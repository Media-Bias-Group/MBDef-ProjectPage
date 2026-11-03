"""The data of the interactive Fig. 2 (research disciplines): static/data/figs/disciplines.json.

The paper's Fig. 2 counts the 6,115 MBDef papers by the field of their OpenAlex primary topic, seed papers apart from
the papers added through citations (closure), with the Social Sciences subfields as an inset. MBDef records each
paper's OpenAlex id and DOI but no discipline, so the fields come from OpenAlex, through the MBDef code
(`mbdef.analysis.disciplines`, tutorial 05): it looks each paper up by OpenAlex id, else by DOI, and keeps every answer
in a cache file.

OpenAlex reclassifies works over time, so a fresh lookup can differ from the printed figure. The rule of this figure:
the bars always show the printed counts (PRINTED_* below); the subfields of the other fields, the papers listed per
field and the reasons a paper is unclassified come from the cached lookup, and the JSON records, field by field, how
far today's lookup is from the print, so the page can say so.

Run it with the MBDef code installed (e.g. its checkout's venv):

    python scripts/figs/disciplines.py --data <MBDef>/data --cache <openalex-cache.json> [--fetch]

--fetch fills the cache from the OpenAlex API first (a few minutes; an OPENALEX_API_KEY in the MBDef checkout's .env
is optional). Without it the script reads only the cache. It prints its checks and exits non-zero when one fails.
"""

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import polars as pl
from mbdef.analysis import disciplines
from mbdef.collect.identity import unicode_words

OUT = Path(__file__).resolve().parents[2] / "static" / "data" / "figs" / "disciplines.json"

# paper Fig. 2: the bars, in the printed order, as (name, seed papers, cited papers)
PRINTED_FIELDS = [
    ("Social Sciences", 2158, 1426),  # paper Fig. 2
    ("Computer Science", 352, 439),  # paper Fig. 2
    ("Arts and Humanities", 209, 139),  # paper Fig. 2
    ("Psychology", 71, 89),  # paper Fig. 2
    ("Medicine and Health Professions", 34, 35),  # paper Fig. 2
    ("Decision Sciences", 26, 38),  # paper Fig. 2
    ("Physics and Astronomy", 10, 41),  # paper Fig. 2
    ("Business, Management and Accounting", 13, 20),  # paper Fig. 2
    ("Neuroscience", 3, 23),  # paper Fig. 2
    ("Economics, Econometrics and Finance", 9, 10),  # paper Fig. 2
    ("Other classified fields", 30, 27),  # paper Fig. 2
    ("Unclassified", 800, 113),  # paper Fig. 2
]
# paper Fig. 2, inset: the Social Sciences subfields, as (name, seed papers, cited papers)
PRINTED_SOCIAL_SUBFIELDS = [
    ("Sociology and Political Science", 1067, 707),  # paper Fig. 2 (inset)
    ("Communication", 609, 328),  # paper Fig. 2 (inset)
    ("Political Science and International Relations", 153, 103),  # paper Fig. 2 (inset)
    ("Safety Research", 68, 153),  # paper Fig. 2 (inset)
    ("Gender Studies", 71, 36),  # paper Fig. 2 (inset)
    ("Law", 42, 17),  # paper Fig. 2 (inset)
    ("Other subfields", 148, 82),  # paper Fig. 2 (inset)
]
PRINTED_SOCIAL_SHARE = 58.6  # paper, Section 4 (text beside Fig. 2): % of papers from the social sciences
PRINTED_TOTAL = 6115  # paper Fig. 2 caption: the papers counted

MERGED = {"Medicine": "Medicine and Health Professions", "Health Professions": "Medicine and Health Professions"}
OTHER_FIELDS, UNCLASSIFIED, OTHER_SUB = "Other classified fields", "Unclassified", "Other subfields"
TOP_SUBFIELDS = 6  # as the printed inset: the six largest subfields, then the rest as one row
TOP_PAPERS = 5  # papers listed per field
TOP_PAPERS_SUB = 3  # papers listed per subfield
CORPUS = {"seeds": "s", "closure": "c"}
REASONS = {  # why a paper has no field, in plain words
    "no_identifier": "no OpenAlex id or DOI in MBDef",
    "not_found": "its id or DOI is not in OpenAlex",
    "matched_without_primary_topic": "found in OpenAlex, but without a topic",
    "not_queried": "not looked up",
}


def field_of(row):
    """The printed bar a paper falls in by its looked-up primary field (Other and Unclassified decided later)."""
    name = row["primary_field"]
    return MERGED.get(name, name) if name else UNCLASSIFIED


def pair(rows):
    c = Counter(r["corpus"] for r in rows)
    return [c.get("seeds", 0), c.get("closure", 0)]


def top_papers(rows, n):
    """The N papers with the most definitions in MBDef, among those whose MBDef title is the title of the OpenAlex work
    they were matched to (so the field shown is surely theirs, and the title is clean) and has three words or more
    (a title such as "Introduction" names a chapter, not the work); ties by title, then id."""
    ranked = sorted(
        (r for r in rows if r["title_confirmed"] and len(unicode_words(r["title"] or "").split()) >= 3),
        key=lambda r: (-r["n_definitions"], r["title"].lower(), r["paper_id"]),
    )
    return [
        {"t": r["title"], "y": r["year"], "c": CORPUS[r["corpus"]], "d": r["n_definitions"]}
        for r in ranked[:n]
    ]


def subfields(rows, name_key="primary_subfield", other=OTHER_SUB):
    """The TOP_SUBFIELDS largest subfields of ROWS (ties by name), the rest as one row (unless it is one subfield), each
    with its top papers."""
    groups = {}
    for r in rows:
        groups.setdefault(r[name_key] or "No subfield", []).append(r)
    ranked = sorted(groups, key=lambda k: (-len(groups[k]), k))
    shown = ranked if len(ranked) <= TOP_SUBFIELDS + 1 else ranked[:TOP_SUBFIELDS]
    out = [{"name": k, "n": pair(groups[k]), "papers": top_papers(groups[k], TOP_PAPERS_SUB)} for k in shown]
    rest = [r for k in ranked[len(shown):] for r in groups[k]]
    if rest:
        out.append(
            {"name": other, "n": pair(rest), "papers": top_papers(rest, TOP_PAPERS_SUB), "members": len(ranked) - len(shown)}
        )
    return out


def matched_title(row, lookups):
    """The title of the OpenAlex work a paper was matched to, or None."""
    key = {"openalex": disciplines.work_id(row["openalex_id"]), "doi": disciplines.doi(row["doi"])}.get(row["match_method"])
    work = (lookups.get(f"{row['match_method']}:{key}") or {}).get("work") if key else None
    return (work or {}).get("display_name")


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data", required=True, help="the folder of MBDef's released parquet tables")
    ap.add_argument("--cache", required=True, help="the OpenAlex cache of mbdef.analysis.disciplines")
    ap.add_argument("--fetch", action="store_true", help="fill the cache from the OpenAlex API first")
    ap.add_argument("--out", default=str(OUT))
    args = ap.parse_args()

    table = pl.read_parquet(Path(args.data) / "papers.parquet")
    papers = table.select("paper_id", "corpus", "title", "year", "doi", "openalex_id").to_dicts()
    cache = disciplines.enrich(papers, args.cache) if args.fetch else disciplines.read_cache(args.cache)
    rows, _counts = disciplines.summarize(papers, cache)
    ndef = dict(zip(table["paper_id"], table["n_definitions"], strict=True))
    for r in rows:
        r["n_definitions"] = ndef[r["paper_id"]]
        r["field"] = field_of(r)
        r["title_confirmed"] = r["status"] == "classified" and unicode_words(r["title"] or "") == unicode_words(
            matched_title(r, cache["lookups"]) or ""
        )

    checks = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))

    # ---- the printed bars against what the released data fixes (the papers and their seed / cited split)
    total, seeds, cited = len(rows), *pair(rows)
    p_seed = sum(s for _, s, _ in PRINTED_FIELDS)
    p_cited = sum(c for _, _, c in PRINTED_FIELDS)
    check("released papers = printed total", total == PRINTED_TOTAL, f"{total:,} vs {PRINTED_TOTAL:,}")
    check("printed bars add up to the released papers", p_seed + p_cited == total, f"{p_seed + p_cited:,} vs {total:,}")
    check("printed seed parts = released seed papers", p_seed == seeds, f"{p_seed:,} vs {seeds:,}")
    check("printed cited parts = released cited papers", p_cited == cited, f"{p_cited:,} vs {cited:,}")
    social = next((s, c) for n, s, c in PRINTED_FIELDS if n == "Social Sciences")
    sub_seed = sum(s for _, s, _ in PRINTED_SOCIAL_SUBFIELDS)
    sub_cited = sum(c for _, _, c in PRINTED_SOCIAL_SUBFIELDS)
    check("printed inset adds up to the Social Sciences bar", (sub_seed, sub_cited) == social, f"{sub_seed + sub_cited:,} vs {sum(social):,}")
    share = round(100 * sum(social) / total, 1)
    check("Social Sciences share = the paper's 58.6%", share == PRINTED_SOCIAL_SHARE, f"{share}%")
    check("every paper was looked up", all(r["status"] != "not_queried" for r in rows), "")
    confirmed = sum(r["title_confirmed"] for r in rows)
    classified = sum(r["status"] == "classified" for r in rows)
    print(f"titles confirmed by OpenAlex: {confirmed:,} of {classified:,} classified papers")

    # ---- today's lookup, bar by bar: the ten named fields, the other classified fields, the unclassified papers
    named = [n for n, _, _ in PRINTED_FIELDS if n not in (OTHER_FIELDS, UNCLASSIFIED)]
    for r in rows:
        if r["field"] not in named and r["field"] != UNCLASSIFIED:
            r["bar"] = OTHER_FIELDS
        else:
            r["bar"] = r["field"]
    by_bar = {}
    for r in rows:
        by_bar.setdefault(r["bar"], []).append(r)

    fields, drift = [], []
    for name, s, c in PRINTED_FIELDS:
        members = by_bar.get(name, [])
        today = pair(members)
        entry = {"name": name, "n": [s, c], "today": today}
        if name != UNCLASSIFIED:  # unclassified papers have no OpenAlex record to confirm their title by
            entry["papers"] = top_papers(members, TOP_PAPERS)
            entry["confirmed"] = sum(r["title_confirmed"] for r in members)
        if name == UNCLASSIFIED:
            reasons = {}
            for r in members:
                reasons.setdefault(r["status"], []).append(r)
            entry["reasons"] = [
                {"name": REASONS[k], "n": pair(v)} for k, v in sorted(reasons.items(), key=lambda kv: (-len(kv[1]), kv[0]))
            ]
        elif name == OTHER_FIELDS:
            entry["subfields"] = subfields(members, "primary_field", "Remaining fields")  # the fields inside
            entry["groups"] = "fields"
        else:
            entry["subfields"] = subfields(members)
            if name == "Medicine and Health Professions":
                entry["parts"] = [[k, v] for k, v in sorted(Counter(r["primary_field"] for r in members).items())]
        if today != [s, c]:
            drift.append(f"{name}: printed {s + c:,} ({s:,}, {c:,}), today {sum(today):,} ({today[0]:,}, {today[1]:,})")
        fields.append(entry)

    # the printed inset: Social Sciences' subfields carry the printed counts, today's beside them
    social_entry = fields[0]
    inset = []
    for name, s, c in PRINTED_SOCIAL_SUBFIELDS:
        if name == OTHER_SUB:
            named_sub = {n for n, _, _ in PRINTED_SOCIAL_SUBFIELDS if n != OTHER_SUB}
            rest = [r for r in by_bar.get("Social Sciences", []) if (r["primary_subfield"] or "No subfield") not in named_sub]
            today, papers = pair(rest), top_papers(rest, TOP_PAPERS_SUB)
            extra = {"members": len({r["primary_subfield"] for r in rest})}
        else:
            got = [r for r in by_bar.get("Social Sciences", []) if r["primary_subfield"] == name]
            today, papers, extra = pair(got), top_papers(got, TOP_PAPERS_SUB), {}
        inset.append({"name": name, "n": [s, c], "today": today, "papers": papers, **extra})
        if today != [s, c]:
            drift.append(f"Social Sciences / {name}: printed {s + c:,} ({s:,}, {c:,}), today {sum(today):,} ({today[0]:,}, {today[1]:,})")
    social_entry["subfields"] = inset
    social_entry["printed_inset"] = True

    stamps = sorted(e["retrieved_at"][:10] for e in cache["lookups"].values() if e.get("retrieved_at"))
    data = {
        "total": total,
        "seeds": seeds,
        "cited": cited,
        "lookup": {"from": stamps[0], "to": stamps[-1], "same_as_print": not drift, "drift": drift},
        "rule": {"papers": TOP_PAPERS, "papers_sub": TOP_PAPERS_SUB, "subfields": TOP_SUBFIELDS, "confirmed": confirmed, "classified": classified},
        "fields": fields,
    }
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n"
    Path(args.out).write_text(text, encoding="utf-8")

    for name, ok, detail in checks:
        print(f"{'ok  ' if ok else 'FAIL'} {name}{': ' + detail if detail else ''}")
    print(f"today's OpenAlex lookup ({stamps[0]} to {stamps[-1]}):", "same as the print" if not drift else f"{len(drift)} counts differ")
    for line in drift:
        print("  drift", line)
    print(f"wrote {args.out} ({len(text.encode()):,} bytes)")
    sys.exit(0 if all(ok for _, ok, _ in checks) else 1)


if __name__ == "__main__":
    main()
