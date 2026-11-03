# MBDef project page

The project page of the paper **MBDef: A Media Bias Definitions Dataset**, at
https://media-bias-group.github.io/MBDef-ProjectPage/. It follows the Media Bias Group's project pages (for example
[Plausibility Machines](https://media-bias-group.github.io/LLMExplanations_ProjectPage/) and
[SciDef](https://media-bias-group.github.io/SciDef-ProjectPage/)), which are built on the
[Academic Project Page Template](https://github.com/eliahuhorwitz/Academic-project-page-template). It is a static
site: `index.html` plus `static/`, served by GitHub Pages from the root of `main` (`.nojekyll` is set).

- **At the top**, where the template has its teaser image, a slowly turning 3D map shows all 34,916 terms of MBDef:
  each dot is one term, placed by the meaning of its definitions and coloured by one of 36 topics, as in the
  [MBDef Explorer](https://media-bias-group.github.io/MBDef/#overview). A click on the map opens the Explorer.
- **The paper's figures** appear as printed: Fig. 1 with the five steps under "How MBDef was built", Figs. 2–6 in the
  template's carousel. Each has a button that opens its **interactive version** in place, redrawn from the released
  data: point at a mark for its numbers, click it for the papers or definitions behind it.
- **Links to one figure**: `#fig-pipeline`, `#fig-disciplines`, `#fig-content`, `#fig-coverage`, `#fig-divergence`
  and `#fig-network` open that figure's interactive version on arrival (the Explorer links to them).

## Edit the page

Most text is in the `PROJECT` object near the top of `index.html`, as in the group's template: title, authors and
affiliations, highlights, abstract, BibTeX and the Explorer's address. Still to fill in once the paper is public
(marked `TODO` there): `status`, `venue`, `pdfUrl` and the paper's BibTeX entry; the "Paper · coming soon" button in
`index.html` then becomes a link.

## Files

| Path | What it is |
|---|---|
| `index.html` | the page |
| `static/css/bulma.min.css`, `index.css`, `bulma-carousel.min.css`, `static/js/bulma-carousel.min.js`, `fontawesome.all.min.js`, `static/images/favicon.ico`, the logo | the group's template, unchanged |
| `static/css/mbdef.css`, `static/js/index.js` | this page's additions: the map panel, the numbers, the five steps, the figure buttons |
| `static/js/map3d.js`, `static/data/points.bin`, `points.json` | the rotating map and its points |
| `static/images/paper/fig1.png` … `fig6.png` | the paper's figures, cut from its PDF |
| `static/js/figkit.js`, `static/css/figs.css` | the shared parts of the interactive figures |
| `static/js/figs/<name>.js`, `static/css/figs/<name>.css`, `static/data/figs/<name>.json` | one interactive figure each |
| `static/images/mbdef-explorer-poster.png` | the Explorer's poster, from the MBDef repository's `docs/images/` |
| `static/images/social_preview.png` | the link preview (1200 x 630), rendered from `scripts/social_preview.html` |

## Where the data comes from

Every script writes the same bytes from the same inputs, and the figure scripts check their numbers against the
printed figures and stop when one differs without a note.

| Script | Makes | From |
|---|---|---|
| `scripts/build_points.py` | `static/data/points.*` | the Explorer's map data and MBDef's `data/instances.parquet` |
| `scripts/crop_figures.py` | `static/images/paper/fig*.png` | the paper's PDF |
| `scripts/figs/<name>.py` | `static/data/figs/<name>.json` | MBDef's and MBDef-Gold's released tables, with the MBDef code's `mbdef.analysis` |
| `scripts/check_numbers.py` | nothing: a check | every number in `index.html` must be in the paper, in the released tables, or listed as printed in a figure |

Run the figure scripts with the MBDef repository's environment, for example
`<MBDef checkout>/.venv/bin/python scripts/figs/content.py --help`. Two need more than the tables:
`disciplines.py` asks OpenAlex for each paper's field (through a cache), and `divergence.py` computes DefScore with
two small models. Two differences from the printed figures are shown on the page: Fig. 4 counts 38 papers for
gatekeeping / selection bias and 2 for labeling and word choice in the released data (37 and 1 in print), and
OpenAlex now classifies 37 papers that were unclassified for Fig. 2 (the bars keep the printed counts).

## Run it locally

```bash
python -m http.server 8000      # then open http://localhost:8000/
```

Opening `index.html` as a file does not work, because the browser does not let the page read `static/data/`.

## Website license

This website is licensed under a [Creative Commons Attribution-ShareAlike 4.0 International
License](http://creativecommons.org/licenses/by-sa/4.0/), as the template it is built on.
