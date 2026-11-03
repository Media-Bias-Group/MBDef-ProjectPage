"""The data of the interactive Fig. 3 (what MBDef holds): static/data/figs/content.json.

The paper's Fig. 3 has two bar charts, each bar split into seed papers (the media-bias literature the corpus started
from) and closure papers (the papers those seed papers cite, added by following the citations):

* left, the extracted records by field. Definitions are the rows of the `definitions` table; each other field
  (description, synonyms, related terms, subtypes, supertypes, examples) counts the items of that list in the
  `instances` table, where one row is one term as one paper defines it. The paper's corpus comes from `papers`.
* right, the ten merged terms with the most definitions: the `definitions` rows grouped by `concept_id` (a merged term,
  a row of `concepts`: the spellings that match up to case, plural, spelling variant and word order, so "frame" and
  "framing" stay two terms). This equals `concepts.n_definitions`. Ranked by definitions, ties by the dataset's name.

The paper prints each term's name in lower case and in the singular ("frame", "echo chamber"), where the dataset
names a term by its most used spelling ("frames", "echo chambers"). The rule here: the most used lower-case spelling
whose letters, spaces and hyphens set aside, equal the term's singular spelling key (`instances.spacing_key`); a term
with no such spelling keeps the dataset's name. For the paper's ten terms this gives exactly the printed names.

For the top 50 terms the JSON adds what the page shows on a click: distinct papers by corpus, the spellings (most
papers first), the papers' years (as the `papers` table gives them; a histogram with every year before 2000 in one
bin) and one short definition, picked by this rule: among the term's definitions of 3 to 40 words in the `terms`
table (where texts that read the same once case, punctuation and spacing are set aside are one item), the one the
most papers give; on a tie, the one whose paper's mention of the term has the highest relevance score
(`instances.ensemble_score`); then the shorter; then alphabetical. It is shown with that best-scored paper.
Each field's tooltip example: for "fake news" (the term with the most definitions), the field's item that the most
papers state, then the fewest words, then alphabetical.

Run it with the MBDef code installed (e.g. its checkout's venv):

    python scripts/figs/content.py --data <MBDef>/data

It prints its checks against the printed figure and exits non-zero when one fails. The output is the same bytes on
every run.
"""

import argparse
import json
import re
import sys
from pathlib import Path

import polars as pl
from mbdef import analysis

OUT = Path(__file__).resolve().parents[2] / "static" / "data" / "figs" / "content.json"

# paper Fig. 3, left: the extracted records by field, as (field, seed papers, closure papers, total)
PRINTED_FIELDS = [
    ("definitions", 59071, 44405, 103476),  # paper Fig. 3 (left)
    ("description", 22990, 18772, 41762),  # paper Fig. 3 (left): "Descriptions"
    ("synonyms", 3312, 3122, 6434),  # paper Fig. 3 (left)
    ("related_terms", 11264, 10005, 21269),  # paper Fig. 3 (left): "Related Terms"
    ("subtypes", 7090, 5592, 12682),  # paper Fig. 3 (left)
    ("supertypes", 4989, 4116, 9105),  # paper Fig. 3 (left)
    ("examples", 5409, 4781, 10190),  # paper Fig. 3 (left)
]
# paper Fig. 3, right: the ten terms with the most definitions, as (printed name, seed papers, closure papers, total)
PRINTED_TERMS = [
    ("fake news", 1319, 572, 1891),  # paper Fig. 3 (right)
    ("disinformation", 811, 371, 1182),  # paper Fig. 3 (right)
    ("misinformation", 721, 363, 1084),  # paper Fig. 3 (right)
    ("framing", 804, 211, 1015),  # paper Fig. 3 (right)
    ("hate speech", 429, 319, 748),  # paper Fig. 3 (right)
    ("frame", 436, 134, 570),  # paper Fig. 3 (right)
    ("media literacy", 356, 165, 521),  # paper Fig. 3 (right)
    ("propaganda", 369, 115, 484),  # paper Fig. 3 (right)
    ("echo chamber", 276, 172, 448),  # paper Fig. 3 (right)
    ("confirmation bias", 183, 160, 343),  # paper Fig. 3 (right)
]
PRINTED_DEFINITIONS = 103476  # paper, Section 4 and Fig. 3: definitions in MBDef
PRINTED_PAPERS = 6115  # paper, Section 4: papers in MBDef
PRINTED_TERMS_TOTAL = 34916  # paper, Section 4: normalised terms

FIELD_NAMES = {
    "definitions": "Definitions", "description": "Descriptions", "synonyms": "Synonyms", "related_terms": "Related terms",
    "subtypes": "Subtypes", "supertypes": "Supertypes", "examples": "Examples",
}
TOP = 50  # the page's largest choice (top 10, 25 or 50)
EXAMPLE_TERM = "fake news"  # the term the field tooltips take their examples from: the one with the most definitions
FIRST_YEAR_BIN = 2000  # the year histogram puts every earlier year in one bin
MAX_WORDS, MIN_WORDS = 40, 3


def words(text: str) -> int:
    return len(text.split())


def letters(text: str) -> str:
    return re.sub(r"[\s\-]+", "", text)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--data", required=True, help="the folder of MBDef's parquet tables")
    args = ap.parse_args()
    t = analysis.load(args.data)
    concepts, terms, inst, defs, papers = t["concepts"], t["terms"], t["instances"], t["definitions"], t["papers"]
    checks: list[tuple[str, bool, str]] = []

    def check(name: str, ok: bool, detail: str = "") -> None:
        checks.append((name, bool(ok), detail))

    corpus = dict(zip(papers["paper_id"], papers["corpus"]))
    year = dict(zip(papers["paper_id"], papers["year"]))
    title = dict(zip(papers["paper_id"], papers["title"]))
    score = dict(zip(inst["mention_id"], inst["ensemble_score"]))
    seed_of = lambda pid: corpus[pid] == "seeds"  # noqa: E731

    # ---------------------------------------------------------------- the totals
    n_seed_papers = int((papers["corpus"] == "seeds").sum())
    check("papers", papers.height == PRINTED_PAPERS, f"{papers.height:,} vs printed {PRINTED_PAPERS:,}")
    check("terms", concepts.height == PRINTED_TERMS_TOTAL, f"{concepts.height:,} vs printed {PRINTED_TERMS_TOTAL:,}")
    check("definitions", defs.height == PRINTED_DEFINITIONS, f"{defs.height:,} vs printed {PRINTED_DEFINITIONS:,}")

    # ---------------------------------------------------------------- left: the records by field
    dc = defs.join(papers.select("paper_id", "corpus"), on="paper_id", how="left")
    check("every definition has a paper", dc["corpus"].null_count() == 0)
    counts = {"definitions": (int((dc["corpus"] == "seeds").sum()), int((dc["corpus"] == "closure").sum()))}
    for f in FIELD_NAMES:
        if f == "definitions":
            continue
        g = inst.select("corpus", pl.col(f).list.len().alias("n")).group_by("corpus").agg(pl.col("n").sum())
        got = dict(g.iter_rows())
        counts[f] = (int(got.get("seeds", 0)), int(got.get("closure", 0)))

    ex_row = terms.filter(pl.col("term") == EXAMPLE_TERM).row(0, named=True)
    fields = []
    for f, p_seed, p_cited, p_total in PRINTED_FIELDS:
        s, c = counts[f]
        check(f"Fig. 3 left: {FIELD_NAMES[f]}", (s, c, s + c) == (p_seed, p_cited, p_total),
              f"{s + c:,} ({s:,}, {c:,}) vs printed {p_total:,} ({p_seed:,}, {p_cited:,})")
        items = sorted(ex_row[f], key=lambda it: (-it["papers"], words(it["text"]), it["text"]))
        it = items[0]
        fields.append({"key": f, "name": FIELD_NAMES[f], "seed": s, "cited": c,
                       "printed": [p_seed, p_cited], "ex": {"text": it["text"], "papers": it["papers"]}})

    # ---------------------------------------------------------------- right: the terms by definitions
    per = (dc.group_by("concept_id")
           .agg(pl.len().alias("n"), (pl.col("corpus") == "seeds").sum().alias("seed"),
                (pl.col("corpus") == "closure").sum().alias("cited")))
    ranked = (concepts.select("concept_id", "label", "n_definitions", "n_papers")
              .join(per, on="concept_id", how="left")
              .sort(["n", "label", "concept_id"], descending=[True, False, False]))
    check("definitions per term equal the concepts table",
          (ranked["n"] == ranked["n_definitions"]).all())
    check(f"no tie at the top-{TOP} cut", ranked["n"][TOP - 1] != ranked["n"][TOP])
    check("no tie at the top-25 cut", ranked["n"][24] != ranked["n"][25])
    check("no tie at the top-10 cut", ranked["n"][9] != ranked["n"][10])

    spacing = inst.group_by("concept_id").agg(pl.col("spacing_key").unique())
    spacing = dict(zip(spacing["concept_id"], spacing["spacing_key"]))
    trow = {r["concept_id"]: r for r in terms.filter(
        pl.col("concept_id").is_in(ranked["concept_id"].head(TOP).to_list())).iter_rows(named=True)}
    dpap = (dc.filter(pl.col("concept_id").is_in(ranked["concept_id"].head(TOP).to_list()))
            .group_by("concept_id").agg(pl.col("paper_id").unique().sort()))
    dpap = dict(zip(dpap["concept_id"], dpap["paper_id"]))

    bins = ["<" + str(FIRST_YEAR_BIN)] + [str(y) for y in range(FIRST_YEAR_BIN, int(papers["year"].max()) + 1)]
    out_terms = []
    for rank, (cid, label, n, s, c, n_papers) in enumerate(
            ranked.head(TOP).select("concept_id", "label", "n", "seed", "cited", "n_papers").iter_rows(), 1):
        r = trow[cid]
        spell = sorted(((x["text"], x["papers"]) for x in r["spellings"]), key=lambda x: (-x[1], x[0]))
        keys = set(spacing[cid])
        name = next((sp for sp, _ in spell if sp == sp.lower() and letters(sp) in keys), label)
        pids = dpap[cid]
        check(f"{label}: distinct papers equal the concepts table", len(pids) == n_papers)
        ps = sum(1 for p in pids if seed_of(p))
        ys = [year[p] for p in pids if year[p] is not None]
        hist_s, hist_c = [0] * len(bins), [0] * len(bins)
        for p in pids:
            y = year[p]
            if y is None:
                continue
            k = 0 if y < FIRST_YEAR_BIN else y - FIRST_YEAR_BIN + 1
            (hist_s if seed_of(p) else hist_c)[k] += 1
        ys.sort()
        q1, q3 = ys[(len(ys) - 1) // 4], ys[(3 * (len(ys) - 1)) // 4]
        cands = [it for it in r["definitions"] if MIN_WORDS <= words(it["text"]) <= MAX_WORDS]
        best = lambda it: max(score[x["mention_id"]] for x in it["sources"])  # noqa: E731
        cands.sort(key=lambda it: (-it["papers"], -best(it), len(it["text"]), it["text"]))
        pick = cands[0]
        src = max(pick["sources"], key=lambda x: (score[x["mention_id"]], x["paper_id"]))
        out_terms.append({
            "rank": rank, "name": name, "label": label, "seed": s, "cited": c,
            "papers": [ps, len(pids) - ps], "years": [ys[0], ys[-1]], "mid": [q1, q3], "noyear": len(pids) - len(ys),
            "hist": [hist_s, hist_c], "spellings": [list(x) for x in spell],
            "def": {"text": pick["text"], "shared": pick["papers"], "title": title[src["paper_id"]],
                    "year": year[src["paper_id"]], "seed": seed_of(src["paper_id"])},
        })
    for i, (p_name, p_seed, p_cited, p_total) in enumerate(PRINTED_TERMS):
        o = out_terms[i]
        o["printed"] = [p_name, p_seed, p_cited]
        check(f"Fig. 3 right #{i + 1}: {p_name}",
              (o["name"], o["seed"], o["cited"], o["seed"] + o["cited"]) == (p_name, p_seed, p_cited, p_total),
              f"{o['name']} {o['seed'] + o['cited']:,} ({o['seed']:,}, {o['cited']:,}) vs printed "
              f"{p_name} {p_total:,} ({p_seed:,}, {p_cited:,})")

    # the earliest-dated paper that defines the example term: the page names it as a year that looks wrong
    ex_cid = concepts.filter(pl.col("label") == EXAMPLE_TERM)["concept_id"][0]
    first = min((p for p in dpap[ex_cid] if year[p] is not None), key=lambda p: (year[p], p))
    mb = ranked.with_row_index("rank", 1).filter(pl.col("label") == "media bias").row(0, named=True)
    data = {
        "totals": {"papers": papers.height, "seedPapers": n_seed_papers, "citedPapers": papers.height - n_seed_papers,
                   "terms": concepts.height, "definitions": defs.height,
                   "records": sum(s + c for s, c in counts.values()),
                   "noYear": int(papers["year"].null_count())},
        "earliest": {"term": EXAMPLE_TERM, "title": title[first], "year": year[first]},
        "exampleTerm": EXAMPLE_TERM,
        "mediaBias": {"rank": mb["rank"], "definitions": mb["n"], "papers": mb["n_papers"]},
        "yearBins": bins,
        "fields": fields,
        "terms": out_terms,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

    for name, ok, detail in checks:
        print(f"{'ok  ' if ok else 'FAIL'} {name}{': ' + detail if detail else ''}")
    print(f"wrote {OUT} ({OUT.stat().st_size:,} bytes)")
    return 0 if all(ok for _, ok, _ in checks) else 1


if __name__ == "__main__":
    sys.exit(main())
