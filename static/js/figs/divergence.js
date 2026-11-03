/* Fig. 5, interactive: how similar two papers' definitions of the same term are (DefScore), for the ten terms of
   MBDef-Gold defined in the most papers. Drawn as printed: one box plot per term (box = middle half of the pairs,
   line = median, diamond = mean, whiskers to the furthest pair within 1.5 box widths, circles beyond them), plus a quiet
   strip under each box with one tick per pair.
   Pointing at a term lifts its row (the others dim) and marks its median on the axis; at a tick or circle, both
   definitions of that pair; at the 0.5 match line, how many of each term's pairs reach it. A click on a term opens its
   most and least similar pair under the chart; a second click, the close button or Esc closes it. On a touch screen a
   first tap shows what pointing shows, a second tap on the same term opens it.
   Arrival: from the printed figure, every mark starts where the print draws it and glides to its place; opened by a
   link or the arrows, the boxes and whiskers draw out from the median. Then the strips fade up.
   Data: static/data/figs/divergence.json (scripts/figs/divergence.py). */
(function () {
  'use strict';

  var WARM = 'media bias'; // the dataset's own term stays emphasised
  // a clause where a least similar pair surprises: media bias's 0.00 pair has a 2023 definition that reads like the
  // 1.00 pair; shown only while that pair still holds a definition from the named year
  var WHY = { 'media bias': { year: 2018, text: 'the 2018 definition is about intent and persistence, not slant.' } };
  // where the printed figure (static/images/paper/fig5.png, 972 × 384 px) draws its marks, measured on the image: the
  // DefScore v at x = 295.1 + 640.6 v; row i centred at y = 32.5 + 27.67 i; boxes 16 px high; mean diamonds 5 px and
  // circles 3.8 px from their centre; term labels end at x 279 and start at labelL, 26 px type, baseline 8.8 px under
  // the row's centre; the axis line at y 295; its numbers 17 px high, "0.0" 32 px wide, on the baseline 320; its title
  // 526 px wide, centred at x 615 on the baseline 357
  var PRINT = { src: /fig5\.png$/, w: 972, h: 384, x0: 295.1, xk: 640.6, y0: 32.5, dy: 27.67, box: 16, diamond: 5, dot: 3.8,
    labelX: 279, labelL: [108, 22, 115, 71, 61, 131, 26, 68, 148, 163], labelPx: 26, labelBase: 8.8, axisY: 295,
    digitH: 17, zeroW: 32, tickBase: 320, titleW: 526, titleX: 615, titleBase: 357 };
  var SOFT = 'cubic-bezier(0.22, 1, 0.36, 1)'; // things that only arrive: the draw-out, the strips
  var GLIDE = 'cubic-bezier(0.45, 0, 0.2, 1)'; // from the print, which has just come to rest: a gentle start, a long soft landing
  var I = 'matrix(1,0,0,1,0,0)';

  FIG.register('divergence', {
    build: function (panel, data, k) {
      var el = k.el, svg = k.svg, f2 = function (x) { return k.f(x, 2); };
      var terms = data.terms, papers = data.papers, MATCH = data.match;
      var open = -1, g = null, svgEl = null, rows = [], ticks = [], hlTick = null, hlRing = null;
      var axisParts = null, guide = null, matchKey = null;
      var cursor = terms.map(function () { return -1; }); // the pair the arrow keys stand on, per term
      var focus = -1, matchOn = false, pointerIn = false, tapType = '', tapWasFocus = false, keyHeld = false; // keyHeld: the state belongs to keyboard focus
      var entering = false, entryAnims = [], pending = null;

      // the print's whiskers (matplotlib's default): the furthest pair within 1.5 box widths of the box
      var whisk = terms.map(function (t) {
        var iqr = t.q3 - t.q1, s = t.pairs.map(function (p) { return p[2]; });
        return [Math.min.apply(null, s.filter(function (v) { return v >= t.q1 - 1.5 * iqr; })),
          Math.max.apply(null, s.filter(function (v) { return v <= t.q3 + 1.5 * iqr; }))];
      });
      function outlier(ti, s) { return s < whisk[ti][0] || s > whisk[ti][1]; }

      var body = k.body();
      body.classList.add('dv');
      var chart = body.appendChild(el('div', { class: 'dv-chart' }));
      var detail = body.appendChild(el('section', { class: 'dv-detail', hidden: true, 'aria-live': 'polite' }));

      function plural(n, one, many) { return k.nf(n) + ' ' + (n === 1 ? one : many); }
      function diamond(x, y, r) { return 'M' + x + ' ' + (y - r) + 'L' + (x + r) + ' ' + y + 'L' + x + ' ' + (y + r) + 'L' + (x - r) + ' ' + y + 'Z'; }
      function ties(t, s) { return t.pairs.filter(function (p) { return p[2] === s; }).length; }
      // a definition in curly quotes, with its paper and year; quotes inside it become single curly ones
      function curly(s) {
        return s.replace(/"([^"]*)"/g, '‘$1’').replace(/(^|[\s(])'([^']+)'(?=[\s,.;:)]|$)/g, '$1‘$2’').replace(/'/g, '’');
      }
      function def(d, cls) {
        var p = papers[d[0]];
        return el('div', { class: cls },
          el('p', { class: 'dv-q', text: '“' + curly(d[1]) + '”' }),
          el('p', { class: 'dv-src' }, p[0] + ' ', el('span', { class: 'dv-src-y', text: '(' + p[1] + ')' })));
      }

      // ------------------------------------------------------------ tooltips
      function pairTip(t, pair) {
        var n = ties(t, pair[2]);
        return el('div', { class: 'dv-tip' },
          el('div', { class: 'dv-tip-head' },
            el('b', { class: 'dv-tip-score', text: f2(pair[2]) }),
            el('span', { class: 'k', text: t.term + (pair[2] >= MATCH ? ' · a match (≥ ' + MATCH + ')' : '') +
              (n > 1 ? ' · one of ' + n + ' pairs at ' + f2(pair[2]) : '') })),
          el('div', { class: 'dv-tip-defs' }, def(t.defs[pair[0]], 'dv-tip-def'), def(t.defs[pair[1]], 'dv-tip-def')));
      }
      function rowTip(t) {
        return el('div', { class: 'dv-rowtip' + (t.term === WARM ? ' is-warm' : '') },
          el('b', { class: 'dv-rt-t', text: t.term }),
          el('dl', { class: 'dv-rt' },
            el('dt', { text: 'median' }), el('dd', { text: f2(t.median) }),
            el('dt', { text: 'quartiles' }), el('dd', { text: f2(t.q1) + '–' + f2(t.q3) }),
            el('dt', { text: 'mean' }), el('dd', { text: f2(t.mean) }),
            el('dt', { text: 'pairs' }), el('dd', {}, k.nf(t.n), el('span', { class: 'k', text: ' from ' + plural(t.papers, 'paper', 'papers') }))));
      }
      function matchTip() {
        return el('div', { class: 'dv-rowtip' },
          el('b', { class: 'dv-rt-t', text: 'DefScore ' + MATCH }), el('span', { class: 'k', text: ' the paper’s line for a match' }), el('br'),
          k.nf(data.ten.atMatch) + ' of ' + k.nf(data.ten.pairs) + ' pairs (' + k.pct(data.ten.atMatch, data.ten.pairs) + ') reach it');
      }

      // ------------------------------------------------------------ the chart
      function geometry(w) {
        var wide = w >= 620, o = { w: w, wide: wide };
        o.left = wide ? Math.min(200, Math.round(w * 0.17)) + 14 : 8; // wide: labels left of the axis, as printed
        o.right = w - (wide ? 16 : 10);
        o.top = 4;
        o.rowH = wide ? 44 : 58;
        o.cy = wide ? 18 : 33; // the box's centre line, from the row's top
        o.boxH = wide ? 18 : 15;
        o.dia = wide ? 5 : 4.5; // the mean diamond, from its centre
        o.dot = wide ? 3.4 : 3; // an outlier circle's radius
        o.rug = wide ? [32, 40] : [46, 53]; // the strip of ticks, from the row's top
        o.passDy = wide ? 7 : 9; // the match counts sit this far above the box's centre line
        o.bottom = o.top + terms.length * o.rowH;
        // narrow: "0.5 match" sits under the axis numbers, not squeezed between 0.4 and 0.6
        o.matchY = wide ? o.bottom + 18 : o.bottom + 34;
        o.titleY = wide ? o.bottom + 44 : o.bottom + 56;
        o.h = o.titleY + 6;
        o.x = function (v) { return o.left + v * (o.right - o.left); };
        return o;
      }

      function draw(w) {
        stopEntrance();
        g = geometry(w);
        chart.textContent = '';
        rows = []; ticks = [];
        focus = -1; matchOn = false;
        var s = svgEl = svg('svg', { width: w, height: g.h, class: 'dv-svg', role: 'group',
          'aria-label': 'Box plots of the DefScore of pairs of definitions from two papers, for ten terms' });
        var axis = s.appendChild(svg('g', { class: 'dv-axis', 'aria-hidden': 'true' }));
        var grid = axis.appendChild(svg('g', { class: 'dv-gridg' }));
        [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
          grid.appendChild(svg('line', { x1: g.x(v), x2: g.x(v), y1: g.top, y2: g.bottom, class: 'dv-grid' }));
          ticks.push({ v: v, el: axis.appendChild(svg('text', { x: g.x(v), y: g.bottom + 18, 'text-anchor': 'middle', class: 'dv-tick', text: v.toFixed(1) })) });
        });
        var base = axis.appendChild(svg('line', { x1: g.left, x2: g.right, y1: g.bottom, y2: g.bottom, class: 'dv-base' }));
        var title = axis.appendChild(svg('text', { x: (g.left + g.right) / 2, y: g.titleY, 'text-anchor': 'middle', class: 'dv-axis-title',
          text: 'Cross-Paper DefScore Definition Similarity' }));
        // the hovered term's median, marked on the axis: behind the rows, its value over the axis numbers
        guide = s.appendChild(svg('g', { class: 'dv-guide', 'aria-hidden': 'true' },
          svg('line', { x1: 0, x2: 0, y1: g.top, y2: g.bottom, class: 'dv-guide-line' }),
          svg('rect', { x: -19, y: g.bottom + 6, width: 38, height: 17, rx: 8.5, class: 'dv-guide-pill' }),
          svg('text', { x: 0, y: g.bottom + 18, 'text-anchor': 'middle', class: 'dv-guide-val' })));
        terms.forEach(function (t, ti) { s.appendChild(row(t, ti)); });
        // the match line (not in the print), named on the axis
        var xm = g.x(MATCH);
        var match = s.appendChild(svg('g', { class: 'dv-matchg', 'aria-hidden': 'true' },
          svg('line', { x1: xm, x2: xm, y1: g.top, y2: g.matchY - 13, class: 'dv-match' }),
          svg('text', { x: xm, y: g.matchY, 'text-anchor': 'middle', class: 'dv-match-label', text: MATCH + ' match' })));
        // how many of each term's pairs reach it, shown while the line is pointed at
        s.appendChild(svg('g', { class: 'dv-passes', 'aria-hidden': 'true' }, terms.map(function (t, ti) {
          return svg('text', { x: xm + 6, y: rows[ti].cy - g.passDy, class: 'dv-pass' + (t.term === WARM ? ' is-warm' : ''), style: '--i:' + ti },
            svg('tspan', { class: 'dv-pass-p', text: k.pct(t.atMatch, t.n) }),
            svg('tspan', { text: ' · ' + k.nf(t.atMatch) + ' of ' + k.nf(t.n) }));
        })));
        hlTick = s.appendChild(svg('line', { class: 'dv-hl', 'aria-hidden': 'true' }));
        hlRing = s.appendChild(svg('circle', { r: 5.5, class: 'dv-hl', 'aria-hidden': 'true' }));
        // the match line's label takes keyboard focus too, and shows the counts
        matchKey = s.appendChild(svg('rect', { x: xm - 34, y: g.matchY - 13, width: 68, height: 18, rx: 6, class: 'dv-matchkey', tabindex: 0, role: 'img',
          'aria-label': 'The ' + MATCH + ' match line: ' + data.ten.atMatch + ' of ' + k.nf(data.ten.pairs) + ' pairs reach it; ' +
            terms.map(function (t) { return t.term + ' ' + t.atMatch + ' of ' + t.n; }).join(', ') }));
        matchKey.addEventListener('focus', function (ev) {
          if (!matchKey.matches(':focus-visible')) return;
          keyHeld = true; setFocus(-1); setMatch(true); k.tip.show(ev, matchTip());
        });
        matchKey.addEventListener('blur', letGo);
        axisParts = { grid: grid, base: base, title: title, match: match };
        chart.appendChild(s);
        wireSvg(s);
      }

      function row(t, ti) {
        var y0 = g.top + ti * g.rowH, cy = y0 + g.cy, h = g.boxH, x = g.x, lo = whisk[ti][0], hi = whisk[ti][1];
        var r = svg('g', { class: 'dv-row' + (t.term === WARM ? ' is-warm' : '') + (ti === open ? ' is-open' : ''),
          tabindex: 0, role: 'button', 'aria-expanded': String(ti === open),
          'aria-label': t.term + ': ' + t.papers + ' papers, ' + t.n + ' pairs, median ' + f2(t.median) + ', quartiles ' + f2(t.q1) +
            ' to ' + f2(t.q3) + ', mean ' + f2(t.mean) + ', ' + t.atMatch + ' pairs reach ' + MATCH +
            '. Opens its most and least similar pair; arrow keys step through its pairs.' });
        r.appendChild(svg('rect', { x: 0, y: y0 + 1, width: g.w, height: g.rowH - 2, rx: 8, class: 'dv-rowbg' }));
        // every pair, one tick each; denser terms draw fainter ticks so the strip reads as a shade, not as noise
        var op = Math.max(0.1, Math.min(0.75, 0.9 * Math.sqrt(10 / t.n)));
        var rugw = r.appendChild(svg('g', { class: 'dv-rugw' }));
        var rug = rugw.appendChild(svg('g', { class: 'dv-rug', style: '--dv-op:' + op.toFixed(3) })), pos = [], outs = [];
        var pass = svg('g', { class: 'dv-rugpass' }); // the pairs that reach the match line, lit while it is pointed at
        t.pairs.forEach(function (p) {
          var px = x(p[2]);
          pos.push(px);
          rug.appendChild(svg('line', { x1: px, x2: px, y1: y0 + g.rug[0], y2: y0 + g.rug[1] }));
          if (p[2] >= MATCH) pass.appendChild(svg('line', { x1: px, x2: px, y1: y0 + g.rug[0], y2: y0 + g.rug[1] }));
          if (outlier(ti, p[2])) outs.push({ v: p[2], el: svg('circle', { cx: px, cy: cy, r: g.dot, class: 'dv-out' }) });
        });
        rugw.appendChild(pass);
        var cap = h / 4, bp = r.appendChild(svg('g', { class: 'dv-bp' }));
        var wh = bp.appendChild(svg('path', { class: 'dv-whisk', d: 'M' + x(lo) + ' ' + cy + 'H' + x(t.q1) + 'M' + x(t.q3) + ' ' + cy + 'H' + x(hi) +
          'M' + x(lo) + ' ' + (cy - cap) + 'V' + (cy + cap) + 'M' + x(hi) + ' ' + (cy - cap) + 'V' + (cy + cap) }));
        var box = bp.appendChild(svg('rect', { x: x(t.q1), y: cy - h / 2, width: Math.max(1, x(t.q3) - x(t.q1)), height: h, class: 'dv-box' }));
        bp.appendChild(svg('line', { x1: x(t.median), x2: x(t.median), y1: cy - h / 2, y2: cy + h / 2, class: 'dv-med' }));
        var mean = r.appendChild(svg('path', { d: diamond(x(t.mean), cy, g.dia), class: 'dv-mean' }));
        outs.forEach(function (o) { r.appendChild(o.el); });
        var label = r.appendChild(svg('text', g.wide ? { x: g.left - 14, y: cy + 5, 'text-anchor': 'end', class: 'dv-term' } : { x: g.left, y: y0 + 16, class: 'dv-term' },
          t.term, svg('tspan', { class: 'dv-n', text: ' (' + t.papers + ')' })));
        rows.push({ g: r, y0: y0, cy: cy, pos: pos, rugw: rugw, bp: bp, box: box, whisk: wh, mean: mean, outs: outs, label: label });
        wireRow(r, ti);
        return r;
      }

      // ------------------------------------------------------------ the arrival
      function stopEntrance() {
        entryAnims.forEach(function (a) { a.cancel(); });
        entryAnims = []; entering = false; pending = null;
      }
      function M(a, d, e, f) { return 'matrix(' + [a, 0, 0, d, e, f].map(function (n) { return +n.toFixed(4); }).join(',') + ')'; }
      // the printed figure as it lies on the stage now, in the chart's coordinates (null when the figure did not come
      // from the print: opened by a link or the arrows)
      function printFrame() {
        var stage = panel.closest('dialog'), gh = stage && stage.querySelector('.fig-ghost');
        if (!gh || !PRINT.src.test(gh.getAttribute('src') || '')) return null;
        var G = gh.getBoundingClientRect(), S = svgEl.getBoundingClientRect();
        if (G.width < 60 || G.height < 24) return null;
        return { sx: G.width / PRINT.w, sy: G.height / PRINT.h, ox: G.left - S.left, oy: G.top - S.top };
      }
      function entrance() {
        stopEntrance();
        if (!k.motion || !svgEl || !rows.length) return;
        clearHover();
        var P = printFrame(), anims = entryAnims;
        function A(node, frames, opt) { opt.fill = 'backwards'; anims.push(node.animate(frames, opt)); }
        entering = true;
        if (P) fromPrint(P, A); else fromMedian(A);
        // then the strips fade up, top to bottom, with the grid and the match line
        var late = P ? 600 : 400; // from the print: once the rows have nearly opened out
        rows.forEach(function (r, ti) {
          A(r.rugw, [{ opacity: 0, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: late + ti * 10, easing: SOFT });
        });
        [axisParts.grid, axisParts.match].forEach(function (n) { A(n, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: late, easing: 'ease-out' }); });
        Promise.all(anims.map(function (a) { return a.finished; })).then(function () {
          if (entryAnims !== anims) return;
          var ev = pending;
          entryAnims = []; entering = false; pending = null;
          if (ev && pointerIn) pointAt(ev); // the pointer waited on the chart: answer it now
        }, function () { /* replaced or cancelled */ });
      }
      // where each mark stands on the print P, as a transform of the drawn mark (and media bias's colours, printed blue)
      function printMarks(P) {
        var X = function (v) { return P.ox + P.sx * (PRINT.x0 + PRINT.xk * v); };
        var a = P.sx * PRINT.xk / (g.right - g.left), e = X(0) - a * g.left; // the chart's x, as the print draws it
        var out = { moves: [], colours: [] }, blue = k.color('--fig-closure'), warm = k.color('--fig-warm'), ink = k.color('--fig-ink');
        function mv(node, m) { out.moves.push([node, m]); }
        rows.forEach(function (r, ti) {
          var t = terms[ti], yP = P.oy + P.sy * (PRINT.y0 + PRINT.dy * ti), b = P.sy * PRINT.box / g.boxH;
          mv(r.bp, M(a, b, e, yP - b * r.cy));
          var dm = P.sy * PRINT.diamond / g.dia;
          mv(r.mean, M(dm, dm, X(t.mean) - dm * g.x(t.mean), yP - dm * r.cy));
          r.outs.forEach(function (o) {
            var c = P.sy * PRINT.dot / g.dot;
            mv(o.el, M(c, c, X(o.v) - c * g.x(o.v), yP - c * r.cy));
          });
          // the label's size: between the print's type size and its printed width (the print's Times runs wider)
          var lw = r.label.getComputedTextLength(), s = P.sy * PRINT.labelPx / 16;
          if (lw > 0) s = Math.sqrt(s * P.sx * (PRINT.labelX - PRINT.labelL[ti]) / lw);
          var right = P.ox + P.sx * PRINT.labelX, ly = yP + P.sy * PRINT.labelBase;
          var lx0 = g.wide ? g.left - 14 : g.left, ly0 = g.wide ? r.cy + 5 : r.y0 + 16;
          var lx = g.wide ? right : right - s * lw; // printed labels end at the axis
          mv(r.label, M(s, s, lx - s * lx0, ly - s * ly0));
          if (t.term === WARM) {
            out.colours.push([r.box, 'fill', blue, warm], [r.whisk, 'stroke', blue, warm], [r.label, 'fill', ink, warm]);
            r.outs.forEach(function (o) { out.colours.push([o.el, 'fill', blue, warm]); });
          }
        });
        // 11 px mono numbers: 0.73 of their size high, "0.0" 17 px wide; sized between the print's height and width
        var ts = Math.sqrt(P.sy * PRINT.digitH / (11 * 0.73) * P.sx * PRINT.zeroW / 17);
        ticks.forEach(function (tk) { mv(tk.el, M(ts, ts, X(tk.v) - ts * g.x(tk.v), P.oy + P.sy * PRINT.tickBase - ts * (g.bottom + 18))); });
        mv(axisParts.base, M(a, 1, e, P.oy + P.sy * PRINT.axisY - g.bottom));
        var tw = axisParts.title.getComputedTextLength(), mid = (g.left + g.right) / 2;
        if (tw > 0) {
          var st = P.sx * PRINT.titleW / tw;
          mv(axisParts.title, M(st, st, P.ox + P.sx * PRINT.titleX - st * mid, P.oy + P.sy * PRINT.titleBase - st * g.titleY));
        }
        return out;
      }
      // every mark starts where the print draws it and glides to its place: the rows open apart to make room for the
      // strips, the axis widens, the labels settle to their size, media bias warms. The marks hold on the print while it
      // hands over (the print dissolves into them), then open out; the warming happens within the hand-over, so its
      // way through grey is never in view
      function fromPrint(P, A) {
        var pm = printMarks(P);
        pm.moves.forEach(function (m) { A(m[0], [{ transform: m[1] }, { transform: I }], { duration: 680, delay: 160, easing: GLIDE }); });
        pm.colours.forEach(function (c) {
          var f0 = {}, f1 = {}; f0[c[1]] = c[2]; f1[c[1]] = c[3];
          A(c[0], [f0, f1], { duration: 240, easing: 'ease-out' });
        });
      }
      // the stage closing onto the print: the same movement backwards, quick enough that the marks lie on the print
      // before it shows through (media bias keeps its colour and dissolves into the print's blue)
      function toPrint(P) {
        var anims = entryAnims, opt = { duration: 280, easing: SOFT, fill: 'forwards' };
        function A(node, frames, o) { anims.push(node.animate(frames, o)); }
        var pm = printMarks(P);
        pm.moves.forEach(function (m) { A(m[0], [{ transform: I }, { transform: m[1] }], opt); });
        var fade = { duration: 160, easing: 'ease-out', fill: 'forwards' }; // what the print does not draw goes first
        rows.forEach(function (r) { A(r.rugw, [{ opacity: 1 }, { opacity: 0 }], fade); });
        [axisParts.grid, axisParts.match].forEach(function (n) { A(n, [{ opacity: 1 }, { opacity: 0 }], fade); });
      }
      function leave() {
        if (!k.motion || !svgEl || !rows.length) return;
        var P = printFrame();
        if (!P) return;
        stopEntrance(); clearHover();
        entering = true; // until the next arrival or the stage closes
        toPrint(P);
      }
      // no print to continue from: the boxes and whiskers draw out from the median, the means slide out to their place
      function fromMedian(A) {
        rows.forEach(function (r, ti) {
          var t = terms[ti], mx = g.x(t.median), opt = { duration: 600, delay: ti * 24, easing: SOFT };
          A(r.bp, [{ transform: M(0.001, 1, mx * 0.999, 0) }, { transform: I }], opt);
          A(r.mean, [{ opacity: 0, transform: 'translate(' + (mx - g.x(t.mean)).toFixed(2) + 'px,0)' }, { opacity: 1, transform: 'none' }],
            { duration: 600, delay: ti * 24, easing: SOFT });
          r.outs.forEach(function (o) { A(o.el, [{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: ti * 24 + 320, easing: 'ease-out' }); });
        });
      }

      // ------------------------------------------------------------ pointing: a term, a pair, the match line
      function local(ev) { var b = svgEl.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
      function rowAt(y) { return y >= g.top && y < g.bottom ? Math.floor((y - g.top) / g.rowH) : -1; }
      // the pair under the pointer: the nearest tick in the strip, or a circle on the box's line; among pairs at one spot
      // the pointer's height picks one, so tied pairs stay reachable
      function hit(ti, px, py) {
        var r = rows[ti], t = terms[ti], a = r.y0 + g.rug[0] - 7, b = r.y0 + g.rug[1] + 6;
        var strip = py >= a && py <= b, line = Math.abs(py - r.cy) <= g.boxH / 2 + 2;
        if (!strip && !line) return -1;
        var best = strip ? 12 : 6, c = [];
        r.pos.forEach(function (x, i) {
          var d = Math.abs(x - px);
          if (d > best + 0.5 || (!strip && !outlier(ti, t.pairs[i][2]))) return;
          if (d < best - 0.5) { best = d; c = []; }
          c.push(i);
        });
        c = c.filter(function (i) { return Math.abs(r.pos[i] - px) <= best + 0.5; });
        if (!c.length) return -1;
        var f = strip ? (py - a) / (b - a) : (py - r.cy + 6) / 12;
        return c[Math.min(c.length - 1, Math.max(0, Math.floor(f * c.length)))];
      }
      function onMatch(x, y) {
        var xm = g.x(MATCH);
        if (rowAt(y) >= 0) return Math.abs(x - xm) <= 5;
        return y > g.bottom && y <= g.matchY + 5 && Math.abs(x - xm) <= (y > g.matchY - 14 ? 34 : 5); // its stub, its label
      }

      function setFocus(ti) {
        if (focus === ti) return;
        focus = ti;
        rows.forEach(function (r, i) { r.g.classList.toggle('is-focus', i === ti); });
        svgEl.classList.toggle('has-focus', ti >= 0);
        var t = ti >= 0 ? terms[ti] : null, xm = t ? g.x(t.median) : -1e3, x = xm.toFixed(1) + 'px';
        // an axis number the median's value would half cover steps aside
        ticks.forEach(function (tk) { tk.el.classList.toggle('is-under', Math.abs(g.x(tk.v) - xm) < 31); });
        if (ti < 0) { guide.classList.remove('on'); return; }
        guide.lastChild.textContent = f2(t.median);
        guide.classList.toggle('is-warm', t.term === WARM);
        if (!guide.classList.contains('on')) { // appear in place; slide only from one term to the next
          guide.style.transition = 'none';
          guide.style.transform = 'translate(' + x + ',0)';
          void guide.getBoundingClientRect();
          guide.style.transition = '';
          guide.classList.add('on');
        } else guide.style.transform = 'translate(' + x + ',0)';
      }
      function setMatch(on) {
        if (matchOn === on) return;
        matchOn = on;
        svgEl.classList.toggle('is-match', on);
      }
      function clearHover() {
        keyHeld = false;
        if (!svgEl) return;
        setFocus(-1); setMatch(false); unmark(); k.tip.hide();
      }
      // keyboard focus leaves: let go of what it showed (a tap or a click focuses too, and keeps its state)
      function letGo() { if (keyHeld && !pointerIn) clearHover(); keyHeld = false; }
      // what the pointer is on, and what it shows
      function pointAt(ev) {
        if (entering) { pending = ev; return; }
        var p = local(ev), ti = rowAt(p[1]), i = ti >= 0 ? hit(ti, p[0], p[1]) : -1;
        if (i >= 0) { setMatch(false); setFocus(ti); showPair(ti, i, ev); return; }
        unmark();
        if (onMatch(p[0], p[1])) { // the tip waits by the line's label, clear of the counts
          var b = svgEl.getBoundingClientRect();
          setFocus(-1); setMatch(true);
          k.tip.show({ target: ev.target, clientX: b.left + g.x(MATCH) + 24, clientY: b.top + g.matchY - 4 }, matchTip());
          return;
        }
        setMatch(false);
        if (ti < 0) { setFocus(-1); k.tip.hide(); return; }
        setFocus(ti);
        k.tip.show(ev, rowTip(terms[ti]));
      }
      function mark(ti, i) {
        var r = rows[ti], x = r.pos[i], warm = terms[ti].term === WARM;
        hlTick.setAttribute('x1', x); hlTick.setAttribute('x2', x);
        hlTick.setAttribute('y1', r.y0 + g.rug[0] - 3); hlTick.setAttribute('y2', r.y0 + g.rug[1] + 3);
        hlTick.classList.add('on');
        hlTick.classList.toggle('is-warm', warm);
        var o = outlier(ti, terms[ti].pairs[i][2]);
        hlRing.setAttribute('cx', x); hlRing.setAttribute('cy', r.cy);
        hlRing.classList.toggle('on', o);
        hlRing.classList.toggle('is-warm', warm);
      }
      function unmark() { if (hlTick) { hlTick.classList.remove('on'); hlRing.classList.remove('on'); } }
      function showPair(ti, i, ev) {
        mark(ti, i);
        if (!ev) { // the keyboard: next to the tick
          var b = svgEl.getBoundingClientRect(), r = rows[ti];
          ev = { target: r.g, clientX: b.left + r.pos[i], clientY: b.top + r.y0 + g.rug[1] };
        }
        k.tip.show(ev, pairTip(terms[ti], terms[ti].pairs[i]));
      }

      function setOpen(ti) {
        open = ti;
        rows.forEach(function (r, i) {
          r.g.classList.toggle('is-open', i === ti);
          r.g.setAttribute('aria-expanded', String(i === ti));
        });
        detail.hidden = ti < 0;
        if (ti < 0) { detail.textContent = ''; return; }
        renderDetail();
        detail.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' });
      }
      function close(refocus) {
        var was = open;
        setOpen(-1);
        unmark();
        if (refocus && rows[was]) rows[was].g.focus({ preventScroll: true });
      }

      function wireSvg(s) {
        s.addEventListener('pointerenter', function () { pointerIn = true; });
        s.addEventListener('pointermove', function (ev) { pointerIn = true; if (ev.pointerType !== 'touch') pointAt(ev); });
        s.addEventListener('pointerleave', function (ev) {
          pointerIn = false; pending = null;
          if (ev.pointerType !== 'touch') clearHover(); // a lifted finger leaves too: a tap's state stays until the next tap
        });
        // a tap does what pointing does; a second tap on the same term opens it
        s.addEventListener('pointerdown', function (ev) {
          tapType = ev.pointerType;
          if (tapType !== 'touch') return;
          var p = local(ev);
          tapWasFocus = focus >= 0 && focus === rowAt(p[1]);
          pointAt(ev);
        });
        s.addEventListener('click', function (ev) {
          if (entering) return;
          var p = local(ev), ti = rowAt(p[1]);
          if (ti < 0 || (tapType === 'touch' && !tapWasFocus)) return;
          var i = hit(ti, p[0], p[1]);
          if (i >= 0) { showPair(ti, i, ev); if (open !== ti) setOpen(ti); } // a pair opens its term, never closes it
          else setOpen(open === ti ? -1 : ti);
        });
      }
      // a tap anywhere else lets the tapped state go
      document.addEventListener('pointerdown', function (ev) {
        if (ev.pointerType === 'touch' && svgEl && !svgEl.contains(ev.target)) clearHover();
      }, true);

      function wireRow(r, ti) {
        r.addEventListener('focus', function (ev) {
          if (!r.matches(':focus-visible')) return; // a click focuses too; the pointer shows the state then
          keyHeld = true; setMatch(false); setFocus(ti);
          if (cursor[ti] >= 0) showPair(ti, cursor[ti]);
          else k.tip.show(ev, rowTip(terms[ti]));
        });
        r.addEventListener('blur', letGo);
        r.addEventListener('keydown', function (ev) {
          var n = terms[ti].pairs.length, c = cursor[ti], key = ev.key;
          if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Home' || key === 'End') {
            ev.preventDefault();
            if (key === 'ArrowRight') c = c < 0 ? 0 : Math.min(n - 1, c + 1);
            if (key === 'ArrowLeft') c = c < 0 ? n - 1 : Math.max(0, c - 1);
            if (key === 'Home') c = 0;
            if (key === 'End') c = n - 1;
            cursor[ti] = c;
            setFocus(ti);
            showPair(ti, c);
          } else if (key === 'Enter' || key === ' ') {
            ev.preventDefault();
            setOpen(open === ti ? -1 : ti);
          } else if (key === 'Escape' && cursor[ti] >= 0 && open < 0) { // the pair's tip first, then the stage
            ev.preventDefault();
            cursor[ti] = -1; unmark(); k.tip.show({ target: r }, rowTip(terms[ti]));
          }
        });
      }
      // Esc closes the open term before it closes the stage
      document.addEventListener('keydown', function (ev) {
        if (ev.key !== 'Escape' || open < 0 || !panel.offsetParent) return;
        ev.preventDefault();
        ev.stopPropagation();
        k.tip.hide();
        cursor.fill(-1);
        close(detail.contains(document.activeElement) || panel.contains(document.activeElement));
      }, true);

      // ------------------------------------------------------------ the open term: its most and least similar pair
      function renderDetail() {
        var t = terms[open];
        detail.textContent = '';
        detail.classList.toggle('is-warm', t.term === WARM);
        detail.setAttribute('aria-label', t.term + ': most and least similar pair');
        var meta = [plural(t.papers, 'paper', 'papers'), plural(t.n, 'pair', 'pairs'), 'median ' + f2(t.median), t.atMatch + ' reach ' + MATCH];
        detail.appendChild(el('header', { class: 'dv-dh' },
          el('div', { class: 'dv-dh-t' }, el('h4', { class: 'dv-dt', text: t.term }), ' ',
            el('p', { class: 'dv-dm' }, meta.map(function (m, i) { return [i ? ' · ' : '', el('span', { text: m })]; }))),
          el('button', { type: 'button', class: 'dv-x', 'aria-label': 'Close ' + t.term, title: 'Close (Esc)',
            onclick: function () { close(true); } }, '×')));
        detail.appendChild(pairRow(t, t.most, 'most similar'));
        detail.appendChild(pairRow(t, t.least, 'least similar'));
        detail.appendChild(el('a', { class: 'fig-link dv-more', href: k.explorer('concepts'), target: '_blank', rel: 'noopener',
          text: 'Every definition of “' + t.term + '”: MBDef Explorer, Concepts →' }));
      }
      function pairRow(t, i, label) {
        var p = t.pairs[i], n = ties(t, p[2]), why = WHY[t.term], ti = open;
        var note = i === t.least && why && [p[0], p[1]].some(function (d) { return papers[t.defs[d][0]][1] === why.year; });
        var r = el('div', { class: 'dv-pair' },
          el('div', { class: 'dv-ps' },
            el('b', { text: f2(p[2]) }), el('span', { text: label }),
            n > 1 ? el('span', { class: 'dv-tie', text: 'one of ' + n + ' at ' + f2(p[2]) }) : null),
          def(t.defs[p[0]], 'dv-pd'), def(t.defs[p[1]], 'dv-pd'),
          note ? el('p', { class: 'dv-why', text: 'Why ' + f2(p[2]) + ': ' + why.text }) : null);
        r.addEventListener('pointerenter', function () { if (rows[ti]) { setFocus(ti); mark(ti, i); } });
        r.addEventListener('pointerleave', function () { unmark(); setFocus(-1); });
        return r;
      }

      k.onResize(draw);
      k.onArrive(entrance);
      // the closing: the stage lays the print (its ghost) over this figure while the figure is shown and has arrived
      // (an arriving figure's ghost is the opening's); then the marks glide back onto it
      var stage = panel.closest('dialog');
      if (stage && 'MutationObserver' in window) {
        new MutationObserver(function (ms) {
          if (panel.hidden || panel.classList.contains('is-arriving')) return;
          var ghost = ms.some(function (m) { return [].some.call(m.addedNodes, function (n) { return n.classList && n.classList.contains('fig-ghost'); }); });
          if (ghost) leave();
        }).observe(stage, { childList: true });
        stage.addEventListener('close', stopEntrance);
      }

      k.method(
        '<p><b>Rule.</b> Take every definition in MBDef-Gold that annotators marked relevant, from all three splits (' +
        k.nf(data.all.definitions) + ' definitions from ' + data.all.papers + ' of its ' + data.all.goldPapers + ' papers). ' +
        'Two terms are the same when they match after setting aside case, spacing and outer punctuation (no synonyms, no ' +
        'plurals). Pair every two definitions of one term that come from different papers (' + k.nf(data.all.pairs) +
        ' pairs over ' + data.all.terms + ' terms), score each pair with DefScore, and draw the ten terms defined in the most ' +
        'papers (ties alphabetical) as printed: box from first to third quartile, line at the median, diamond at the mean, ' +
        'whiskers to the furthest pair within 1.5 box widths, circles beyond. Added here: the strip under each box, one tick ' +
        'per pair, and the ' + MATCH + ' match line. Most similar pair: the highest DefScore, ties to the most shared words; ' +
        'least similar: the lowest, ties to the fewest. Definitions are cut to ' + data.words + ' words.</p>' +
        '<p><b>DefScore and code.</b> clip(' + data.calibration[0] + ' × mean − ' + Math.abs(data.calibration[1]) + ', 0, 1) of three ' +
        'similarities: word-overlap F1, the cosine of the two texts’ <code>' + data.models[0] + '</code> vectors, and the ' +
        'entailment probability of <code>' + data.models[1] + '</code> in both directions. The constants are a least-squares fit ' +
        'to the 60 human-rated pairs of DefSim, and the paper counts ' + MATCH + ' or more as a match. ' +
        '<code>scripts/figs/divergence.py</code> runs the code of the printed figure (tutorial 04) and checks every term’s ' +
        'paper count, quartiles, median and mean against the print, and the media bias median against the paper’s 0.25.</p>');
    }
  });
})();
