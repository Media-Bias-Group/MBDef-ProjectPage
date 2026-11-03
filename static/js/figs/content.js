/* Fig. 3, interactive: the printed figure come alive. Left, the extracted records by field; right, the terms with the
   most definitions (top 10, 25 or 50); every bar split into seed papers (grey) and cited papers (blue), with the
   printed numbers at its end. Hover or focus shows the numbers; a click on a term opens its papers, spellings, years
   and one definition (beside the chart on a wide screen, under its bar on a phone), and a second click, × or Esc
   closes it. Data: static/data/figs/content.json, written by scripts/figs/content.py from MBDef's released tables. */
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

  var ctx = null;
  function textW(s, size, weight) {
    if (!ctx) ctx = document.createElement('canvas').getContext('2d');
    ctx.font = (weight || 400) + ' ' + (size || 12) + 'px ' + FONT;
    return ctx.measureText(s).width;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function short(s, n) { return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; }

  // tick values 0, step, 2·step, … up to vmax (never past it), with step 1, 2, 2.5 or 5 × 10^k and at least minGap px apart
  function ticks(vmax, px, minGap) {
    var raw = minGap * vmax / px, p = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (m) { return m * p; }).filter(function (s) { return s >= raw; })[0];
    var out = [];
    for (var v = 0; v <= vmax + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }

  FIG.register('content', {
    build: function (panel, data, k) {
      var nf = k.nf, el = k.el, T = data.totals, terms = data.terms;
      var state = { n: 10, open: -1, wide: false };

      // ---------------------------------------------------------------- two charts, as printed
      var body = k.body();
      body.classList.add('ct');
      var grid = el('div', { class: 'ct-grid' });
      var left = el('section', { class: 'ct-chart ct-left', 'aria-label': 'Extracted records by field' });
      var right = el('section', { class: 'ct-chart', 'aria-label': 'Terms with the most definitions' });
      grid.appendChild(left); grid.appendChild(right); body.appendChild(grid);

      left.appendChild(el('div', { class: 'ct-h' },
        el('h3', { class: 'ct-eye', text: 'Records by field' }),
        el('p', { class: 'ct-key', title: nf(T.seedPapers) + ' seed papers, the media-bias literature the collection started from; ' +
          nf(T.citedPapers) + ' papers they cite' },
          el('span', {}, el('i', { class: 's' }), 'Seed papers'), el('span', {}, el('i', { class: 'c' }), 'Cited papers'))));
      var leftRows = el('div', { class: 'ct-plot' });
      var slot = el('div', { class: 'ct-slot' }); // a term's detail on a wide screen: beside the terms, under the fields
      left.appendChild(leftRows); left.appendChild(slot);

      var sw = el('div', { class: 'ct-n', role: 'group', 'aria-label': 'Terms shown' }, el('span', { 'aria-hidden': 'true', text: 'Top' }));
      CHOICES.forEach(function (n) {
        sw.appendChild(el('button', { type: 'button', 'aria-pressed': String(n === state.n), 'aria-label': 'Top ' + n, title: 'The top ' + n + ' terms',
          text: String(n), onclick: function () { setN(n); } }));
      });
      right.appendChild(el('div', { class: 'ct-h' }, el('h3', { class: 'ct-eye', text: 'Terms with the most definitions' }), sw));
      var rightRows = el('div', { class: 'ct-plot' });
      right.appendChild(rightRows);

      function setN(n) {
        state.n = n;
        if (state.open >= n) state.open = -1;
        [].forEach.call(sw.querySelectorAll('button'), function (b, i) { b.setAttribute('aria-pressed', String(CHOICES[i] === n)); });
        drawTerms();
      }

      // ---------------------------------------------------------------- one bar chart (HTML rows on a px scale)
      // rows: [{label, seed, cited}]; opt: {rowH, barH, axis, listRole, listLabel, attrs(r, i), wire(rowEl, r, i)}
      function bars(host, rows, opt) {
        host.textContent = '';
        var W = host.clientWidth || 600, gap = 12;
        var labW = Math.ceil(Math.max.apply(null, rows.map(function (r) { return textW(r.label, 13, 500); }))) + 4;
        var stacked = labW > W * 0.36; // long names go above their bars
        var x0 = stacked ? 0 : labW + gap, trackW = W - x0;
        var vmax = Math.max.apply(null, rows.map(function (r) { return r.seed + r.cited; }));
        var scale = (trackW - Math.ceil(textW(nf(vmax), 12, 600)) - 10) / vmax;
        host.classList.toggle('is-stacked', stacked);
        host.style.setProperty('--x0', x0 + 'px');
        host.style.setProperty('--row', (stacked ? opt.barH + 30 : opt.rowH) + 'px');
        host.style.setProperty('--bar', opt.barH + 'px');

        var tv = ticks(vmax, vmax * scale, Math.max(56, textW(nf(vmax), 11) + 18));
        var lines = el('div', { class: 'ct-lines', 'aria-hidden': 'true' });
        tv.forEach(function (v) { lines.appendChild(el('i', { class: v ? '' : 'zero', style: 'left:' + (x0 + v * scale).toFixed(1) + 'px' })); });
        var list = el('div', { class: 'ct-rows', role: opt.listRole, 'aria-label': opt.listLabel });
        host.appendChild(el('div', { class: 'ct-area' }, lines, list));

        var rowEls = rows.map(function (r, i) {
          var tot = r.seed + r.cited, ws = r.seed * scale, wc = r.cited * scale, bw = ws + wc;
          var sl = nf(r.seed), cl = nf(r.cited), fit = function (w, s) { return w >= textW(s, 11.5, 500) + 10 && opt.barH >= 15; };
          // as printed: the two numbers inside the bar when both fit, else "total (seed, cited)" after it when there is room
          var inside = fit(ws, sl) && fit(wc, cl), after = nf(tot);
          if (!inside && trackW - bw - 6 >= textW(after + ' (' + sl + ', ' + cl + ')', 12, 600) + 4) after += ' (' + sl + ', ' + cl + ')';
          var row = el('div', Object.assign({ class: 'ct-row' }, opt.attrs(r, i)),
            el('span', { class: 'ct-lab', text: r.label }),
            el('span', { class: 'ct-track' },
              el('span', { class: 'ct-bar', style: 'width:' + bw.toFixed(1) + 'px' },
                el('i', { class: 'ct-s', style: 'width:' + ws.toFixed(1) + 'px' }, inside ? el('em', { text: sl }) : null),
                el('i', { class: 'ct-c', style: 'width:' + wc.toFixed(1) + 'px' }, inside ? el('em', { text: cl }) : null)),
              el('span', { class: 'ct-val', style: 'left:' + (bw + 6).toFixed(1) + 'px', text: after })));
          list.appendChild(row);
          opt.wire(row, r, i);
          return row;
        });

        var axis = el('div', { class: 'ct-axis', 'aria-hidden': 'true' });
        tv.forEach(function (v) { axis.appendChild(el('span', { style: 'left:' + (x0 + v * scale).toFixed(1) + 'px', text: nf(v) })); });
        host.appendChild(axis);
        host.appendChild(el('p', { class: 'ct-axt', style: 'padding-left:' + x0 + 'px', text: opt.axis }));
        return { list: list, rows: rowEls };
      }

      function tipOn(node, html) {
        var show = function (e) { if (e.pointerType !== 'touch') k.tip.show(e, html()); };
        node.addEventListener('pointerenter', show);
        node.addEventListener('pointermove', show);
        node.addEventListener('pointerleave', k.tip.hide);
        node.addEventListener('focus', function (e) { k.tip.show(e, html()); });
        node.addEventListener('blur', k.tip.hide);
      }
      function split(r) {
        var t = r.seed + r.cited;
        return '<span class="ct-tsw s"></span>' + nf(r.seed) + ' in seed papers (' + k.pct(r.seed, t) + ')<br>' +
          '<span class="ct-tsw c"></span>' + nf(r.cited) + ' in cited papers (' + k.pct(r.cited, t) + ')';
      }

      // a field's tooltip opened by a tap stays until the next tap outside the field rows
      var tapTip = false;
      document.addEventListener('pointerdown', function (e) {
        if (tapTip && !(e.target.closest && e.target.closest('.ct-row[role="listitem"]'))) { tapTip = false; k.tip.hide(); }
      }, true);

      // ---------------------------------------------------------------- left: the fields
      function drawFields() {
        var rows = data.fields.map(function (f) { return { label: f.name, seed: f.seed, cited: f.cited, f: f }; });
        bars(leftRows, rows, {
          rowH: ROW * 10 / rows.length, barH: 24, axis: 'Extracted records', listRole: 'list', listLabel: 'Records by field',
          attrs: function (r) {
            return { role: 'listitem', tabindex: '0',
              'aria-label': r.label + ': ' + nf(r.seed + r.cited) + ' records, ' + nf(r.seed) + ' from seed papers and ' + nf(r.cited) + ' from cited papers. ' + MEANS[r.f.key][0] };
          },
          wire: function (row, r) {
            var m = MEANS[r.f.key];
            var html = function () {
              return '<b>' + esc(r.label) + '</b> · ' + nf(r.seed + r.cited) + ' records<br>' + split(r) +
                '<div class="ct-tmean">' + m[0] + '</div><div class="ct-tex">' + m[1](r.f.ex, esc(data.exampleTerm), nf) + '</div>';
            };
            tipOn(row, html);
            row.addEventListener('click', function (e) { k.tip.show(e, html()); tapTip = true; });
          }
        });
      }

      // ---------------------------------------------------------------- right: the terms
      var termRows = null;
      function drawTerms() {
        var rows = terms.slice(0, state.n).map(function (t) { return { label: t.name, seed: t.seed, cited: t.cited, t: t }; });
        termRows = bars(rightRows, rows, {
          rowH: ROW, barH: 18, axis: 'Definitions', listRole: 'group', listLabel: 'Terms by definitions',
          attrs: function (r, i) {
            return { role: 'button', tabindex: '0', 'aria-expanded': 'false', 'aria-controls': 'ct-detail',
              'aria-label': '#' + (i + 1) + ' ' + r.label + ': ' + nf(r.seed + r.cited) + ' definitions from ' + nf(r.t.papers[0] + r.t.papers[1]) + ' papers' };
          },
          wire: function (row, r, i) {
            var t = r.t;
            tipOn(row, function () {
              return '<b>' + esc(t.name) + '</b> <span class="k">#' + (i + 1) + '</span><br>' + nf(t.seed + t.cited) + ' definitions from ' +
                nf(t.papers[0] + t.papers[1]) + ' papers<br>' + split(r);
            });
            var go = function () { k.tip.hide(); toggle(i); };
            row.addEventListener('click', go);
            row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
          }
        });
        show(false);
      }

      function toggle(i) {
        state.open = state.open === i ? -1 : i;
        show(true);
      }

      // the open term: its row marked, its detail placed (or removed)
      function show(scroll) {
        var old = body.querySelector('.ct-detail');
        if (old) old.remove();
        termRows.list.classList.toggle('has-open', state.open >= 0);
        termRows.rows.forEach(function (row, j) { row.classList.toggle('is-open', j === state.open); row.setAttribute('aria-expanded', String(j === state.open)); });
        if (state.open < 0) return;
        var box = detail(state.open);
        if (state.wide) slot.appendChild(box); else termRows.rows[state.open].after(box);
        if (scroll) box.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' });
      }

      // Esc closes the open term (and only that: the stage stays open)
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || state.open < 0 || panel.hidden || !panel.closest('dialog[open]')) return;
        e.preventDefault(); e.stopPropagation();
        var i = state.open;
        toggle(i);
        termRows.rows[i].focus({ preventScroll: true });
      }, true);

      // ---------------------------------------------------------------- the detail of a clicked term
      function detail(i) {
        var t = terms[i], np = t.papers[0] + t.papers[1], nd = t.seed + t.cited, d = t.def;
        var box = el('div', { class: 'ct-detail', id: 'ct-detail', role: 'region', 'aria-label': t.name + ', details' });
        box.appendChild(el('div', { class: 'ct-dh' },
          el('h4', { class: 'ct-dname' }, t.name, el('small', { text: '#' + (i + 1) })),
          el('button', { type: 'button', class: 'ct-close', 'aria-label': 'Close', title: 'Close (Esc)', text: '×',
            onclick: function () { toggle(i); termRows.rows[i].focus({ preventScroll: true }); } })));

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
        state.wide = w >= 860;
        grid.classList.toggle('is-wide', state.wide);
        drawFields();
        drawTerms();
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
