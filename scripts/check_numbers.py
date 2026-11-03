# /// script
# requires-python = ">=3.12"
# dependencies = ["polars"]
# ///
"""Check every number in the page's own text against its source, and fail when one has none.

The page states numbers in index.html: the highlights and the abstract (the PROJECT object), the five step cards,
the captions of the paper's figures, the map's caption and the headline tiles. Each must be either

* found in the paper's LaTeX source (the paper is the source of the page's claims), or
* recomputed here from MBDef's released tables (for the counts the page takes from the data), or
* listed in PRINTED below: numbers that appear only inside the paper's printed figures, each with its figure.

Years, DOIs, the BibTeX block and the affiliation numbers are skipped. The script prints each number with where it
was found, and exits 1 if any number is unaccounted for.

    uv run scripts/check_numbers.py --tex /path/to/paper.tex --data /path/to/MBDef/data
"""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path

import polars as pl

ROOT = Path(__file__).resolve().parent.parent

# numbers that the paper prints only inside its figures (not in its text)
PRINTED = {
    "1,891": "Fig. 3: definitions of fake news",
    "9": "Fig. 5: media bias is defined in 9 MBDef-Gold papers",
}


def page_text() -> str:
    s = (ROOT / "index.html").read_text()
    s = re.sub(r"bibtex: `.*?`,", "", s, flags=re.S)                    # the BibTeX entries
    s = re.sub(r"<pre id=\"bibtex-code\">.*?</pre>", "", s, flags=re.S)
    s = re.sub(r"affiliation: \[[^\]]*\]", "", s)                         # authors' affiliation numbers
    s = re.sub(r"url: \"[^\"]*\"", "", s)                                 # authors' links (ORCID ids)
    s = re.sub(r"<head>.*?const PROJECT = \{", "", s, flags=re.S)         # meta tags, analytics ids
    s = re.sub(r"function writeProjectHead.*?</script>", "", s, flags=re.S)
    s = re.sub(r"<(script|style)[^>]*>.*?</\1>", "", s, flags=re.S)
    s = re.sub(r"\b(?:10\.5281/zenodo\.\d+|zenodo\.\d+|\d{4}-\d{2}-\d{2})\b", "", s)
    s = re.sub(r"(href|src|width|height)=\"[^\"]*\"", "", s)
    return html.unescape(s)


def numbers(text: str) -> list[str]:
    found = re.findall(r"(?<![\w.])(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)(%?)(?![\w])", text)
    out = []
    for num, _ in found:
        if re.fullmatch(r"(19|20)\d\d", num):  # a year
            continue
        if num in {"0", "1", "2", "3", "4", "5", "6", "4.0", "101"}:  # step and figure numbers, scale ends, CC BY-SA 4.0, "Media Bias 101"
            continue
        out.append(num)
    return sorted(set(out), key=lambda n: float(n.replace(",", "")))


def data_numbers(folder: Path) -> dict[str, str]:
    papers = pl.read_parquet(folder / "papers.parquet")
    defs = pl.read_parquet(folder / "definitions.parquet", columns=[pl.read_parquet_schema(folder / "definitions.parquet").names()[0]])
    terms = pl.read_parquet(folder / "concepts.parquet", columns=[pl.read_parquet_schema(folder / "concepts.parquet").names()[0]])
    points = json.loads((ROOT / "static" / "data" / "points.json").read_text())
    seeds = papers.filter(pl.col("corpus") == "seeds").height
    facts = {
        f"{papers.height:,}": "papers in the released papers table",
        f"{defs.height:,}": "rows of the released definitions table",
        f"{terms.height:,}": "rows of the released concepts (terms) table",
        f"{seeds:,}": "seed papers in the released papers table",
        f"{papers.height - seeds:,}": "cited (closure) papers in the released papers table",
        f"{len(points['topics'])}": "topics on the map (points.json)",
        f"{points['count']:,}": "dots on the map (points.json)",
    }
    return facts


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tex", type=Path, required=True, help="the paper's LaTeX source")
    ap.add_argument("--data", type=Path, required=True, help="the folder of MBDef's released parquet tables")
    args = ap.parse_args()
    tex = args.tex.read_text()
    tex_nums = set(re.findall(r"\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?", tex))
    facts = data_numbers(args.data)
    missing = 0
    for n in numbers(page_text()):
        where = []
        if n in tex_nums:
            where.append("paper text")
        if n in facts:
            where.append(facts[n])
        if n in PRINTED:
            where.append(PRINTED[n])
        print(f"{n:>9}  {'; '.join(where) if where else 'NOT FOUND'}")
        missing += not where
    if missing:
        raise SystemExit(f"{missing} number(s) on the page have no source")
    print("every number on the page has a source")


if __name__ == "__main__":
    main()
