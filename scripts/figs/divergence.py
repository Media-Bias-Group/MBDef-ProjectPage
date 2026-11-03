"""Build static/data/figs/divergence.json: the data of the interactive Fig. 5 ("Do papers agree on what a term means?").

The paper's Fig. 5 draws, for the ten terms defined in the most distinct papers of MBDef-Gold, how similar the
definitions of one term are when they come from two different papers. This script makes the same numbers with the
code that made the printed figure (``mbdef.analysis.divergence`` of the pipeline repository, tutorial 04) and keeps,
for the page, every pair behind each box.

The rule, step by step (all in ``mbdef.analysis.divergence``):

1. Take every non-empty definition of every record of MBDef-Gold (all three splits) that people marked relevant:
   1,192 definitions from 130 papers.
2. Match terms by case, spacing and outer punctuation only ("Media bias" = "media bias"; no synonyms, no plurals).
3. Pair every two definitions of the same term that come from two different papers (1,395 pairs over 71 terms).
4. Score each pair with DefScore: the mean of word overlap (F1 of shared words), the cosine of the two texts'
   BAAI/bge-base-en-v1.5 vectors and the entailment probability of tasksource/ModernBERT-large-nli in both directions,
   calibrated to human similarity ratings as clip(1.40284 * mean - 0.29737, 0, 1). The paper counts 0.5 as a match.
5. Keep the ten terms defined in the most distinct papers (ties: alphabetical) and summarise each term's pair scores:
   quartiles and median (numpy's linear quantiles, as matplotlib's box plot), mean.

Added for the page: each term's definitions (cut to 40 words), the papers' titles and years, every pair's score, and the
term's most and least similar pair. Most similar: the highest DefScore; when several pairs share it, the one with the
most shared words (word-overlap F1), then the first in the data's order. Least similar: the lowest DefScore; when
several share it (scores stop at 0), the one with the fewest shared words, then the first in the data's order.

Worked example (checked below): media bias is defined in 9 papers, by 17 definitions; 119 pairs of them come from two
different papers; their median DefScore is 0.2502, which the paper's text gives as 0.25.

Usage (the pipeline checkout's environment has mbdef, torch and the two models; scores are cached in WORK, so a
second run loads no model and writes the same bytes):

    <MBDef checkout>/.venv/bin/python scripts/figs/divergence.py \
        --gold /path/to/MBDef-Gold/data --work /path/to/work/folder

It prints each term's numbers beside the printed figure's and exits 1 when one differs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from mbdef.analysis import load_gold
from mbdef.analysis import divergence
from mbdef.evaluate import metric

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "static" / "data" / "figs" / "divergence.json"
WORDS = 40  # longest definition quote on the page
TOP = 10  # Fig. 5 shows ten terms

# Fig. 5 as printed: term, papers (the number in the label), then the box's first quartile, median and third quartile
# and the mean (white diamond), read from the vector figure in the paper's PDF (x axis: 0.0 at 261.80 pt, 1.0 at
# 415.44 pt on page 11; a reading is good to about 0.003).
PRINTED = [
    ("fake news", 17, 0.145, 0.245, 0.340, 0.254),  # Fig. 5, row 1
    ("confirmation bias", 10, 0.154, 0.201, 0.283, 0.230),  # Fig. 5, row 2
    ("media bias", 9, 0.146, 0.250, 0.393, 0.304),  # Fig. 5, row 3
    ("discrimination", 8, 0.071, 0.115, 0.197, 0.142),  # Fig. 5, row 4
    ("misinformation", 8, 0.148, 0.249, 0.377, 0.282),  # Fig. 5, row 5
    ("prejudice", 7, 0.117, 0.168, 0.275, 0.238),  # Fig. 5, row 6
    ("selective exposure", 7, 0.171, 0.278, 0.347, 0.266),  # Fig. 5, row 7
    ("disinformation", 6, 0.163, 0.180, 0.379, 0.279),  # Fig. 5, row 8
    ("framing", 6, 0.059, 0.107, 0.177, 0.109),  # Fig. 5, row 9
    ("racism", 5, 0.061, 0.137, 0.163, 0.153),  # Fig. 5, row 10
]
READ_TOLERANCE = 0.005
# The paper's text beside Fig. 5: "median DefScore of 0.25 for media bias" (two decimals).
TEXT_MEDIA_BIAS_MEDIAN = 0.25


def clean(text: str) -> str:
    return " ".join((text or "").split())


def cut(text: str, words: int = WORDS) -> str:
    parts = clean(text).split(" ")
    return " ".join(parts) if len(parts) <= words else " ".join(parts[:words]).rstrip(",;:") + "…"


def r4(x: float) -> float:
    return round(float(x), 4)


def build(gold_dir: Path, work: Path) -> tuple[dict, list[str]]:
    gold = load_gold(gold_dir)
    report = divergence.run(gold, work, baseline_pairs=2000)  # scores come from WORK/score_cache.json when present
    pairs = [json.loads(line) for line in (work / "pairs.jsonl").read_text().splitlines() if line]
    terms = sorted(report["terms"], key=lambda t: (-t["n_papers"], t["term"]))[:TOP]

    papers: dict[str, int] = {}
    paper_rows: list[list] = []
    years = {r["paper_id"]: r["paper_year"] for r in gold.select("paper_id", "paper_year").unique().iter_rows(named=True)}

    def paper_index(row: dict) -> int:
        if row["paper_id"] not in papers:
            papers[row["paper_id"]] = len(paper_rows)
            paper_rows.append([clean(row["title"]), int(years[row["paper_id"]])])
        return papers[row["paper_id"]]

    out_terms = []
    for t in terms:
        members = [p for p in pairs if p["group"] == "cross_paper" and p["term_key"] == t["term"]]
        defs: dict[tuple, int] = {}
        def_rows: list[list] = []

        def def_index(row: dict) -> int:
            key = (row["paper_id"], row["record_index"], row["item_index"])
            if key not in defs:
                defs[key] = len(def_rows)
                def_rows.append([paper_index(row), cut(row["text"])])
            return defs[key]

        # ranked on the score as the page shows it (4 decimals), so that the page's ties are the script's ties
        scored = []
        for order, p in enumerate(members):
            i, j = def_index(p["a"]), def_index(p["b"])
            scored.append((r4(p["defscore"]), metric.token_f1(p["a"]["text"], p["b"]["text"]), order, i, j))
        values = np.array([p["defscore"] for p in members])
        most = min(scored, key=lambda s: (-s[0], -s[1], s[2]))
        least = min(scored, key=lambda s: (s[0], s[1], s[2]))
        ordered = sorted(scored, key=lambda s: (s[0], s[2]))  # by score; the page steps through them in this order
        position = {s[2]: k for k, s in enumerate(ordered)}
        out_terms.append(
            {
                "term": t["term"],
                "papers": t["n_papers"],
                "definitions": len(def_rows),
                "n": len(members),
                "q1": r4(np.quantile(values, 0.25)),
                "median": r4(np.median(values)),
                "q3": r4(np.quantile(values, 0.75)),
                "mean": r4(values.mean()),
                "atMatch": int((values >= metric.MATCH_THRESHOLD).sum()),
                "most": position[most[2]],
                "least": position[least[2]],
                "defs": def_rows,
                "pairs": [[s[3], s[4], s[0]] for s in ordered],
            }
        )
        # the report's own summary must agree with the pairs kept here, and no rounded score may cross the match line
        if len(members) != t["n"] or abs(np.median(values) - t["median"]) > 1e-9:
            raise SystemExit(f"{t['term']}: pairs disagree with the report")
        if ((values >= metric.MATCH_THRESHOLD) != (np.round(values, 4) >= metric.MATCH_THRESHOLD)).any():
            raise SystemExit(f"{t['term']}: a score rounds across the match line")

    cross = report["groups"]["cross_paper"]
    ten_pairs = sum(t["n"] for t in out_terms)
    ten_match = sum(t["atMatch"] for t in out_terms)
    data = {
        "match": metric.MATCH_THRESHOLD,
        "words": WORDS,
        "models": [metric.BGE_MODEL, metric.NLI_MODEL],
        "calibration": [round(metric.DEFSCORE_SLOPE, 5), round(metric.DEFSCORE_INTERCEPT, 5)],
        "all": {
            "definitions": report["definitions"],
            "papers": report["papers"],
            "goldPapers": gold["paper_id"].n_unique(),
            "terms": cross["bootstrap_terms"],
            "pairs": cross["n"],
            "median": r4(cross["median"]),
            "below": round(cross["share_below_0_5"], 4),
            "differentTermMedian": r4(report["groups"]["different_term"]["median"]),
            "differentTermPairs": report["groups"]["different_term"]["n"],
        },
        "ten": {"pairs": ten_pairs, "atMatch": ten_match},
        "papers": paper_rows,
        "terms": out_terms,
    }

    # ------------------------------------------------------------ checks against the printed figure and the text
    failures = []
    print(f"{'term':20s} {'papers':>7s} {'pairs':>6s}   {'q1':>13s} {'median':>13s} {'q3':>13s} {'mean':>13s}   (data / printed)")
    if [t["term"] for t in out_terms] != [p[0] for p in PRINTED]:
        failures.append("the ten terms or their order differ from Fig. 5")
    for t, (term, n_papers, *printed) in zip(out_terms, PRINTED, strict=True):
        cells = []
        for name, want in zip(("q1", "median", "q3", "mean"), printed, strict=True):
            ok = abs(t[name] - want) <= READ_TOLERANCE
            cells.append(f"{t[name]:.3f}/{want:.3f}{'' if ok else ' !'}".rjust(13))
            if not ok:
                failures.append(f"{term} {name}: data {t[name]:.4f}, printed {want:.3f}")
        if t["papers"] != n_papers:
            failures.append(f"{term} papers: data {t['papers']}, printed {n_papers}")
        print(f"{t['term']:20s} {t['papers']:>3d}/{n_papers:<3d} {t['n']:>6d}   {' '.join(cells)}")
    mb = next(t for t in out_terms if t["term"] == "media bias")
    print(f"media bias median {mb['median']:.4f} -> {mb['median']:.2f}; the paper's text: {TEXT_MEDIA_BIAS_MEDIAN:.2f}")
    if round(mb["median"], 2) != TEXT_MEDIA_BIAS_MEDIAN:
        failures.append(f"media bias median {mb['median']:.4f} does not round to the text's {TEXT_MEDIA_BIAS_MEDIAN}")
    for t in out_terms:
        a, b = t["pairs"][t["most"]], t["pairs"][t["least"]]
        print(f"{t['term']:20s} most similar {a[2]:.4f}, least similar {b[2]:.4f}, {t['atMatch']}/{t['n']} pairs at 0.5 or more")
    print(f"ten terms: {ten_pairs} pairs, {ten_match} at 0.5 or more ({ten_pairs - ten_match} below)")
    print(f"all cross-paper pairs: {cross['n']} over {cross['bootstrap_terms']} terms, median {cross['median']:.4f}, "
          f"{cross['share_below_0_5']:.1%} below 0.5; different-term pairs median {data['all']['differentTermMedian']}")
    return data, failures


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--gold", type=Path, required=True, help="folder with MBDef-Gold's train/validation/test.parquet")
    ap.add_argument("--work", type=Path, required=True, help="folder for the pair scores (a cache) and the run's report")
    ap.add_argument("--out", type=Path, default=OUT)
    args = ap.parse_args()
    data, failures = build(args.gold, args.work)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out} ({len(text.encode()) / 1024:.0f} KB)")
    for f in failures:
        print("CHECK FAILED:", f)
    print("all checks pass" if not failures else f"{len(failures)} checks failed")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
