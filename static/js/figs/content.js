/* Fig. 3, interactive: the printed figure come alive. Left, the extracted records by field; right, the terms with the
   most definitions (top 10, 25 or 50); every bar split into seed papers (grey) and cited papers (blue), with the
   printed numbers at its end. On arrival the bars grow from zero, top to bottom, and their numbers count up. A hover
   (or focus, or a tap) lights one bar, its label and its value on the axis, and the tooltip gives its split; a hover on
   the grey or blue part lights that part, and one on the colour key lights that part of every bar. A click on a term
   opens its papers, spellings, years and one definition (beside the chart on a wide screen, under its bar on a
   phone), and a second click, × or Esc closes it. Data: static/data/figs/content.json, written by
   scripts/figs/content.py from MBDef's released tables. */
(function () {
  'use strict';

  // what each field means, and a sentence with its real example for "fake news" (the term with the most definitions)
  var MEANS = {
    definitions: ['A sentence or passage in which a paper states what a term means.',
      function (e, t, nf) { return nf(e.papers) + ' papers define <i>' + t + '</i> as “' + e.text + '”.'; }],
    description: ['What a paper says the term is or does, without defining it.',
      function (e, t, nf) { return 'For <i>' + t + '</i>, ' + nf(e.papers) + ' papers write “' + e.text + '”'; }],
    synonyms: ['Another name a paper gives for the term.',
      function (e, t, nf) { return nf(e.papers) + ' papers give “' + e.text + '” as another name for <i>' + t + '</i>.'; }],
    related_terms: ['A term a paper relates to this one, without saying how.',
      function (e, t, nf) { return nf(e.papers) + ' papers relate “' + e.text + '” to <i>' + t + '</i>.'; }],
    subtypes: ['A kind of the term that a paper names.',
      function (e, t, nf) { return nf(e.papers) + ' papers name “' + e.text + '” as a kind of <i>' + t + '</i>.'; }],
    supertypes: ['What a paper says the term is a kind of.',
      function (e, t, nf) { return nf(e.papers) + ' papers call <i>' + t + '</i> a kind of “' + e.text + '”.'; }],
    examples: ['An instance a paper gives of the term.',
      function (e, t, nf) { return nf(e.papers) + ' papers give “' + e.text + '” as an example of <i>' + t + '</i>.'; }]
  };
  var CHOICES = [10, 25, 50];
  var FONT = 'Inter, system-ui, sans-serif';
  var ROW = 27;     // a term row; the seven field rows share the height of the ten printed terms, as in the print
  var SPELL = 4;    // spellings shown before a "+n" button
  var INSIDE = 0.35; // as printed: a bar's two numbers sit inside it when it is over 35% of the longest (and they fit)
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var GROW = 680;   // ms: one bar growing from zero
  var SWEEP = 260;  // ms: from the first bar's start to the last's, top to bottom
  var MOVE = 460;   // ms: a top-n switch (the CSS transitions in content.css take as long)

  var ctx = null;
  function textW(s, size, weight) {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = (weight || 400) + ' ' + (size || 12) + 'px ' + FONT;
    return ctx.measureText(s).width;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function short(s, n) { return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }
  function px(x) { return x.toFixed(1) + 'px'; }

  // tick values 0, step, 2·step, … up to vmax (never past it), with step 1, 2, 2.5 or 5 × 10^k and at least minGap px apart
  function ticks(vmax, span, minGap) {
    var raw = minGap * vmax / span, p = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * p; }).filter(function (s) { return s >= raw; })[0];
    var out = [];
    for (var v = 0; v <= vmax + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }

  FIG.register('content', {
    build: function (panel, data, k) {
      var nf = k.nf, el = k.el, T = data.totals, terms = data.terms, motion = k.motion;
      var state = { n: 10, open: -1, wide: false };
      var left = null, right = null; // the two charts (rebuilt on a resize)

      // ---------------------------------------------------------------- two charts, as printed
      var body = k.body();
      body.classList.add('ct');
      var grid = el('div', { class: 'ct-grid' });
      var leftSec = el('section', { class: 'ct-chart ct-left', 'aria-label': 'Extracted records by field' });
      var rightSec = el('section', { class: 'ct-chart', 'aria-label': 'Terms with the most definitions' });
      grid.appendChild(leftSec); grid.appendChild(rightSec); body.appendChild(grid);

      // the colour key: a hover, focus or tap on one part lights that part of every bar (a click keeps it lit)
      var KEY = {
        s: ['Seed papers', nf(T.seedPapers) + ' seed papers, the media-bias literature the collection started from'],
        c: ['Cited papers', nf(T.citedPapers) + ' papers the seed papers cite']
      };
      var keys = ['s', 'c'].map(function (p) {
        return el('button', { type: 'button', class: 'ct-k', 'data-part': p, 'aria-pressed': 'false', 'aria-label': KEY[p][0] + ': ' + KEY[p][1] },
          el('i', { class: p }), KEY[p][0]);
      });
      leftSec.appendChild(el('div', { class: 'ct-h' }, el('h3', { class: 'ct-eye', text: 'Records by field' }), el('p', { class: 'ct-key' }, keys)));
      var leftHost = el('div', { class: 'ct-plot' });
      var slot = el('div', { class: 'ct-slot' }); // a term's detail on a wide screen: beside the terms, under the fields
      leftSec.appendChild(leftHost); leftSec.appendChild(slot);

      var sw = el('div', { class: 'ct-n', role: 'group', 'aria-label': 'Terms shown' }, el('span', { 'aria-hidden': 'true', text: 'Top' }));
      CHOICES.forEach(function (n) {
        sw.appendChild(el('button', { type: 'button', 'aria-pressed': String(n === state.n), 'aria-label': 'Top ' + n, title: 'The top ' + n + ' terms',
          text: String(n), onclick: function () { setN(n); } }));
      });
      rightSec.appendChild(el('div', { class: 'ct-h' }, el('h3', { class: 'ct-eye', text: 'Terms with the most definitions' }), sw));
      var rightHost = el('div', { class: 'ct-plot' });
      rightSec.appendChild(rightHost);

      var fieldRows = data.fields.map(function (f) { return { label: f.name, seed: f.seed, cited: f.cited, f: f }; });
      var termRows = terms.map(function (t) { return { label: t.name, seed: t.seed, cited: t.cited, t: t }; });

      // ---------------------------------------------------------------- one bar chart (HTML rows on a px scale)
      // all: every row it can show [{label, seed, cited}], of which the first n are shown;
      // opt: {rowH, barH, axis, listRole, listLabel, attrs(r, i), wire(rowEl, r, i, chart)}
      function layout(ch, n) {
        var rows = ch.all.slice(0, n), W = ch.host.clientWidth || 600;
        var labW = Math.ceil(Math.max.apply(null, rows.map(function (r) { return textW(r.label, 13, 500); }))) + 4;
        var stacked = labW > W * 0.36; // long names go above their bars
        var x0 = stacked ? 0 : labW + 12, trackW = W - x0;
        var vmax = Math.max.apply(null, rows.map(function (r) { return r.seed + r.cited; }));
        var scale = (trackW - Math.ceil(textW(nf(vmax), 12, 600)) - 10) / vmax;
        return { W: W, x0: x0, trackW: trackW, stacked: stacked, vmax: vmax, scale: scale, rowH: stacked ? ch.opt.barH + 30 : ch.opt.rowH,
          tv: ticks(vmax, vmax * scale, Math.max(56, textW(nf(vmax), 11) + 18)) };
      }

      function chart(host, all, n, opt) {
        var ch = { host: host, all: all, n: n, opt: opt, L: null, ticks: new Map(), hot: -1, part: '', pin: -1, clr: 0, sizing: null };
        host.textContent = '';
        ch.L = layout(ch, n);
        ch.lines = el('div', { class: 'ct-lines', 'aria-hidden': 'true' });
        ch.guide = el('i', { class: 'ct-guide', 'aria-hidden': 'true' });
        ch.list = el('div', { class: 'ct-rows', role: opt.listRole, 'aria-label': opt.listLabel });
        ch.area = el('div', { class: 'ct-area' }, ch.lines, ch.guide, ch.list);
        ch.tag = el('b', { class: 'ct-tag' });
        ch.axis = el('div', { class: 'ct-axis', 'aria-hidden': 'true' }, ch.tag);
        ch.axt = el('p', { class: 'ct-axt', text: opt.axis });
        ch.rows = all.map(function (r, i) {
          var s = el('i', { class: 'ct-s' }, el('em', { text: nf(r.seed) })), c = el('i', { class: 'ct-c' }, el('em', { text: nf(r.cited) }));
          var bar = el('span', { class: 'ct-bar' }, s, c);
          var nt = el('b', { text: nf(r.seed + r.cited) }), ns = el('span', { class: 's', text: nf(r.seed) }), nc = el('span', { class: 'c', text: nf(r.cited) });
          var val = el('span', { class: 'ct-val' }, nt, el('span', { class: 'ct-vp' }, ' (', ns, ', ', nc, ')'));
          var row = el('div', Object.assign({ class: 'ct-row' }, opt.attrs(r, i)),
            el('span', { class: 'ct-lab', text: r.label }), el('span', { class: 'ct-track' }, bar, val));
          row.hidden = i >= n;
          row._ = { r: r, bar: bar, s: s, c: c, val: val, ems: [s.firstChild, c.firstChild], g: null, anims: [], fade: null, leaving: false,
            nums: [[nt, r.seed + r.cited], [ns, r.seed], [nc, r.cited], [s.firstChild, r.seed], [c.firstChild, r.cited]] };
          return row;
        });
        place(ch, false);
        ch.rows.forEach(function (row, i) { ch.list.appendChild(row); opt.wire(row, all[i], i, ch); });
        host.appendChild(ch.area); host.appendChild(ch.axis); host.appendChild(ch.axt);
        return ch;
      }

      // every bar, number and tick at the chart's layout ch.L; when animate, the positions glide (CSS transitions) and
      // a number that changes place fades out and back in
      function place(ch, animate) {
        var L = ch.L, h = ch.host, barH = ch.opt.barH;
        h.classList.toggle('is-stacked', L.stacked);
        h.style.setProperty('--x0', L.x0 + 'px');
        h.style.setProperty('--row', L.rowH + 'px');
        h.style.setProperty('--bar', barH + 'px');
        ch.rows.forEach(function (row) {
          var o = row._, r = o.r, tot = r.seed + r.cited, ws = r.seed * L.scale, wc = r.cited * L.scale, bw = ws + wc;
          var fit = function (w, v) { return w >= textW(nf(v), 11.5, 500) + 10 && barH >= 15; };
          var inside = tot >= INSIDE * L.vmax && fit(ws, r.seed) && fit(wc, r.cited);
          // else "total (seed, cited)" after the bar when there is room, as printed
          var paren = !inside && L.trackW - bw - 6 >= textW(nf(tot) + ' (' + nf(r.seed) + ', ' + nf(r.cited) + ')', 12, 600) + 4;
          var was = o.g;
          o.g = { ws: ws, wc: wc, bw: bw, inside: inside, paren: paren };
          o.bar.style.width = px(bw); o.s.style.width = px(ws); o.c.style.width = px(wc);
          o.val.style.left = px(bw + 6);
          var swap = function () { row.classList.toggle('is-in', o.g.inside); row.classList.toggle('is-paren', o.g.paren); };
          if (animate && was && (was.paren !== paren || was.inside !== inside) && !row.hidden) {
            var out = o.val.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'ease-in', fill: 'forwards' });
            out.finished.then(function () { swap(); out.cancel(); o.val.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease-out' }); })
              .catch(function () {});
          } else swap();
        });
        drawTicks(ch, animate);
        ch.axt.style.paddingLeft = L.x0 + 'px';
      }

      // the grid lines and axis numbers, kept by value, so that a new scale moves them instead of redrawing them
      function drawTicks(ch, animate) {
        var L = ch.L, prev = ch.Lprev, keep = {};
        var xAt = function (M, v) { return Math.min(M.x0 + v * M.scale, M.W); };
        L.tv.forEach(function (v) {
          keep[v] = 1;
          var t = ch.ticks.get(v);
          if (!t) {
            t = { line: el('i', { class: v ? '' : 'zero' }), lab: el('span', { text: nf(v) }), gone: 0 };
            ch.ticks.set(v, t);
            ch.lines.appendChild(t.line); ch.axis.appendChild(t.lab);
            if (animate && prev) { // a new tick comes in from where the old scale had it
              t.line.style.left = t.lab.style.left = px(xAt(prev, v));
              t.line.style.opacity = t.lab.style.opacity = '0';
              void t.lab.offsetWidth;
            }
          }
          clearTimeout(t.gone);
          t.line.style.left = t.lab.style.left = px(xAt(L, v));
          t.line.style.opacity = t.lab.style.opacity = '';
        });
        ch.ticks.forEach(function (t, v) {
          if (keep[v]) return;
          if (!animate) { t.line.remove(); t.lab.remove(); ch.ticks.delete(v); return; }
          t.line.style.left = t.lab.style.left = px(xAt(L, v));
          t.line.style.opacity = t.lab.style.opacity = '0';
          clearTimeout(t.gone);
          t.gone = setTimeout(function () { t.line.remove(); t.lab.remove(); ch.ticks.delete(v); }, MOVE + 60);
        });
      }

      // ---------------------------------------------------------------- growing bars and counting numbers
      // the numbers follow their bar's own animation (its eased progress), so they always say what the bar shows
      var counting = [], raf = 0;
      function countUp() {
        raf = 0;
        counting = counting.filter(function (c) {
          var done = c.a.playState === 'finished' || c.a.playState === 'idle';
          var p = done ? 1 : c.a.effect.getComputedTiming().progress || 0;
          c.nums.forEach(function (x) { x[0].textContent = nf(Math.round(x[1] * p)); });
          return !done;
        });
        if (counting.length) raf = requestAnimationFrame(countUp);
      }
      // a row's bar grows from zero along the axis, its end number riding on it; at: ms already played
      function grow(row, delay, dur, at) {
        var o = row._, t = { duration: dur, delay: delay, easing: EASE, fill: 'backwards' };
        o.anims.forEach(function (a) { a.cancel(); });
        var a = o.bar.animate([{ clipPath: 'inset(0 100% 0 0 round 3px)' }, { clipPath: 'inset(0 0 0 0 round 3px)' }], t);
        o.anims = [a,
          o.val.animate([{ transform: 'translate(' + px(-o.g.bw) + ', -50%)' }, { transform: 'translate(0, -50%)' }], t),
          o.val.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.3, delay: delay, fill: 'backwards' })];
        if (o.g.inside) o.ems.forEach(function (em) { // the numbers inside appear as the bar reaches them
          o.anims.push(em.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur * 0.4, delay: delay + dur * 0.35, fill: 'backwards' }));
        });
        if (at) o.anims.forEach(function (x) { x.currentTime = at; });
        counting.push({ a: a, nums: o.nums });
        if (!raf) raf = requestAnimationFrame(countUp);
      }

      // the entrance: the print's bars hand over to bars that grow out of the axis, top to bottom across both charts
      var arrived = -1;
      function entrance(at) {
        var rows = [];
        [left, right].forEach(function (ch) { ch.rows.forEach(function (row) { if (!row.hidden) rows.push(row); }); });
        var ys = rows.map(function (row) { return row._.bar.getBoundingClientRect().top; });
        var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        rows.forEach(function (row, j) { grow(row, SWEEP * (ys[j] - y0) / (y1 - y0 || 1), GROW, at); });
      }
      k.onArrive(function () {
        if (!motion) return;
        arrived = document.timeline.currentTime;
        entrance(0);
      });

      // ---------------------------------------------------------------- hover, focus, tap
      // a top-n switch moves the chart under a resting pointer: that lights nothing until the pointer moves (on arrival
      // the stage does the same with the panel's is-settling)
      var calm = false;
      function still(e) {
        if (calm && e.type === 'pointermove' && (e.movementX || e.movementY)) calm = false;
        return calm;
      }
      // one bar lit: its label white, the other rows quieter, a guide from its end down to its value on the axis
      function hot(ch, i, part) {
        cancelAnimationFrame(ch.clr);
        if (ch.hot === i && ch.part === part) return;
        var old = ch.rows[ch.hot], row = ch.rows[i];
        if (old) old.classList.remove('is-hot', 'on-s', 'on-c');
        ch.hot = row ? i : -1; ch.part = row ? part : '';
        if (row) { row.classList.add('is-hot'); if (part) row.classList.add('on-' + part); }
        ch.list.classList.toggle('has-hot', !!row);
        guide(ch);
      }
      // cleared a frame later, so that moving to the next row glides there instead of blinking
      function cool(ch) {
        cancelAnimationFrame(ch.clr);
        ch.clr = requestAnimationFrame(function () { hot(ch, -1, ''); });
      }
      function guide(ch) {
        var i = ch.hot >= 0 ? ch.hot : ch.pin, row = ch.rows[i], L = ch.L;
        if (!row || row.hidden || row._.leaving) {
          ch.guide.classList.remove('on'); ch.tag.classList.remove('on');
          ch.ticks.forEach(function (t) { t.lab.classList.remove('is-near'); });
          return;
        }
        var r = row._.r, v = ch.hot === i && ch.part === 's' ? r.seed : r.seed + r.cited, x = L.x0 + v * L.scale;
        var b = row._.bar, top = b.offsetHeight; // the bar's bottom in the chart area (by offsets: the stage may be mid-morph)
        for (var e = b; e && e !== ch.area; e = e.offsetParent) top += e.offsetTop;
        var snap = !ch.guide.classList.contains('on'); // from nothing it appears in place; from another bar it glides
        if (snap) { ch.guide.classList.add('is-snap'); ch.tag.classList.add('is-snap'); }
        ch.guide.style.transform = 'translateX(' + px(x) + ')';
        ch.guide.style.top = px(top);
        ch.tag.textContent = nf(v);
        ch.tag.style.left = px(x);
        if (snap) { void ch.guide.offsetWidth; ch.guide.classList.remove('is-snap'); ch.tag.classList.remove('is-snap'); }
        ch.guide.classList.add('on'); ch.tag.classList.add('on');
        var half = textW(nf(v), 11, 600) / 2 + 5;
        ch.ticks.forEach(function (t, tv) { t.lab.classList.toggle('is-near', Math.abs(L.x0 + tv * L.scale - x) < half + textW(nf(tv), 11) / 2 + 8); });
      }

      function partOf(e) {
        var p = e.target.closest && e.target.closest('.ct-s, .ct-c');
        return p ? (p.classList.contains('ct-s') ? 's' : 'c') : '';
      }
      function hoverRow(ch, row, i, html) {
        var move = function (e) {
          if (e.pointerType === 'touch' || still(e)) return;
          var part = partOf(e), same = ch.hot === i && ch.part === part && e.type === 'pointermove';
          hot(ch, i, part);
          k.tip.show(e, same ? null : html(part));
        };
        row.addEventListener('pointerenter', move);
        row.addEventListener('pointermove', move);
        row.addEventListener('pointerleave', function (e) { if (e.pointerType === 'touch') return; k.tip.hide(); cool(ch); });
        row.addEventListener('focus', function (e) { hot(ch, i, ''); if (row.matches(':focus-visible')) k.tip.show(e, html('')); });
        row.addEventListener('blur', function () { k.tip.hide(); cool(ch); });
      }
      // the seed/cited split, the hovered part's line bright and the other's quiet
      function split(r, part) {
        var t = r.seed + r.cited;
        var line = function (p, v, what) {
          return '<span class="ct-tl' + (part && part !== p ? ' is-dim' : '') + '"><span class="ct-tsw ' + p + '"></span>' +
            nf(v) + ' in ' + what + ' (' + k.pct(v, t) + ')</span>';
        };
        return line('s', r.seed, 'seed papers') + line('c', r.cited, 'cited papers');
      }

      // the key: the part of every bar, while hovered or focused; a click (a tap) keeps it lit until the next one
      var keep = '';
      function light(part) {
        body.classList.toggle('hl-s', part === 's');
        body.classList.toggle('hl-c', part === 'c');
        keys.forEach(function (b) { b.classList.toggle('is-on', b.dataset.part === part); });
      }
      keys.forEach(function (b) {
        var p = b.dataset.part, tip = '<b>' + KEY[p][0] + '</b><br>' + KEY[p][1];
        var over = false, on = function (e) {
          if (e.pointerType === 'touch' || still(e)) return;
          if (over) { k.tip.show(e, null); return; }
          over = true; light(p); k.tip.show(e, tip);
        };
        b.addEventListener('pointerenter', on);
        b.addEventListener('pointermove', on);
        b.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch' && over) { over = false; light(keep); k.tip.hide(); } });
        b.addEventListener('focus', function (e) { if (b.matches(':focus-visible')) { light(p); k.tip.show(e, tip); } });
        b.addEventListener('blur', function () { light(keep); k.tip.hide(); });
        b.addEventListener('click', function () {
          keep = keep === p ? '' : p;
          keys.forEach(function (x) { x.setAttribute('aria-pressed', String(x.dataset.part === keep)); });
          light(keep || (over ? p : ''));
        });
      });

      // a field lit by a tap stays lit, with its tooltip, until the next tap outside the field rows
      var tapped = false;
      document.addEventListener('pointerdown', function (e) {
        if (tapped && !(e.target.closest && e.target.closest('.ct-left .ct-row'))) { tapped = false; k.tip.hide(); if (left) hot(left, -1, ''); }
      }, true);

      // ---------------------------------------------------------------- left: the fields
      function drawFields() {
        left = chart(leftHost, fieldRows, fieldRows.length, {
          rowH: ROW * 10 / fieldRows.length, barH: 24, axis: 'Extracted records', listRole: 'list', listLabel: 'Records by field',
          attrs: function (r) {
            return { role: 'listitem', tabindex: '0',
              'aria-label': r.label + ': ' + nf(r.seed + r.cited) + ' records, ' + nf(r.seed) + ' from seed papers and ' + nf(r.cited) + ' from cited papers. ' + MEANS[r.f.key][0] };
          },
          wire: function (row, r, i, ch) {
            var m = MEANS[r.f.key];
            var html = function (part) {
              return '<b>' + esc(r.label) + '</b> · ' + nf(r.seed + r.cited) + ' records' + split(r, part) +
                '<div class="ct-tmean">' + m[0] + '</div><div class="ct-tex">' + m[1](r.f.ex, esc(data.exampleTerm), nf) + '</div>';
            };
            hoverRow(ch, row, i, html);
            row.addEventListener('click', function (e) { var part = e.pointerType === 'touch' ? partOf(e) : ch.part; hot(ch, i, part); k.tip.show(e, html(part)); tapped = true; });
          }
        });
      }

      // ---------------------------------------------------------------- right: the terms
      function termOpt() {
        return {
          rowH: ROW, barH: 18, axis: 'Definitions', listRole: 'group', listLabel: 'Terms by definitions',
          attrs: function (r, i) {
            return { role: 'button', tabindex: '0', 'aria-expanded': 'false', 'aria-controls': 'ct-detail',
              'aria-label': '#' + (i + 1) + ' ' + r.label + ': ' + nf(r.seed + r.cited) + ' definitions from ' + nf(r.t.papers[0] + r.t.papers[1]) + ' papers' };
          },
          wire: function (row, r, i, ch) {
            var t = r.t;
            hoverRow(ch, row, i, function (part) {
              return '<b>' + esc(t.name) + '</b> <span class="k">#' + (i + 1) + '</span><br>' + nf(t.seed + t.cited) + ' definitions from ' +
                nf(t.papers[0] + t.papers[1]) + ' papers' + split(r, part);
            });
            var go = function () { k.tip.hide(); toggle(i); };
            row.addEventListener('click', go);
            row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
          }
        };
      }
      function drawTerms() {
        right = chart(rightHost, termRows, state.n, termOpt());
        show(false);
      }

      // the top 10, 25 or 50: the bars that stay glide to the new scale, the chart opens over the rows that come (their
      // bars growing as they appear) or closes over the rows that go (as they fade)
      function setN(n) {
        if (n === state.n) return;
        var closed = state.open >= n;
        state.n = n;
        if (closed) state.open = -1;
        [].forEach.call(sw.querySelectorAll('button'), function (b, i) { b.setAttribute('aria-pressed', String(CHOICES[i] === n)); });
        k.tip.hide();
        calm = true; // the chart grows or shrinks under the pointer
        var ch = right, area = ch.area, h0 = area.getBoundingClientRect().height, L = layout(ch, n);
        if (ch.sizing) { ch.sizing.cancel(); ch.sizing = null; area.classList.remove('is-sizing'); }
        if (ch.hot >= n) hot(ch, -1, '');
        if (L.stacked !== ch.L.stacked || !motion) { // the names move above the bars (or back): draw anew, and let it grow
          drawTerms();
          if (!motion) return;
          ch = right; area = ch.area;
          var h = area.offsetHeight, shown = ch.rows.filter(function (row) { return !row.hidden; });
          shown.forEach(function (row, j) { grow(row, SWEEP * j / shown.length, GROW, 0); });
          size(ch, h0, h);
          return;
        }
        ch.Lprev = ch.L; ch.L = L; ch.n = n;
        place(ch, true);
        var coming = [];
        ch.rows.forEach(function (row, i) {
          var o = row._;
          if (i < n) {
            if (o.leaving) { // it was going: it stays after all
              var op = getComputedStyle(row).opacity;
              if (o.fade) o.fade.cancel();
              o.fade = null; o.leaving = false;
              row.animate([{ opacity: op }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
            } else if (row.hidden) { row.hidden = false; coming.push(row); }
          } else if (!row.hidden && !o.leaving) {
            o.leaving = true;
            o.fade = row.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
          }
        });
        coming.forEach(function (row, j) { grow(row, 60 + SWEEP * j / coming.length, GROW * 0.85, 0); });
        if (closed) show(false); else guide(ch);
        // the height without the rows that go
        var going = ch.rows.filter(function (row) { return row._.leaving; });
        going.forEach(function (row) { row.style.display = 'none'; });
        var h1 = area.offsetHeight;
        going.forEach(function (row) { row.style.display = ''; });
        size(ch, h0, h1);
      }
      function size(ch, h0, h1) {
        var area = ch.area;
        area.classList.add('is-sizing');
        var s = ch.sizing = area.animate([{ height: px(h0) }, { height: px(h1) }], { duration: MOVE, easing: EASE, fill: 'forwards' });
        s.finished.then(function () {
          ch.rows.forEach(function (row) {
            var o = row._;
            if (o.leaving) { row.hidden = true; o.leaving = false; if (o.fade) o.fade.cancel(); o.fade = null; }
          });
          area.classList.remove('is-sizing'); s.cancel(); ch.sizing = null;
          guide(ch);
        }).catch(function () {});
      }

      function toggle(i) {
        state.open = state.open === i ? -1 : i;
        show(true);
      }

      // the open term: its row marked, its detail placed (or removed), the guide at its value
      function show(scroll) {
        var old = body.querySelector('.ct-detail');
        if (old) old.remove();
        right.list.classList.toggle('has-open', state.open >= 0);
        right.rows.forEach(function (row, j) { row.classList.toggle('is-open', j === state.open); row.setAttribute('aria-expanded', String(j === state.open)); });
        right.pin = state.open;
        if (state.open >= 0) {
          var box = detail(state.open);
          if (state.wide) slot.appendChild(box); else right.rows[state.open].after(box);
          if (scroll) box.scrollIntoView({ block: 'nearest', behavior: motion ? 'smooth' : 'auto' });
        }
        guide(right);
      }

      // Esc closes the open term (and only that: the stage stays open)
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || state.open < 0 || panel.hidden || !panel.closest('dialog[open]')) return;
        e.preventDefault(); e.stopPropagation();
        var i = state.open;
        toggle(i);
        right.rows[i].focus({ preventScroll: true });
      }, true);

      // ---------------------------------------------------------------- the detail of a clicked term
      function detail(i) {
        var t = terms[i], np = t.papers[0] + t.papers[1], nd = t.seed + t.cited, d = t.def;
        var box = el('div', { class: 'ct-detail', id: 'ct-detail', role: 'region', 'aria-label': t.name + ', details' });
        box.appendChild(el('div', { class: 'ct-dh' },
          el('h4', { class: 'ct-dname' }, t.name, el('small', { text: '#' + (i + 1) })),
          el('button', { type: 'button', class: 'ct-close', 'aria-label': 'Close', title: 'Close (Esc)', text: '×',
            onclick: function () { toggle(i); right.rows[i].focus({ preventScroll: true }); } })));

        var spell = el('dd', { class: 'ct-spell' });
        var addSp = function (list) { list.forEach(function (s) { spell.appendChild(el('span', {}, s[0], el('small', { text: nf(s[1]) }))); }); };
        addSp(t.spellings.slice(0, SPELL));
        if (t.spellings.length > SPELL) {
          var more = el('button', { type: 'button', class: 'ct-more', text: '+' + (t.spellings.length - SPELL), title: 'All ' + t.spellings.length + ' spellings',
            onclick: function () { more.remove(); addSp(t.spellings.slice(SPELL)); } });
          spell.appendChild(more);
        }
        var years = el('dd', { class: 'ct-years' });
        var ttl = d.title ? '“' + short(d.title, 80) + '”' : 'an untitled paper';
        var src = (d.shared > 1 ? nf(d.shared) + ' papers give this wording, among them ' : 'From ') + ttl +
          ' (' + (d.year || 'no year') + ', ' + (d.seed ? 'seed' : 'cited') + ' paper). ';

        box.appendChild(el('dl', { class: 'ct-dl' },
          el('dt', { text: 'Papers' }), el('dd', { html: '<b>' + nf(np) + '</b> · ' + nf(t.papers[0]) + ' seed, ' + nf(t.papers[1]) + ' cited · ' +
            k.f(nd / np, 1) + ' definitions each' }),
          el('dt', { text: 'Spellings', title: 'Merged into this term; the number is the papers that write each' }), spell,
          el('dt', { text: 'Years' }), years,
          el('dt', { text: 'Definition' }), el('dd', {}, el('blockquote', { text: '“' + d.text + '”' }),
            el('p', { class: 'ct-src' }, src, el('a', { class: 'fig-link', href: k.explorer('concepts'), target: '_blank', rel: 'noopener',
              title: 'The MBDef Explorer: search “' + t.name + '” for every definition with its paper', text: 'Explorer →' })))));
        drawYears(years, t);
        return box;
      }

      // the term's papers by year, a small stacked histogram: one bin before 2000, then one per year
      function drawYears(host, t) {
        var bins = data.yearBins, hs = t.hist[0], hc = t.hist[1], nb = bins.length;
        var H = 30, bw = 8, w = bw * nb;
        var mx = Math.max.apply(null, hs.map(function (v, j) { return v + hc[j]; })) || 1;
        var svg = k.svg('svg', { width: w, height: H + 15, viewBox: '0 0 ' + w + ' ' + (H + 15), class: 'ct-hist', role: 'img',
          'aria-label': 'Papers per year: from ' + t.years[0] + ' to ' + t.years[1] + ', half of them between ' + t.mid[0] + ' and ' + t.mid[1] + '.' });
        for (var j = 0; j < nb; j++) {
          var s = hs[j], c = hc[j], hS = H * s / mx, hC = H * c / mx, x = j * bw;
          var g = k.svg('g', {},
            k.svg('rect', { x: x, y: 0, width: bw, height: H, class: 'hit' }),
            s ? k.svg('rect', { x: x + 0.5, y: H - hS, width: bw - 1, height: hS, class: 's' }) : null,
            c ? k.svg('rect', { x: x + 0.5, y: H - hS - hC, width: bw - 1, height: hC, class: 'c' }) : null);
          (function (lab, s, c) {
            g.addEventListener('pointerenter', function (e) { k.tip.show(e, '<b>' + (lab[0] === '<' ? 'before ' + lab.slice(1) : lab) + '</b>: ' + nf(s + c) + ' paper' + (s + c === 1 ? '' : 's') + '<br>' + nf(s) + ' seed, ' + nf(c) + ' cited'); });
            g.addEventListener('pointerleave', k.tip.hide);
          })(bins[j], s, c);
          svg.appendChild(g);
        }
        svg.appendChild(k.svg('line', { x1: 0, x2: w, y1: H + 0.5, y2: H + 0.5, class: 'base' }));
        [[0, 'start'], [bins.indexOf('2010'), 'middle'], [nb - 1, 'end']].forEach(function (p) {
          var j = p[0];
          if (j >= 0) svg.appendChild(k.svg('text', { x: p[1] === 'start' ? 0 : p[1] === 'end' ? w : j * bw + bw / 2, y: H + 13, 'text-anchor': p[1], text: bins[j] }));
        });
        host.appendChild(el('span', { class: 'ct-yr', text: t.years[0] + '–' + t.years[1] + ' · half ' + t.mid[0] + (t.mid[1] !== t.mid[0] ? '–' + t.mid[1] : '') +
          (t.noyear ? ' · ' + nf(t.noyear) + ' without a year' : '') }));
        host.appendChild(svg);
      }

      k.onResize(function (w) {
        var wide = w >= 860, same = !!left && wide === state.wide;
        state.wide = wide;
        grid.classList.toggle('is-wide', wide);
        // the same charts at a new width (a scroll bar appearing, a window resized): everything glides to its place
        var next = same && [left, right].map(function (ch) { return layout(ch, ch.n); });
        if (same && next[0].stacked === left.L.stacked && next[1].stacked === right.L.stacked) {
          [left, right].forEach(function (ch, j) { ch.Lprev = ch.L; ch.L = next[j]; place(ch, motion); guide(ch); });
          return;
        }
        drawFields();
        drawTerms();
        // a resize while the bars are still growing (the stage's scroll bar appearing, say) carries the entrance on
        var at = arrived >= 0 ? document.timeline.currentTime - arrived : Infinity;
        if (motion && at < SWEEP + GROW) entrance(at);
      });

      // ---------------------------------------------------------------- every printed number against the data
      // fields (seed, cited, total) and the ten printed terms (name, seed, cited, total); a difference shows as one † line
      var nums = 0, same = 0, diffs = [];
      function cmp(name, pairs) {
        pairs.forEach(function (p) { nums++; if (p[0] === p[1]) same++; else diffs.push(name + ' ' + nf(p[0]) + ' (printed ' + nf(p[1]) + ')'); });
      }
      data.fields.forEach(function (f) { cmp(f.name, [[f.seed, f.printed[0]], [f.cited, f.printed[1]], [f.seed + f.cited, f.printed[0] + f.printed[1]]]); });
      terms.forEach(function (t) {
        if (!t.printed) return;
        cmp(t.name, [[t.seed, t.printed[1]], [t.cited, t.printed[2]], [t.seed + t.cited, t.printed[1] + t.printed[2]]]);
        if (t.name !== t.printed[0]) diffs.push('“' + t.printed[0] + '” is named “' + t.name + '”');
      });
      if (diffs.length) body.appendChild(el('p', { class: 'ct-diff', text: '† Differs from the print: ' + diffs.join('; ') + '.' }));

      k.method(
        '<p><b>Left</b>, definitions are the rows of MBDef’s <code>definitions</code> table; every other field counts the items papers list for a term in the <code>instances</code> table. ' +
        '<b>Right</b>, the definitions per merged term (the <code>concepts</code> table, which joins spellings that differ only in case, punctuation, plural, British or American spelling and word order), ranked, ties by name, and named as the paper prints them: the most used lower-case spelling, in the singular. ' +
        'Grey or blue is the paper’s group in the <code>papers</code> table: one of the ' + nf(T.seedPapers) + ' seed papers, or one of the ' + nf(T.citedPapers) + ' papers they cite (the paper’s closure papers). ' +
        'A field’s tooltip example is the item of <i>' + esc(data.exampleTerm) + '</i> the most papers state.</p>' +
        '<p><b>A term’s detail</b>: the distinct papers with a definition of it, its spellings with the papers that write each (<code>terms</code> table), and their years as the <code>papers</code> table records them (' +
        nf(T.noYear) + ' of the ' + nf(T.papers) + ' papers have none, and a few look wrong: “' + esc(data.earliest.title) + '” is dated ' + data.earliest.year + '). ' +
        'The definition shown is, of the term’s definitions of 3 to 40 words, the wording the most papers give; on a tie, the one whose paper MBDef’s relevance score ranks highest, then the shorter. ' +
        '<code>scripts/figs/content.py</code> computes every number from the released tables and checks it against the print: ' +
        (diffs.length ? same + ' of ' + nums + ' numbers match (†).' : 'all ' + nums + ' printed numbers and the ten printed names match.') + '</p>');
    }
  });
})();
