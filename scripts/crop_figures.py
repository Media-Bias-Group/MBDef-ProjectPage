# /// script
# requires-python = ">=3.12"
# dependencies = ["pymupdf"]
# ///
"""Cut the paper's six figures out of its PDF, as they are printed, for the page's "Figures" carousel.

Each figure is a fixed rectangle on its page of the PDF (in PDF points, 72 per inch), measured once from the
positions of its drawings and labels and set above its "Fig. N." caption. The script renders each rectangle at
300 dpi into static/images/paper/figN.png. A changed PDF needs the rectangles checked again: the script prints
the caption it finds below each rectangle, so a figure that moved shows up at once.

    uv run scripts/crop_figures.py --pdf /path/to/the-paper.pdf
"""

from __future__ import annotations

import argparse
from pathlib import Path

import pymupdf

ROOT = Path(__file__).resolve().parent.parent

# figure number -> (page index from 0, x0, y0, x1, y1)
FIGURES = {
    1: (3, 131, 206, 485, 255),
    2: (8, 131, 281, 485, 462),
    3: (9, 131, 112, 485, 217),
    4: (9, 131, 345, 485, 474),
    5: (10, 191, 112, 424, 204),
    6: (10, 131, 310, 485, 425),
}


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--pdf", type=Path, required=True, help="the paper's PDF")
    ap.add_argument("--out", type=Path, default=ROOT / "static" / "images" / "paper")
    args = ap.parse_args()
    doc = pymupdf.open(args.pdf)
    args.out.mkdir(parents=True, exist_ok=True)
    for num, (page, *box) in FIGURES.items():
        p, rect = doc[page], pymupdf.Rect(*box)
        below = [b for b in p.get_text("blocks") if b[1] >= rect.y1 - 2 and b[4].strip().startswith("Fig.")]
        caption = min(below, key=lambda b: b[1])[4].split(".")[0:2] if below else ["(no caption below)"]
        if ".".join(caption).strip() != f"Fig. {num}":
            raise SystemExit(f"figure {num}: the caption below its rectangle is {'.'.join(caption)!r}")
        pix = p.get_pixmap(clip=rect, dpi=300)
        pix.save(args.out / f"fig{num}.png")
        print(f"fig{num}.png  {pix.width} x {pix.height}")


if __name__ == "__main__":
    main()
