# /// script
# requires-python = ">=3.12"
# dependencies = ["pyarrow"]
# ///
"""Build the small point file for the rotating 3D map at the top of the page: one dot per term of MBDef.

Inputs:

* the dataset explorer's data folder (``meta.json`` and the ``mentions/NN.json`` shards): the map position and the
  topic of every place where a paper defines a term;
* MBDef's ``data/instances.parquet``: one row per (term, paper), with the term's id (``concept_id``), the id of that
  row in the explorer (``mention_id``) and how many definitions the paper gives (``n_definitions``). It has 62,066
  rows for 34,916 terms and 103,476 definitions.

The rule that places a term: a term is defined by one or more papers, and each of them has its own position on the
explorer's map. The term's dot goes at the position of the paper whose entry gives the most definitions of it; when
two or more give the same number, the one whose ``mention_id`` sorts first wins. The dot takes that entry's topic
colour. So every one of the 34,916 terms is one dot, and the output is the same on every run.

Worked example: the term "language bias" (``concept_id`` g00818f83cda4) is defined by three papers, with 3, 1 and 3
definitions (entries m83c0653ee1dbc7a0, mbc594b4cadf01d0d, md51cac884e100a44). The two entries with 3 tie, and
m83c0653ee1dbc7a0 sorts first, so the term's dot sits where that entry sits and takes its topic colour.

Outputs:

* ``static/data/points.bin``  - for each term, in ``concept_id`` order: x, y, z as unsigned 16-bit integers (little
  endian), then all topic numbers as unsigned 8-bit integers. ``3 * 2 * n + n`` bytes.
* ``static/data/points.json`` - the point count, how to turn the integers back into positions, the topic colours
  and the topic labels shown on the map.

Positions and colours follow the explorer's Map tab: the map is centred on the mean of all mentions and scaled so
that 98% of them lie within radius 10; the 36 topic colours are the explorer's topic colours (evenly
spaced OKLab hues in three lightness tiers, handed out biggest topic first so that neighbouring topics differ), with
the lightness of the explorer's dark theme, because the page draws the map on a dark ground, and at the full
saturation sRGB can show, so that the topics stand apart.

Usage (needs pyarrow to read the Parquet file):

    uv run scripts/build_points.py --explorer /path/to/explorer --instances /path/to/instances.parquet

The same inputs always give the same bytes.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

import pyarrow.parquet as pq

ROOT = Path(__file__).resolve().parent.parent


# ---------------------------------------------------------------- colours (ported from the explorer's map.js)
def _to_lin(c: float) -> float:
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _from_lin(c: float) -> int:
    v = 12.92 * c if c <= 0.0031308 else 1.055 * max(c, 0) ** (1 / 2.4) - 0.055
    return round(min(1.0, max(0.0, v)) * 255)


def ok_lab(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    r, g, b = (_to_lin(x) for x in rgb)
    l_ = math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
    m_ = math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
    s_ = math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
    return (
        0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_,
        1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_,
        0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_,
    )


def _ok_linear(L: float, a: float, b: float) -> tuple[float, float, float]:
    l_ = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
    m_ = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
    s_ = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
    return (
        4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
        -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
        -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
    )


def ok_lch(L: float, C: float, h_deg: float) -> tuple[int, int, int]:
    """The most saturated colour of this lightness and hue that sRGB can show."""
    h = math.radians(h_deg)
    c = C
    while c >= 0:
        v = _ok_linear(L, c * math.cos(h), c * math.sin(h))
        if all(-0.0005 <= x <= 1.0005 for x in v):
            return tuple(_from_lin(x) for x in v)  # type: ignore[return-value]
        c -= 0.004
    return tuple(_from_lin(x) for x in _ok_linear(L, 0, 0))  # type: ignore[return-value]


def tiered(n: int, dark: bool = False, saturate: bool = False) -> list[tuple[int, int, int]]:
    """Evenly spaced hues in lightness tiers (12 hues x 3 tiers for 36 topics); lighter tiers for a dark ground."""
    tiers = min(4, max(1, math.ceil(n / 12)))
    k = math.ceil(n / tiers)
    Ls = [0.74, 0.62, 0.86, 0.54] if dark else [0.6, 0.47, 0.74, 0.4]
    Cs = [0.145, 0.13, 0.115, 0.12]
    if saturate:  # the most saturated colour sRGB can show at each hue and lightness
        Cs = [0.4] * 4
    return [ok_lch(Ls[t], Cs[t], 28 + (j * 360) / k + (t * 180) / k) for t in range(tiers) for j in range(k)]


# ---------------------------------------------------------------- data
def load_mentions(data: Path) -> tuple[dict, dict]:
    meta = json.loads((data / "meta.json").read_text())
    n_shards = math.ceil(meta["counts"]["terms"] / meta["shard"])
    cols: dict[str, list] = {"xyz": [], "topic": [], "mention_id": []}
    for s in range(n_shards):
        part = json.loads((data / "mentions" / f"{s:02d}.json").read_text())
        for k in cols:
            cols[k].extend(part[k])
    n = len(cols["topic"])
    if n != meta["counts"]["terms"] or len(cols["xyz"]) != 3 * n:
        raise SystemExit(f"expected {meta['counts']['terms']} mentions, read {n}")
    return meta, cols


def fit(xyz: list[int], n: int) -> list[float]:
    """Centre on the mean; scale so that 98% of the dots lie within radius 10 (as the explorer's map)."""
    mean = [sum(xyz[i * 3 + a] for i in range(n)) / n for a in range(3)]
    out = [0.0] * (3 * n)
    r = []
    for i in range(n):
        s = 0.0
        for a in range(3):
            v = xyz[i * 3 + a] - mean[a]
            out[i * 3 + a] = v
            s += v * v
        r.append(math.sqrt(s))
    r.sort()
    k = 10 / (r[math.floor(0.98 * (n - 1))] or 1)
    return [v * k for v in out]


def anchors(pos: list[float], members: list[list[int]]) -> list[tuple[float, float, float]]:
    """For each topic, the member nearest its coordinate-wise median (always on the topic)."""
    out = []
    for ix in members:
        med = [sorted(pos[i * 3 + a] for i in ix)[len(ix) >> 1] for a in range(3)]
        best = min(ix, key=lambda i: sum((pos[i * 3 + a] - med[a]) ** 2 for a in range(3)))
        out.append(tuple(pos[best * 3 : best * 3 + 3]))
    return out


def colour_slots(anc: list[tuple[float, float, float]], size: list[int]) -> list[int]:
    """Biggest topic first; each takes the free colour farthest (OKLab) from its 6 nearest coloured neighbours."""
    nt = len(anc)
    pal = [ok_lab(c) for c in tiered(nt)]
    order = sorted(range(nt), key=lambda t: -size[t])
    slot = [-1] * nt
    used: set[int] = set()
    for t in order:
        near = sorted((math.dist(anc[t], anc[o]), o) for o in order if slot[o] >= 0)[:6]
        best, bs = -1, -1.0
        for s in range(len(pal)):
            if s in used:
                continue
            sc = math.inf
            for k, (_, o) in enumerate(near):
                sc = min(sc, math.dist(pal[s], pal[slot[o]]) * (1 + 0.12 * k))
            if sc > bs + 1e-9:
                bs, best = sc, s
        slot[t] = best if best >= 0 else t % len(pal)
        used.add(slot[t])
    return slot


def pick_labels(anc: list[tuple[float, float, float]], size: list[int], count: int, first: list[int]) -> list[int]:
    """Topics to name on the map: those in FIRST (the topic led by "media bias"), or else the biggest
    topic, then each next one as far as possible from those named."""
    chosen = first[:count] or [max(range(len(anc)), key=lambda t: size[t])]
    while len(chosen) < count:
        rest = [t for t in range(len(anc)) if t not in chosen]
        chosen.append(max(rest, key=lambda t: (min(math.dist(anc[t], anc[c]) for c in chosen), size[t])))
    return chosen


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--explorer", type=Path, required=True, help="the explorer folder (holds data/meta.json)")
    ap.add_argument("--instances", type=Path, required=True, help="MBDef's data/instances.parquet")
    ap.add_argument("--labels", type=int, default=10, help="how many topic labels to name (default 10)")
    ap.add_argument("--out", type=Path, default=ROOT / "static" / "data", help="output folder")
    args = ap.parse_args()

    data = args.explorer / "data"
    meta, cols = load_mentions(data)
    n, topics = len(cols["topic"]), meta["topics"]
    nt = len(topics)

    # frame and colours on all mentions, exactly as the explorer draws them
    pos = fit(cols["xyz"], n)
    members = [[] for _ in range(nt)]
    for i, t in enumerate(cols["topic"]):
        members[t].append(i)
    size = [len(ix) for ix in members]
    anc = anchors(pos, members)
    slot = colour_slots(anc, size)
    # the page draws the map on a dark ground: the explorer's dark-theme lightness, at full saturation
    pal = tiered(nt, dark=True, saturate=True)
    colours = [pal[slot[t]] for t in range(nt)]

    # one point per term: the entry with the most definitions; ties go to the smallest mention_id
    row_of = {m: i for i, m in enumerate(cols["mention_id"])}
    inst = pq.read_table(args.instances, columns=["concept_id", "mention_id", "n_definitions"]).to_pylist()
    best: dict[str, tuple[int, str]] = {}
    for r in inst:
        if r["mention_id"] not in row_of:
            raise SystemExit(f"{r['mention_id']} of the instances table is not in the explorer data")
        key = (-r["n_definitions"], r["mention_id"])
        if r["concept_id"] not in best or key < best[r["concept_id"]]:
            best[r["concept_id"]] = key
    sample = [row_of[best[c][1]] for c in sorted(best)]
    m = len(sample)
    n_defs = sum(r["n_definitions"] for r in inst)

    # quantise positions to 16 bits over a symmetric cube that holds every sampled point
    lim = max(abs(pos[i * 3 + a]) for i in sample for a in range(3))
    lim = math.ceil(lim * 100) / 100
    q = lambda v: max(0, min(65535, round((v + lim) / (2 * lim) * 65535)))  # noqa: E731
    xyz = [q(pos[i * 3 + a]) for i in sample for a in range(3)]
    blob = struct.pack(f"<{3 * m}H", *xyz) + bytes(cols["topic"][i] for i in sample)

    # the dataset's own subject is always named; the other names spread out from it (nearby bias topics would hide it)
    media_bias = [t for t in range(nt) if topics[t]["top"][0].lower() == "media bias"]
    labels = pick_labels(anc, size, args.labels, media_bias)
    info = {
        "count": m,
        "terms": m,
        "entries": len(inst),
        "definitions": n_defs,
        "rule": "one dot per term, at its entry with the most definitions; ties: the smallest mention_id",
        "layout": "uint16 x,y,z per point (little endian), then uint8 topic per point",
        "decode": {"offset": -lim, "scale": 2 * lim / 65535},
        "topics": [
            {"id": t["id"], "name": t["name"], "label": t["top"][0], "rgb": list(colours[t["id"]])} for t in topics
        ],
        "labels": [{"topic": t, "text": topics[t]["top"][0], "at": [round(v, 3) for v in anc[t]]} for t in labels],
        "bin_sha256": hashlib.sha256(blob).hexdigest(),
    }
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "points.bin").write_bytes(blob)
    (args.out / "points.json").write_text(json.dumps(info, ensure_ascii=False, indent=1) + "\n")
    print(f"{m:,} terms ({len(inst):,} entries, {n_defs:,} definitions) -> points.bin {len(blob):,} bytes")
    print("labels:", ", ".join(topics[t]["top"][0] for t in labels))


if __name__ == "__main__":
    main()
