"""The data of the interactive Fig. 4 (coverage of two classification schemes): static/data/figs/coverage.json.

The paper's Fig. 4 counts, for each of the eleven bias types that two published classification schemes both report
(Rodrigo-Ginés et al. 2024 and Spinde 2025), the MBDef papers that define the type, seed papers apart from the papers
added through citations (closure). The MBDef code made the printed figure (`mbdef.analysis.taxonomy_coverage`,
tutorial 06): its comparison table (`tutorials/assets/taxonomy-coverage/concepts.csv`) lists each type, its level, how
each scheme covers it and its search terms; a definition counts for a type when a search term has the Label Match key
of the defined term or of a synonym its own paper gives for that term; for two types the definition must also name the
news, media, journalism, journalists or the press; `manual_exclusions.csv` beside it removes rejected matches (it is
empty). This script runs the same functions (`read_concepts`, `read_exclusions`, `audit`) on the released tables and
keeps, for every counted paper, its title, year, seed or cited, the terms it defines, the search terms they matched and
a short quote of one matching definition.

The rule when the released data differ from the print: the dots follow the data (one dot per counted paper), the
JSON keeps the printed numbers beside them, and KNOWN_DIFFERENCES lists every type where the two differ, so the page
can say so. Any other difference fails the run.

Worked example (checked below): Gatekeeping / selection bias is the most-defined type, 38 papers in the released data
(29 seed, 9 cited) against 37 (28, 9) in the print; Connotation bias, the language-level type with the fewest papers,
has 1 paper (a cited one), while 11 MBDef papers define "connotation" itself, without the word "bias".

Run it with the MBDef code installed (e.g. its checkout's venv):

    python scripts/figs/coverage.py --data <MBDef>/data [--concepts <MBDef checkout>/tutorials/assets/taxonomy-coverage/concepts.csv]

It prints its checks and exits non-zero when one fails. The same inputs give the same bytes.
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

import polars as pl
from mbdef import analysis, postprocess
from mbdef.analysis import taxonomy_coverage as tc
from mbdef.postprocess import label_match

OUT = Path(__file__).resolve().parents[2] / "static" / "data" / "figs" / "coverage.json"
DEFAULT_CONCEPTS = postprocess.REPO / "tutorials" / "assets" / "taxonomy-coverage" / "concepts.csv"

# paper Fig. 4: the types in the printed order, as (level, type, papers, seed papers, cited papers)
PRINTED = [
    ("Reporting level", "Gatekeeping / selection bias", 37, 28, 9),  # paper Fig. 4
    ("Reporting level", "Coverage bias", 14, 7, 7),  # paper Fig. 4
    ("Reporting level", "Omission / commission bias", 9, 6, 3),  # paper Fig. 4
    ("Statement level", "Spin bias", 23, 17, 6),  # paper Fig. 4
    ("Statement level", "Sensationalism / emotionalism", 20, 15, 5),  # paper Fig. 4
    ("Statement level", "Statement bias", 19, 11, 8),  # paper Fig. 4
    ("Language level", "Framing bias", 8, 5, 3),  # paper Fig. 4
    ("Language level", "Subjective qualifying adjectives", 4, 3, 1),  # paper Fig. 4
    ("Language level", "Phrasing bias", 3, 2, 1),  # paper Fig. 4
    ("Language level", "Labeling and word choice", 1, 1, 0),  # paper Fig. 4
    ("Language level", "Connotation bias", 1, 0, 1),  # paper Fig. 4
]
# paper Fig. 4: the rows of marks, top row Rodrigo-Ginés et al. 2024 (printed [23]), bottom row Spinde 2025
# (printed [25]); "full" = listed, "half" = covered under a different name; per type in the printed order
PRINTED_MARKS = {
    "rodrigo": ["full", "full", "full", "full", "full", "full", "half", "full", "half", "full", "half"],  # paper Fig. 4
    "spinde": ["full", "full", "full", "full", "half", "full", "full", "half", "full", "half", "full"],  # paper Fig. 4
}
PRINTED_IN_8_OR_MORE = 7  # paper, Section 4 (text beside Fig. 4): "seven of them in at least eight papers"
PRINTED_LANGUAGE_MAX = 8  # paper, Section 4 (text beside Fig. 4): language-level types "at most 8 papers"

# Where the released data differ from the print, as (papers, seed, cited) in the released data. The dots follow the data.
KNOWN_DIFFERENCES = {
    "Gatekeeping / selection bias": (38, 29, 9),
    "Labeling and word choice": (2, 2, 0),
}

# The two schemes, in the printed order, from the paper's bibliography (references 23 and 25 of the final draft).
SCHEMES = [
    {
        "key": "rodrigo",
        "short": "Rodrigo-Ginés et al. 2024",
        "authors": "Rodrigo-Ginés, F.-J., Carrillo-de Albornoz, J., Plaza, L.",
        "year": 2024,
        "title": "A systematic review on media bias detection: What is media bias, how it is expressed, and how to detect it",
        "venue": "Expert Systems with Applications 237, 121641",
        "doi": "10.1016/j.eswa.2023.121641",
    },
    {
        "key": "spinde",
        "short": "Spinde 2025",
        "authors": "Spinde, T.",
        "year": 2025,
        "title": "Automated Detection of Media Bias: From the Conceptualization of Media Bias to its Computational Classification",
        "venue": "Springer Vieweg, Wiesbaden",
        "doi": "10.1007/978-3-658-47798-1",
    },
]
# the comparison table writes the schemes as [15] (Rodrigo-Ginés) and [16] (Spinde) in its notes
NOTE_REF = {"[15]": "rodrigo", "[16]": "spinde"}

QUOTE_WORDS = 30  # a definition quote is cut after this many words (the page's limit is 40)
TERMS_SHOWN = 3  # terms as written, per paper
# Worked example: the most-defined type, and the language-level type with the fewest papers, beside the plain word
EXAMPLE_PLAIN = {"Connotation bias": "connotation", "Framing bias": "framing"}
EXPECTED_PLAIN_PAPERS = {"connotation": 11, "framing": 420}  # released data, checked so the page text stays true

CHECKS = []


def check(ok, msg):
    CHECKS.append((bool(ok), msg))
    print(("ok   " if ok else "FAIL ") + msg)


def short_quote(text):
    words = text.split()
    return " ".join(words[:QUOTE_WORDS]) + ("…" if len(words) > QUOTE_WORDS else "")


def plain_alias(note):
    """The comparison table's note on a type a scheme covers under another name: (scheme, [the name, the scheme's section])."""
    match = re.fullmatch(r"(\[\d+\]):\s*(.+?)\s*\(Sec\. ([\d.]+)\)", note.strip())
    if not match or match.group(1) not in NOTE_REF:
        raise ValueError(f"Unexpected note in the comparison table: {note!r}")
    return NOTE_REF[match.group(1)], [match.group(2), match.group(3)]


def plain_term_papers(data, vocab, word):
    """Distinct papers with a definition whose defined term has the Label Match key of WORD (term only, no synonyms)."""
    wanted = tc.keys(word, vocab)
    inst = data["instances"].select("mention_id", "word_set_key", "spacing_key")
    hits = {
        row["mention_id"]
        for row in inst.iter_rows(named=True)
        if ({"w" + row["word_set_key"]} | ({"s" + row["spacing_key"]} if row["spacing_key"] else set())) & wanted
    }
    defs = data["definitions"].filter(pl.col("mention_id").is_in(sorted(hits)))
    return defs["paper_id"].n_unique()


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--data", required=True, type=Path, help="MBDef's data folder (the five parquet tables)")
    parser.add_argument("--concepts", type=Path, default=DEFAULT_CONCEPTS, help="the comparison table (concepts.csv)")
    args = parser.parse_args()

    data = analysis.load(args.data)
    # as taxonomy_coverage.run: the keys come from the vocabulary of the released terms
    vocab = label_match.vocabulary(data["instances"]["term"].to_list())
    concepts = tc.read_concepts(args.concepts, vocab)
    exclusions_path = args.concepts.with_name("manual_exclusions.csv")
    excluded = tc.read_exclusions(exclusions_path, set(data["definitions"]["def_id"]), concepts)
    rows, evidence, _ = tc.audit(concepts, data, excluded, vocab)
    shown = tc.select_display_rows(rows)

    check(len(excluded) == 0, f"rejected matches in the comparison table's exclusion list: {len(excluded)} (expected 0)")
    check([r["concept"] for r in shown] == [p[1] for p in PRINTED], "the eleven types and their order match the print")
    check([r["group"] for r in shown] == [p[0] for p in PRINTED], "each type's level matches the print")
    for key, marks in PRINTED_MARKS.items():
        check([r[key] for r in shown] == marks, f"the marks of {key} match the print")

    papers = {r["paper_id"]: r for r in data["papers"].select("paper_id", "title", "year", "corpus").iter_rows(named=True)}
    by_concept = defaultdict(lambda: defaultdict(list))
    for row in evidence:
        if row["status"] == "included":
            by_concept[row["concept"]][row["paper_id"]].append(row)
    concept_rows = {c["concept"]: c for c in concepts}

    types, diffs = [], []
    for row, (level, name, p_total, p_seed, p_cited) in zip(shown, PRINTED, strict=True):
        concept = concept_rows[name]
        plist = []
        for pid, matches in by_concept[name].items():
            paper = papers[pid]
            seed = paper["corpus"] == "seeds"
            check(all((m["source"] == "seed") == seed for m in matches), f"{name}: one source per paper ({pid[:12]})")
            matches = sorted(matches, key=lambda m: ("term" not in m["match_via"].split("; "), m["record_id"]))
            searched = sorted({q for m in matches for q in m["matched_search_terms"].split("; ")})
            written = {}  # each defined term as the paper wrote it -> the synonym that matched, or None for the term itself
            for m in matches:
                if "term" in m["match_via"].split("; "):
                    written[m["term"]] = None
                elif m["term"] not in written:
                    wanted = set().union(*(concept["queries"][q] for q in m["matched_search_terms"].split("; ")))
                    syns = sorted(s.strip() for s in m["synonyms"].split("; ") if s.strip() and tc.keys(s.strip(), vocab) & wanted)
                    check(bool(syns), f"{name}: the synonym behind a synonym match is found ({pid[:12]})")
                    written[m["term"]] = syns[0]
            plist.append({
                "t": paper["title"],
                "y": paper["year"],
                "s": 1 if seed else 0,
                "w": [[term, syn] for term, syn in written.items()][:TERMS_SHOWN],  # [term as written, synonym or null]
                "m": searched,
                "n": len(matches),
                "q": short_quote(matches[0]["definition_text"]),
            })
        plist.sort(key=lambda p: (-p["s"], p["y"] is None, p["y"] or 0, p["t"].casefold()))
        seed_n = sum(p["s"] for p in plist)
        data_counts = (len(plist), seed_n, len(plist) - seed_n)
        check(data_counts == (row["total"], row["seed"], row["closure"]), f"{name}: listed papers add up to the module's counts")
        printed = (p_total, p_seed, p_cited)
        if data_counts == printed:
            check(name not in KNOWN_DIFFERENCES, f"{name}: {p_total} ({p_seed}, {p_cited}) as printed")
        else:
            check(KNOWN_DIFFERENCES.get(name) == data_counts,
                  f"{name}: data {data_counts} vs printed {printed} (a known, noted difference)")
            diffs.append(name)
        aliases = {}
        if concept["half_note"].strip():
            key, alias = plain_alias(concept["half_note"])
            aliases[key] = alias
        for key in ("rodrigo", "spinde"):
            if concept[key] == "half" and key not in aliases:
                aliases[key] = None  # covered under a different name the comparison table does not record
        hits = defaultdict(int)  # the search terms by the papers they matched: what to search in the Explorer
        for p in plist:
            for q in p["m"]:
                hits[q] += 1
        explore = sorted(hits, key=lambda q: (-hits[q], len(q), q))[:2]
        types.append({
            "name": name,
            "level": level,
            "printed": list(printed),
            "data": list(data_counts),
            "marks": {k: concept[k] for k in ("rodrigo", "spinde")},
            "alias": aliases,
            "search": sorted(concept["queries"]),
            "context": concept["needs_manual_check"],
            "explore": explore,
            "papers": plist,
        })
    check(sorted(diffs) == sorted(KNOWN_DIFFERENCES), "every known difference still occurs")

    in8 = sum(t["data"][0] >= 8 for t in types)
    check(in8 == PRINTED_IN_8_OR_MORE, f"types in at least 8 papers: {in8} (paper text: {PRINTED_IN_8_OR_MORE})")
    lang_max = max(t["data"][0] for t in types if t["level"] == "Language level")
    check(lang_max == PRINTED_LANGUAGE_MAX, f"most papers of a language-level type: {lang_max} (paper text: {PRINTED_LANGUAGE_MAX})")
    check(all(t["data"][0] >= 1 for t in types), "all eleven types are defined in MBDef")

    top = max(types, key=lambda t: t["data"][0])
    lang = [t for t in types if t["level"] == "Language level"]
    fewest = min(lang, key=lambda t: (t["data"][0], -lang.index(t)))  # the fewest; on a tie, the last in printed order
    check(top["name"] == "Gatekeeping / selection bias", f"most-defined type: {top['name']}")
    check(fewest["name"] == "Connotation bias", f"language-level type with the fewest papers: {fewest['name']}")
    plain = {}
    for name, word in EXAMPLE_PLAIN.items():
        n = plain_term_papers(data, vocab, word)
        check(n == EXPECTED_PLAIN_PAPERS[word], f"papers defining '{word}' itself: {n} (expected {EXPECTED_PLAIN_PAPERS[word]})")
        plain[name] = {"word": word, "papers": n}

    out = {
        "schemes": SCHEMES,
        "levels": list(dict.fromkeys(p[0] for p in PRINTED)),
        "types": types,
        "differences": diffs,
        "example": {"top": top["name"], "fewest": fewest["name"], "plain": plain},
        "in8": in8,
        "context_words": "news, media, journalism, journalist(s) or the press",
        "source": {name: list(rev) for name, rev in analysis.SOURCES.items()},
    }
    text = json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(text, encoding="utf-8")
    print(f"wrote {OUT} ({len(text.encode()):,} bytes)")
    failed = [m for ok, m in CHECKS if not ok]
    if failed:
        print(f"{len(failed)} check(s) failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
