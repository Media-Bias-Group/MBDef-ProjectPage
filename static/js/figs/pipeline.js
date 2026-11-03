/* Paper, Fig. 1, interactive: the five steps that build MBDef, drawn as one flow of papers.

   The five step headers are the print's five boxes, each with the papers it passes on. Under them runs a band whose
   width is the number of papers, to one scale (the tooltips give it): grey are the papers from the keyword search
   (the seed papers once Step 2 keeps them), blue the papers added through citations (closure). Where a step drops
   papers the band narrows, and a thin stream falls straight down from that point and fades, with its count at the
   foot; at Step 4 a blue stream falls into the band. Wide screens run the flow left to right, phones top to bottom:
   the geometry is built in flow coordinates (u along the flow, v across it) and mapped to x/y by the mode.

   On open the flow runs once: the band is drawn from its start, each stream falls as the front passes it, and the
   step counts run with it (skipped for reduced motion). A click on a step (its header, its column or a stream) opens
   its card under the flow; a second click or Esc closes it. Every number comes from static/data/figs/pipeline.json,
   written by scripts/figs/pipeline.py from the paper and the released tables. */
(function () {
  'use strict';

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
  function sine(x) { return (1 - Math.cos(Math.PI * x)) / 2; } // the front: gentler, so no step is rushed

  FIG.register('pipeline', {
    build: function (panel, D, k) {
      var P = D.paper, X = D.derived, R = D.released, MB = D.media_bias, nf = k.nf, el = k.el;
      var pc1 = function (a, b) { return k.pct(a, b, 1); };
      var K = function (s) { return '<span class="k">' + s + '</span>'; };

      // ------------------------------------------------------------ the five steps (the print's boxes)
      var STEPS = [
        { name: 'Search', from: P.search_results, out: P.pdfs_read, unit: 'papers read', sub: 'of ' + nf(P.search_results) + ' found',
          tip: '<b>Step 1 · Search</b><br>' + nf(P.search_results) + ' documents found → ' + nf(P.pdfs_read) + ' PDFs read (' + pc1(P.pdfs_read, P.search_results) + ')<br>' +
            K('dropped:') + ' ' + nf(X.not_open) + ' with no openly accessible copy; ' + nf(X.open_not_read) + ' open, but not retrieved or converted' },
        { name: 'Classification', from: P.pdfs_read, out: P.seed_papers, unit: 'seed papers', sub: 'of ' + nf(P.pdfs_read) + ' read',
          tip: '<b>Step 2 · Classification</b><br>' + nf(P.pdfs_read) + ' papers read → ' + nf(P.seed_papers) + ' seed papers (' + pc1(P.seed_papers, P.pdfs_read) + ')<br>' +
            K('kept:') + ' ' + nf(P.both_relevant) + ' both models marked relevant + ' + nf(P.judge_added) + ' the third model added − ' + nf(X.removed) + ' removed<br>' +
            K('dropped:') + ' ' + nf(X.not_relevant) + ' not marked relevant; ' + nf(X.removed) + ' errata, withdrawals or without a title' },
        { name: 'Extraction', from: P.seed_papers, out: P.seed_papers, unit: 'papers extracted', sub: 'finds ' + P.test_recall + '% of test definitions',
          tip: '<b>Step 3 · Extraction</b><br>All ' + nf(P.seed_papers) + ' seed papers are read by the extractor; none is dropped here<br>' +
            'On hand-checked papers it finds ' + P.test_found + ' of ' + P.test_gold + ' test definitions (' + P.test_recall + '%)' },
        { name: 'Closure', from: P.seed_papers, out: P.corpus_papers, unit: 'papers', sub: '<span class="pl-c">+' + nf(P.closure_added) + ' cited</span> · ' + nf(P.defs_collapsed) + ' definitions',
          tip: '<b>Step 4 · Closure</b><br>' + nf(P.cited_works) + ' cited works → ' + nf(P.closure_added) + ' papers added<br>' +
            nf(P.seed_papers) + ' + ' + nf(P.closure_added) + ' = ' + nf(P.corpus_papers) + ' papers, with ' + nf(P.defs_extracted) + ' definitions extracted (' +
            nf(P.defs_collapsed) + ' after collapsing identical ones)' },
        { name: 'Post Processing', from: P.corpus_papers, out: P.final_papers, unit: 'papers', sub: nf(P.final_definitions) + ' definitions · ' + nf(P.terms) + ' terms',
          tip: '<b>Step 5 · Post Processing</b><br>' + nf(P.corpus_papers) + ' papers → ' + nf(P.final_papers) + ' (' + nf(R.seed) + ' seed, ' + nf(R.cited) + ' cited)<br>' +
            nf(P.defs_collapsed) + ' definitions → ' + nf(P.final_definitions) + '; ' + nf(P.label_groups) + ' term groups → ' + nf(P.terms) + ' terms' }
      ];
      // what moves in or out of the band: where in its step's column (wide screens), the count, its caption and tooltip
      var EVENTS = [
        { step: 0, at: 0.34, n: X.not_open, cap: 'no open copy',
          tip: '<b>' + nf(X.not_open) + '</b> search results (' + pc1(X.not_open, P.search_results) + ') have no openly accessible copy ' + K('(' + nf(P.search_results) + ' − ' + nf(P.open_access) + ')') },
        { step: 0, at: 0.78, n: X.open_not_read, cap: 'open, not read',
          tip: '<b>' + nf(X.open_not_read) + '</b> openly accessible documents (' + pc1(X.open_not_read, P.search_results) + ' of the search) could not be retrieved or converted to text ' + K('(' + nf(P.open_access) + ' − ' + nf(P.pdfs_read) + ')') },
        { step: 1, at: 0.3, n: X.not_relevant, cap: 'not marked relevant',
          tip: '<b>' + nf(X.not_relevant) + '</b> papers read were not marked relevant to media bias ' + K('(' + nf(P.pdfs_read) + ' − ' + nf(P.both_relevant) + ' − ' + nf(P.judge_added) + ')') },
        { step: 1, at: 0.8, n: X.removed, cap: 'errata, no title',
          tip: '<b>' + nf(X.removed) + '</b> removed: ' + P.removed_errata + ' errata, withdrawals or tables of contents, and ' + P.removed_no_title + ' records without a recoverable title' },
        { step: 3, at: 0.3, n: P.closure_added, cap: 'cited papers join', cited: true,
          tip: '<b>' + nf(P.cited_works) + '</b> distinct works are cited next to extracted definitions (from ' + nf(P.citation_markers) + ' citation markers, ' + P.markers_matched_pct + '% matched to a reference list).<br>' +
            nf(P.cited_collected) + ' (' + k.pct(P.cited_collected, P.cited_works, 0) + ') were collected and extracted; without ' + X.cited_duplicates + ' duplicates, <b>' + nf(P.closure_added) + ' join</b>.<br>' +
            K('Not added:') + ' ' + nf(P.cited_in_corpus) + ' already in the corpus; ' + nf(X.cited_not_obtained) + ' not obtained, mostly because no open-access copy is known' },
        { step: 4, at: 0.45, n: X.papers_dropped_s5, cap: 'no definition left',
          tip: '<b>' + nf(X.papers_dropped_s5) + '</b> papers left without a definition: ' + P.papers_no_def + ' had none after extraction, and the filter removed the last one of ' + P.papers_lost_last + ' more.<br>' +
            K('By origin, in the released tables:') + ' ' + nf(R.dropped_seed) + ' seed, ' + nf(R.dropped_cited) + ' cited' }
      ];
      EVENTS.forEach(function (e) { e.sign = e.cited ? 1 : -1; });
      // the seed band's thickness before each drop (Step 5's 364 leave from the bottom of the stack)
      var BEFORE = [P.search_results, P.open_access, P.pdfs_read, X.relevant, null, P.seed_papers];

      // ------------------------------------------------------------ the parts of the panel
      var body = k.body();
      var chart = el('div', { class: 'pl-chart' });
      var svg = S('svg', { class: 'pl-svg', role: 'group', 'aria-label': 'The papers through the five steps: ' + STEPS.map(function (s, i) { return 'step ' + (i + 1) + ', ' + s.name + ', ' + nf(s.out) + ' ' + s.unit; }).join('; ') });
      var heads = el('div', { class: 'pl-heads', role: 'group', 'aria-label': 'The five steps' });
      var card = el('section', { class: 'pl-card', id: 'pl-card', hidden: true });
      chart.append(heads, svg); // the steps first in the reading and tab order; they sit over the flow
      body.append(chart, card);

      var sel = -1, hov = -1, played = !k.motion, anim = 0, G = null, lastW = 0, front = 0, scaleTip = '';
      var stepTip = function (i) { return STEPS[i].tip + '<br>' + K(scaleTip); };
      var hb = STEPS.map(function (st, i) {
        var num = el('b', { class: 'pl-num', text: nf(st.out) });
        var b = el('button', {
          type: 'button', class: 'pl-step', 'aria-expanded': 'false', 'aria-controls': 'pl-card',
          'aria-label': 'Step ' + (i + 1) + ', ' + st.name + ': ' + nf(st.out) + ' ' + st.unit + ', ' + st.sub.replace(/<[^>]+>/g, ''),
          onclick: function () { select(i); },
          onmouseenter: function (e) { hover(i); k.tip.show(e, stepTip(i)); }, onmousemove: function (e) { k.tip.show(e, stepTip(i)); },
          onmouseleave: function () { hover(-1); k.tip.hide(); },
          onfocus: function (e) { hover(i); if (b.matches(':focus-visible')) k.tip.show(e, stepTip(i)); }, onblur: function () { hover(-1); k.tip.hide(); },
          onkeydown: function (e) {
            var d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
            if (d) { e.preventDefault(); hb[(i + d + 5) % 5].focus(); }
          }
        },
          el('span', { class: 'pl-eb', text: 'Step ' + (i + 1) }),
          el('span', { class: 'pl-nm', text: st.name }),
          num,
          el('span', { class: 'pl-unit', text: st.unit }),
          el('span', { class: 'pl-sub', html: st.sub }));
        b._num = num;
        heads.appendChild(b);
        return b;
      });

      var ctx = document.createElement('canvas').getContext('2d');
      function wrap(str, px) {
        ctx.font = '12px Inter, system-ui, sans-serif';
        var out = [], line = '';
        str.split(' ').forEach(function (w) {
          var t = line ? line + ' ' + w : w;
          if (line && ctx.measureText(t).width > px) { out.push(line); line = w; } else line = t;
        });
        if (line) out.push(line);
        return out;
      }
      function S(tag, attrs, parent) { var e = k.svg(tag, attrs); if (parent) parent.appendChild(e); return e; }

      // ------------------------------------------------------------ geometry
      function draw(W) {
        lastW = W;
        var wide = W >= 860, sw = 2; // below 860 px the columns are too narrow for the drops' labels: the flow runs down; sw: a stream's width
        var Hmax = wide ? clamp(W * 0.165, 110, 196) : clamp(W * 0.3, 84, 140);
        var s = Hmax / P.search_results, th = function (n) { return n * s; };
        var tj = th(P.closure_added);
        var M = wide ? function (u, v) { return [u, v]; } : function (u, v) { return [v, u]; };
        var box = function (u0, u1, v0, v1) {
          var p = M(Math.min(u0, u1), Math.min(v0, v1)), q = M(Math.max(u0, u1), Math.max(v0, v1));
          return { x: p[0].toFixed(2), y: p[1].toFixed(2), width: (q[0] - p[0]).toFixed(2), height: (q[1] - p[1]).toFixed(2) };
        };
        var pt = function (u, v) { var p = M(u, v); return p[0].toFixed(2) + ',' + p[1].toFixed(2); };
        scaleTip = 'Band width: 1 px ≈ ' + nf(Math.round(1 / s)) + ' papers';

        svg.textContent = '';
        var defs = S('defs', {}, svg), tint = S('g', { class: 'pl-tint' }, svg), flow = S('g', {}, svg);
        var clipRect = S('rect', { x: 0, y: 0, width: 0, height: 0 }, S('clipPath', { id: 'pl-clip' }, defs));
        var band = S('g', { class: 'pl-band' }, flow), marks = S('g', {}, flow);
        var C = { seed: k.color('--fig-seed'), cited: k.color('--fig-closure') };

        // the headers: wide, columns as wide as their steps need (Step 1 drops two streams, Step 3 none)
        var segs = [], V0, hx = 0;
        if (wide) {
          var WTS = [1.45, 1.1, 0.8, 0.95, 0.95], wsum = 5.25;
          WTS.reduce(function (acc, w) { segs.push([acc, acc + W * w / wsum]); return acc + W * w / wsum; }, 0);
          segs[4][1] = W;
          hb.forEach(function (b, i) { b.style.left = segs[i][0] + 'px'; b.style.top = '0px'; b.style.width = (segs[i][1] - segs[i][0] - 14) + 'px'; });
        } else {
          V0 = 34; hx = V0 + Hmax + 34;
          hb.forEach(function (b) { b.style.left = hx + 'px'; b.style.width = (W - hx) + 'px'; });
        }
        var hh = hb.map(function (b) { return b.offsetHeight; });

        // the marks (a stream, its label, a hit area): labels first, as their size sets the layout
        var evs = EVENTS.map(function (E) {
          var g = S('g', { class: 'pl-ev' + (E.cited ? ' is-cited' : ''), tabindex: '0', role: 'button', 'aria-controls': 'pl-card',
            'aria-label': E.tip.replace(/<[^>]+>/g, '') + '. Step ' + (E.step + 1) + '.' }, marks);
          var lab = S('g', { class: 'pl-lab' }, g);
          var anchor = wide && !E.cited ? 'middle' : 'start'; // wide, a drop's label is centred under it; the cited one sits beside its stream
          var num = S('text', { class: 'pl-lab-n', x: 0, y: 0, 'text-anchor': anchor, text: (E.cited ? '+' : '') + nf(E.n) }, lab);
          if (wide) wrap(E.cap, E.cited ? 170 : clamp(W * 0.1, 86, 120)).forEach(function (c, j) { S('text', { class: 'pl-lab-c', x: 0, y: 17 + 14 * j, 'text-anchor': anchor, text: c }, lab); });
          else {
            var nw = num.getBBox().width, room = W - hx;
            if (wrap(E.cap, room - nw - 7).length === 1) S('text', { class: 'pl-lab-c', x: (nw + 7).toFixed(1), y: 0, text: E.cap }, lab);
            else wrap(E.cap, room).forEach(function (c, j) { S('text', { class: 'pl-lab-c', x: 0, y: 17 + 14 * j, text: c }, lab); });
          }
          return { E: E, g: g, lab: lab, num: num, bb: lab.getBBox() };
        });
        var drops = evs.filter(function (e) { return !e.E.cited; }), inflow = evs[4];

        // ---- positions along the flow (u) and across it (v)
        var U, H, vEnd, vIn0;
        if (wide) {
          var vTop = Math.max.apply(null, hh) + 16;
          vIn0 = vTop + 4;                                    // the cited stream starts beside its label …
          V0 = vIn0 + Math.max(44, inflow.bb.height + 10) + tj; // … and lands on the band
          vEnd = V0 + Hmax + 34;                   // every drop falls to here
          evs.forEach(function (e) { var sg = segs[e.E.step]; e.u = sg[0] + e.E.at * (sg[1] - sg[0]); });
          U = W;
        } else {
          var u = 0;
          for (var si = 0; si < 5; si++) {
            var a0 = u;
            hb[si].style.top = (u + 10) + 'px';
            u += 10 + hh[si] + 4;
            evs.forEach(function (e) {
              if (e.E.step !== si) return;
              e.u = u + 14;
              u = e.u + 6 + e.bb.y + e.bb.height + 8;
            });
            segs.push([a0, u + 8]);
            u += 8;
          }
          U = u + 4;
          vEnd = hx - 9;
          vIn0 = 0;
        }
        var a = inflow.u, uS5 = evs[5].u;

        // ---- the band, one path per colour (no seams): seed below V0, cited above it
        var bot = BEFORE.map(function (n) { return n == null ? null : V0 + th(n); });
        var c5 = V0 - tj + th(R.cited), s5 = c5 + th(R.seed); // after Step 5: the released split, the stack's top kept
        var stairs = [[drops[0].u, bot[0]], [drops[1].u, bot[1]], [drops[2].u, bot[2]], [drops[3].u, bot[3]], [uS5, bot[5]]];
        var dSeed = 'M' + pt(0, V0) + 'L' + pt(uS5, V0) + 'L' + pt(uS5, c5) + 'L' + pt(U, c5) + 'L' + pt(U, s5) + 'L' + pt(uS5, s5);
        for (var j = stairs.length - 1; j >= 0; j--) {
          var uPrev = j ? stairs[j - 1][0] : 0;
          dSeed += 'L' + pt(stairs[j][0], stairs[j][1]) + 'L' + pt(uPrev, stairs[j][1]);
        }
        S('path', { class: 'pl-seed', d: dSeed + 'Z', fill: C.seed }, band);
        S('path', { class: 'pl-cit', fill: C.cited, d: 'M' + pt(a, V0 - tj) + 'L' + pt(U, V0 - tj) + 'L' + pt(U, c5) + 'L' + pt(uS5, c5) + 'L' + pt(uS5, V0) + 'L' + pt(a, V0) + 'Z' }, band);
        var st0 = M(wide ? 8 : 21, V0 + (wide ? 21 : 8));
        var startLab = S('g', { class: 'pl-in', transform: 'translate(' + st0[0] + ',' + st0[1] + ')' }, band);
        S('text', { x: 0, y: 0, class: 'pl-in-n', text: nf(P.search_results) }, startLab);
        S('text', { x: 0, y: 15, class: 'pl-in-c', text: 'search results' }, startLab);

        // ---- labels into place; wide, the drops' labels share one row under the band (a crowded one steps down)
        if (wide) {
          var placed = [];
          drops.forEach(function (e) {
            var x = clamp(e.u - sw / 2, e.bb.width / 2 + 2, W - e.bb.width / 2 - 2), top = vEnd + 7;
            placed.forEach(function (p) {
              var need = (p.w + e.bb.width) / 2 + 12 - (x - p.x); // a close neighbour on the left: move right a little, or step down
              if (need > 0 && top < p.top + p.h + 6) { if (need <= 24 && x + need + e.bb.width / 2 <= W) x += need; else top = p.top + p.h + 10; }
            });
            placed.push({ x: x, top: top, w: e.bb.width, h: e.bb.height });
            e.lab.setAttribute('transform', 'translate(' + x.toFixed(1) + ',' + (top - e.bb.y).toFixed(1) + ')');
            e.v1 = top - 7;
          });
          H = Math.max.apply(null, placed.map(function (p) { return p.top + p.h; })) + 6;
          inflow.lab.setAttribute('transform', 'translate(' + (a + sw + 9).toFixed(1) + ',' + (vIn0 - inflow.bb.y).toFixed(1) + ')');
        } else {
          evs.forEach(function (e) { e.lab.setAttribute('transform', 'translate(' + hx + ',' + (e.u + 6 - sw / 2).toFixed(1) + ')'); e.v1 = vEnd; });
          H = U;
        }

        // ---- the streams: a drop leaves where the band narrows and falls (wide) or runs out (phone) to its label,
        // fading; the cited stream comes in from its label and lands where the blue layer starts
        evs.forEach(function (e, i) {
          var cited = e.E.cited, v0 = cited ? vIn0 : bot[i], v1 = cited ? V0 - tj : e.v1;
          var u0 = cited ? a : e.u - sw, len = v1 - v0;
          var gid = 'pl-g' + i, g0 = M(u0, v0), g1 = M(u0, v1);
          var gr = S('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: g0[0], y1: g0[1], x2: g1[0], y2: g1[1] }, defs);
          var col = cited ? C.cited : C.seed, solid = Math.min(0.45, 22 / len);
          (cited ? [[0, 0.1], [1 - solid, 0.85], [1, 1]] : [[0, 1], [solid, 0.85], [1, 0.1]]).forEach(function (st) {
            S('stop', { offset: st[0].toFixed(3), 'stop-color': col, 'stop-opacity': st[1] }, gr);
          });
          var hit = S('rect', { class: 'pl-hit', rx: 6 }, e.g);
          var r = S('rect', { class: 'pl-stream', fill: 'url(#' + gid + ')' }, e.g);
          e.g.insertBefore(r, e.g.firstChild);
          e.g.insertBefore(hit, r);
          e.stream = r; e.u0 = u0; e.v0 = v0; e.len = len; e.cited = cited;
          e.setLen = function (p) { // cited: grows from its label towards the band; a drop: from the band outwards
            var bx = box(u0, u0 + sw, v0, v0 + Math.max(0, p) * len);
            Object.keys(bx).forEach(function (kk) { r.setAttribute(kk, bx[kk]); });
          };
          e.setLen(1);
          // the hit area (and focus ring): the stream and its label, with room for a finger, stopping at the band
          var lb = e.lab.getBBox(), tr = e.lab.transform.baseVal.consolidate().matrix;
          var lu0 = wide ? tr.e + lb.x : tr.f + lb.y, lv0 = wide ? tr.f + lb.y : tr.e + lb.x;
          var lu1 = lu0 + (wide ? lb.width : lb.height), lv1 = lv0 + (wide ? lb.height : lb.width);
          var hu0 = Math.min(lu0, u0 - 9) - 4, hu1 = Math.max(lu1, u0 + sw + 9) + 4;
          var hv0 = cited ? Math.min(lv0, v0) - 4 : v0 + 1, hv1 = cited && wide ? v1 - 1 : Math.max(lv1, v1) + 4; // phone: the cited row's label is across the band
          var hb2 = box(hu0, hu1, hv0, hv1);
          Object.keys(hb2).forEach(function (kk) { hit.setAttribute(kk, hb2[kk]); });
        });

        // ---- columns (wide) or rows (phone): the tint of the hovered and the chosen step, and its hit area
        var cols = segs.map(function (sg, i) {
          var p = M(sg[0], 0), q = M(sg[1], wide ? H : W);
          var rc = S('rect', { class: 'pl-col', x: p[0], y: p[1], width: q[0] - p[0], height: q[1] - p[1] }, tint);
          rc.addEventListener('pointerenter', function (e) { hover(i); k.tip.show(e, stepTip(i)); });
          rc.addEventListener('pointermove', function (e) { k.tip.show(e, stepTip(i)); });
          rc.addEventListener('pointerleave', function () { hover(-1); k.tip.hide(); });
          rc.addEventListener('click', function () { select(i); });
          if (i) { var l0 = M(sg[0], 0), l1 = M(sg[0], wide ? H : W); S('line', { class: 'pl-sep', x1: l0[0], y1: l0[1], x2: l1[0], y2: l1[1] }, tint); }
          return rc;
        });

        // ---- the marks answer hover, focus and click
        evs.forEach(function (e) {
          var g = e.g, html = e.E.tip, step = e.E.step;
          g.addEventListener('pointerenter', function (ev) { hover(step); k.tip.show(ev, html); });
          g.addEventListener('pointermove', function (ev) { k.tip.show(ev, html); });
          g.addEventListener('pointerleave', function () { hover(-1); k.tip.hide(); });
          g.addEventListener('focus', function (ev) { hover(step); k.tip.show(ev, html); });
          g.addEventListener('blur', function () { hover(-1); k.tip.hide(); });
          g.addEventListener('click', function () { select(step); });
          g.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(step); } });
        });

        svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
        svg.setAttribute('width', W);
        svg.setAttribute('height', H);
        chart.style.height = H + 'px';
        if (!played) band.setAttribute('clip-path', 'url(#pl-clip)');
        G = { wide: wide, segs: segs, cols: cols, clipRect: clipRect, band: band, evs: evs, U: U, W: W, H: H, lead: wide ? 150 : 80 };
        paint();
        if (!played) setFront(front);
      }

      // ------------------------------------------------------------ state
      function paint() {
        if (!G) return;
        G.cols.forEach(function (c, i) { c.classList.toggle('is-sel', i === sel); c.classList.toggle('is-hov', i === hov && i !== sel); });
        hb.forEach(function (b, i) { b.setAttribute('aria-expanded', String(i === sel)); b.classList.toggle('is-hov', i === hov); });
      }
      function hover(i) { hov = i; paint(); }
      function select(i) {
        if (!played) finish();
        sel = sel === i ? -1 : i;
        paint();
        if (sel < 0) { card.hidden = true; return; }
        renderCard(sel);
        card.hidden = false;
        card.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' });
      }
      function closeCard() {
        if (sel < 0) return;
        var i = sel;
        if (card.contains(document.activeElement)) hb[i].focus();
        sel = -1; paint(); card.hidden = true;
      }
      // Esc closes the card first (and keeps the stage open); with no card open it closes the stage as before
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || sel < 0 || panel.hidden || !panel.offsetParent) return;
        e.preventDefault();
        closeCard();
      });

      // the entrance: the band is drawn from its start; each stream falls as the front passes it, its count running
      // up while its step's count runs down, so every header shows the papers the band carries at the front
      function prog(e, f) { return clamp((f - (e.cited ? e.u - G.lead : e.u)) / G.lead, 0, 1); }
      function setFront(f) {
        front = f;
        G.clipRect.setAttribute('width', G.wide ? f : G.W);
        G.clipRect.setAttribute('height', G.wide ? G.H : f);
        var got = [0, 0, 0, 0, 0];
        G.evs.forEach(function (e) {
          var p = prog(e, f), q = ease(p), n = Math.round(e.E.n * q);
          e.setLen(q);
          e.lab.style.opacity = e.cited ? clamp(p * 3, 0, 1) : q;
          e.num.textContent = (e.cited ? '+' : '') + nf(n);
          got[e.E.step] += e.E.sign * n;
        });
        STEPS.forEach(function (st, i) {
          hb[i]._num.textContent = nf(st.from + got[i]);
          hb[i].classList.toggle('is-wait', f < G.segs[i][0]);
        });
      }
      function play() {
        if (played || !G) return;
        var t0 = performance.now(), dur = 2600;
        (function tick() {
          if (played || !G) return;
          var x = clamp((performance.now() - t0) / dur, 0, 1);
          setFront(sine(x) * (G.U + G.lead));
          if (x < 1) anim = requestAnimationFrame(tick);
          else finish();
        })();
      }
      function finish() {
        played = true;
        if (anim) cancelAnimationFrame(anim);
        if (!G) return;
        G.band.removeAttribute('clip-path');
        G.evs.forEach(function (e) { e.setLen(1); e.lab.style.opacity = ''; e.num.textContent = (e.cited ? '+' : '') + nf(e.E.n); });
        hb.forEach(function (b, i) { b._num.textContent = nf(STEPS[i].out); b.classList.remove('is-wait'); });
      }

      // ------------------------------------------------------------ the card under the flow
      function bar(title, parts, total, aria) {
        var b = el('div', { class: 'pl-bar', role: 'img', 'aria-label': aria });
        var keys = el('div', { class: 'pl-bar-k' });
        parts.forEach(function (p) {
          b.appendChild(el('i', { class: p.cls, style: 'flex:' + p.n }));
          keys.appendChild(el('span', {}, el('i', { class: p.cls }), el('b', { text: nf(p.n) }), ' ' + p.label + ' (' + k.pct(p.n, total, 1) + ')'));
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
        card.setAttribute('aria-label', 'Step ' + (i + 1) + ', ' + STEPS[i].name);
        var head = el('div', { class: 'pl-card-h' },
          el('span', { class: 'pl-eb', text: 'Step ' + (i + 1) }),
          el('h4', { text: STEPS[i].name }),
          el('button', { type: 'button', class: 'pl-x', 'aria-label': 'Close', title: 'Close (Esc)', onclick: closeCard }, el('i', { class: 'fas fa-times', 'aria-hidden': 'true' })));
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

      // ------------------------------------------------------------ method
      k.method(
        '<p>The counts are the paper’s own, from its account of how the dataset was built; the printed Fig. 1 shows the five steps without numbers. The band’s width is the papers a step passes on, to one linear scale; definitions and terms are another unit, so they appear only as numbers. Counts the paper does not print are differences of printed ones, such as ' + nf(X.not_open) + ' without an open copy = ' + nf(P.search_results) + ' − ' + nf(P.open_access) + '.</p>' +
        '<p><code>scripts/figs/pipeline.py</code> keeps each count as a constant, checks that it is printed in the paper, that the counts add up (' + nf(P.both_relevant) + ' + ' + P.judge_added + ' − ' + P.removed_errata + ' − ' + P.removed_no_title + ' = ' + nf(P.seed_papers) + '; ' + nf(P.seed_papers) + ' + ' + nf(P.closure_added) + ' = ' + nf(P.corpus_papers) + '; ' + nf(P.corpus_papers) + ' − ' + P.papers_no_def + ' − ' + P.papers_lost_last + ' = ' + nf(P.final_papers) + ') and that the released tables agree (' + nf(R.papers) + ' papers, ' + nf(R.definitions) + ' definitions, ' + nf(R.terms) + ' terms). Two things come from the released tables alone: how Step 5’s ' + X.papers_dropped_s5 + ' dropped papers split by origin (' + R.dropped_seed + ' seed, ' + R.dropped_cited + ' cited), and the papers listed under Steps 2 and 4, the three that give the most definitions of <i>media bias</i> (ties by title).</p>');

      // ------------------------------------------------------------ go: the flow runs once the stage shows the panel
      k.onResize(function (w) { draw(w); });
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (lastW) draw(lastW); });
      if (!played) {
        var t0 = performance.now();
        (function wait() { // the printed figure still covers the panel while it arrives on the stage
          if (played) return;
          if (performance.now() - t0 > 5000) return finish();
          if (panel.classList.contains('is-arriving') || panel.hidden || !panel.offsetParent) return requestAnimationFrame(wait);
          setTimeout(play, 150);
        })();
      }
    }
  });
})();
