/* Fig. 6, interactive: the concept-connections network (data: static/data/figs/network.json, made by
   scripts/figs/network.py from the released tables with the MBDef code that drew the printed figure).

   The terms sit at the printed figure's positions, in the printed boxes, and every arrow follows the printed route; the
   whole drawing scales with the panel's width (in inches of the printed 38 x 12 inch canvas, times s pixels per inch).
   Below MINW pixels it keeps MINW and scrolls sideways inside its own box, opening on media bias, with its edges fading
   where more of the network lies.

   At rest an arrow of two or more papers shows its number where the print puts it; a one-paper arrow shows its 1 while
   it or one of its terms is pointed at, focused or selected. Pointing at (or focusing) a term brightens it and its
   links, lights its neighbours and dims the rest; pointing at an arrow thickens it and lights its two terms. A click
   (tap, Enter) opens a panel under the chart: the papers behind an arrow, with the words each uses, or a term's broader
   and narrower terms. A second click, the panel's ×, Esc or a click on the empty chart closes it.

   Entrance (k.onArrive, each time the figure is revealed; not with reduced motion): it starts from the print's look,
   the boxes drawn and the arrows faint, without numbers; the glow of the query terms fades in (media bias turning warm),
   then every arrow draws from its narrower to its broader term, strongest first, its number appearing as the line
   passes it; about 1.2 s in all. A pointer resting on the chart does not light anything until it moves. */
(function () {
  'use strict';
  var MINW = 760;

  FIG.register('network', {
    build: function (panel, data, k) {
      var T = data.terms, E = data.edges, P = data.papers, F = data.font, CW = data.canvas[0], CH = data.canvas[1];
      var MB = T.map(function (t) { return t.name; }).indexOf('media bias');
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
      var differs = function (e) { return e.printed != null && e.printed !== e.n; };

      var body = k.body();
      var scroller = el('div', { class: 'nw-scroll', tabindex: '-1' });
      var detail = el('div', { class: 'nw-detail', 'aria-live': 'polite', hidden: true });
      body.appendChild(scroller);
      body.appendChild(el('p', { class: 'nw-key', text: 'arrow: narrower → broader · number: papers' }));
      var off = E.filter(differs);
      if (off.length) {
        body.appendChild(el('p', { class: 'nw-key nw-off', text: '† differs from the print: ' + off.map(function (e) {
          return T[e.s].name + ' → ' + T[e.t].name + ' printed ' + e.printed + ', data ' + e.n;
        }).join('; ') }));
      }
      body.appendChild(detail);

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
        var pts = [].concat.apply([], cmds.map(function (c) { return c[1]; })), n = pts.length, ex = pts[n - 2], ey = pts[n - 1];
        for (var i = n - 4; i >= 0; i -= 2) {
          var dx = ex - pts[i], dy = ey - pts[i + 1], L = Math.hypot(dx, dy);
          if (L > 1e-3) return [ex, ey, dx / L, dy / L];
        }
        return [ex, ey, 1, 0];
      }
      var ends = paths.map(endTangent);

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
          return (t.box[2] - t.box[0] - 0.5 * F) / (perPx[i] * F * (t.query ? 1.04 : 1));
        })));
      }

      // ------------------------------------------------------------ state
      // calm: the entrance is playing, so a pointer resting on the chart lights nothing (it lights on its next move)
      var sel = null, hover = null, drawn = null, calm = false, show = null;
      var same = function (a, b) { return !!(a && b && a.type === b.type && a.i === b.i); };

      // the focus (hover, keyboard focus, else the selection) is "hot"; its links and terms are "on"; the rest dims
      function paint() {
        if (!drawn) return;
        var f = hover || sel, litE = {}, litN = {}, hotE = -1, hotN = -1;
        if (f && f.type === 'e') { hotE = f.i; litE[f.i] = 1; litN[E[f.i].s] = 1; litN[E[f.i].t] = 1; }
        if (f && f.type === 'n') {
          hotN = f.i; litN[f.i] = 1;
          outs[f.i].concat(ins[f.i]).forEach(function (j) { litE[j] = 1; litN[E[j].s] = 1; litN[E[j].t] = 1; });
        }
        drawn.svg.classList.toggle('nw-focus', !!f);
        E.forEach(function (e, j) {
          var on = !!litE[j], hot = j === hotE;
          [drawn.edge[j], drawn.head[j], drawn.pill[j]].forEach(function (m) { m.classList.toggle('on', on); m.classList.toggle('hot', hot); });
          drawn.pill[j].classList.toggle('picked', same(sel, { type: 'e', i: j }));
        });
        T.forEach(function (t, i) {
          drawn.node[i].classList.toggle('on', !!litN[i]);
          drawn.node[i].classList.toggle('hot', i === hotN);
          drawn.node[i].classList.toggle('picked', same(sel, { type: 'n', i: i }));
        });
      }

      // where a term or an arrow's number sits, in inches from the left
      function xOf(f) { return f.type === 'n' ? (T[f.i].box[0] + T[f.i].box[2]) / 2 : E[f.i].at[0]; }
      // when the network scrolls sideways (a phone), put x in the middle of its box
      function centre(x, smooth) {
        if (!drawn || scroller.scrollWidth <= scroller.clientWidth + 1) return;
        var left = Math.max(0, x * drawn.s - scroller.clientWidth / 2);
        if (scroller.scrollTo) scroller.scrollTo({ left: left, behavior: smooth && k.motion ? 'smooth' : 'auto' });
        else scroller.scrollLeft = left;
      }
      function fade() { // the box's edges fade where more of the network lies beyond them
        var max = scroller.scrollWidth - scroller.clientWidth;
        scroller.classList.toggle('fade-l', max > 1 && scroller.scrollLeft > 2);
        scroller.classList.toggle('fade-r', max > 1 && scroller.scrollLeft < max - 2);
      }
      scroller.addEventListener('scroll', fade, { passive: true });

      function select(next) {
        sel = same(sel, next) ? null : next;
        paint();
        renderDetail();
        if (sel) centre(xOf(sel), true);
      }

      // ------------------------------------------------------------ the tooltip
      function tipEdge(j) {
        var e = E[j], r = E[pair[e.t + '>' + e.s]];
        return '<b>' + nf(e.n) + ' ' + papersWord(e.n) + '</b>: ' + esc(T[e.s].name) + ' → ' + esc(T[e.t].name) +
          (r ? '<br><span class="k">the other way: ' + nf(r.n) + ' ' + papersWord(r.n) + '</span>' : '') +
          (differs(e) ? '<br><span class="k">† the print shows ' + e.printed + '</span>' : '');
      }
      function count(n, kind) { return (n ? nf(n) : 'no') + ' ' + kind; }
      function tipNode(i) {
        var t = T[i];
        return '<b>' + esc(t.name) + '</b>' + (t.query ? ' <span class="k">· query term</span>' : '') +
          '<br>defined by ' + nf(t.papers) + ' ' + papersWord(t.papers) + ' <span class="k">(' + nf(t.defs) + ' definitions)</span>' +
          '<br><span class="k">here: ' + count(outs[i].length, 'broader') + ', ' + count(ins[i].length, 'narrower') + '</span>';
      }

      // ------------------------------------------------------------ the panel under the chart
      function paperRow(p) {
        var paper = P[p[0]], seed = paper[2] === 's';
        return el('li', {},
          el('div', { class: 'nw-paper' },
            el('span', { class: 'nw-dot ' + (seed ? 'is-seed' : 'is-cited') }),
            el('span', { class: 'nw-title', text: paper[0] }),
            el('span', { class: 'nw-year', text: String(paper[1]) }),
            el('span', { class: 'nw-kind', text: seed ? 'seed' : 'cited',
              title: seed ? 'found by the literature search' : 'added because a seed paper cites it' })),
          p[1].map(function (w) {
            return el('p', { class: 'nw-words', html: w[0] === 'b'
              ? 'defines “' + esc(w[1]) + '”, lists “' + esc(w[2]) + '” as narrower'
              : 'defines “' + esc(w[1]) + '”, names “' + esc(w[2]) + '” as broader' });
          }));
      }
      function linkChip(j, label) {
        var e = E[j];
        return el('button', { type: 'button', class: 'nw-mini', 'aria-label': says(e), onclick: function () { select({ type: 'e', i: j }); } },
          el('span', { text: label }), el('b', { text: nf(e.n) }));
      }
      function chipRow(label, list, other) {
        return el('div', { class: 'nw-row' }, el('span', { class: 'nw-row-k', text: label }),
          list.length ? el('div', { class: 'nw-minis' }, list.map(function (j) { return linkChip(j, T[E[j][other]].name); }))
            : el('span', { class: 'nw-muted', text: 'none here' }));
      }
      function renderDetail() {
        var refocus = detail.contains(document.activeElement);
        detail.textContent = '';
        detail.hidden = !sel;
        if (!sel) return;
        var close = el('button', { type: 'button', class: 'nw-close', 'aria-label': 'Close', title: 'Close (Esc)', text: '×', onclick: function () { select(null); } });
        var byN = function (a, b) { return E[b].n - E[a].n; };
        if (sel.type === 'e') {
          var e = E[sel.i], r = pair[e.t + '>' + e.s];
          detail.appendChild(el('div', { class: 'nw-detail-top' },
            el('h4', { class: 'nw-detail-h', html: '<b>' + nf(e.n) + ' ' + papersWord(e.n) + '</b> ' + (e.n === 1 ? 'says' : 'say') + ' ' + nm(e.s) + ' is a kind of ' + nm(e.t) }),
            r != null ? linkChip(r, 'the reverse') : null,
            close));
          detail.appendChild(el('ol', { class: 'nw-papers' }, e.papers.map(paperRow)));
        } else {
          var i = sel.i, t = T[i];
          detail.appendChild(el('div', { class: 'nw-detail-top' },
            el('h4', { class: 'nw-detail-h', html: nm(i) + ' <span class="nw-muted">defined by</span> <b>' + nf(t.papers) + ' ' + papersWord(t.papers) +
              '</b> <span class="nw-muted">(' + nf(t.defs) + ' definitions)</span>' }),
            el('a', { class: 'fig-link nw-ext', href: k.explorer('relations'), target: '_blank', rel: 'noopener',
              title: 'Every link of this term in MBDef: search “' + t.name + '” under “The strongest links”', text: 'All its links ↗' }),
            close));
          detail.appendChild(chipRow('broader', outs[i].slice().sort(byN), 't'));
          detail.appendChild(chipRow('narrower', ins[i].slice().sort(byN), 's'));
        }
        if (refocus) close.focus({ preventScroll: true });
        detail.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' });
      }

      // ------------------------------------------------------------ drawing
      function draw(width) {
        var W = Math.max(width, MINW), s = W / CW, H = Math.ceil(CH * s);
        stopEntrance();
        scroller.textContent = '';
        var svg = S('svg', { class: 'nw-svg', width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'group',
          'aria-label': 'The network of ' + T.length + ' terms and ' + E.length + ' arrows; each term and each number can be focused.' });
        scroller.appendChild(svg);
        if (!perPx) measure(svg);
        var fontPx = F * s * fit, pillPx = Math.max(11, Math.min(16, fontPx * 0.74));
        svg.appendChild(S('rect', { class: 'nw-bg', x: 0, y: 0, width: W, height: H, onclick: function () { if (sel) select(null); } }));
        var gE = S('g'), gH = S('g'), gX = S('g'), gN = S('g'), gP = S('g');
        [gE, gH, gX, gN, gP].forEach(function (g) { svg.appendChild(g); });
        var d = { svg: svg, s: s, gE: gE, edge: [], head: [], pill: [], node: [], o: [], oh: [], vis: [], tip: [] };

        function bind(target, f, tip) {
          target.addEventListener('pointerenter', function (ev) {
            if (ev.pointerType !== 'mouse' || calm) return;
            hover = f; paint(); k.tip.show(ev, tip());
          });
          target.addEventListener('pointermove', function (ev) { // also lights a mark the pointer rested on during the entrance
            if (ev.pointerType !== 'mouse' || calm) return;
            if (!same(hover, f)) { hover = f; paint(); }
            k.tip.show(ev, tip());
          });
          target.addEventListener('pointerleave', function () { if (hover) { hover = null; paint(); } k.tip.hide(); });
          target.addEventListener('focus', function (ev) { hover = f; paint(); k.tip.show(ev, tip()); });
          target.addEventListener('blur', function () { hover = null; paint(); k.tip.hide(); });
          target.addEventListener('click', function () { k.tip.hide(); select(f); });
          target.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(f); }
          });
        }

        E.forEach(function (e, j) {
          var dd = pathD(paths[j], s), w = 0.9 + 0.55 * Math.log2(e.n), hl = 6 + 1.1 * Math.log2(e.n), hw = hl * 0.45;
          var o = Math.min(0.9, 0.42 + 0.11 * Math.log2(e.n)), oh = Math.min(0.95, 0.55 + 0.11 * Math.log2(e.n));
          var path = S('path', { class: 'nw-e', d: dd, style: '--o:' + o.toFixed(2) + ';--w:' + w.toFixed(2) + 'px' });
          gE.appendChild(path);
          // the line stops short of the head's tip
          var L = path.getTotalLength(), vis = Math.max(0, L - hl * 0.7);
          path.setAttribute('stroke-dasharray', vis.toFixed(1) + ' ' + (L + 50).toFixed(1));
          var t = ends[j], tx = t[0] * s, ty = t[1] * s, ux = t[2], uy = t[3];
          d.o[j] = o; d.oh[j] = oh; d.vis[j] = vis; d.tip[j] = [tx, ty];
          var head = S('path', { class: 'nw-h', style: '--o:' + oh.toFixed(2),
            d: 'M' + tx.toFixed(1) + ' ' + ty.toFixed(1) +
              'L' + (tx - ux * hl - uy * hw).toFixed(1) + ' ' + (ty - uy * hl + ux * hw).toFixed(1) +
              'L' + (tx - ux * hl + uy * hw).toFixed(1) + ' ' + (ty - uy * hl - ux * hw).toFixed(1) + 'Z' });
          gH.appendChild(head);
          var hit = S('path', { class: 'nw-hit', d: dd });
          gX.appendChild(hit);
          bind(hit, { type: 'e', i: j }, function () { return tipEdge(j); });
          // the number, where the printed figure puts it
          var g = S('g', { class: 'nw-pill' + (e.n === 1 ? ' is-one' : e.n >= 10 ? ' is-big' : ''), tabindex: '0', role: 'button',
            'aria-label': says(e) + (differs(e) ? ' (the printed figure shows ' + e.printed + ')' : '') });
          var px = e.at[0] * s, py = e.at[1] * s;
          var txt = S('text', { x: px.toFixed(1), y: (py + pillPx * 0.36).toFixed(1), style: 'font-size:' + pillPx.toFixed(1) + 'px', 'text-anchor': 'middle', text: nf(e.n) + (differs(e) ? '†' : '') });
          var rect = S('rect', { rx: (pillPx * 0.62).toFixed(1) });
          g.appendChild(rect); g.appendChild(txt);
          gP.appendChild(g);
          var tw = txt.getComputedTextLength(), bw = Math.max(tw + pillPx * 0.9, pillPx * 1.5), bh = pillPx * 1.35;
          rect.setAttribute('x', (px - bw / 2).toFixed(1)); rect.setAttribute('y', (py - bh / 2).toFixed(1));
          rect.setAttribute('width', bw.toFixed(1)); rect.setAttribute('height', bh.toFixed(1));
          bind(g, { type: 'e', i: j }, function () { return tipEdge(j); });
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
          bind(g, { type: 'n', i: i }, function () { return tipNode(i); });
          d.node[i] = g;
        });

        drawn = d;
        paint();
        // a phone shows part of the network: the selection, or else media bias, in the middle
        centre(xOf(sel || { type: 'n', i: MB }), false);
        fade();
      }

      // ------------------------------------------------------------ the entrance
      var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
      // the time (0..1) at which EASE has covered the share p of the way (its curve, inverted by sampling)
      function reach(p) {
        var x1 = 0.22, y1 = 1, x2 = 0.36, y2 = 1, prev = 0;
        for (var i = 1; i <= 60; i++) {
          var u = i / 60, v = 1 - u, y = 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u;
          if (y >= p) return 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u;
          prev = u;
        }
        return prev;
      }
      // how far along an arrow's line (0..1 of its drawn length) its number sits
      function shareAt(path, vis, at) {
        var best = 0, bd = Infinity;
        for (var i = 0; i <= 40; i++) {
          var p = path.getPointAtLength(vis * i / 40), dx = p.x - at[0], dy = p.y - at[1], dd = dx * dx + dy * dy;
          if (dd < bd) { bd = dd; best = i / 40; }
        }
        return best;
      }
      function stopEntrance() {
        if (!show) return;
        var s = show; show = null; calm = false;
        s.anims.forEach(function (a) { a.cancel(); });
        if (s.under.parentNode) s.under.parentNode.removeChild(s.under);
      }
      function entrance() {
        stopEntrance();
        // the figure arrives with nothing lit or selected, a phone's view on media bias
        hover = null; calm = false;
        if (sel) { sel = null; renderDetail(); }
        paint(); k.tip.hide();
        centre(xOf({ type: 'n', i: MB }), false);
        if (!drawn || !k.motion) return;
        var d = drawn, anims = [], under = S('g', { class: 'nw-under', 'aria-hidden': 'true' });
        var maxLog = Math.log2(Math.max.apply(null, E.map(function (e) { return e.n; })));
        d.svg.insertBefore(under, d.gE);
        var me = show = { anims: anims, under: under };
        calm = true;
        function play(m, frames, o) { anims.push(m.animate(frames, Object.assign({ fill: 'backwards' }, o))); }

        // the glow of the query terms fades in; media bias turns from the print's query blue to its own warm
        var qRect = d.node[T.findIndex(function (t, i) { return t.query && i !== MB; })].querySelector('rect');
        var qs = getComputedStyle(qRect);
        T.forEach(function (t, i) {
          if (!t.query) return;
          var r = d.node[i].querySelector('rect'), from = { filter: 'drop-shadow(rgba(0, 0, 0, 0) 0px 0px 0px)' };
          if (i === MB) { from.fill = qs.fill; from.stroke = qs.stroke; }
          play(r, [from], { duration: 560, delay: 40, easing: 'ease-in-out' }); // to the resting look
        });
        // each arrow draws from its narrower to its broader term over a faint copy of itself, strongest first;
        // its head settles when the line arrives, its number appears as the line passes it
        E.forEach(function (e, j) {
          var str = Math.log2(e.n) / maxLog, delay = 340 + (1 - str) * 220, dur = 640;
          var u = S('path', { class: 'nw-u', d: d.edge[j].getAttribute('d'), style: d.edge[j].getAttribute('style'),
            'stroke-dasharray': d.edge[j].getAttribute('stroke-dasharray') });
          under.appendChild(u);
          play(u, [{ opacity: d.o[j] * 0.35 }, { opacity: 0 }], { duration: 260, delay: delay + dur * 0.55, fill: 'both' });
          play(d.edge[j], [{ strokeDashoffset: d.vis[j] }, { strokeDashoffset: 0 }], { duration: dur, delay: delay, easing: EASE });
          d.head[j].style.transformOrigin = d.tip[j][0].toFixed(1) + 'px ' + d.tip[j][1].toFixed(1) + 'px';
          play(d.head[j], [{ opacity: d.oh[j] * 0.35, transform: 'scale(0.6)' }, { opacity: d.oh[j], transform: 'none' }],
               { duration: 260, delay: delay + dur * reach(0.94), easing: EASE });
          if (e.n > 1) {
            var at = [e.at[0] * d.s, e.at[1] * d.s];
            play(d.pill[j], [{ opacity: 0, transform: 'scale(0.7)' }, { opacity: 1, transform: 'none' }],
                 { duration: 280, delay: delay + dur * reach(shareAt(d.edge[j], d.vis[j], at)) - 30, easing: EASE });
          }
        });
        Promise.all(anims.map(function (a) { return a.finished; })).then(function () {
          if (show !== me) return;
          show = null; calm = false;
          if (under.parentNode) under.parentNode.removeChild(under);
        }, function () { /* cancelled: stopEntrance has tidied up */ });
      }
      k.onArrive(entrance);

      // Esc closes the panel first (and keeps the stage open); a second Esc closes the stage
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && sel && !panel.hidden) { ev.preventDefault(); select(null); }
      });
      // the figure opens again with nothing selected
      var stage = panel.closest('dialog');
      if (stage) stage.addEventListener('close', function () { stopEntrance(); hover = null; if (sel) select(null); else paint(); });
      // Esc closes the stage: the chart hands back to the print from its resting look, lighting nothing on the way
      if (stage) stage.addEventListener('cancel', function () {
        if (panel.hidden) return;
        calm = true; k.tip.hide();
        if (hover) { hover = null; paint(); }
      });

      k.method(
        '<p>Start from the six query terms (filled): <i>media bias</i>, <i>bias</i>, <i>misinformation</i>, ' +
        '<i>disinformation</i>, <i>fake news</i> and <i>propaganda</i>. Keep every term on a shortest chain of links ' +
        'between two of them, ignoring direction, then draw every narrower-to-broader statement between two kept terms: ' +
        nf(T.length) + ' terms, ' + nf(E.length) + ' arrows, ' + nf(data.counts.papers) + ' papers. A statement is a ' +
        'paper that defines one term and lists the other as a narrower or broader term. The number on an arrow counts ' +
        'distinct papers (a paper that states a link from both sides counts once); the ' + nf(data.counts.one_paper) +
        ' one-paper arrows show their 1 on hover, or when one of their terms is selected. Seed papers come from the literature search; cited papers were added ' +
        'because seed papers cite them. Titles and words are as recorded in the dataset; a few titles carry extraction errors.</p>' +
        '<p><code>scripts/figs/network.py</code> runs the MBDef code that drew the printed figure (its concept-connections ' +
        'module, tutorial 3) unchanged on the released tables, keeps every box, arrow route and number position, and checks ' +
        'all ' + T.length + ' terms and ' + E.length + ' numbers against the print (' +
        (off.length ? off.length + ' differ, marked †' : 'all match') + '). Four names are spelled as printed: ' +
        '<i>commercial bias</i>, <i>ownership bias</i> and <i>religious bias</i> (capitalised in the dataset) and ' +
        '<i>cognitive bias</i> (a spelling of the dataset’s <i>cognitive biases</i>).</p>');

      return (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
        k.onResize(draw);
      });
    }
  });
})();
