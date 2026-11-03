"""The data of the interactive Fig. 6 (concept connections): static/data/figs/network.json.

The paper's Fig. 6 is drawn by the MBDef code (`mbdef.analysis.connections`, tutorial 03). `network_inputs` reads
every narrower-to-broader statement of the released `terms` table: a paper that defines a term lists another term as
one of its subtypes (narrower terms) or supertypes (broader terms), and the dataset links that name to one of its
terms. `connections_figure` keeps every term on a shortest path between two of the six query terms (direction
ignored), then every statement between two kept terms, and draws them at the fixed positions of
`network_layout.json`, each arrow labelled with the number of distinct papers behind it.

This script runs that code on the released tables, unchanged, and takes from the figure it draws the box of every
term, the route of every arrow and the place of every count, so the page can redraw the printed figure at any width.
It adds what the page shows on demand: for each arrow the papers behind it (title, year, seed or cited) with the words
each uses, and for each term the number of papers that define it.

Checks against the printed figure (PRINTED_* below, read off the paper's Fig. 6; each count was matched to its arrow
by its route, which is the route the code draws today): the same 24 terms, the same 63 arrows, the same count on
every arrow. A difference is kept in the JSON (the page shows the data's number with a note) and makes the script
exit non-zero.

The paper prints four terms in lower case where the released labels differ: "commercial bias", "ownership bias" and
"religious bias" (labels "Commercial Bias", "Ownership Bias", "Religious Bias") and "cognitive bias" (label
"cognitive biases"; "cognitive bias" is one of its spellings). The page uses the printed names; the figure's boxes are
sized as the code sizes them, with the labels in lower case as printed.

Run it with the MBDef code installed (e.g. its checkout's venv):

    python scripts/figs/network.py --data <MBDef>/data
"""

import argparse
import json
import sys
import tempfile
from collections import Counter, defaultdict, deque
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import polars as pl  # noqa: E402
from matplotlib.patches import FancyArrowPatch  # noqa: E402
from matplotlib.path import Path as PlotPath  # noqa: E402
from mbdef.analysis import load  # noqa: E402
from mbdef.analysis.connections import ANCHORS, connections_figure, network_inputs  # noqa: E402
from mbdef.analysis.queries import find_concept  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "static" / "data" / "figs" / "network.json"

# paper Fig. 6: the 24 terms as printed (the six query terms are the filled boxes)
PRINTED_TERMS = [
    "media bias", "bias", "misinformation", "disinformation", "fake news", "propaganda",  # paper Fig. 6 (filled)
    "commercial bias", "ideological stand bias", "informational bias", "spin", "paltering",  # paper Fig. 6
    "political bias", "framing bias", "ownership bias", "lexical bias", "framing",  # paper Fig. 6
    "linguistic bias", "racial bias", "selection bias", "religious bias", "cognitive bias",  # paper Fig. 6
    "statement bias", "coverage bias", "distortion",  # paper Fig. 6
]
PRINTED_QUERY = ["media bias", "bias", "misinformation", "disinformation", "fake news", "propaganda"]  # paper Fig. 6
# paper Fig. 6: every arrow as (narrower term, broader term, the number printed on it)
PRINTED_EDGES = [
    ("cognitive bias", "media bias", 1),  # paper Fig. 6
    ("cognitive bias", "bias", 1),  # paper Fig. 6
    ("framing bias", "media bias", 2),  # paper Fig. 6
    ("framing bias", "informational bias", 1),  # paper Fig. 6
    ("framing bias", "linguistic bias", 1),  # paper Fig. 6
    ("framing bias", "framing", 1),  # paper Fig. 6
    ("framing bias", "bias", 2),  # paper Fig. 6
    ("informational bias", "media bias", 3),  # paper Fig. 6
    ("informational bias", "framing", 3),  # paper Fig. 6
    ("informational bias", "political bias", 1),  # paper Fig. 6
    ("informational bias", "bias", 1),  # paper Fig. 6
    ("commercial bias", "media bias", 1),  # paper Fig. 6
    ("commercial bias", "bias", 1),  # paper Fig. 6
    ("misinformation", "disinformation", 3),  # paper Fig. 6
    ("misinformation", "fake news", 28),  # paper Fig. 6
    ("misinformation", "propaganda", 2),  # paper Fig. 6
    ("coverage bias", "media bias", 1),  # paper Fig. 6
    ("coverage bias", "framing", 1),  # paper Fig. 6
    ("coverage bias", "bias", 2),  # paper Fig. 6
    ("disinformation", "misinformation", 33),  # paper Fig. 6
    ("disinformation", "fake news", 28),  # paper Fig. 6
    ("disinformation", "propaganda", 1),  # paper Fig. 6
    ("racial bias", "media bias", 1),  # paper Fig. 6
    ("racial bias", "bias", 2),  # paper Fig. 6
    ("linguistic bias", "media bias", 2),  # paper Fig. 6
    ("linguistic bias", "bias", 2),  # paper Fig. 6
    ("paltering", "misinformation", 2),  # paper Fig. 6
    ("framing", "media bias", 1),  # paper Fig. 6
    ("framing", "informational bias", 1),  # paper Fig. 6
    ("framing", "bias", 1),  # paper Fig. 6
    ("framing", "fake news", 1),  # paper Fig. 6
    ("spin", "media bias", 2),  # paper Fig. 6
    ("spin", "disinformation", 1),  # paper Fig. 6
    ("spin", "paltering", 1),  # paper Fig. 6
    ("lexical bias", "media bias", 4),  # paper Fig. 6
    ("lexical bias", "linguistic bias", 1),  # paper Fig. 6
    ("lexical bias", "political bias", 1),  # paper Fig. 6
    ("lexical bias", "bias", 1),  # paper Fig. 6
    ("statement bias", "media bias", 1),  # paper Fig. 6
    ("statement bias", "framing", 1),  # paper Fig. 6
    ("statement bias", "bias", 1),  # paper Fig. 6
    ("political bias", "media bias", 2),  # paper Fig. 6
    ("political bias", "bias", 2),  # paper Fig. 6
    ("selection bias", "cognitive bias", 1),  # paper Fig. 6
    ("selection bias", "media bias", 3),  # paper Fig. 6
    ("selection bias", "bias", 1),  # paper Fig. 6
    ("ideological stand bias", "media bias", 1),  # paper Fig. 6
    ("ideological stand bias", "bias", 1),  # paper Fig. 6
    ("distortion", "disinformation", 1),  # paper Fig. 6
    ("ownership bias", "media bias", 1),  # paper Fig. 6
    ("ownership bias", "bias", 1),  # paper Fig. 6
    ("bias", "misinformation", 1),  # paper Fig. 6
    ("bias", "distortion", 1),  # paper Fig. 6
    ("religious bias", "media bias", 1),  # paper Fig. 6
    ("religious bias", "bias", 1),  # paper Fig. 6
    ("fake news", "misinformation", 35),  # paper Fig. 6
    ("fake news", "disinformation", 41),  # paper Fig. 6
    ("fake news", "distortion", 1),  # paper Fig. 6
    ("fake news", "propaganda", 2),  # paper Fig. 6
    ("propaganda", "misinformation", 3),  # paper Fig. 6
    ("propaganda", "disinformation", 6),  # paper Fig. 6
    ("propaganda", "framing", 1),  # paper Fig. 6
    ("propaganda", "fake news", 31),  # paper Fig. 6
]
# the four misinformation terms of the lead line
CLUSTER = ["misinformation", "disinformation", "fake news", "propaganda"]
CORPUS = {"seeds": "s", "closure": "c"}
FIELD = {"subtypes": "b", "supertypes": "n"}  # b: the paper defines the broader term; n: it defines the narrower one
ROUND = 3  # decimals of the figure's coordinates (inches on a 38 x 12 inch canvas)


def capture_figure(evidence, requested, labels):
    """Run the MBDef figure code unchanged and take, from the figure it draws, every box, arrow route and count place."""
    grabbed = {}
    close = plt.close

    def grab(fig=None):
        if fig is not None and "geometry" not in grabbed:
            grabbed["geometry"] = read_geometry(fig)
        return close(fig)

    plt.close = grab
    try:
        with tempfile.TemporaryDirectory() as tmp:
            audit = Path(tmp) / "relations.json"
            connections_figure(Path(tmp), evidence, requested, audit_path=audit, node_labels=labels)
            relations = json.loads(audit.read_text(encoding="utf-8"))
    finally:
        plt.close = close
    return grabbed["geometry"], relations


def read_geometry(fig):
    """Boxes (by label), arrows and count places (by 'source->target'), in the figure's inches, y downward."""
    fig.canvas.draw()
    renderer = fig.canvas.get_renderer()
    ax = fig.axes[0]
    to_data = ax.transData.inverted()
    boxes, places, arrows = {}, {}, {}
    for text in ax.texts:
        gid = text.get_gid() or ""
        if gid.startswith("paper-count:"):
            key = gid.split(":", 1)[1].split(";")[0]
            places[key] = [round(float(v), ROUND) for v in text.get_position()]
        else:
            extent = text.get_bbox_patch().get_window_extent(renderer)
            (x0, y1), (x1, y0) = to_data.transform([(extent.x0, extent.y0), (extent.x1, extent.y1)])
            boxes[text.get_text().replace("\n", " ")] = [round(float(v), ROUND) for v in (x0, y0, x1, y1)]
    for patch in ax.patches:
        gid = patch.get_gid() or ""
        if isinstance(patch, FancyArrowPatch) and gid.startswith("relation:"):
            key = gid.split(":", 1)[1].split(";")[0]
            arrows[key] = svg_path(patch._path_original)  # the route as the code built it, before the arrow head
    return {"boxes": boxes, "places": places, "arrows": arrows}


def svg_path(path):
    """A Matplotlib path of one move and quadratic or cubic pieces as SVG path data, in inches."""
    out, i = [], 0
    vertices, codes = path.vertices, list(path.codes)

    def pt(v):
        return f"{round(float(v[0]), ROUND):g} {round(float(v[1]), ROUND):g}"

    while i < len(codes):
        code = codes[i]
        if code == PlotPath.MOVETO:
            out.append("M" + pt(vertices[i]))
            i += 1
        elif code == PlotPath.CURVE3:
            out.append("Q" + pt(vertices[i]) + " " + pt(vertices[i + 1]))
            i += 2
        elif code == PlotPath.CURVE4:
            out.append("C" + pt(vertices[i]) + " " + pt(vertices[i + 1]) + " " + pt(vertices[i + 2]))
            i += 3
        else:
            raise ValueError(f"Unexpected path code {code}")
    return "".join(out)


def connected_without_single_links(edges, start, targets):
    """Whether START still reaches any of TARGETS when only the links of 2+ papers are kept (direction ignored)."""
    nbr = defaultdict(set)
    for (a, b), n in edges.items():
        if n >= 2:
            nbr[a].add(b)
            nbr[b].add(a)
    seen, queue = {start}, deque([start])
    while queue:
        for nxt in nbr[queue.popleft()]:
            if nxt not in seen:
                seen.add(nxt)
                queue.append(nxt)
    return bool(seen & set(targets))


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--data", required=True, help="the MBDef data folder (concepts, instances, definitions, papers, terms .parquet)")
    args = ap.parse_args()
    data = load(args.data)
    failures = []

    def check(ok, msg):
        print(("ok   " if ok else "FAIL ") + msg)
        if not ok:
            failures.append(msg)

    evidence, requested, labels, _ = network_inputs(data, ANCHORS)
    printed_id = {name: find_concept(data, name) for name in PRINTED_TERMS}
    printed_name = {cid: name for name, cid in printed_id.items()}
    # the boxes are sized as the code sizes them, with the names in lower case as printed (the layout file is keyed by
    # label, ignoring case, so "cognitive biases" keeps its own label there)
    draw_labels = {cid: (label.lower() if label.lower() in printed_id else label) for cid, label in labels.items()}
    geometry, relations = capture_figure(evidence, requested, draw_labels)

    # ---------------------------------------------------------------- terms
    terms = sorted(relations["nodes"], key=lambda c: (c not in requested, requested.index(c) if c in requested else 0, draw_labels[c]))
    check(set(terms) == set(printed_id.values()), f"the same {len(PRINTED_TERMS)} terms as printed (data: {len(terms)})")
    check({printed_id[n] for n in PRINTED_QUERY} == set(requested), "the six filled terms are the six query terms")
    index = {c: i for i, c in enumerate(terms)}
    defs = data["definitions"].group_by("concept_id").agg(pl.len().alias("defs"), pl.col("paper_id").n_unique().alias("papers"))
    defs = {r["concept_id"]: r for r in defs.iter_rows(named=True)}
    concept_papers = dict(data["concepts"].select("concept_id", "n_papers").iter_rows())
    nodes = []
    for c in terms:
        name = printed_name.get(c, labels[c])
        box = geometry["boxes"][draw_labels[c]]
        check(defs[c]["papers"] == concept_papers[c], f"{name}: papers that define it, {defs[c]['papers']}, as the concepts table says")
        nodes.append({"name": name, "label": labels[c], "query": c in requested, "box": box,
                      "papers": defs[c]["papers"], "defs": defs[c]["defs"]})

    # ---------------------------------------------------------------- arrows and the papers behind them
    papers = data["papers"].select("paper_id", "title", "year", "corpus")
    paper_row = {r["paper_id"]: r for r in papers.iter_rows(named=True)}
    own_term = dict(data["instances"].select("mention_id", "term").iter_rows())
    used, edges, counts = {}, [], {}
    printed = {(printed_id[a], printed_id[b]): n for a, b, n in PRINTED_EDGES}
    check(len(printed) == len(PRINTED_EDGES), "no arrow listed twice among the printed ones")
    data_edges = {(e["source"], e["target"]): e for e in relations["edges"]}
    check(set(data_edges) == set(printed), f"the same {len(PRINTED_EDGES)} arrows as printed (data: {len(data_edges)})")
    for (a, b), e in sorted(data_edges.items(), key=lambda kv: (-kv[1]["distinct_papers"], index[kv[0][0]], index[kv[0][1]])):
        n = e["distinct_papers"]
        counts[a, b] = n
        by_paper = defaultdict(list)
        for claim in e["evidence"]:
            said = [FIELD[claim["field"]], own_term[claim["mention_id"]], claim["as_written"] or claim["related_term"]]
            if said not in by_paper[claim["paper_id"]]:
                by_paper[claim["paper_id"]].append(said)
        check(len(by_paper) == n, f"{printed_name[a]} -> {printed_name[b]}: {n} distinct papers in the evidence")
        want = printed.get((a, b))
        check(want == n, f"{printed_name[a]} -> {printed_name[b]}: printed {want}, data {n}")
        rows = []
        for pid in sorted(by_paper, key=lambda p: (-(paper_row[p]["year"] or 0), paper_row[p]["title"].casefold(), p)):
            if pid not in used:
                used[pid] = len(used)
            rows.append([used[pid], sorted(by_paper[pid])])
        key = f"{a}->{b}"
        edges.append({"s": index[a], "t": index[b], "n": n, "printed": want, "path": geometry["arrows"][key],
                      "at": geometry["places"][key], "papers": rows})
    paper_list = [[paper_row[p]["title"], paper_row[p]["year"], CORPUS[paper_row[p]["corpus"]]] for p in used]

    # ---------------------------------------------------------------- the facts the page states
    mb, cluster = printed_id["media bias"], [printed_id[n] for n in CLUSTER]
    direct = [k for k in counts if (k[0] == mb and k[1] in cluster) or (k[1] == mb and k[0] in cluster)]
    check(not direct, "no arrow between media bias and the four misinformation terms (lead line)")
    check(not connected_without_single_links(counts, mb, cluster),
          "without the one-paper arrows, media bias no longer reaches the four misinformation terms (lead line)")
    strongest = max(counts, key=counts.get)
    check((printed_name[strongest[0]], printed_name[strongest[1]], counts[strongest]) == ("fake news", "disinformation", 41),
          "the strongest arrow: fake news -> disinformation, 41 papers (worked example)")
    into_mb = sorted(printed_name[a] for (a, b), n in counts.items() if b == mb and n == 1)
    print("one-paper arrows into media bias:", ", ".join(into_mb))
    one_into = [(a, n) for (a, b), n in counts.items() if b == mb and n == 1]
    top = max(one_into, key=lambda an: defs[an[0]]["papers"])[0]
    check((printed_name.get(top), defs[top]["papers"]) == ("framing", 420),
          "worked example: the one-paper arrow into media bias from the term most papers define is framing (420 papers)")
    sources = Counter(next(iter({c["paper_id"] for c in data_edges[a, mb]["evidence"]})) for a, _ in one_into)
    check(sources.most_common(1)[0][1] == 4 and len(one_into) == 9,
          "how to read it: 4 of the 9 one-paper arrows into media bias come from the same paper")
    check(counts[printed_id["disinformation"], printed_id["fake news"]] == 28, "the reverse arrow: disinformation -> fake news, 28 papers (how to read it)")
    bridges = sorted(
        (printed_name[a], printed_name[b], n) for (a, b), n in counts.items()
        if (a in cluster) != (b in cluster) and n == 1 and printed_name[a] in {"bias", "framing", "spin", "distortion", "propaganda", "fake news"}
    )
    print("one-paper arrows to and from the four misinformation terms:", bridges)

    payload = {
        "canvas": relations["layout"]["canvas_inches"],
        "font": round(relations["typography"]["node_font_size"] / 72, 4),  # the printed node font, in inches
        "terms": nodes,
        "edges": edges,
        "papers": paper_list,
        "counts": {"terms": len(nodes), "arrows": len(edges), "papers": len(paper_list),
                   "one_paper": sum(1 for e in edges if e["n"] == 1)},
        "mismatches": [[nodes[e["s"]]["name"], nodes[e["t"]]["name"], e["printed"], e["n"]] for e in edges if e["printed"] != e["n"]],
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), sort_keys=False)
    OUT.write_text(text + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(text.encode()) / 1024:.0f} KB): {len(nodes)} terms, {len(edges)} arrows, {len(paper_list)} papers")
    if failures:
        print(f"{len(failures)} check(s) failed", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
