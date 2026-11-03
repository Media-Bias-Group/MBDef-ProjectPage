/* Paper, Fig. 1, interactive: the five steps that build MBDef, drawn as one flow of papers.

   The band is the papers each step passes on, its width to one scale; grey are papers from the keyword search (the
   seed papers once Step 2 keeps them), blue the papers added through citations (closure). A stream that leaves the
   band and fades is what a step drops; at Step 4 the cited works pour in from above and most of them fade before they
   join. Wide screens run the flow left to right, phones top to bottom: the geometry is built in flow coordinates
   (u along the flow, v across it) and mapped to x/y by the mode. Every number comes from
   static/data/figs/pipeline.json, written by scripts/figs/pipeline.py from the paper and the released tables. */
(function () {
  'use strict';
  var KQ = 0.5523; // a quarter circle as one cubic Bézier

  FIG.register('pipeline', {
    build: function (panel, D, k) {
      var P = D.paper, X = D.derived, R = D.released, MB = D.media_bias, nf = k.nf, el = k.el;
      var pc1 = function (a, b) { return k.pct(a, b, 1); };

      k.head({
        fig: 'Fig. 1',
        title: 'How does a keyword search become ' + nf(P.final_definitions) + ' definitions?',
        lead: 'A Scopus search finds ' + nf(P.search_results) + ' documents. Only ' + nf(P.pdfs_read) + ' can be read, and ' +
          nf(P.seed_papers) + ' of those are about media bias; the works they cite add ' + nf(P.closure_added) +
          ' papers, and a relevance filter keeps <b>' + nf(P.final_definitions) + ' definitions</b> from ' + nf(P.final_papers) + ' papers.',
        stats: [
          { value: nf(P.search_results), label: 'documents found' },
          { value: nf(P.final_papers), label: 'papers kept' },
          { value: nf(P.final_definitions), label: 'definitions' }
        ]
      });

      // ------------------------------------------------------------ the steps: header text, tooltip, card
      var STEPS = [
        { name: 'Search', from: P.search_results, out: P.pdfs_read, unit: 'papers read', sub: 'of ' + nf(P.search_results) + ' found',
          tip: '<b>Step 1 · Search</b><br>' + nf(P.search_results) + ' documents found → ' + nf(P.pdfs_read) + ' PDFs read (' + pc1(P.pdfs_read, P.search_results) + ')<br>' +
            '<span class="k">dropped:</span> ' + nf(X.not_open) + ' with no openly accessible copy; ' + nf(X.open_not_read) + ' open, but not retrieved or converted' },
        { name: 'Classification', from: P.pdfs_read, out: P.seed_papers, unit: 'seed papers', sub: 'of ' + nf(P.pdfs_read) + ' read',
          tip: '<b>Step 2 · Classification</b><br>' + nf(P.pdfs_read) + ' papers read → ' + nf(P.seed_papers) + ' seed papers (' + pc1(P.seed_papers, P.pdfs_read) + ')<br>' +
            '<span class="k">kept:</span> ' + nf(P.both_relevant) + ' both models marked relevant + ' + nf(P.judge_added) + ' the third model added − ' + nf(X.removed) + ' removed<br>' +
            '<span class="k">dropped:</span> ' + nf(X.not_relevant) + ' not marked relevant; ' + nf(X.removed) + ' errata, withdrawals or without a title' },
        { name: 'Extraction', from: P.seed_papers, out: P.seed_papers, unit: 'papers extracted', sub: 'finds ' + P.test_recall + '% of test definitions',
          tip: '<b>Step 3 · Extraction</b><br>All ' + nf(P.seed_papers) + ' seed papers are read by the extractor; none is dropped here<br>' +
            'On hand-checked papers it finds ' + P.test_found + ' of ' + P.test_gold + ' test definitions (' + P.test_recall + '%)' },
        { name: 'Closure', from: P.seed_papers, out: P.corpus_papers, unit: 'papers', sub: '+' + nf(P.closure_added) + ' cited · ' + nf(P.defs_collapsed) + ' definitions',
          tip: '<b>Step 4 · Closure</b><br>' + nf(P.cited_works) + ' cited works → ' + nf(P.closure_added) + ' papers added<br>' +
            nf(P.seed_papers) + ' + ' + nf(P.closure_added) + ' = ' + nf(P.corpus_papers) + ' papers, with ' + nf(P.defs_extracted) + ' definitions extracted (' +
            nf(P.defs_collapsed) + ' after collapsing identical ones)' },
        { name: 'Post-processing', from: P.corpus_papers, out: P.final_papers, unit: 'papers', sub: nf(P.final_definitions) + ' definitions · ' + nf(P.terms) + ' terms',
          tip: '<b>Step 5 · Post-processing</b><br>' + nf(P.corpus_papers) + ' papers → ' + nf(P.final_papers) + ' (' + nf(R.seed) + ' seed, ' + nf(R.cited) + ' cited)<br>' +
            nf(P.defs_collapsed) + ' definitions → ' + nf(P.final_definitions) + '; ' + nf(P.label_groups) + ' term groups → ' + nf(P.terms) + ' terms' }
      ];
      // the streams a step drops: where in its column they leave (wide mode), what the label and tooltip say
      var LOSSES = [
        { step: 0, at: 0.2, n: X.not_open, cap: 'no openly accessible copy',
          tip: '<b>' + nf(X.not_open) + '</b> search results (' + pc1(X.not_open, P.search_results) + ') have no openly accessible copy <span class="k">(' + nf(P.search_results) + ' − ' + nf(P.open_access) + ')</span>' },
        { step: 0, at: 0.46, n: X.open_not_read, cap: 'open, but not retrieved or converted',
          tip: '<b>' + nf(X.open_not_read) + '</b> openly accessible documents (' + pc1(X.open_not_read, P.search_results) + ' of the search) could not be retrieved or converted to text <span class="k">(' + nf(P.open_access) + ' − ' + nf(P.pdfs_read) + ')</span>' },
        { step: 1, at: 0.13, n: X.not_relevant, cap: 'not marked relevant',
          tip: '<b>' + nf(X.not_relevant) + '</b> papers read were not marked relevant to media bias <span class="k">(' + nf(P.pdfs_read) + ' − ' + nf(P.both_relevant) + ' − ' + nf(P.judge_added) + ')</span>' },
        { step: 1, at: 0.8, n: X.removed, cap: 'errata, withdrawals, no title',
          tip: '<b>' + nf(X.removed) + '</b> removed: ' + P.removed_errata + ' errata, withdrawals or tables of contents, and ' + P.removed_no_title + ' records without a recoverable title' },
        { step: 4, at: 0.34, n: X.papers_dropped_s5, cap: 'left without a definition',
          tip: '<b>' + nf(X.papers_dropped_s5) + '</b> papers left without a definition: ' + P.papers_no_def + ' had none after extraction, and the filter removed the last one of ' + P.papers_lost_last + ' more.<br>' +
            '<span class="k">By origin, in the released tables:</span> ' + nf(R.dropped_seed) + ' seed, ' + nf(R.dropped_cited) + ' cited' }
      ];
      var CITED = {
        tip: '<b>' + nf(P.cited_works) + '</b> distinct works are cited next to extracted definitions (from ' + nf(P.citation_markers) + ' citation markers, ' + P.markers_matched_pct + '% matched to a reference list).<br>' +
          nf(P.cited_collected) + ' (' + k.pct(P.cited_collected, P.cited_works, 0) + ') were collected and extracted; without ' + X.cited_duplicates + ' duplicates, <b>' + nf(P.closure_added) + ' join</b>.<br>' +
          '<span class="k">Not added:</span> ' + nf(P.cited_in_corpus) + ' already in the corpus; ' + nf(X.cited_not_obtained) + ' not obtained, mostly because no open-access copy is known'
      };

      // ------------------------------------------------------------ the parts of the panel
      var body = k.body();
      var chart = el('div', { class: 'pl-chart' });
      var svg = S('svg', { class: 'pl-svg', role: 'group', 'aria-label': 'The papers through the five steps: ' + STEPS.map(function (s, i) { return 'step ' + (i + 1) + ', ' + s.name + ', ' + nf(s.out) + ' ' + s.unit; }).join('; ') });
      var heads = el('div', { class: 'pl-heads', role: 'group', 'aria-label': 'The five steps: choose one to read what happens in it' });
      var legend = el('div', { class: 'fig-legend pl-legend' });
      var card = el('div', { class: 'pl-card', 'aria-live': 'polite' });
      chart.append(heads, svg); // the steps first in the reading and tab order; they sit over the flow
      body.append(chart, legend, card);

      var sel = 0, hov = -1, played = !k.motion, anim = null, G = null, lastW = 0;
      var hb = STEPS.map(function (st, i) {
        var num = el('b', { class: 'pl-num', text: nf(st.out) });
        var b = el('button', {
          type: 'button', class: 'pl-step', 'aria-pressed': 'false',
          'aria-label': 'Step ' + (i + 1) + ', ' + st.name + ': ' + nf(st.out) + ' ' + st.unit + ', ' + st.sub,
          onclick: function () { select(i); },
          onmouseenter: function (e) { hover(i); k.tip.show(e, st.tip); }, onmousemove: function (e) { k.tip.show(e, st.tip); },
          onmouseleave: function () { hover(-1); k.tip.hide(); },
          onfocus: function (e) { hover(i); if (b.matches(':focus-visible')) k.tip.show(e, st.tip); }, onblur: function () { hover(-1); k.tip.hide(); },
          onkeydown: function (e) {
            var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (d) { e.preventDefault(); hb[(i + d + 5) % 5].focus(); }
          }
        },
          el('span', { class: 'pl-eb', text: 'Step ' + (i + 1) }),
          el('span', { class: 'pl-nm', text: st.name }),
          num,
          el('span', { class: 'pl-unit', text: st.unit }),
          el('span', { class: 'pl-sub', text: st.sub }));
        b._num = num;
        heads.appendChild(b);
        return b;
      });

      // ------------------------------------------------------------ text helpers
      var ctx = document.createElement('canvas').getContext('2d');
      function wrap(str, px, font) {
        ctx.font = font;
        var out = [], line = '';
        str.split(' ').forEach(function (w) {
          var t = line ? line + ' ' + w : w;
          if (line && ctx.measureText(t).width > px) { out.push(line); line = w; } else line = t;
        });
        if (line) out.push(line);
        return out;
      }
      var CAP_FONT = '12px Inter, system-ui, sans-serif';
      // a label: the count in the display face, then the caption lines; anchor 'middle' or 'start'
      function label(parent, n, capLines, anchor) {
        var g = S('g', { class: 'pl-lab' }, parent);
        g.appendChild(S('text', { class: 'pl-lab-n', x: 0, y: 0, 'text-anchor': anchor, text: n }));
        capLines.forEach(function (c, j) { g.appendChild(S('text', { class: 'pl-lab-c', x: 0, y: 17 + 14 * j, 'text-anchor': anchor, text: c })); });
        return g;
      }
      function S(tag, attrs, parent) { var e = k.svg(tag, attrs); if (parent) parent.appendChild(e); return e; }
      function under(g, node) { g.insertBefore(node, g.firstChild); } // beneath what the group already holds

      // ------------------------------------------------------------ geometry
      function draw(W) {
        lastW = W;
        var wide = W >= 640;
        var tall = !wide;
        var Hmax = wide ? Math.max(110, Math.min(196, W * 0.165)) : Math.max(84, Math.min(150, W * 0.32));
        var s = Hmax / P.search_results, th = function (n) { return n * s; };
        var r = wide ? 12 : 10;
        var tj = th(P.closure_added), tc = th(P.cited_works);
        var M = wide ? function (u, v) { return [u, v]; } : function (u, v) { return [v, u]; };
        var pt = function (u, v) { var p = M(u, v); return p[0].toFixed(2) + ',' + p[1].toFixed(2); };

        // band thickness (seed side) after each loss, in order
        var seedAfter = [P.open_access, P.pdfs_read, X.relevant, P.seed_papers, null];

        // headers: place, then measure
        // wide: the columns are as wide as their steps need (Step 1 drops two large streams, Step 3 none)
        var WTS = [1.45, 1.1, 0.8, 0.95, 0.95], wsum = 5.25, segs = [], V0, vTop;
        if (wide) {
          WTS.reduce(function (acc, w) { segs.push([acc, acc + W * w / wsum]); return acc + W * w / wsum; }, 0);
          segs[4][1] = W;
          hb.forEach(function (b, i) { b.style.left = segs[i][0] + 'px'; b.style.top = '0px'; b.style.width = (segs[i][1] - segs[i][0] - 14) + 'px'; });
        } else {
          V0 = 56;
          var hx = V0 + Hmax + 14;
          hb.forEach(function (b) { b.style.left = hx + 'px'; b.style.width = (W - hx) + 'px'; });
        }
        var hh = hb.map(function (b) { return b.offsetHeight; });

        svg.textContent = '';
        var defs = S('defs', {}, svg);
        var tint = S('g', { class: 'pl-tint' }, svg);
        var flow = S('g', { class: 'pl-flow' }, svg);
        var clipId = 'pl-clip', clip = S('clipPath', { id: clipId }, defs), clipRect = S('rect', { x: 0, y: 0, width: 0, height: 0 }, clip);
        var band = S('g', { class: 'pl-band' }, flow);
        var marks = S('g', {}, flow);
        var C = { seed: k.color('--fig-seed'), cited: k.color('--fig-closure') };

        // labels first (their size sets the tall layout)
        var losses = LOSSES.map(function (L, j) {
          var bBefore = j === 0 ? P.search_results : seedAfter[j - 1];
          if (j === 4) bBefore = P.seed_papers;
          var bAfter = j === 4 ? P.seed_papers - X.papers_dropped_s5 : seedAfter[j];
          var g = S('g', { class: 'pl-loss', tabindex: '0', role: 'button', 'aria-label': L.tip.replace(/<[^>]+>/g, '') + '. Step ' + (L.step + 1) + '.' }, marks);
          var t = th(L.n), rr = wide ? 8 + 0.3 * t : 8 + 0.2 * t;
          var capW = wide ? Math.max(88, Math.min(132, t + 34)) : W - (V0 + th(bBefore) + rr) - 8;
          var lab = label(g, nf(L.n), wrap(L.cap, capW, CAP_FONT), wide ? 'middle' : 'start');
          var bb = lab.getBBox();
          return { L: L, g: g, lab: lab, bw: bb.width, bh: bb.height, t: t, r: rr, before: bBefore, after: bAfter };
        });
        var citedG = S('g', { class: 'pl-cited', tabindex: '0', role: 'button', 'aria-label': CITED.tip.replace(/<[^>]+>/g, '') + '. Step 4.' }, marks);
        var citedLab = label(citedG, nf(P.cited_works), ['cited works; ' + nf(P.closure_added) + ' join,', nf(P.cited_works - P.closure_added) + ' do not'], 'start');
        var cbb = citedLab.getBBox();
        marks.insertBefore(citedG, losses[4].g); // in the flow's order: Step 4's stream before Step 5's
        var note = S('text', { class: 'pl-note', 'text-anchor': wide ? 'middle' : 'start', text: 'no papers dropped' }, marks);

        // ---- positions along the flow
        var U, H, a, uJoin, vEnd;
        if (wide) {
          var headH = Math.max.apply(null, hh) + 18;
          vTop = headH;
          V0 = vTop + 64 + tj + r;
          losses.forEach(function (o) { o.u = segs[o.L.step][0] + o.L.at * (segs[o.L.step][1] - segs[o.L.step][0]); });
          // keep the two big losses of Step 1 apart
          losses[1].u = losses[0].u + losses[0].r + losses[0].t + 24;
          a = segs[3][0] + 0.2 * (segs[3][1] - segs[3][0]);
          vEnd = V0 + Hmax + losses[0].r + 52;
          U = W;
        } else {
          vTop = 2;
          var u = 0, gap = 12;
          var stepLosses = [[0, 1], [2, 3], [], [], [4]];
          for (var si = 0; si < 5; si++) {
            var a0 = u;
            hb[si].style.top = (u + 10) + 'px';
            u += 10 + hh[si] + gap;
            if (si === 2) { note.setAttribute('x', V0 + th(P.seed_papers) + 14); note.setAttribute('y', u + 2); u += 16; }
            if (si === 3) { a = u; citedG._labU = u; u += Math.max(tc + 6, cbb.height) + gap; }
            stepLosses[si].forEach(function (j) {
              var o = losses[j];
              o.u = u;
              u += o.r + Math.max(o.t, 1) + 6 + o.bh + gap + 4;
            });
            segs.push([a0, u]);
          }
          U = u + 4;
          vEnd = W - 2;
        }
        uJoin = a + tc + r; // where the joining cited papers meet the band (see the ribbon below)
        H = wide ? 0 : U;

        // ---- the band: straight pieces between events, seed below V0 and cited above it
        var seedEdges = [[0, P.search_results]].concat(losses.slice(0, 4).map(function (o) { return [o.u, o.after]; }));
        var piece = function (u0, u1, v0, v1, fill, cls) {
          var p = M(u0, v0), q = M(u1, v1);
          S('rect', { x: Math.min(p[0], q[0]).toFixed(2), y: Math.min(p[1], q[1]).toFixed(2), width: Math.abs(q[0] - p[0]).toFixed(2), height: Math.max(0.6, Math.abs(q[1] - p[1])).toFixed(2), fill: fill, class: cls }, band);
        };
        var uL5 = losses[4].u;
        seedEdges.forEach(function (e, j) {
          var u1 = j + 1 < seedEdges.length ? seedEdges[j + 1][0] : uL5;
          piece(e[0], u1, V0, V0 + th(e[1]), C.seed, 'pl-seed');
        });
        // after Step 5's loss: the stack keeps its top edge, its inner border moves with the released split
        var top5 = V0 - tj;
        piece(uL5, U, top5 + th(R.cited), top5 + th(R.cited) + th(R.seed), C.seed, 'pl-seed');
        piece(uJoin, uL5, V0 - tj, V0, C.cited, 'pl-cit');
        piece(uL5, U, top5, top5 + th(R.cited), C.cited, 'pl-cit');

        // ---- the losses: leave the band's far edge, turn across the flow, fade
        losses.forEach(function (o, j) {
          var vB = V0 + th(o.before), vA = V0 + th(o.after);
          if (j === 4) { vB = V0 + th(P.seed_papers); vA = vB - o.t; }
          var t = Math.max(o.t, 1);
          if (o.t < 1) vA = vB - 1;
          var ue = o.u, R1 = o.r, R2 = o.r + (vB - vA);
          // outer edge (vA, radius R2) and inner edge (vB, radius R1) around the centre (ue, vB + r)
          var cu = ue, cv = vB + o.r;
          var d = 'M' + pt(ue, vA) +
            'C' + pt(cu + KQ * R2, cv - R2) + ' ' + pt(cu + R2, cv - KQ * R2) + ' ' + pt(cu + R2, cv) +
            'L' + pt(cu + R2, vEnd) + 'L' + pt(cu + R1, vEnd) + 'L' + pt(cu + R1, cv) +
            'C' + pt(cu + R1, cv - KQ * R1) + ' ' + pt(cu + KQ * R1, cv - R1) + ' ' + pt(ue, vB) + 'Z';
          // solid through the turn, as the band it leaves, then fading out along the fall
          var gid = 'pl-gl' + j, g0 = M(ue, cv), g1 = M(ue, vEnd);
          var gr = S('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: g0[0], y1: g0[1], x2: g1[0], y2: g1[1] }, defs);
          S('stop', { offset: 0, 'stop-color': C.seed, 'stop-opacity': 0.82 }, gr);
          S('stop', { offset: 0.35, 'stop-color': C.seed, 'stop-opacity': 0.45 }, gr);
          S('stop', { offset: 1, 'stop-color': C.seed, 'stop-opacity': 0 }, gr);
          // a hit area a finger can find, under the stream
          var h0 = M(ue - 4, vA - 2), h1 = M(cu + R2 + 6, vEnd);
          // a hairline of the panel's colour where the stream splits off the band (the node and the outer bend)
          if (o.t >= 4) under(o.g, S('path', { class: 'pl-cut', d: 'M' + pt(ue, vB) + 'L' + pt(ue, vA) + 'C' + pt(cu + KQ * R2, cv - R2) + ' ' + pt(cu + R2, cv - KQ * R2) + ' ' + pt(cu + R2, cv) }));
          under(o.g, S('path', { class: 'pl-stream', d: d, fill: 'url(#' + gid + ')' }));
          under(o.g, S('rect', { class: 'pl-hit', x: Math.min(h0[0], h1[0]), y: Math.min(h0[1], h1[1]), width: Math.abs(h1[0] - h0[0]), height: Math.abs(h1[1] - h0[1]), rx: 6 }));
          o.mid = cu + (R1 + R2) / 2;
          o.vEnd = vEnd;
        });

        // ---- the cited works pour in at Step 4: a ribbon across the flow. Its last part (the papers that join) turns
        // into the band; the rest falls towards it and fades out just before it.
        var ct = vTop, cvTurn = V0 - tj - r, cFade = V0 - 3, aj = a + tc - tj;
        var cc = [a + tc + r, cvTurn], Ro = r + tj, Ri = r;
        var dj = 'M' + pt(aj, ct) + 'L' + pt(aj, cvTurn) +
          'C' + pt(aj, cvTurn + KQ * Ro) + ' ' + pt(cc[0] - KQ * Ro, cc[1] + Ro) + ' ' + pt(cc[0], cc[1] + Ro) +
          'L' + pt(cc[0], cc[1] + Ri) +
          'C' + pt(cc[0] - KQ * Ri, cc[1] + Ri) + ' ' + pt(a + tc, cvTurn + KQ * Ri) + ' ' + pt(a + tc, cvTurn) +
          'L' + pt(a + tc, ct) + 'Z';
        var f0 = M(a, ct), f1 = M(a, cFade);
        var cg = S('linearGradient', { id: 'pl-gc', gradientUnits: 'userSpaceOnUse', x1: f0[0], y1: f0[1], x2: f1[0], y2: f1[1] }, defs);
        S('stop', { offset: 0, 'stop-color': C.cited, 'stop-opacity': 0.9 }, cg);
        S('stop', { offset: 0.45, 'stop-color': C.cited, 'stop-opacity': 0.35 }, cg);
        S('stop', { offset: 1, 'stop-color': C.cited, 'stop-opacity': 0 }, cg);
        var dn = 'M' + pt(a, ct) + 'L' + pt(aj, ct) + 'L' + pt(aj, cFade) + 'L' + pt(a, cFade) + 'Z';
        var cap0 = M(a, ct - 0.5), cap1 = M(a + tc, ct + 1.5);
        var ch0 = M(a - 4, ct - 4), ch1 = M(a + tc + 4, V0);
        under(citedG, S('rect', { class: 'pl-src', x: Math.min(cap0[0], cap1[0]), y: Math.min(cap0[1], cap1[1]), width: Math.max(2, Math.abs(cap1[0] - cap0[0])), height: Math.max(2, Math.abs(cap1[1] - cap0[1])), fill: C.cited }));
        under(citedG, S('path', { class: 'pl-join', d: dj, fill: C.cited }));
        under(citedG, S('path', { class: 'pl-stream is-cut', d: dn, fill: 'url(#pl-gc)' }));
        under(citedG, S('rect', { class: 'pl-hit', x: Math.min(ch0[0], ch1[0]), y: Math.min(ch0[1], ch1[1]), width: Math.abs(ch1[0] - ch0[0]), height: Math.abs(ch1[1] - ch0[1]), rx: 6 }));

        // ---- where the band starts: the search results, written on the band itself
        var st0 = M(wide ? 8 : 21, V0 + (wide ? 21 : 8));
        var startLab = S('g', { class: 'pl-in', transform: 'translate(' + st0[0] + ',' + st0[1] + ')' }, marks);
        S('text', { x: 0, y: 0, class: 'pl-in-n', text: nf(P.search_results) }, startLab);
        S('text', { x: 0, y: 15, class: 'pl-in-c', text: 'search results' }, startLab);

        // ---- labels into place
        if (wide) {
          var placed = [];
          losses.forEach(function (o) {
            var x = Math.max(o.bw / 2 + 2, Math.min(W - o.bw / 2 - 2, o.mid)), y = vEnd + 22;
            placed.forEach(function (p) {
              if (Math.abs(p.x - x) < (p.w + o.bw) / 2 + 10 && y < p.y + p.h + 6) y = p.y + p.h + 8;
            });
            placed.push({ x: x, y: y, w: o.bw, h: o.bh });
            o.lab.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
          });
          H = Math.max.apply(null, placed.map(function (p) { return p.y + p.h; })) + 6;
          citedLab.setAttribute('transform', 'translate(' + (a + tc + 10).toFixed(1) + ',' + (ct + 17).toFixed(1) + ')');
          note.setAttribute('x', (segs[2][0] + segs[2][1]) / 2);
          note.setAttribute('y', V0 + th(P.seed_papers) + 30);
        } else {
          losses.forEach(function (o) {
            var vB = (o === losses[4] ? V0 + th(P.seed_papers) : V0 + th(o.before));
            var x = vB + o.r + 2, y = o.u + o.r + Math.max(o.t, 1) + 6 + 15;
            o.lab.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + y.toFixed(1) + ')');
          });
          citedLab.setAttribute('transform', 'translate(' + (V0 + th(P.seed_papers) + 14).toFixed(1) + ',' + (citedG._labU + 15).toFixed(1) + ')');
        }

        // ---- columns (wide) or rows (tall): the tint that marks the hovered and the chosen step, and its hit area
        var cols = segs.map(function (sg, i) {
          var p = M(sg[0], 0), q = M(sg[1], wide ? H : W);
          var rc = S('rect', { class: 'pl-col', x: p[0], y: p[1], width: q[0] - p[0], height: q[1] - p[1] }, tint);
          rc.addEventListener('pointerenter', function (e) { hover(i); k.tip.show(e, STEPS[i].tip); });
          rc.addEventListener('pointermove', function (e) { k.tip.show(e, STEPS[i].tip); });
          rc.addEventListener('pointerleave', function () { hover(-1); k.tip.hide(); });
          rc.addEventListener('click', function () { select(i); });
          if (i) {
            var l0 = M(sg[0], 0), l1 = M(sg[0], wide ? H : W);
            S('line', { class: 'pl-sep', x1: l0[0], y1: l0[1], x2: l1[0], y2: l1[1] }, tint);
          }
          return rc;
        });

        // ---- the marks answer hover, focus and click
        function arm(g, html, step) {
          g.addEventListener('pointerenter', function (e) { hover(step); k.tip.show(e, html); });
          g.addEventListener('pointermove', function (e) { k.tip.show(e, html); });
          g.addEventListener('pointerleave', function () { hover(-1); k.tip.hide(); });
          g.addEventListener('focus', function (e) { hover(step); k.tip.show(e, html); });
          g.addEventListener('blur', function () { hover(-1); k.tip.hide(); });
          g.addEventListener('click', function () { select(step); });
          g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(step); } });
        }
        losses.forEach(function (o) { arm(o.g, o.L.tip, o.L.step); });
        arm(citedG, CITED.tip, 3);

        // ---- sizes
        var sw = W, sh = wide ? H : U;
        svg.setAttribute('viewBox', '0 0 ' + sw + ' ' + sh);
        svg.setAttribute('width', sw);
        svg.setAttribute('height', sh);
        chart.style.height = sh + 'px';
        if (!played) flow.setAttribute('clip-path', 'url(#' + clipId + ')');

        G = { wide: wide, segs: segs, cols: cols, clipRect: clipRect, flow: flow, U: wide ? W : U, W: sw, H: sh };
        legend.innerHTML = '';
        legend.append(
          el('span', {}, el('i', { style: 'background:' + C.seed }), 'papers from the keyword search (seed papers from Step 2 on)'),
          el('span', {}, el('i', { style: 'background:' + C.cited }), 'papers added through citations'),
          el('span', {}, el('i', { class: 'pl-fade' }), 'dropped by a step'),
          el('span', { class: 'pl-scale', text: 'width: 1 px ≈ ' + nf(Math.round(1 / s)) + ' papers' }));
        paint();
        if (!played) setFront(0);
      }

      // ------------------------------------------------------------ state
      function paint() {
        if (!G) return;
        G.cols.forEach(function (c, i) { c.classList.toggle('is-sel', i === sel); c.classList.toggle('is-hov', i === hov && i !== sel); });
        hb.forEach(function (b, i) { b.setAttribute('aria-pressed', String(i === sel)); b.classList.toggle('is-hov', i === hov); });
      }
      function hover(i) { hov = i; paint(); }
      function select(i) {
        sel = i; paint(); renderCard(i);
        // on a phone the card is far below the steps: bring it into view
        var r = card.getBoundingClientRect();
        if (G && !G.wide && (r.top > innerHeight - 80 || r.bottom < 0)) card.scrollIntoView({ block: 'start', behavior: k.motion ? 'smooth' : 'auto' });
      }

      // the entrance: the flow is drawn from its start to its end, and each step's count runs as the front passes it
      function setFront(f) {
        var w = G.wide;
        G.clipRect.setAttribute('width', w ? f : G.W);
        G.clipRect.setAttribute('height', w ? G.H : f);
        STEPS.forEach(function (st, i) {
          var sg = G.segs[i], p = Math.max(0, Math.min(1, (f - sg[0]) / (sg[1] - sg[0])));
          hb[i]._num.textContent = nf(Math.round(st.from + (st.out - st.from) * p));
          hb[i].classList.toggle('is-wait', f < sg[0]);
        });
      }
      function play() {
        if (played || !G) return;
        var t0 = performance.now(), dur = G.wide ? 2600 : 3000;
        var ease = function (x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
        (function tick(now) {
          var x = Math.max(0, Math.min(1, (now - t0) / dur)); // a frame's time can precede t0
          setFront(ease(x) * G.U);
          if (x < 1) anim = requestAnimationFrame(tick);
          else finish();
        })(t0);
      }
      function finish() {
        played = true;
        if (anim) cancelAnimationFrame(anim);
        if (G) G.flow.removeAttribute('clip-path');
        hb.forEach(function (b, i) { b._num.textContent = nf(STEPS[i].out); b.classList.remove('is-wait'); });
      }

      // ------------------------------------------------------------ the card under the flow
      function bar(title, parts, total, aria) {
        var b = el('div', { class: 'pl-bar', role: 'img', 'aria-label': aria });
        var keys = el('div', { class: 'pl-bar-k' });
        parts.forEach(function (p) {
          b.appendChild(el('i', { class: p.cls, style: 'flex:' + p.n }));
          keys.appendChild(el('span', {}, el('i', { class: p.cls }), el('b', { text: nf(p.n) }), ' ' + p.label + (p.share === false ? '' : ' (' + k.pct(p.n, total, 1) + ')')));
        });
        return el('div', { class: 'pl-barbox' }, el('span', { class: 'pl-bar-t', text: title }), b, keys);
      }
      function recall(rows) {
        var box = el('div', { class: 'pl-recall', role: 'img', 'aria-label': rows.map(function (r) { return r.label + ': ' + r.found + ' of ' + r.gold + ' (' + r.pct + '%)'; }).join('; ') });
        rows.forEach(function (r) {
          box.appendChild(el('div', { class: 'pl-rrow' },
            el('span', { class: 'pl-rl', text: r.label }),
            el('span', { class: 'pl-rtrack' }, el('i', { class: r.hi ? 'is-opt' : null, style: 'width:' + r.pct + '%' })),
            el('span', { class: 'pl-rv' }, el('b', { text: r.pct + '%' }), ' ' + r.found + ' of ' + r.gold)));
        });
        box.appendChild(el('div', { class: 'pl-raxis' }, el('span', { text: '0%' }), el('span', { text: '50%' }), el('span', { text: '100%' })));
        return box;
      }
      function papers(o, intro) {
        return el('div', { class: 'pl-papers' },
          el('p', { html: intro }),
          el('ol', {}, o.top.map(function (p) {
            return el('li', {}, el('span', { class: 'pl-pt', text: p.title }), el('span', { class: 'pl-pn', text: p.definitions + ' definition' + (p.definitions === 1 ? '' : 's') + ' of it' }));
          })),
          el('p', { class: 'pl-cap', html: 'Every paper that defines it: search <i>media bias</i> in the <a class="fig-link" href="' + k.explorer('concepts') + '" target="_blank" rel="noopener">Explorer’s Concepts tab</a>.' }));
      }
      function kv(rows) {
        return el('dl', { class: 'pl-kv' }, rows.map(function (r) { return [el('dt', { text: r[0] }), el('dd', { html: r[1] })]; }));
      }
      var MBW = '<i class="pl-mb">media bias</i>';
      function renderCard(i) {
        card.textContent = '';
        var head = el('div', { class: 'pl-card-h' },
          el('span', { class: 'pl-eb', text: 'Step ' + (i + 1) + ' of 5' }),
          el('h4', { text: STEPS[i].name }),
          el('span', { class: 'pl-hint', text: 'Choose another step above' }));
        var left = el('div', { class: 'pl-card-l' }), right = el('div', { class: 'pl-card-r' });
        if (i === 0) {
          left.append(el('p', { html: 'A keyword search in Scopus, a large database of scientific literature, returns ' + nf(P.search_results) + ' documents. Definitions can only be read from a full text, so the step keeps the papers with an openly accessible PDF that could be downloaded and turned into text.' }),
            kv([['Keeps', '<b>' + nf(P.pdfs_read) + '</b> papers whose PDF was retrieved and converted (' + pc1(P.pdfs_read, P.search_results) + ' of the search)'],
              ['Drops', nf(X.not_open) + ' with no openly accessible copy; ' + nf(X.open_not_read) + ' open, but not retrieved or converted'],
              ['Uses', 'Scopus (the query is published with the dataset) and GROBID, a tool that turns PDFs into structured text']]));
          right.append(bar('The ' + nf(P.search_results) + ' search results', [{ n: P.pdfs_read, label: 'read', cls: 'c-seed' }, { n: X.open_not_read, label: 'open, not read', cls: 'c-drop' }, { n: X.not_open, label: 'no open copy', cls: 'c-drop2' }],
            P.search_results, nf(P.search_results) + ' search results: ' + nf(P.pdfs_read) + ' read, ' + nf(X.open_not_read) + ' open but not read, ' + nf(X.not_open) + ' with no open copy'));
        } else if (i === 1) {
          left.append(el('p', { html: 'Bias words have other meanings too (<i>spin</i> in physics, for example). Two language models judge each paper’s title and abstract for relevance to media bias, and a third decides where they disagree. The papers kept are the <b>seed papers</b>: the corpus that the search and this step build.' }),
            kv([['Keeps', '<b>' + nf(P.seed_papers) + '</b> seed papers: ' + nf(P.both_relevant) + ' both models marked relevant, ' + nf(P.judge_added) + ' the third model added from their ' + nf(P.disagreed) + ' disagreements (it resolved ' + nf(P.judge_resolved) + '), minus ' + X.removed + ' removed'],
              ['Drops', nf(X.not_relevant) + ' not marked relevant; ' + P.removed_errata + ' errata, withdrawals or tables of contents; ' + P.removed_no_title + ' records without a recoverable title'],
              ['Uses', 'Qwen3.6-35B-A3B and Gemma 4 12B as the two judges, GLM 5.2 on their disagreements; the models and prompts were compared on an expert-labelled set of papers from an earlier study']]));
          right.append(bar('The ' + nf(P.pdfs_read) + ' papers read', [{ n: P.both_relevant, label: 'both models: relevant', cls: 'c-seed' }, { n: P.judge_added, label: 'third model: relevant', cls: 'c-seed2' }, { n: X.not_relevant, label: 'not marked relevant', cls: 'c-drop' }],
            P.pdfs_read, nf(P.pdfs_read) + ' papers read: ' + nf(P.both_relevant) + ' relevant by both models, ' + nf(P.judge_added) + ' by the third, ' + nf(X.not_relevant) + ' not'),
            papers(MB.seed, '<b>' + MB.seed.papers + ' seed papers</b> define ' + MBW + ' itself (' + MB.seed.definitions + ' definitions); the most:'));
        } else if (i === 2) {
          left.append(el('p', { html: 'A language model reads each paper in overlapping windows and writes down every term the paper defines, with its definitions and, where given, synonyms, subtypes, examples and related terms. To measure how well this works, 150 papers were annotated by hand: <b>MBDef-Gold</b>.' }),
            kv([['Gold', P.gold_papers + ' papers (' + P.gold_from_defextra + ' from the earlier DefExtra set, ' + P.gold_from_corpus + ' from this corpus), ' + P.gold_papers_with_defs + ' with relevant definitions: ' + nf(P.gold_records) + ' records (a term in one paper), ' + nf(P.gold_definitions) + ' definitions; two annotators judged each record, a third settled disagreements'],
              ['Keeps', 'every seed paper; ' + P.papers_no_def + ' papers (seed or cited) end with no definition and leave in Step 5'],
              ['Uses', 'Gemma 4 12B, its prompts optimised with DSPy on the training papers; Qwen3.6-35B-A3B checks each definition against the text it came from; a logistic regression on BGE-base embeddings keeps the records about media bias']]));
          right.append(el('p', { class: 'pl-cap', html: 'Share of MBDef-Gold’s definitions the extractor finds. A definition counts as found when an extracted text matches it closely: <b>DefScore</b>, a similarity from 0 to 1 tuned to human ratings, of at least 0.5.' }),
            recall([{ label: 'test', found: P.test_found, gold: P.test_gold, pct: P.test_recall, hi: true },
              { label: 'dev', found: P.dev_found, gold: P.dev_gold, pct: P.dev_recall },
              { label: 'training*', found: P.train_found, gold: P.train_gold, pct: P.train_recall }]),
            el('p', { class: 'pl-cap', html: 'Striped: <b>the extractor was chosen on the test split</b>, so its test figure is optimistic. *The ' + P.train_papers_unused + ' training papers not used in its prompts.' }));
        } else if (i === 3) {
          left.append(el('p', { html: 'Papers cite where their definitions come from. Each citation next to an extracted item, such as “(Entman, 1993)” or “[12]”, is matched to the paper’s reference list; the cited work is looked up, its open-access PDF downloaded, checked against the citation and extracted as in Step 3. This <b>closure</b> reaches papers the keyword search missed. It goes one level deep: the added papers’ own citations are not followed.' }),
            kv([['Keeps', '<b>+' + nf(P.closure_added) + '</b> cited papers (' + nf(P.cited_collected) + ' collected, less ' + X.cited_duplicates + ' duplicates): ' + nf(P.corpus_papers) + ' papers, ' + nf(P.defs_extracted) + ' definitions extracted, ' + nf(P.defs_collapsed) + ' after collapsing identical texts of a term within a paper'],
              ['Drops', nf(X.cited_not_obtained) + ' cited works not obtained, mostly because no open-access copy is known; ' + nf(P.cited_in_corpus) + ' were already in the corpus'],
              ['Uses', nf(P.citation_markers) + ' citation markers (' + P.markers_matched_pct + '% matched); Crossref, Semantic Scholar, OpenAlex and Unpaywall to find the works and their open copies']]));
          right.append(bar('The ' + nf(P.cited_works) + ' cited works', [{ n: P.cited_collected, label: 'collected', cls: 'c-cit' }, { n: P.cited_in_corpus, label: 'already in', cls: 'c-cit2' }, { n: X.cited_not_obtained, label: 'not obtained', cls: 'c-drop' }],
            P.cited_works, nf(P.cited_works) + ' cited works: ' + nf(P.cited_collected) + ' collected, ' + nf(P.cited_in_corpus) + ' already in the corpus, ' + nf(X.cited_not_obtained) + ' not obtained'),
            papers(MB.cited, '<b>' + MB.cited.papers + ' papers</b> that define ' + MBW + ' itself (' + MB.cited.definitions + ' definitions) entered MBDef only through citations; the most:'));
        } else {
          left.append(el('p', { html: 'Variants of a term’s name (casing, abbreviations) are merged: ' + nf(P.concepts_extracted) + ' extracted terms, counted once per paper, form ' + nf(P.label_groups) + ' groups. Three models then score how related each term is to media bias, and their combined ranking removes terms clearly unrelated to it, such as <i>contrastive learning</i>.' }),
            kv([['Keeps', '<b>' + nf(P.final_definitions) + '</b> definitions of ' + nf(P.terms) + ' terms from ' + nf(P.final_papers) + ' papers: ' + nf(R.seed) + ' seed and ' + nf(R.cited) + ' cited'],
              ['Drops', nf(P.defs_removed) + ' definitions and ' + nf(P.concepts_removed) + ' per-paper terms; ' + nf(P.groups_emptied) + ' groups lose all their terms; ' + X.papers_dropped_s5 + ' papers are left without a definition (' + P.papers_no_def + ' had none after extraction, ' + P.papers_lost_last + ' lose their last)'],
              ['Uses', 'the ranks of three scores, averaged: a logistic regression on Qwen3-Embedding-8B embeddings of a term’s definitions in one paper; an LLM decision model (basal-omni-1.0-ultra) that reads the term and its first three definitions; a retrieval judge (Gemma 4 12B) shown the ' + P.judge_neighbours + ' most similar hand-labelled records']]));
          right.append(bar('The ' + nf(P.defs_collapsed) + ' definitions', [{ n: P.final_definitions, label: 'kept', cls: 'c-seed' }, { n: P.defs_removed, label: 'removed', cls: 'c-drop' }],
            P.defs_collapsed, nf(P.defs_collapsed) + ' definitions: ' + nf(P.final_definitions) + ' kept, ' + nf(P.defs_removed) + ' removed'),
            bar('The ' + nf(P.corpus_papers) + ' papers', [{ n: R.seed, label: 'seed', cls: 'c-seed' }, { n: R.cited, label: 'cited', cls: 'c-cit' }, { n: X.papers_dropped_s5, label: 'dropped', cls: 'c-drop' }],
              P.corpus_papers, nf(P.corpus_papers) + ' papers: ' + nf(R.seed) + ' seed and ' + nf(R.cited) + ' cited kept, ' + X.papers_dropped_s5 + ' dropped'),
            el('p', { class: 'pl-cap', html: 'Seed and cited counts are from the released tables. Explore the scores in the <a class="fig-link" href="' + k.explorer('relevance') + '" target="_blank" rel="noopener">Explorer’s Relevance tab</a>.' }));
        }
        card.append(head, el('div', { class: 'pl-card-b' }, left, right));
      }

      // ------------------------------------------------------------ notes and method
      k.notes({
        what: 'The papers behind MBDef, step by step. The band’s width is the number of papers a step passes on, to one scale: grey are papers from the keyword search (the <b>seed papers</b> once Step 2 keeps them), blue the papers added because seed papers cite them (<b>closure</b>). A stream that leaves the band and fades is what a step drops.',
        why: 'A dataset of definitions can only be as broad as the papers it reads. Most search results never reach extraction because no readable copy exists, while citations bring in papers the search did not deliver. What each step drops tells a reader what MBDef can and cannot stand for.',
        read: 'Definitions and terms are a different unit from papers, so they appear as numbers in the steps, not as width. Streams thinner than a pixel are drawn as hairlines; hover or focus one for its count. Choose a step for what happens in it.',
        example: 'Follow the papers. Of the ' + nf(P.search_results) + ' search results, Step 1 loses ' + nf(X.step1_lost) + ' (' + pc1(X.step1_lost, P.search_results) + '), the most of any step: ' + nf(X.not_open) + ' have no openly accessible copy and ' + nf(X.open_not_read) + ' are open, but their PDFs could not be retrieved or converted. Step 2 drops ' + nf(X.step2_lost) + ' of the ' + nf(P.pdfs_read) + ' it reads (' + nf(X.not_relevant) + ' not relevant, ' + nf(X.removed) + ' errata or without a title), Step 3 none, Step 4 adds ' + nf(P.closure_added) + ' cited papers (' + nf(P.corpus_papers) + '), and Step 5 drops the ' + X.papers_dropped_s5 + ' left without a definition: ' + nf(P.final_papers) + '. <span class="pl-rule">Picked as the step that loses the most papers.</span>'
      });
      k.method(
        '<p>The counts are the paper’s own, from its account of how the dataset was built; the printed Fig. 1 shows the five steps without numbers. Counts the paper does not print are differences of printed ones: ' + nf(X.not_open) + ' without an open copy = ' + nf(P.search_results) + ' − ' + nf(P.open_access) + '; ' + nf(X.not_relevant) + ' not marked relevant = ' + nf(P.pdfs_read) + ' − ' + nf(P.both_relevant) + ' − ' + nf(P.judge_added) + '; ' + nf(X.cited_not_obtained) + ' cited works not obtained = ' + nf(P.cited_works) + ' − ' + nf(P.cited_collected) + ' − ' + nf(P.cited_in_corpus) + '.</p>' +
        '<p>The script <code>scripts/figs/pipeline.py</code> keeps each count as a constant, checks that it is printed in the paper, that the counts add up (' + nf(P.both_relevant) + ' + ' + P.judge_added + ' − ' + P.removed_errata + ' − ' + P.removed_no_title + ' = ' + nf(P.seed_papers) + '; ' + nf(P.seed_papers) + ' + ' + nf(P.closure_added) + ' = ' + nf(P.corpus_papers) + '; ' + nf(P.corpus_papers) + ' − ' + P.papers_no_def + ' − ' + P.papers_lost_last + ' = ' + nf(P.final_papers) + '; ' + nf(P.defs_collapsed) + ' − ' + nf(P.defs_removed) + ' = ' + nf(P.final_definitions) + '; ' + nf(P.label_groups) + ' − ' + nf(P.groups_emptied) + ' = ' + nf(P.terms) + ') and that the released tables agree: ' + nf(R.papers) + ' papers (' + nf(R.seed) + ' seed, ' + nf(R.cited) + ' cited), ' + nf(R.definitions) + ' definitions, ' + nf(R.terms) + ' terms, ' + nf(R.mentions) + ' per-paper terms (' + nf(P.concepts_extracted) + ' − ' + nf(P.concepts_removed) + '), and MBDef-Gold’s ' + P.gold_papers + ' papers, ' + nf(P.gold_records) + ' records and ' + nf(P.gold_definitions) + ' definitions (' + P.test_gold + ' on the test split, ' + P.dev_gold + ' on dev).</p>' +
        '<p>Two things come from the released papers table alone: how Step 5’s ' + X.papers_dropped_s5 + ' dropped papers split by origin (' + nf(P.seed_papers) + ' − ' + nf(R.seed) + ' = ' + R.dropped_seed + ' seed, ' + nf(P.closure_added) + ' − ' + nf(R.cited) + ' = ' + R.dropped_cited + ' cited), and the papers listed under Steps 2 and 4: of the seed and of the cited papers, the three that give the most definitions of the term <i>media bias</i>, ties by title. Band widths are to one linear scale; the entrance runs once and is skipped when the reader asks for reduced motion.</p>');

      // ------------------------------------------------------------ go
      renderCard(sel);
      k.onResize(function (w) { draw(w); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (lastW) draw(lastW); });
      if (!played && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); play(); }
        }, { threshold: 0.3 });
        io.observe(chart);
      } else finish();
    }
  });
})();
