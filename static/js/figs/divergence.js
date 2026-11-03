/* Fig. 5, interactive: how similar two papers' definitions of the same term are (DefScore), for the ten terms of
   MBDef-Gold defined in the most papers. One row per term: its box (quartiles, median, mean) over a strip with one dot
   per pair of definitions from two different papers. Pointing at a dot shows both definitions; a click on a term shows
   its most and least similar pair below the chart. Data: static/data/figs/divergence.json (scripts/figs/divergence.py). */
(function () {
  'use strict';

  FIG.register('divergence', {
    build: function (panel, data, k) {
      var el = k.el, svg = k.svg, f2 = function (x) { return k.f(x, 2); };
      var terms = data.terms, papers = data.papers, MATCH = data.match, fm = String(MATCH);
      var focusTerm = 'media bias';
      var selected = Math.max(0, terms.findIndex(function (t) { return t.term === focusTerm; }));
      var medians = terms.map(function (t) { return t.median; });
      var lo = Math.min.apply(null, medians), hi = Math.max.apply(null, medians);
      var mb = terms[selected];
      var below = data.ten.pairs - data.ten.atMatch;

      k.head({
        fig: 'Fig. 5',
        title: 'Do papers agree on what a term means?',
        lead: 'Rarely. In <b>MBDef-Gold</b>, the hand-checked sample of ' + data.all.papers + ' papers, two papers’ ' +
          'definitions of the same term usually share little: for the ten terms defined in the most of these papers, the ' +
          'median <b>DefScore</b> (a 0-to-1 similarity) runs from ' + f2(lo) + ' to ' + f2(hi) +
          ', well under the ' + fm + ' at which the paper counts two definitions as a match.',
        stats: [
          { value: f2(mb.median), label: 'media bias, median (' + mb.papers + ' papers)' },
          { value: k.nf(data.ten.pairs), label: 'pairs from two papers' },
          { value: Math.round(100 * below / data.ten.pairs) + '%', label: 'below the ' + fm + ' match line' }
        ]
      });

      var body = k.body();
      body.classList.add('dv');
      var legend = el('div', { class: 'fig-legend dv-legend' },
        el('span', null, legendIcon('dot'), 'one pair of definitions from two papers'),
        el('span', null, legendIcon('box'), 'middle half of the pairs'),
        el('span', null, legendIcon('median'), 'median'),
        el('span', null, legendIcon('mean'), 'mean'),
        el('span', null, legendIcon('match'), fm + ': counted as a match'));
      var touch = window.matchMedia('(hover: none)').matches;
      var hint = el('p', { class: 'dv-hint', text: touch
        ? 'Tap a dot to read both definitions · tap a term for its most and least similar pair'
        : 'Point at a dot to read both definitions · click a term for its most and least similar pair',
        title: 'Keyboard: Tab to a term, \u2190 \u2192 step through its pairs, Enter picks it' });
      var chart = el('div', { class: 'dv-chart' });
      var detail = el('div', { class: 'dv-detail', 'aria-live': 'polite' });
      body.appendChild(legend);
      body.appendChild(hint);
      body.appendChild(chart);
      body.appendChild(detail);

      function legendIcon(kind) {
        var s = svg('svg', { width: 18, height: 12, viewBox: '0 0 18 12', 'aria-hidden': 'true', class: 'dv-li' });
        if (kind === 'dot') s.appendChild(svg('circle', { cx: 9, cy: 6, r: 3, class: 'dv-dot' }));
        if (kind === 'box') s.appendChild(svg('rect', { x: 1, y: 2, width: 16, height: 8, rx: 1.5, class: 'dv-box' }));
        if (kind === 'median') s.appendChild(svg('line', { x1: 9, x2: 9, y1: 0, y2: 12, class: 'dv-med' }));
        if (kind === 'mean') s.appendChild(svg('path', { d: diamond(9, 6, 4.5), class: 'dv-mean' }));
        if (kind === 'match') s.appendChild(svg('line', { x1: 9, x2: 9, y1: 0, y2: 12, class: 'dv-match' }));
        return s;
      }
      function diamond(x, y, r) { return 'M' + x + ' ' + (y - r) + 'L' + (x + r) + ' ' + y + 'L' + x + ' ' + (y + r) + 'L' + (x - r) + ' ' + y + 'Z'; }
      function plural(n, one, many) { return k.nf(n) + ' ' + (n === 1 ? one : many); }
      function paperLine(def) {
        var p = papers[def[0]];
        return el('p', { class: 'dv-src' }, el('span', { class: 'dv-src-t', text: p[0] }), ' ', el('span', { class: 'dv-src-y', text: '(' + p[1] + ')' }));
      }
      // a definition in curly double quotes; straight double quotes inside it become single ones, as nested quotes are set
      function inner(text) { return text.replace(/"([^"]*)"/g, '‘$1’'); }
      function quote(def) { return el('p', { class: 'dv-q', text: '“' + inner(def[1]) + '”' }); }
      function verdict(s) { return s >= MATCH ? 'counted as a match' : 'below the match line'; }

      // ------------------------------------------------------------ tooltips
      function pairTip(t, pair) {
        var a = t.defs[pair[0]], b = t.defs[pair[1]];
        return el('div', { class: 'dv-tip' },
          el('div', { class: 'dv-tip-head' },
            el('span', { class: 'dv-tip-term', text: t.term }),
            el('span', { class: 'dv-tip-score' }, el('b', { text: f2(pair[2]) }), ' DefScore'),
            el('span', { class: 'k', text: verdict(pair[2]) })),
          el('div', { class: 'dv-tip-defs' },
            el('div', { class: 'dv-tip-def' }, quote(a), paperLine(a)),
            el('div', { class: 'dv-tip-def' }, quote(b), paperLine(b))));
      }
      function rowTip(t) {
        return el('div', { class: 'dv-rowtip' },
          el('b', { text: t.term }), ' ', el('span', { class: 'k', text: plural(t.papers, 'paper', 'papers') + ' · ' + plural(t.definitions, 'definition', 'definitions') }),
          el('br'), plural(t.n, 'pair', 'pairs') + ' from two different papers',
          el('br'), 'median ', el('b', { text: f2(t.median) }), ' · middle half ' + f2(t.q1) + '–' + f2(t.q3) + ' · mean ' + f2(t.mean),
          el('br'), el('span', { class: 'k', text: t.atMatch + ' of ' + t.n + ' reach ' + fm + ' · click for the most and least similar pair' }));
      }

      // ------------------------------------------------------------ the detail under the chart
      function card(label, note, t, pair) {
        var a = t.defs[pair[0]], b = t.defs[pair[1]];
        var w = 64, mark = Math.max(0, Math.min(1, pair[2])) * w;
        var meter = svg('svg', { width: w + 8, height: 12, class: 'dv-meter', 'aria-hidden': 'true' },
          svg('line', { x1: 4, x2: w + 4, y1: 6, y2: 6, class: 'dv-meter-track' }),
          svg('line', { x1: 4 + w * MATCH, x2: 4 + w * MATCH, y1: 1, y2: 11, class: 'dv-match' }),
          svg('circle', { cx: 4 + mark, cy: 6, r: 4, class: 'dv-meter-dot' }));
        return el('div', { class: 'dv-card' },
          el('div', { class: 'dv-card-head' },
            el('span', null, el('span', { class: 'dv-card-k', text: label }), note ? el('span', { class: 'dv-card-note', text: note }) : null),
            el('span', { class: 'dv-card-score' }, meter, el('b', { text: f2(pair[2]) }))),
          el('div', { class: 'dv-card-defs' },
            el('div', { class: 'dv-card-def' }, quote(a), paperLine(a)),
            el('div', { class: 'dv-card-def' }, quote(b), paperLine(b))));
      }
      function renderDetail() {
        var t = terms[selected];
        var most = t.pairs[t.most], least = t.pairs[t.least];
        var tiedLow = t.pairs.filter(function (p) { return p[2] === least[2]; }).length;
        var tiedHigh = t.pairs.filter(function (p) { return p[2] === most[2]; }).length;
        detail.textContent = '';
        detail.appendChild(el('div', { class: 'dv-detail-head' },
          el('p', { class: 'dv-eyebrow', text: 'Selected term' }),
          el('h4', { class: 'dv-detail-term' + (t.term === focusTerm ? ' is-warm' : ''), text: t.term }),
          el('p', { class: 'dv-detail-sum', html:
            plural(t.papers, 'paper', 'papers') + ' give ' + plural(t.definitions, 'definition', 'definitions') + '; ' +
            '<b>' + k.nf(t.n) + '</b> pairs of them come from two different papers. Median <b>' + f2(t.median) + '</b>, middle half ' +
            f2(t.q1) + ' to ' + f2(t.q3) + ', mean ' + f2(t.mean) + '; ' + t.atMatch + ' of the ' + t.n + ' pairs (' + k.pct(t.atMatch, t.n, 0) +
            ') reach ' + fm + '.' }),
          el('a', { class: 'fig-link', href: k.explorer('concepts'), target: '_blank', rel: 'noopener',
            text: 'Every definition of “' + t.term + '” in the full dataset: MBDef Explorer, Concepts tab, search “' + t.term + '” →' })));
        detail.appendChild(el('div', { class: 'dv-cards' },
          card('Most similar pair', tiedHigh > 1 ? 'one of ' + tiedHigh + ' pairs at ' + f2(most[2]) + ': the one with the most shared words' : '', t, most),
          card('Least similar pair', tiedLow > 1 ? 'one of ' + tiedLow + ' pairs at ' + f2(least[2]) + ': the one with the fewest shared words' : '', t, least)));
      }

      // ------------------------------------------------------------ the chart
      var layout = null, rowsEl = [], hl = null, entrance = 'pending', io = null, anim = 0, fallback = 0, svgEl = null;
      var cursor = terms.map(function () { return -1; });

      function geometry(w) {
        var wide = w >= 620;
        var g = { w: w, wide: wide };
        g.labelW = wide ? Math.min(210, Math.round(w * 0.2)) : 0;
        g.left = wide ? g.labelW + 16 : 10;
        g.right = w - (wide ? 18 : 12);
        g.top = 30;
        g.rowH = wide ? 58 : 76;
        g.boxY = wide ? 10 : 26; g.boxH = 16;
        g.stripY = wide ? 33 : 49; g.stripH = wide ? 20 : 22;
        g.r = wide ? 2.6 : 2.3;
        g.h = g.top + terms.length * g.rowH + 48;
        g.x = function (v) { return g.left + v * (g.right - g.left); };
        return g;
      }

      function draw(w) {
        cancelAnimationFrame(anim); anim = 0;
        var g = layout = geometry(w);
        chart.textContent = '';
        rowsEl = [];
        var s = svgEl = svg('svg', { width: w, height: g.h, class: 'dv-svg', role: 'group',
          'aria-label': 'Box plots of DefScore for pairs of definitions from two papers, ten terms; each term is a focusable row' });
        // grid, ticks and the match line
        var axis = svg('g', { class: 'dv-axis', 'aria-hidden': 'true' });
        var bottom = g.top + terms.length * g.rowH;
        [0, 0.2, 0.4, 0.6, 0.8, 1].forEach(function (v) {
          axis.appendChild(svg('line', { x1: g.x(v), x2: g.x(v), y1: g.top - 4, y2: bottom, class: 'dv-grid' }));
          axis.appendChild(svg('text', { x: g.x(v), y: bottom + 17, 'text-anchor': 'middle', class: 'dv-tick', text: v === 0 || v === 1 ? String(v) : v.toFixed(1) }));
        });
        axis.appendChild(svg('text', { x: (g.left + g.right) / 2, y: bottom + 38, 'text-anchor': 'middle', class: 'dv-axis-title',
          text: g.wide ? 'DefScore of a pair of definitions from two papers (0 = nothing in common, 1 = the same content)' : 'DefScore of a pair (0 to 1)' }));
        s.appendChild(axis);

        terms.forEach(function (t, ti) {
          var y0 = g.top + ti * g.rowH;
          var row = svg('g', { class: 'dv-row' + (t.term === focusTerm ? ' is-warm' : '') + (ti === selected ? ' is-selected' : ''),
            tabindex: 0, role: 'button', 'aria-pressed': ti === selected ? 'true' : 'false',
            'aria-label': t.term + ': ' + t.papers + ' papers, ' + t.n + ' pairs, median ' + f2(t.median) + ', mean ' + f2(t.mean) +
              '. Enter shows its most and least similar pair; arrow keys step through its pairs.' });
          row.appendChild(svg('rect', { x: 0, y: y0 + 1, width: w, height: g.rowH - 2, rx: 10, class: 'dv-rowbg' }));
          // the label
          if (g.wide) {
            row.appendChild(svg('text', { x: 14, y: y0 + 22, class: 'dv-term', text: t.term }));
            row.appendChild(svg('text', { x: 14, y: y0 + 40, class: 'dv-count', text: plural(t.papers, 'paper', 'papers') + ' · ' + plural(t.n, 'pair', 'pairs') }));
          } else {
            row.appendChild(svg('text', { x: g.left, y: y0 + 17, class: 'dv-term', text: t.term }));
            row.appendChild(svg('text', { x: g.right, y: y0 + 17, 'text-anchor': 'end', class: 'dv-count', text: t.papers + ' papers · ' + t.n + ' pairs' }));
          }
          // the box, the median and the mean
          var by = y0 + g.boxY, cy = by + g.boxH / 2;
          row.appendChild(svg('rect', { x: g.x(t.q1), y: by, width: Math.max(1, g.x(t.q3) - g.x(t.q1)), height: g.boxH, rx: 2, class: 'dv-box' }));
          // the dots: ordered by score; a golden-ratio sequence spreads neighbours over the strip's height
          var dots = svg('g', { class: 'dv-dots', style: '--dv-op:' + Math.max(0.25, Math.min(0.6, 0.6 * Math.sqrt(120 / t.n))).toFixed(2) }), pos = [];
          t.pairs.forEach(function (p, i) {
            var x = g.x(p[2]), y = y0 + g.stripY + g.stripH * ((i * 0.6180339887 + 0.5) % 1);
            pos.push([x, y]);
            dots.appendChild(svg('circle', { cx: x, cy: y, r: g.r, class: 'dv-dot' }));
          });
          row.appendChild(dots);
          row.appendChild(svg('line', { x1: g.x(t.median), x2: g.x(t.median), y1: by - 2, y2: by + g.boxH + 2, class: 'dv-med' }));
          row.appendChild(svg('path', { d: diamond(g.x(t.mean), cy, 5), class: 'dv-mean' }));
          rowsEl.push({ g: row, pos: pos, dots: dots, y0: y0, medX: g.x(t.median) });
          wire(row, ti);
          s.appendChild(row);
        });
        // the match line sits over the rows, its label above them
        if (g.wide) s.appendChild(svg('line', { x1: g.x(MATCH), x2: g.x(MATCH), y1: g.top - 6, y2: bottom, class: 'dv-match', 'aria-hidden': 'true' }));
        else terms.forEach(function (t, ti) {
          var y0 = g.top + ti * g.rowH;
          s.appendChild(svg('line', { x1: g.x(MATCH), x2: g.x(MATCH), y1: y0 + g.boxY - 4, y2: y0 + g.stripY + g.stripH + 4, class: 'dv-match', 'aria-hidden': 'true' }));
        });
        s.appendChild(svg('text', { x: g.x(MATCH), y: g.top - 11, 'text-anchor': 'middle', class: 'dv-match-label', 'aria-hidden': 'true',
          text: fm + ' · counted as a match' }));
        hl = svg('circle', { r: 5.5, class: 'dv-hl', 'aria-hidden': 'true' });
        s.appendChild(hl);
        chart.appendChild(s);
        prepareEntrance();
      }

      // ------------------------------------------------------------ one gentle entrance: the dots spread out from the median
      // state: 'pending' until the chart is on screen, 'running', then 'done' (also at once without motion or on a resize)
      function prepareEntrance() {
        if (entrance === 'pending' && !io) {
          if (!k.motion || !('IntersectionObserver' in window)) { entrance = 'done'; return; }
          io = new IntersectionObserver(function (es) {
            if (!es.some(function (e) { return e.isIntersecting; })) return;
            io.disconnect();
            runEntrance();
          }, { threshold: 0.2 });
          io.observe(chart);
        }
        if (entrance === 'pending') rowsEl.forEach(function (r) {
          [].forEach.call(r.dots.childNodes, function (c) { c.setAttribute('cx', r.medX); });
          r.dots.style.opacity = '0';
        });
        if (entrance === 'running') finish(); // a redraw mid-way: the new dots already stand where they belong
      }
      function runEntrance() {
        entrance = 'running';
        var t0 = performance.now(), D = 900, STAG = 45;
        fallback = setTimeout(finish, D + STAG * terms.length + 400); // a page in the background draws no frames
        function frame(now) {
          var done = true;
          rowsEl.forEach(function (r, i) {
            var p = Math.max(0, Math.min(1, (now - t0 - i * STAG) / D));
            if (p < 1) done = false;
            var e = 1 - Math.pow(1 - p, 3);
            r.dots.style.opacity = String(Math.min(1, p * 2.5));
            [].forEach.call(r.dots.childNodes, function (c, j) { c.setAttribute('cx', r.medX + (r.pos[j][0] - r.medX) * e); });
          });
          if (done) finish(); else anim = requestAnimationFrame(frame);
        }
        anim = requestAnimationFrame(frame);
      }
      function finish() { // the end state of the entrance, at once (also when a reader points before it ends)
        if (entrance === 'done') return;
        entrance = 'done';
        if (io) io.disconnect();
        cancelAnimationFrame(anim); clearTimeout(fallback); anim = 0;
        rowsEl.forEach(function (r) {
          r.dots.style.opacity = '';
          [].forEach.call(r.dots.childNodes, function (c, j) { c.setAttribute('cx', r.pos[j][0]); });
        });
      }

      // ------------------------------------------------------------ pointing, clicking and the keyboard
      function nearest(ti, px, py) {
        var best = -1, bd = Infinity, pos = rowsEl[ti].pos;
        for (var i = 0; i < pos.length; i++) {
          var dx = pos[i][0] - px, dy = (pos[i][1] - py) * 0.8, d = dx * dx + dy * dy;
          if (d < bd) { bd = d; best = i; }
        }
        return { i: best, d: Math.sqrt(bd) };
      }
      function local(ev) {
        var r = svgEl.getBoundingClientRect();
        return [ev.clientX - r.left, ev.clientY - r.top];
      }
      function showPair(ti, i, ev) {
        var p = rowsEl[ti].pos[i];
        hl.setAttribute('cx', p[0]); hl.setAttribute('cy', p[1]);
        hl.classList.add('on');
        hl.classList.toggle('is-warm', terms[ti].term === focusTerm);
        if (!ev) { var r = svgEl.getBoundingClientRect(); ev = { clientX: r.left + p[0], clientY: r.top + p[1] }; }
        k.tip.show(ev, pairTip(terms[ti], terms[ti].pairs[i]));
      }
      function clearHl() { hl.classList.remove('on'); }
      function select(ti) {
        if (ti === selected) return;
        selected = ti;
        rowsEl.forEach(function (r, i) {
          r.g.classList.toggle('is-selected', i === ti);
          r.g.setAttribute('aria-pressed', i === ti ? 'true' : 'false');
        });
        renderDetail();
      }
      function wire(row, ti) {
        row.addEventListener('pointermove', function (ev) {
          finish();
          var p = local(ev), n = nearest(ti, p[0], p[1]);
          if (n.i >= 0 && n.d <= 12) showPair(ti, n.i, ev);
          else { clearHl(); k.tip.show(ev, rowTip(terms[ti])); }
        });
        row.addEventListener('pointerleave', function () { clearHl(); k.tip.hide(); });
        row.addEventListener('click', function (ev) {
          select(ti);
          var p = local(ev), n = nearest(ti, p[0], p[1]);
          if (n.i >= 0 && n.d <= 12) showPair(ti, n.i, ev);
        });
        row.addEventListener('focus', function (ev) {
          finish();
          if (cursor[ti] >= 0) showPair(ti, cursor[ti]);
          else { clearHl(); k.tip.show(ev, rowTip(terms[ti])); }
        });
        row.addEventListener('blur', function () { clearHl(); k.tip.hide(); });
        row.addEventListener('keydown', function (ev) {
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
            select(ti);
          } else if (key === 'Escape') {
            cursor[ti] = -1; clearHl(); k.tip.hide();
          }
        });
      }

      renderDetail();
      k.onResize(draw);

      // ------------------------------------------------------------ notes and method, from the data
      var mbMost = mb.pairs[mb.most], mbLeast = mb.pairs[mb.least];
      var mbTied = mb.pairs.filter(function (p) { return p[2] === mbLeast[2]; }).length;
      function qShort(def) { return '“' + esc(inner(def[1])) + '” (' + papers[def[0]][1] + ')'; }
      function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

      k.notes({
        what: 'One row for each of the ten terms that the most papers of <b>MBDef-Gold</b> define. Each dot is one pair of ' +
          'definitions of that term taken from two different papers, placed by its DefScore; the box holds the middle half ' +
          'of the pairs. MBDef-Gold is the human-validated part of the release: definitions a language model proposed and ' +
          'annotators confirmed, ' + k.nf(data.all.definitions) + ' of them from ' + data.all.papers + ' papers.',
        why: 'If papers agreed, most dots would sit at or past ' + fm + '. Instead ' + k.nf(below) + ' of the ' +
          k.nf(data.ten.pairs) + ' pairs fall below it, <i>media bias</i> included. A study or a label that says ' +
          '<i>media bias</i> can mean different things, which is why MBDef keeps every definition with its source rather than ' +
          'picking one.',
        read: '<b>DefScore</b> is a number from 0 to 1 for how much two definitions share in content. It combines three ' +
          'signals: shared words, how close the texts sit as meaning vectors, and whether each text entails the other; the ' +
          'mix is calibrated to human similarity ratings. At ' + fm + ' the paper counts two definitions as a match: ' +
          // the paper, Sec. 3.1 "Metrics": DefSim's 60 rated pairs; the cut matches every pair rated >= 3/5
          'on 60 human-rated pairs, that cut matches every pair the raters scored 3 of 5 or higher. ' +
          'It measures overlap, not correctness: a low score means two papers stress different things, not that one is ' +
          'wrong. For scale, definitions of two <i>different</i> terms score a median of ' + f2(data.all.differentTermMedian) + '.',
        example: 'Rule: the term the paper names. <i>Media bias</i>: ' + mb.papers + ' papers, ' + mb.definitions +
          ' definitions, ' + mb.n + ' pairs across papers, median <b>' + f2(mb.median) + '</b> (the paper: 0.25). ' +
          'Most similar (' + f2(mbMost[2]) + '): ' + qShort(mb.defs[mbMost[0]]) + ' and ' + qShort(mb.defs[mbMost[1]]) +
          ', nearly word for word. Least similar (' + f2(mbLeast[2]) + ', one of ' + mbTied + ' pairs at ' + f2(mbLeast[2]) +
          ', the one with the fewest shared words): ' + qShort(mb.defs[mbLeast[0]]) + ' against ' + qShort(mb.defs[mbLeast[1]]) + '.'
      });

      k.method(
        '<p><b>Rule.</b> Take every definition in the MBDef-Gold records that annotators marked relevant, from all three ' +
        'splits (' + k.nf(data.all.definitions) + ' definitions, ' + data.all.papers + ' of its ' + data.all.goldPapers + ' papers). ' +
        'Two terms count as the same when they match after setting aside case, spacing and outer punctuation; synonyms ' +
        'and plurals stay apart. Pair every two definitions of one term that come from different papers (' +
        k.nf(data.all.pairs) + ' pairs over ' + data.all.terms + ' terms), score each pair with DefScore, and keep the ten terms ' +
        'defined in the most papers (ties alphabetical). Box: first to third quartile; line: median; diamond: mean. The ' +
        'printed figure also draws whiskers, out to the furthest pair within 1.5 box widths of the box, and dots for the pairs ' +
        'beyond them only; here every pair is a dot.</p>' +
        '<p><b>DefScore.</b> The mean of three similarities, calibrated and clipped to 0 to 1: ' +
        'clip(' + data.calibration[0] + ' × mean − ' + Math.abs(data.calibration[1]) + ', 0, 1). The three are word-overlap F1, the cosine ' +
        'of the two texts’ <code>' + data.models[0] + '</code> vectors, and the entailment probability of <code>' + data.models[1] +
        '</code> in both directions. The two constants are a least-squares fit to the 60 human-rated definition pairs of DefSim. ' +
        'The paper’s extractor evaluation counts a pair at ' + fm + ' or more as a match.</p>' +
        '<p><b>Pairs shown.</b> Most similar: the highest DefScore, ties to the pair with the most shared words. Least ' +
        'similar: the lowest, ties to the fewest shared words. Definitions are cut to ' + data.words + ' words.</p>' +
        '<p><b>Source and code.</b> Released table: MBDef-Gold (train, validation and test). <code>scripts/figs/divergence.py</code> ' +
        'runs the divergence analysis of the MBDef code (tutorial 04, the code of the printed figure) and checks every ' +
        'term’s paper count, quartiles, median and mean against the printed figure, and the media bias median against ' +
        'the paper’s 0.25. All match.</p>');
    }
  });
})();
