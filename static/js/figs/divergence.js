/* Fig. 5, interactive: how similar two papers' definitions of the same term are (DefScore), for the ten terms of
   MBDef-Gold defined in the most papers. Drawn as printed: one box plot per term (box = middle half of the pairs,
   line = median, diamond = mean, whiskers to the furthest pair within 1.5 box widths, circles beyond them), plus a quiet
   strip under each box with one tick per pair. Pointing at a tick or circle shows both definitions; a click on a term
   opens its most and least similar pair under the chart, a second click, the close button or Esc closes it.
   Data: static/data/figs/divergence.json (scripts/figs/divergence.py). */
(function () {
  'use strict';

  var WARM = 'media bias'; // the dataset's own term stays emphasised
  // a clause where a least similar pair surprises: media bias's 0.00 pair has a 2023 definition that reads like the
  // 1.00 pair; shown only while that pair still holds a definition from the named year
  var WHY = { 'media bias': { year: 2018, text: 'the 2018 definition is about intent and persistence, not slant.' } };

  FIG.register('divergence', {
    build: function (panel, data, k) {
      var el = k.el, svg = k.svg, f2 = function (x) { return k.f(x, 2); };
      var terms = data.terms, papers = data.papers, MATCH = data.match;
      var open = -1, g = null, svgEl = null, rows = [], hlTick = null, hlRing = null;
      var cursor = terms.map(function () { return -1; }); // the pair the arrow keys stand on, per term

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
        return el('div', { class: 'dv-rowtip' },
          el('b', { text: t.term }), el('span', { class: 'k', text: ' · ' + plural(t.papers, 'paper', 'papers') + ', ' + plural(t.definitions, 'definition', 'definitions') }),
          el('br'), 'median ', el('b', { text: f2(t.median) }), ' · middle half ' + f2(t.q1) + '–' + f2(t.q3) + ' · mean ' + f2(t.mean),
          el('br'), el('span', { class: 'k', text: t.atMatch + ' of ' + plural(t.n, 'pair', 'pairs') + ' reach ' + MATCH }));
      }

      // ------------------------------------------------------------ the chart
      function geometry(w) {
        var wide = w >= 620, o = { w: w, wide: wide };
        o.left = wide ? Math.min(200, Math.round(w * 0.17)) + 14 : 8; // wide: labels left of the axis, as printed
        o.right = w - (wide ? 16 : 8);
        o.top = 4;
        o.rowH = wide ? 44 : 58;
        o.cy = wide ? 18 : 33; // the box's centre line, from the row's top
        o.boxH = wide ? 18 : 15;
        o.rug = wide ? [32, 40] : [46, 53]; // the strip of ticks, from the row's top
        o.bottom = o.top + terms.length * o.rowH;
        o.h = o.bottom + 50;
        o.x = function (v) { return o.left + v * (o.right - o.left); };
        return o;
      }

      function draw(w) {
        g = geometry(w);
        chart.textContent = '';
        rows = [];
        var s = svgEl = svg('svg', { width: w, height: g.h, class: 'dv-svg', role: 'group',
          'aria-label': 'Box plots of the DefScore of pairs of definitions from two papers, for ten terms' });
        var axis = s.appendChild(svg('g', { class: 'dv-axis', 'aria-hidden': 'true' }));
        [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
          axis.appendChild(svg('line', { x1: g.x(v), x2: g.x(v), y1: g.top, y2: g.bottom, class: 'dv-grid' }));
          axis.appendChild(svg('text', { x: g.x(v), y: g.bottom + 18, 'text-anchor': 'middle', class: 'dv-tick', text: v.toFixed(1) }));
        });
        axis.appendChild(svg('line', { x1: g.left, x2: g.right, y1: g.bottom, y2: g.bottom, class: 'dv-base' }));
        axis.appendChild(svg('text', { x: (g.left + g.right) / 2, y: g.bottom + 44, 'text-anchor': 'middle', class: 'dv-axis-title',
          text: 'Cross-Paper DefScore Definition Similarity' }));
        terms.forEach(function (t, ti) { s.appendChild(row(t, ti)); });
        // the match line (not in the print), named on the axis
        s.appendChild(svg('line', { x1: g.x(MATCH), x2: g.x(MATCH), y1: g.top, y2: g.bottom + 5, class: 'dv-match', 'aria-hidden': 'true' }));
        s.appendChild(svg('text', { x: g.x(MATCH), y: g.bottom + 18, 'text-anchor': 'middle', class: 'dv-match-label', 'aria-hidden': 'true',
          text: g.wide ? MATCH + ' match' : 'match' }));
        hlTick = s.appendChild(svg('line', { class: 'dv-hl', 'aria-hidden': 'true' }));
        hlRing = s.appendChild(svg('circle', { r: 5.5, class: 'dv-hl', 'aria-hidden': 'true' }));
        chart.appendChild(s);
      }

      function row(t, ti) {
        var y0 = g.top + ti * g.rowH, cy = y0 + g.cy, h = g.boxH, x = g.x, lo = whisk[ti][0], hi = whisk[ti][1];
        var r = svg('g', { class: 'dv-row' + (t.term === WARM ? ' is-warm' : '') + (ti === open ? ' is-open' : ''),
          tabindex: 0, role: 'button', 'aria-expanded': String(ti === open),
          'aria-label': t.term + ': ' + t.papers + ' papers, ' + t.n + ' pairs, median ' + f2(t.median) + ', middle half ' + f2(t.q1) +
            ' to ' + f2(t.q3) + ', mean ' + f2(t.mean) + '. Opens its most and least similar pair; arrow keys step through its pairs.' });
        r.appendChild(svg('rect', { x: 0, y: y0 + 1, width: g.w, height: g.rowH - 2, rx: 8, class: 'dv-rowbg' }));
        // every pair, one tick each; denser terms draw fainter ticks so the strip reads as a shade, not as noise
        var op = Math.max(0.1, Math.min(0.75, 0.9 * Math.sqrt(10 / t.n)));
        var rug = r.appendChild(svg('g', { class: 'dv-rug', style: '--dv-op:' + op.toFixed(3) })), pos = [], outs = [];
        t.pairs.forEach(function (p, i) {
          var px = x(p[2]);
          pos.push(px);
          rug.appendChild(svg('line', { x1: px, x2: px, y1: y0 + g.rug[0], y2: y0 + g.rug[1] }));
          if (outlier(ti, p[2])) outs.push(svg('circle', { cx: px, cy: cy, r: g.wide ? 3.4 : 3, class: 'dv-out' }));
        });
        var cap = h / 4;
        r.appendChild(svg('path', { class: 'dv-whisk', d: 'M' + x(lo) + ' ' + cy + 'H' + x(t.q1) + 'M' + x(t.q3) + ' ' + cy + 'H' + x(hi) +
          'M' + x(lo) + ' ' + (cy - cap) + 'V' + (cy + cap) + 'M' + x(hi) + ' ' + (cy - cap) + 'V' + (cy + cap) }));
        r.appendChild(svg('rect', { x: x(t.q1), y: cy - h / 2, width: Math.max(1, x(t.q3) - x(t.q1)), height: h, class: 'dv-box' }));
        r.appendChild(svg('line', { x1: x(t.median), x2: x(t.median), y1: cy - h / 2, y2: cy + h / 2, class: 'dv-med' }));
        r.appendChild(svg('path', { d: diamond(x(t.mean), cy, g.wide ? 5 : 4.5), class: 'dv-mean' }));
        outs.forEach(function (c) { r.appendChild(c); });
        r.appendChild(svg('text', g.wide ? { x: g.left - 14, y: cy + 5, 'text-anchor': 'end', class: 'dv-term' } : { x: g.left, y: y0 + 16, class: 'dv-term' },
          t.term, svg('tspan', { class: 'dv-n', text: ' (' + t.papers + ')' })));
        rows.push({ g: r, y0: y0, cy: cy, pos: pos });
        wire(r, ti);
        return r;
      }

      // ------------------------------------------------------------ pointing, clicking and the keyboard
      function local(ev) { var b = svgEl.getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; }
      // the pair under the pointer: a tick in the strip, or a circle on the box's line; among pairs at one spot the
      // pointer's height picks one, so tied pairs stay reachable
      function hit(ti, px, py) {
        var r = rows[ti], t = terms[ti], a = r.y0 + g.rug[0] - 6, b = r.y0 + g.rug[1] + 6;
        var strip = py >= a && py <= b, line = Math.abs(py - r.cy) <= 6;
        if (!strip && !line) return -1;
        var best = 5, c = [];
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
      function unmark() { hlTick.classList.remove('on'); hlRing.classList.remove('on'); }
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

      function wire(r, ti) {
        r.addEventListener('pointermove', function (ev) {
          var p = local(ev), i = hit(ti, p[0], p[1]);
          if (i >= 0) showPair(ti, i, ev);
          else { unmark(); k.tip.show(ev, rowTip(terms[ti])); }
        });
        r.addEventListener('pointerleave', function () { unmark(); k.tip.hide(); });
        r.addEventListener('click', function (ev) {
          var p = local(ev), i = hit(ti, p[0], p[1]);
          if (i >= 0) { showPair(ti, i, ev); if (open !== ti) setOpen(ti); } // a pair opens its term, never closes it
          else setOpen(open === ti ? -1 : ti);
        });
        r.addEventListener('focus', function (ev) {
          if (!r.matches(':focus-visible')) return; // a click focuses too; the pointer shows the tip then
          if (cursor[ti] >= 0) showPair(ti, cursor[ti]);
          else k.tip.show(ev, rowTip(terms[ti]));
        });
        r.addEventListener('blur', function () { unmark(); k.tip.hide(); });
        r.addEventListener('keydown', function (ev) {
          var n = terms[ti].pairs.length, c = cursor[ti], key = ev.key;
          if (key === 'ArrowRight' || key === 'ArrowLeft' || key === 'Home' || key === 'End') {
            ev.preventDefault();
            if (key === 'ArrowRight') c = c < 0 ? 0 : Math.min(n - 1, c + 1);
            if (key === 'ArrowLeft') c = c < 0 ? n - 1 : Math.max(0, c - 1);
            if (key === 'Home') c = 0;
            if (key === 'End') c = n - 1;
            cursor[ti] = c;
            showPair(ti, c);
          } else if (key === 'Enter' || key === ' ') {
            ev.preventDefault();
            setOpen(open === ti ? -1 : ti);
          } else if (key === 'Escape' && cursor[ti] >= 0 && open < 0) { // the pair's tip first, then the stage
            ev.preventDefault();
            cursor[ti] = -1; unmark(); k.tip.hide();
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
        r.addEventListener('pointerenter', function () { if (rows[ti]) mark(ti, i); });
        r.addEventListener('pointerleave', unmark);
        return r;
      }

      k.onResize(draw);

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
