# /// script
# requires-python = ">=3.12"
# dependencies = ["pyarrow"]
# ///
"""The data of the interactive Fig. 1 (the five-step pipeline): static/data/figs/pipeline.json.

The printed Fig. 1 shows the five steps (search, classification, extraction, closure, post-processing) without
numbers; the paper's Section 3.1 gives the counts each step keeps and drops. The interactive figure carries those
counts through the steps, so every count below is a constant copied from the paper, with a comment naming its
sentence, and the script checks that:

1. each constant's text, as printed (e.g. "50,101", "80.5\\%"), appears in the paper's .tex;
2. the counts add up along the pipeline (e.g. 2,963 + 925 - 4 - 15 = 3,869 seed papers);
3. the released tables give the same end counts: 6,115 papers, 103,476 definitions, 34,916 terms,
   62,066 term mentions (67,394 extracted concepts minus the 5,328 removed), and MBDef-Gold's 150 papers,
   130 with relevant definitions, 1,003 records and 1,192 definitions (365 on the test split, 115 on dev).

Counts the paper does not print are derived by arithmetic and named as such (e.g. the 14,286 search results without
an open copy are 50,101 - 35,815). Two come from the released papers table only: how the 6,115 papers split into seed
papers (3,715) and papers added through citations (2,400), and so how the 364 papers dropped in Step 5 split
(3,869 - 3,715 = 154 seed, 2,610 - 2,400 = 210 cited).

Worked example (the papers, followed from the search to the release): 50,101 search results; Step 1 keeps 14,862
readable PDFs (it loses 35,239, 70.3%: 14,286 have no openly accessible copy and 20,953 are open but could not be
retrieved or converted); Step 2 keeps 3,869 relevant papers (loses 10,993); Step 3 removes none; Step 4 adds 2,610
cited papers (6,479); Step 5 drops the 364 papers left without a definition: 6,115. Step 1 loses the most.

For the detail cards of Steps 2 and 4 it counts the seed papers and the cited papers that define the term
"media bias" itself (its label group in the terms table) and lists the three of each that give the most definitions
of it (ties: by title), title and count only: the seed papers' years in the release are not reliable enough to show.

    uv run scripts/figs/pipeline.py --tex /path/to/the-paper.tex \\
        --data /path/to/MBDef/data --gold /path/to/MBDef-Gold/data

It prints every check and exits 1 when one fails. The same inputs always give the same bytes.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import pyarrow.compute as pc
import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "static" / "data" / "figs" / "pipeline.json"

# ---------------------------------------------------------------- the paper's numbers (Section 3.1 of the paper's LaTeX source)
# Each entry: key -> (value, text as printed in the .tex). Comments name the sentence.

PAPER: dict[str, tuple[float, str]] = {
    # Step 1. "The search yielded 50,101 documents, of which 35,815 are openly accessible."
    "search_results": (50101, "50,101"),
    "open_access": (35815, "35,815"),
    # Step 1. "We retrieved and converted PDFs for 14,862 of these with GROBID."
    "pdfs_read": (14862, "14,862"),
    # Step 2. "Both marked 2,963 as relevant and disagreed on 2,196, ..."
    "both_relevant": (2963, "2,963"),
    "disagreed": (2196, "2,196"),
    # Step 2. "GLM 5.2, with its best prompt, resolves 2,192 disagreements with titles or abstracts and adds 925
    # relevant papers."
    "judge_resolved": (2192, "2,192"),
    "judge_added": (925, "925 relevant"),
    # Step 2. "After removing 4 papers, based on errata, withdrawals, tables of contents, and 15 records without
    # recoverable titles, the seed corpus contains 3,869 papers."
    "removed_errata": (4, "removing 4 papers"),
    "removed_no_title": (15, "15 records without"),
    "seed_papers": (3869, "3,869"),
    # Step 3. "We extend DefExtra's 73 source publications with 77 papers selected from our relevant corpus"
    "gold_from_defextra": (73, "73 source publications"),
    "gold_from_corpus": (77, "77 papers"),
    # Step 3. "MBDef-Gold contains 1,003 concepts, 1,192 definitions, ... from 130 of the 150 annotated papers"
    "gold_records": (1003, "1,003 concepts"),
    "gold_definitions": (1192, "1,192 definitions"),
    "gold_papers_with_defs": (130, "130 of the 150"),
    "gold_papers": (150, "150 annotated papers"),
    # Step 3. "It finds 294 of 365 test definitions (recall 80.5\%, precision 30.6\%), 95 of 115 dev definitions
    # (82.6\%, 21.8\%), and 543 of 706 on the 79 training papers unused in its prompts (76.9\%, 25.8\%)."
    # (The next sentence, "299 of 365", is not used.)
    "test_found": (294, "294 of 365"),
    "test_gold": (365, "294 of 365"),
    "test_recall": (80.5, "80.5\\%"),
    "dev_found": (95, "95 of 115"),
    "dev_gold": (115, "95 of 115"),
    "dev_recall": (82.6, "82.6\\%"),
    "train_found": (543, "543 of 706"),
    "train_gold": (706, "543 of 706"),
    "train_papers_unused": (79, "79 training papers"),
    "train_recall": (76.9, "76.9\\%"),
    # Step 4. "Of 46,343 markers, 81.4\% were matched, resolving to 16,088 distinct cited works."
    "citation_markers": (46343, "46,343"),
    "markers_matched_pct": (81.4, "81.4\\%"),
    "cited_works": (16088, "16,088"),
    # Step 4. "From the 16,088 works, 2,618 (16\%) were collected and extracted, and 291 (2\%) were already in the
    # corpus."
    "cited_collected": (2618, "2,618 (16\\%)"),
    "cited_in_corpus": (291, "291 (2\\%)"),
    # Step 4. "After removing duplicates, closure adds 2,610 papers, bringing the corpus to 6,479."
    "closure_added": (2610, "2,610"),
    "corpus_papers": (6479, "6,479"),
    # Step 4. "Extraction yields 110,639 definitions, or 110,399 after collapsing identical definition texts of the
    # same term within a paper."
    "defs_extracted": (110639, "110,639"),
    "defs_collapsed": (110399, "110,399"),
    # Step 5. "We first merge term variants (casing, abbreviations) of the 67,394 extracted concepts into 38,407
    # label groups"
    "concepts_extracted": (67394, "67,394"),
    "label_groups": (38407, "38,407"),
    # Step 5. "We post-process all 110,399 definitions, removing 6,923 definitions and 5,328 concepts."
    "defs_removed": (6923, "6,923"),
    "concepts_removed": (5328, "5,328"),
    # Step 5. "3,491 label groups lose all concepts, leaving 34,916."
    "groups_emptied": (3491, "3,491"),
    "terms": (34916, "34,916"),
    # Step 5. "Step 3 had already left 238 papers without a definition, and the filter removes the last definitions
    # of 126 more."
    "papers_no_def": (238, "238 papers"),
    "papers_lost_last": (126, "126 more"),
    # Step 5. "The final dataset contains 103,476 definitions from 6,115 papers."
    "final_definitions": (103476, "103,476"),
    "final_papers": (6115, "6,115"),
    # Step 5. "The ensemble averages the ranks of these three components with near-equal weights (0.34/0.34/0.32)."
    "judge_neighbours": (32, "32 most similar"),
}

# Names the figure prints: each must appear in the .tex as written here.
NAMES = [
    "Scopus",  # Step 1: the database searched
    "GROBID",  # Step 1: PDF to text
    "Qwen3.6-35B-A3B",  # Step 2 classifier; Step 3 verifier
    "Gemma~4~12B",  # Step 2 classifier; Step 3 extractor; Step 5 retrieval judge
    "GLM~5.2",  # Step 2 third model on disagreements
    "DSPy",  # Step 3 prompt optimisation
    "BGE-base",  # Step 3 relevance filter embeddings
    "Crossref, Semantic Scholar, OpenAlex, and Unpaywall",  # Step 4 sources
    "basal-omni-1.0-ultra",  # Step 5 LLM decision model
    "Qwen3-Embedding-8B",  # Step 5 embeddings of the logistic regression
]

FAILS: list[str] = []


def check(ok: bool, what: str) -> None:
    print(("ok    " if ok else "FAIL  ") + what)
    if not ok:
        FAILS.append(what)


def v(key: str) -> int:
    return int(PAPER[key][0])


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tex", type=Path, required=True, help="the paper's LaTeX source")
    ap.add_argument("--data", type=Path, required=True, help="MBDef's data folder (papers, definitions, ... .parquet)")
    ap.add_argument("--gold", type=Path, required=True, help="MBDef-Gold's data folder (train/validation/test.parquet)")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()

    # ------------------------------------------------ 1. every number and name as printed in the paper
    tex = args.tex.read_text(encoding="utf-8")
    for key, (_, text) in PAPER.items():
        check(text in tex, f"paper prints {text!r} ({key})")
    for name in NAMES:
        check(name in tex, f"paper names {name!r}")
    check("299 of 365" in tex, "the draft's '299 of 365' sentence exists and is deliberately not used")

    # ------------------------------------------------ 2. the counts add up (derived numbers are named here)
    relevant = v("both_relevant") + v("judge_added")
    removed = v("removed_errata") + v("removed_no_title")
    derived = {
        "not_open": v("search_results") - v("open_access"),  # search results without an open copy
        "open_not_read": v("open_access") - v("pdfs_read"),  # open, but the PDF could not be retrieved or converted
        "relevant": relevant,  # marked relevant by both models or by the third
        "not_relevant": v("pdfs_read") - relevant,  # read, not kept as relevant
        "unresolved": v("disagreed") - v("judge_resolved"),  # disagreements the third model did not resolve
        "removed": removed,  # errata etc. and records without a title
        "cited_not_obtained": v("cited_works") - v("cited_collected") - v("cited_in_corpus"),
        "cited_duplicates": v("cited_collected") - v("closure_added"),
        "defs_identical": v("defs_extracted") - v("defs_collapsed"),
        "mentions_kept": v("concepts_extracted") - v("concepts_removed"),
        "papers_dropped_s5": v("papers_no_def") + v("papers_lost_last"),
    }
    derived["step1_lost"] = derived["not_open"] + derived["open_not_read"]
    derived["step2_lost"] = derived["not_relevant"] + removed
    check(relevant - removed == v("seed_papers"), f"2,963 + 925 - 4 - 15 = {relevant - removed:,} seed papers")
    check(v("seed_papers") + v("closure_added") == v("corpus_papers"), "3,869 + 2,610 = 6,479 papers")
    check(v("corpus_papers") - v("papers_no_def") - v("papers_lost_last") == v("final_papers"),
          "6,479 - 238 - 126 = 6,115 papers")
    check(v("defs_collapsed") - v("defs_removed") == v("final_definitions"), "110,399 - 6,923 = 103,476 definitions")
    check(v("label_groups") - v("groups_emptied") == v("terms"), "38,407 - 3,491 = 34,916 terms")
    check(v("gold_from_defextra") + v("gold_from_corpus") == v("gold_papers"), "73 + 77 = 150 MBDef-Gold papers")
    check(v("search_results") - derived["step1_lost"] == v("pdfs_read"), "50,101 - 14,286 - 20,953 = 14,862")
    check(v("pdfs_read") - derived["step2_lost"] == v("seed_papers"), "14,862 - 10,974 - 19 = 3,869")
    check(derived["cited_not_obtained"] > 0 and derived["cited_duplicates"] >= 0,
          f"16,088 - 2,618 - 291 = {derived['cited_not_obtained']:,} cited works not obtained; "
          f"2,618 - 2,610 = {derived['cited_duplicates']} duplicates")
    for key, found, gold, pct in (("test", "test_found", "test_gold", "test_recall"),
                                  ("dev", "dev_found", "dev_gold", "dev_recall"),
                                  ("training", "train_found", "train_gold", "train_recall")):
        r = round(100 * v(found) / v(gold), 1)
        check(r == PAPER[pct][0], f"{key} recall {v(found)}/{v(gold)} = {r}% (paper {PAPER[pct][0]}%)")
    check(round(100 * v("cited_collected") / v("cited_works")) == 16, "2,618 / 16,088 rounds to 16%")
    check(round(100 * v("cited_in_corpus") / v("cited_works")) == 2, "291 / 16,088 rounds to 2%")

    # ------------------------------------------------ 3. the released tables
    papers = pq.read_table(args.data / "papers.parquet", columns=["corpus", "title", "year", "n_instances", "n_definitions"])
    n_papers = papers.num_rows
    corpus = papers.column("corpus").to_pylist()
    n_seed, n_cited = corpus.count("seeds"), corpus.count("closure")
    n_defs = pq.read_metadata(args.data / "definitions.parquet").num_rows
    n_terms = pq.read_metadata(args.data / "concepts.parquet").num_rows
    n_mentions = pq.read_metadata(args.data / "instances.parquet").num_rows
    defs_by = {c: 0 for c in ("seeds", "closure")}
    for c, d in zip(corpus, papers.column("n_definitions").to_pylist(), strict=True):
        defs_by[c] += d
    check(n_papers == v("final_papers"), f"released papers: {n_papers:,} (paper 6,115)")
    check(n_seed + n_cited == n_papers, f"released papers split: {n_seed:,} seed + {n_cited:,} cited")
    check(n_defs == v("final_definitions"), f"released definitions: {n_defs:,} (paper 103,476)")
    check(sum(defs_by.values()) == n_defs, "per-paper definition counts add up to the definitions table")
    check(n_terms == v("terms"), f"released terms: {n_terms:,} (paper 34,916)")
    check(n_mentions == derived["mentions_kept"], f"released term mentions: {n_mentions:,} = 67,394 - 5,328")
    check(n_seed <= v("seed_papers") and n_cited <= v("closure_added"), "no origin gains papers in Step 5")
    check((v("seed_papers") - n_seed) + (v("closure_added") - n_cited) == derived["papers_dropped_s5"],
          f"Step 5 drops {v('seed_papers') - n_seed} seed + {v('closure_added') - n_cited} cited = 364 papers")
    check(int(pc.min(papers.column("n_definitions")).as_py()) >= 1, "every released paper has a definition")

    gold = {s: pq.read_table(args.gold / f"{s}.parquet", columns=["paper_id", "relevant", "definitions"]).to_pylist()
            for s in ("train", "validation", "test")}
    rows = [r for s in gold.values() for r in s]
    rel = [r for r in rows if r["relevant"]]
    check(len({r["paper_id"] for r in rows}) == v("gold_papers"), "MBDef-Gold: 150 papers")
    check(len({r["paper_id"] for r in rel}) == v("gold_papers_with_defs"), "MBDef-Gold: 130 papers with relevant definitions")
    check(len(rel) == v("gold_records"), f"MBDef-Gold: {len(rel):,} relevant records (paper 1,003)")
    check(sum(len(r["definitions"]) for r in rel) == v("gold_definitions"), "MBDef-Gold: 1,192 definitions")
    for split, key in (("test", "test_gold"), ("validation", "dev_gold")):
        n = sum(len(r["definitions"]) for r in gold[split] if r["relevant"])
        check(n == v(key), f"MBDef-Gold {split}: {n} definitions (paper {v(key)})")

    # ------------------------------------------------ examples for the cards: papers that define "media bias" itself
    concepts = pq.read_table(args.data / "concepts.parquet", columns=["concept_id", "label"]).to_pylist()
    mb_ids = [c["concept_id"] for c in concepts if c["label"] == "media bias"]
    check(len(mb_ids) == 1, "one term is labelled 'media bias'")
    defs = pq.read_table(args.data / "definitions.parquet", columns=["concept_id", "paper_id"]).to_pylist()
    per_paper: dict[str, int] = {}
    for d in defs:
        if d["concept_id"] == mb_ids[0]:
            per_paper[d["paper_id"]] = per_paper.get(d["paper_id"], 0) + 1
    meta = {r["paper_id"]: r for r in pq.read_table(args.data / "papers.parquet", columns=["paper_id", "corpus", "title"]).to_pylist()}

    def media_bias(origin: str) -> dict:
        rs = [(n, meta[pid]["title"] or "") for pid, n in per_paper.items() if meta[pid]["corpus"] == origin]
        rs.sort(key=lambda r: (-r[0], r[1]))
        return {"papers": len(rs), "definitions": sum(n for n, _ in rs),
                "top": [{"title": t, "definitions": n} for n, t in rs[:3]]}

    data = {
        "paper": {k: val for k, (val, _) in PAPER.items()},
        "derived": derived,
        "released": {
            "papers": n_papers, "seed": n_seed, "cited": n_cited,
            "definitions": n_defs, "definitions_seed": defs_by["seeds"], "definitions_cited": defs_by["closure"],
            "terms": n_terms, "mentions": n_mentions,
            "dropped_seed": v("seed_papers") - n_seed, "dropped_cited": v("closure_added") - n_cited,
        },
        "media_bias": {"seed": media_bias("seeds"), "cited": media_bias("closure")},
    }
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out.relative_to(ROOT) if args.out.is_relative_to(ROOT) else args.out} ({len(text.encode()):,} bytes)")
    if FAILS:
        print(f"{len(FAILS)} check(s) failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
