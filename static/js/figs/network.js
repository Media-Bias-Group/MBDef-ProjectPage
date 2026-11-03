/* Fig. 6, interactive: the concept-connections network (data: static/data/figs/network.json, made by
   scripts/figs/network.py from the released tables with the MBDef code that drew the printed figure).

   The terms sit at the printed figure's positions, in the printed boxes, and every arrow follows the printed route; the
   whole drawing scales with the panel's width (in inches of the printed 38 x 12 inch canvas, times s pixels per inch).
   Below MINW pixels it keeps MINW and scrolls sideways inside its own box, so the labels stay readable on a phone.

   Interaction: pointing at (or focusing) a term or an arrow's number lights its links and dims the rest; a click (tap,
   Enter) selects it and the detail under the chart lists the papers behind an arrow, with the words each uses, or
   what a term is linked to and how many papers define it. Escape or a click on the empty stage clears it.
   Entrance: the arrows draw in once, from left to right, when the chart first comes into view (not with reduced motion). */
(function () {
  'use strict';
  var MINW = 760;

  FIG.register('network', {
    build: function (panel, data, k) {
      var T = data.terms, E = data.edges, P = data.papers, F = data.font, CW = data.canvas[0], CH = data.canvas[1];
      var idx = {}; T.forEach(function (t, i) { idx[t.name] = i; });
      var MB = idx['media bias'];
      var pair = {}; E.forEach(function (e, j) { pair[e.s + '>' + e.t] = j; });
      var outs = T.map(function () { return []; }), ins = T.map(function () { return []; });
      E.forEach(function (e, j) { outs[e.s].push(j); ins[e.t].push(j); });
      var nf = k.nf, el = k.el, S = k.svg;
      var papersWord = function (n) { return n === 1 ? 'paper' : 'papers'; };
      var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
      var nm = function (i) { return '<i>' + esc(T[i].name) + '</i>'; };
      var says = function (e) {
        return nf(e.n) + ' ' + papersWord(e.n) + ' ' + (e.n === 1 ? 'says' : 'say') + ' ' + T[e.s].name + ' is a kind of ' + T[e.t].name;
      };

      // ------------------------------------------------------------ the facts the head and notes state
      var strongest = E.reduce(function (a, e) { return e.n > a.n ? e : a; }, E[0]);
      var reverse = E[pair[strongest.t + '>' + strongest.s]];
      var oneIntoMB = E.filter(function (e) { return e.t === MB && e.n === 1; });
      var mbExample = oneIntoMB.reduce(function (a, e) { return T[e.s].papers > T[a.s].papers ? e : a; }, oneIntoMB[0]);
      var byPaper = {}; oneIntoMB.forEach(function (e) { var p = e.papers[0][0]; (byPaper[p] = byPaper[p] || []).push(e); });
      var busiest = Object.keys(byPaper).sort(function (a, b) { return byPaper[b].length - byPaper[a].length || a - b; })[0];
      var cluster = ['misinformation', 'disinformation', 'fake news', 'propaganda'].map(function (n) { return idx[n]; });
      var clusterMax = Math.max.apply(null, E.filter(function (e) { return cluster.indexOf(e.s) >= 0 && cluster.indexOf(e.t) >= 0; }).map(function (e) { return e.n; }));

      k.head({
        fig: 'Fig. 6',
        title: 'How do media bias, misinformation and propaganda connect?',
        lead: '<b>Only through links that one paper states.</b> No paper in MBDef calls media bias a kind of misinformation, ' +
          'disinformation, fake news or propaganda, or the reverse. Those four are tightly linked to each other (up to ' +
          clusterMax + ' papers per arrow); media bias reaches them only through one-paper arrows, via terms such as ' +
          '<i>bias</i>, <i>framing</i> and <i>spin</i>.',
        stats: [
          { value: nf(data.counts.terms), label: 'terms' },
          { value: nf(data.counts.arrows), label: 'narrower-to-broader arrows' },
          { value: nf(data.counts.papers), label: 'papers behind them' }
        ]
      });

      var body = k.body();
      // a row of the six query terms to start from, and the legend
      var chips = el('div', { class: 'fig-chips nw-chips', role: 'group', 'aria-label': 'Follow one of the six query terms' },
        el('span', { class: 'nw-chips-k', text: 'Follow a term' }),
        T.map(function (t, i) {
          if (!t.query) return null;
          return el('button', { type: 'button', class: 'fig-chip' + (i === MB ? ' nw-chip-mb' : ''), 'aria-pressed': 'false', 'data-i': i, text: t.name,
            onclick: function () { select(sel && sel.type === 'n' && sel.i === i ? null : { type: 'n', i: i }); } });
        }));
      var legend = el('div', { class: 'fig-legend nw-legend' },
        el('span', {}, el('i', { class: 'nw-key nw-key-q' }), 'the six query terms'),
        el('span', {}, el('i', { class: 'nw-key nw-key-mb' }), 'media bias itself'),
        el('span', {}, el('i', { class: 'nw-key nw-key-o' }), 'terms that connect them'),
        el('span', { html: '<svg class="nw-key-arrow" width="34" height="10" aria-hidden="true"><path d="M1 5H27"/><path d="M33 5L25 1.5V8.5Z"/></svg>points from the narrower to the broader term' }),
        el('span', {}, el('b', { class: 'nw-key-n', text: '41' }), 'papers that state the link'));
      body.appendChild(chips);
      body.appendChild(legend);
      var scroller = el('div', { class: 'nw-scroll', tabindex: '-1' });
      var hint = el('p', { class: 'nw-hint', text: 'Swipe sideways to see the whole network. Tap a term or a number to read the papers.' });
      var detail = el('div', { class: 'nw-detail', 'aria-live': 'polite' });
      body.appendChild(scroller);
      body.appendChild(hint);
      body.appendChild(detail);
      if (data.mismatches && data.mismatches.length) {
        body.appendChild(el('p', { class: 'nw-mismatch', html: 'The released data differ from the printed figure on ' +
          data.mismatches.map(function (m) { return esc(m[0]) + ' → ' + esc(m[1]) + ' (printed ' + m[2] + ', data ' + m[3] + ')'; }).join('; ') +
          '. The figure shows the data’s number, marked with an asterisk.' }));
      }

      // ------------------------------------------------------------ geometry helpers (inches -> pixels)
      var paths = E.map(function (e) {
        var cmds = [], re = /([MQC])([^MQC]*)/g, m;
        while ((m = re.exec(e.path))) cmds.push([m[1], m[2].trim().split(/[\s,]+/).map(Number)]);
        return cmds;
      });
      function pathD(cmds, s) {
        return cmds.map(function (c) { return c[0] + c[1].map(function (v) { return (v * s).toFixed(1); }).join(' '); }).join('');
      }
      function endTangent(cmds) {
        var last = cmds[cmds.length - 1][1], n = last.length, ex = last[n - 2], ey = last[n - 1], i = n - 4;
        var pts = [].concat.apply([], cmds.map(function (c) { return c[1]; }));
        for (i = pts.length - 4; i >= 0; i -= 2) {
          var dx = ex - pts[i], dy = ey - pts[i + 1], L = Math.hypot(dx, dy);
          if (L > 1e-3) return [ex, ey, dx / L, dy / L];
        }
        return [ex, ey, 1, 0];
      }
      var ends = paths.map(endTangent);
      var startX = paths.map(function (c) { return c[0][1][0]; });

      // how wide each name is per pixel of font size (measured once, after the fonts load), to fit the printed boxes
      var perPx = null, fit = 1;
      function measure(svg) {
        var probe = S('text', { class: 'nw-probe', x: -9999, y: -9999 });
        svg.appendChild(probe);
        perPx = T.map(function (t) {
          probe.setAttribute('class', 'nw-probe' + (t.query ? ' nw-probe-q' : ''));
          probe.style.fontSize = '100px';
          probe.textContent = t.name;
          return probe.getComputedTextLength() / 100;
        });
        svg.removeChild(probe);
        fit = Math.min(1, Math.min.apply(null, T.map(function (t, i) {
          var size = F * (t.query ? 1.04 : 1);
          return (t.box[2] - t.box[0] - 0.5 * F) / (perPx[i] * size);
        })));
      }

      // ------------------------------------------------------------ state
      var sel = null, hover = null, drawn = null, animated = false;
      function focusOf() { return hover || sel; }

      function paint() {
        if (!drawn) return;
        var f = focusOf(), litE = {}, litN = {};
        if (f && f.type === 'e') { litE[f.i] = 1; litN[E[f.i].s] = 1; litN[E[f.i].t] = 1; }
        if (f && f.type === 'n') {
          litN[f.i] = 1;
          outs[f.i].concat(ins[f.i]).forEach(function (j) { litE[j] = 1; litN[E[j].s] = 1; litN[E[j].t] = 1; });
        }
        drawn.svg.classList.toggle('nw-focus', !!f);
        E.forEach(function (e, j) {
          var on = !!litE[j];
          drawn.edge[j].classList.toggle('on', on);
          drawn.head[j].classList.toggle('on', on);
          drawn.pill[j].classList.toggle('on', on);
          drawn.pill[j].classList.toggle('picked', !!(sel && sel.type === 'e' && sel.i === j));
        });
        T.forEach(function (t, i) {
          drawn.node[i].classList.toggle('on', !!litN[i]);
          drawn.node[i].classList.toggle('picked', !!(sel && sel.type === 'n' && sel.i === i));
        });
        [].forEach.call(chips.querySelectorAll('.fig-chip'), function (b) {
          b.setAttribute('aria-pressed', String(!!(sel && sel.type === 'n' && sel.i === +b.dataset.i)));
        });
      }

      function select(next) {
        sel = next;
        paint();
        renderDetail();
        // when the network scrolls sideways (a phone), bring the picked term or number into view
        if (sel && drawn && scroller.scrollWidth > scroller.clientWidth + 1) {
          var x = sel.type === 'n' ? (T[sel.i].box[0] + T[sel.i].box[2]) / 2 : E[sel.i].at[0];
          var left = x * drawn.s - scroller.clientWidth / 2;
          if (scroller.scrollTo) scroller.scrollTo({ left: Math.max(0, left), behavior: k.motion ? 'smooth' : 'auto' });
          else scroller.scrollLeft = Math.max(0, left);
        }
      }

      // ------------------------------------------------------------ the tooltip
      function tipEdge(j) {
        var e = E[j], r = E[pair[e.t + '>' + e.s]];
        var list = e.papers.slice(0, 3).map(function (p) { return '<li>' + esc(P[p[0]][0]) + ' <span class="k">(' + P[p[0]][1] + ')</span></li>'; }).join('');
        return '<b>' + esc(says(e)) + '</b>' +
          (r ? '<br><span class="k">' + nf(r.n) + ' ' + papersWord(r.n) + ' ' + (r.n === 1 ? 'says' : 'say') + ' the reverse.</span>' : '') +
          '<ul class="nw-tip-list">' + list + '</ul>' +
          '<span class="k">' + (e.n > 3 ? 'and ' + nf(e.n - 3) + ' more. ' : '') + 'Click to read ' + (e.n === 1 ? 'its words.' : 'all ' + nf(e.n) + ' and their words.') + '</span>';
      }
      function count(n, kind) { return (n ? nf(n) : 'no') + ' ' + kind + ' ' + (n === 1 ? 'term' : 'terms'); }
      function tipNode(i) {
        var t = T[i];
        return '<b>' + esc(t.name) + '</b>' + (t.query ? ' <span class="k">· query term</span>' : '') +
          '<br>defined by ' + nf(t.papers) + ' ' + papersWord(t.papers) + ' (' + nf(t.defs) + ' definitions)' +
          '<br><span class="k">in this figure: ' + count(outs[i].length, 'broader') + ', ' + count(ins[i].length, 'narrower') + '. Click for the list.</span>';
      }

      // ------------------------------------------------------------ the detail under the chart
      function paperRow(p) {
        var paper = P[p[0]], seed = paper[2] === 's';
        return el('li', {},
          el('div', { class: 'nw-paper' },
            el('span', { class: 'nw-dot ' + (seed ? 'is-seed' : 'is-cited'), title: seed ? 'seed paper' : 'cited paper' }),
            el('span', { class: 'nw-title', text: paper[0] }),
            el('span', { class: 'nw-year', text: String(paper[1]) }),
            el('span', { class: 'nw-kind', text: seed ? 'seed' : 'cited' })),
          p[1].map(function (w) {
            return el('p', { class: 'nw-words', html: w[0] === 'b'
              ? 'defines “' + esc(w[1]) + '” and lists “' + esc(w[2]) + '” as a narrower term'
              : 'defines “' + esc(w[1]) + '” and names “' + esc(w[2]) + '” as a broader term' });
          }));
      }
      function linkChip(j, label) {
        var e = E[j];
        return el('button', { type: 'button', class: 'nw-mini', onclick: function () { select({ type: 'e', i: j }); },
          'aria-label': says(e) },
          el('span', { text: label }), el('b', { text: nf(e.n) }));
      }
      function explorerLine(name) {
        return el('p', { class: 'nw-more' },
          el('a', { class: 'fig-link', href: k.explorer('relations'), target: '_blank', rel: 'noopener', text: 'Open the Explorer’s Relations tab' }),
          ' and search “' + name + '” under “The strongest links” for every link of this term in MBDef, beyond this figure.');
      }
      function renderDetail() {
        detail.textContent = '';
        if (!sel) {
          detail.appendChild(el('p', { class: 'nw-detail-k', text: 'Read the papers behind a link' }));
          detail.appendChild(el('p', { class: 'nw-detail-lead', html: 'Point at a term or at a number to light its links; click it to read the papers. Two places to start:' }));
          detail.appendChild(el('div', { class: 'nw-start' },
            linkChip(E.indexOf(strongest), T[strongest.s].name + ' → ' + T[strongest.t].name),
            linkChip(E.indexOf(mbExample), T[mbExample.s].name + ' → ' + T[mbExample.t].name)));
          return;
        }
        var close = el('button', { type: 'button', class: 'nw-close', 'aria-label': 'Clear the selection', text: '×', onclick: function () { select(null); } });
        if (sel.type === 'e') {
          var e = E[sel.i], r = pair[e.t + '>' + e.s];
          detail.appendChild(el('div', { class: 'nw-detail-top' },
            el('div', {},
              el('p', { class: 'nw-detail-k', text: 'One arrow' }),
              el('h4', { class: 'nw-detail-h', html: '<b>' + nf(e.n) + ' ' + papersWord(e.n) + '</b> ' + (e.n === 1 ? 'says' : 'say') + ' ' + nm(e.s) + ' is a kind of ' + nm(e.t) }),
              r != null ? el('p', { class: 'nw-detail-sub' }, 'The reverse: ', linkChip(r, T[E[r].s].name + ' → ' + T[E[r].t].name)) : null),
            close));
          detail.appendChild(el('p', { class: 'nw-legend-papers', html: '<span class="nw-dot is-seed"></span> seed paper, found by the literature search · ' +
            '<span class="nw-dot is-cited"></span> cited paper, added through the seed papers’ citations. Newest first; each paper counts once, even when it states the link from both sides.' }));
          detail.appendChild(el('ol', { class: 'nw-papers' }, e.papers.map(paperRow)));
          detail.appendChild(el('p', { class: 'nw-note-small', text: 'Titles and words as recorded in the dataset; a few titles carry extraction errors.' }));
          return;
        }
        var i = sel.i, t = T[i];
        var broader = outs[i].slice().sort(function (a, b) { return E[b].n - E[a].n; });
        var narrower = ins[i].slice().sort(function (a, b) { return E[b].n - E[a].n; });
        detail.appendChild(el('div', { class: 'nw-detail-top' },
          el('div', {},
            el('p', { class: 'nw-detail-k', text: t.query ? 'One of the six query terms' : 'A term on a shortest path' }),
            el('h4', { class: 'nw-detail-h', html: nm(i) + ': defined by <b>' + nf(t.papers) + ' ' + papersWord(t.papers) + '</b> <span class="nw-muted">(' + nf(t.defs) + ' definitions)</span>' })),
          close));
        var cols = el('div', { class: 'nw-cols' });
        cols.appendChild(el('div', {}, el('p', { class: 'nw-col-k', text: 'Broader terms it is called a kind of' }),
          broader.length ? el('div', { class: 'nw-minis' }, broader.map(function (j) { return linkChip(j, T[E[j].t].name); })) : el('p', { class: 'nw-muted', text: 'none in this figure' })));
        cols.appendChild(el('div', {}, el('p', { class: 'nw-col-k', text: 'Narrower terms called a kind of it' }),
          narrower.length ? el('div', { class: 'nw-minis' }, narrower.map(function (j) { return linkChip(j, T[E[j].s].name); })) : el('p', { class: 'nw-muted', text: 'none in this figure' })));
        detail.appendChild(cols);
        detail.appendChild(explorerLine(t.name));
      }

      // ------------------------------------------------------------ drawing
      function draw(width) {
        var W = Math.max(width, MINW), s = W / CW, H = Math.ceil(CH * s);
        scroller.textContent = '';
        var svg = S('svg', { class: 'nw-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group',
          'aria-label': 'The network of ' + T.length + ' terms and ' + E.length + ' arrows; each term and each number can be focused.' });
        scroller.appendChild(svg);
        hint.hidden = W <= width;
        if (!perPx) measure(svg);
        var fontPx = F * s * fit, pillPx = Math.max(11, Math.min(16, fontPx * 0.74));
        svg.appendChild(S('rect', { class: 'nw-bg', x: 0, y: 0, width: W, height: H, onclick: function () { select(null); } }));
        var gE = S('g', { class: 'nw-edges' }), gH = S('g', { class: 'nw-heads' }), gX = S('g', { class: 'nw-hits' }),
          gN = S('g', { class: 'nw-nodes' }), gP = S('g', { class: 'nw-pills' });
        svg.appendChild(gE); svg.appendChild(gH); svg.appendChild(gX); svg.appendChild(gN); svg.appendChild(gP);
        var d = { svg: svg, s: s, edge: [], head: [], pill: [], node: [], len: [] };

        function bindHover(target, f, tip) {
          target.addEventListener('pointerenter', function (ev) {
            if (ev.pointerType !== 'mouse') return;
            hover = f; paint(); k.tip.show(ev, tip());
          });
          target.addEventListener('pointermove', function (ev) { if (ev.pointerType === 'mouse') k.tip.show(ev, tip()); });
          target.addEventListener('pointerleave', function () { if (hover) { hover = null; paint(); } k.tip.hide(); });
          target.addEventListener('focus', function (ev) { hover = f; paint(); k.tip.show(ev, tip()); });
          target.addEventListener('blur', function () { hover = null; paint(); k.tip.hide(); });
          target.addEventListener('click', function () {
            k.tip.hide();
            select(sel && sel.type === f.type && sel.i === f.i ? null : f);
          });
          target.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(sel && sel.type === f.type && sel.i === f.i ? null : f); }
          });
        }

        E.forEach(function (e, j) {
          var dd = pathD(paths[j], s), w = 0.9 + 0.55 * Math.log2(e.n), hl = 6 + 1.1 * Math.log2(e.n), hw = hl * 0.45;
          var path = S('path', { class: 'nw-e', d: dd, 'stroke-width': w.toFixed(2), style: '--o:' + Math.min(0.9, 0.42 + 0.11 * Math.log2(e.n)).toFixed(2) });
          gE.appendChild(path);
          var L = path.getTotalLength(), vis = Math.max(0, L - hl * 0.7);
          path.setAttribute('stroke-dasharray', vis.toFixed(1) + ' ' + (L + 50).toFixed(1));
          d.len[j] = vis;
          var t = ends[j], tx = t[0] * s, ty = t[1] * s, ux = t[2], uy = t[3];
          var head = S('path', { class: 'nw-h', style: '--o:' + Math.min(0.95, 0.55 + 0.11 * Math.log2(e.n)).toFixed(2),
            d: 'M' + tx.toFixed(1) + ' ' + ty.toFixed(1) +
              'L' + (tx - ux * hl - uy * hw).toFixed(1) + ' ' + (ty - uy * hl + ux * hw).toFixed(1) +
              'L' + (tx - ux * hl + uy * hw).toFixed(1) + ' ' + (ty - uy * hl - ux * hw).toFixed(1) + 'Z' });
          gH.appendChild(head);
          var hit = S('path', { class: 'nw-hit', d: dd });
          gX.appendChild(hit);
          bindHover(hit, { type: 'e', i: j }, function () { return tipEdge(j); });
          // the number, where the printed figure puts it
          var mark = e.printed != null && e.printed !== e.n ? '*' : '';
          var g = S('g', { class: 'nw-pill' + (e.n === 1 ? ' is-one' : e.n >= 10 ? ' is-big' : ''), tabindex: '0', role: 'button',
            'aria-label': says(e) + (mark ? ' (the printed figure shows ' + e.printed + ')' : '') });
          var px = e.at[0] * s, py = e.at[1] * s;
          var txt = S('text', { x: px.toFixed(1), y: (py + pillPx * 0.36).toFixed(1), style: 'font-size:' + pillPx.toFixed(1) + 'px', 'text-anchor': 'middle', text: nf(e.n) + mark });
          var rect = S('rect', { rx: (pillPx * 0.62).toFixed(1) });
          g.appendChild(rect); g.appendChild(txt);
          gP.appendChild(g);
          var tw = txt.getComputedTextLength(), bw = Math.max(tw + pillPx * 0.9, pillPx * 1.5), bh = pillPx * 1.35;
          rect.setAttribute('x', (px - bw / 2).toFixed(1)); rect.setAttribute('y', (py - bh / 2).toFixed(1));
          rect.setAttribute('width', bw.toFixed(1)); rect.setAttribute('height', bh.toFixed(1));
          bindHover(g, { type: 'e', i: j }, function () { return tipEdge(j); });
          d.edge[j] = path; d.head[j] = head; d.pill[j] = g;
        });

        T.forEach(function (t, i) {
          var b = t.box, x = b[0] * s, y = b[1] * s, w = (b[2] - b[0]) * s, h = (b[3] - b[1]) * s;
          var g = S('g', { class: 'nw-node' + (t.query ? ' is-q' : '') + (i === MB ? ' is-mb' : ''), tabindex: '0', role: 'button',
            'aria-label': t.name + ': defined by ' + nf(t.papers) + ' ' + papersWord(t.papers) + '; ' + outs[i].length + ' broader and ' + ins[i].length + ' narrower terms in this figure' });
          g.appendChild(S('rect', { x: x.toFixed(1), y: y.toFixed(1), width: w.toFixed(1), height: h.toFixed(1), rx: (0.3 * F * s).toFixed(1) }));
          var size = fontPx * (t.query ? 1.04 : 1);
          g.appendChild(S('text', { x: (x + w / 2).toFixed(1), y: (y + h / 2 + size * 0.34).toFixed(1), style: 'font-size:' + size.toFixed(1) + 'px', 'text-anchor': 'middle', text: t.name }));
          gN.appendChild(g);
          bindHover(g, { type: 'n', i: i }, function () { return tipNode(i); });
          d.node[i] = g;
        });

        drawn = d;
        paint();
        if (!animated) {
          animated = true;
          // a phone shows part of the network: start with media bias in the middle
          if (W > width) scroller.scrollLeft = Math.max(0, (T[MB].box[0] + T[MB].box[2]) / 2 * s - width / 2);
          entrance(d, W);
        }
      }

      function entrance(d, W) {
        if (!k.motion || !('IntersectionObserver' in window) || !d.svg.animate) return;
        d.svg.classList.add('nw-pre');
        var io = new IntersectionObserver(function (es) {
          if (!es.some(function (x) { return x.isIntersecting; })) return;
          io.disconnect();
          var cur = drawn;
          cur.svg.classList.remove('nw-pre');
          var ease = 'cubic-bezier(.25,.7,.25,1)';
          E.forEach(function (e, j) {
            var delay = 120 + 700 * Math.min(1, startX[j] / CW);
            cur.edge[j].animate([{ strokeDashoffset: cur.len[j] }, { strokeDashoffset: 0 }], { duration: 900, delay: delay, easing: ease, fill: 'backwards' });
            cur.head[j].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: delay + 800, fill: 'backwards' });
            cur.pill[j].animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: delay + 500, fill: 'backwards' });
          });
        }, { threshold: 0.3 });
        io.observe(d.svg);
      }

      document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && sel) select(null); });

      // ------------------------------------------------------------ notes and method
      var ex1 = strongest.papers[0], ex1p = P[ex1[0]], ex1w = ex1[1][0];
      var ex2p = P[mbExample.papers[0][0]];
      var busy = byPaper[busiest], busyP = P[busiest];
      k.notes({
        what: 'Each box is a term of MBDef. An arrow says that papers call one term a kind of another: it points from the ' +
          'narrower to the broader term, and its number counts the papers that say so. The figure keeps every term on a ' +
          'shortest chain of links between two of the six query terms (filled), then every arrow between the kept terms: ' +
          nf(T.length) + ' terms, ' + nf(E.length) + ' arrows, ' + nf(data.counts.papers) + ' papers.',
        why: 'Where media bias ends is not settled, and MBDef does not decide it. The network ' +
          'shows where the literature itself draws the lines. The misinformation terms are densely tied to each other, ' +
          'while media bias is tied to them only by single papers, so its boundary with them is open.',
        read: 'Two arrows between the same terms mean that papers disagree on which is broader: ' + nf(strongest.n) +
          ' call <i>' + esc(T[strongest.s].name) + '</i> a kind of <i>' + esc(T[strongest.t].name) + '</i>' +
          (reverse ? ', ' + nf(reverse.n) + ' the reverse' : '') + '. An arrow records what papers state, not an agreed ' +
          'hierarchy, and ' + nf(data.counts.one_paper) + ' of the ' + nf(E.length) + ' arrows rest on one paper; ' +
          busy.length + ' of the ' + oneIntoMB.length + ' one-paper arrows into <i>media bias</i> (' +
          busy.map(function (e) { return esc(T[e.s].name); }).join(', ') + ') come from the same ' + busyP[1] + ' paper.',
        example: 'The strongest arrow (the rule: most papers) is <i>' + esc(T[strongest.s].name) + '</i> → <i>' +
          esc(T[strongest.t].name) + '</i>, ' + nf(strongest.n) + ' papers; the most recent, from ' + ex1p[1] + ', ' +
          (ex1w[0] === 'b' ? 'defines “' + esc(ex1w[1]) + '” and lists “' + esc(ex1w[2]) + '” as a narrower term.'
            : 'defines “' + esc(ex1w[1]) + '” and names “' + esc(ex1w[2]) + '” as a broader term.') +
          ' Around media bias (the rule: the one-paper arrow into it from the term most papers define): <i>' +
          esc(T[mbExample.s].name) + '</i> is defined by ' + nf(T[mbExample.s].papers) + ' papers, yet only one, “' +
          esc(ex2p[0]) + '” (' + ex2p[1] + '), calls it a kind of <i>media bias</i>.'
      });
      k.method(
        '<p><b>The rule.</b> Start from six query terms: <i>media bias</i>, <i>bias</i>, <i>misinformation</i>, ' +
        '<i>disinformation</i>, <i>fake news</i> and <i>propaganda</i>. Keep every term that lies on a shortest chain of ' +
        'links between two of them, with the direction of the links ignored, then draw every narrower-to-broader statement ' +
        'between two kept terms. A statement comes from a paper that defines a term and lists another term as one of its ' +
        'narrower terms (subtypes) or broader terms (supertypes), when the dataset matches that name to one of its terms. ' +
        'The number on an arrow counts distinct papers: a paper that states a link from both sides counts once. A link of a ' +
        'term to itself is left out.</p>' +
        '<p><b>The data.</b> The released MBDef tables: terms (the listed narrower and broader terms and the papers behind ' +
        'them), concepts and definitions (how many papers define each term), instances (each paper’s own spelling of the ' +
        'term) and papers (titles, years, seed or cited). Seed papers come from the literature search; cited papers were ' +
        'added because seed papers cite them.</p>' +
        '<p><b>The drawing.</b> The paper’s figure was drawn by the MBDef code (the concept-connections module of its ' +
        'analysis package, tutorial 3), at fixed positions. <code>scripts/figs/network.py</code> runs that code unchanged ' +
        'on the released tables and keeps every box, arrow route and number position it draws, so this figure redraws the ' +
        'printed one at any width; it checks all ' + T.length + ' terms and ' + E.length + ' numbers against the printed figure (' +
        (data.mismatches.length ? data.mismatches.length + ' differ; the figure shows the data’s numbers' : 'all match') + '). Four ' +
        'names are spelled as printed: <i>commercial bias</i>, <i>ownership bias</i> and <i>religious bias</i> (capitalised ' +
        'in the dataset), and <i>cognitive bias</i> (the dataset’s term <i>cognitive biases</i>, of which it is a spelling).</p>');

      return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
        k.onResize(draw);
        renderDetail();
      });
    }
  });
})();
