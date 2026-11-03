/* Fig. 3, interactive: what MBDef holds (the extracted records by field) and which terms papers define most (top 10,
   25 or 50), each bar split into seed papers (grey) and cited papers (blue). Built with the figure kit (figkit.js).
   Data: static/data/figs/content.json, written by scripts/figs/content.py from MBDef's released tables; the script
   also records the printed figure's numbers, so this page can say whether every one of them matches. */
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
      var nf = k.nf, el = k.el, T = data.totals, terms = data.terms, ex = terms[0];
      var state = { n: 10, open: -1, played: !k.motion, width: 0 };

      // ---------------------------------------------------------------- the head
      var defShare = k.pct(T.definitions, T.records);
      k.head({
        fig: 'Fig. 3',
        title: 'What does MBDef hold, and which terms do papers define most?',
        lead: 'Half of the ' + nf(T.records) + ' records extracted from ' + nf(T.papers) + ' papers are definitions; the rest describe each term and link it to others. ' +
          'Papers define <i>' + esc(ex.name) + '</i> most, then <i>' + esc(terms[1].name) + '</i> and <i>' + esc(terms[2].name) + '</i>.',
        stats: [
          { value: nf(T.records), label: 'records extracted' },
          { value: defShare, label: 'of them definitions' },
          { value: nf(ex.seed + ex.cited), label: 'definitions of ' + ex.name }
        ]
      });

      // ---------------------------------------------------------------- the body: legend, two charts
      var body = k.body();
      body.classList.add('ct');
      body.appendChild(el('div', { class: 'fig-legend ct-legend' },
        el('span', {}, el('i', { class: 'ct-sw-s' }), el('b', { text: 'Seed papers' }), ': the ' + nf(T.seedPapers) + ' media-bias papers the collection started from'),
        el('span', {}, el('i', { class: 'ct-sw-c' }), el('b', { text: 'Cited papers' }), ': the ' + nf(T.citedPapers) + ' papers they cite, added by following the citations (the closure)')));

      var grid = el('div', { class: 'ct-grid' });
      var left = el('section', { class: 'ct-chart', 'aria-label': 'Extracted records by field' });
      var right = el('section', { class: 'ct-chart', 'aria-label': 'Terms with the most definitions' });
      grid.appendChild(left); grid.appendChild(right); body.appendChild(grid);

      left.appendChild(el('div', { class: 'ct-h' }, el('div', {},
        el('p', { class: 'ct-eye', text: 'Records by field' }),
        el('p', { class: 'ct-sub', text: 'Every item extracted from the papers, by kind. Point at a bar for what the kind means.' }))));
      var leftRows = el('div', { class: 'ct-plot' });
      left.appendChild(leftRows);

      var chips = el('div', { class: 'fig-chips ct-chips', role: 'group', 'aria-label': 'How many terms to show' });
      CHOICES.forEach(function (n) {
        chips.appendChild(el('button', { type: 'button', class: 'fig-chip', 'aria-pressed': String(n === state.n), text: 'Top ' + n,
          onclick: function () { setN(n); } }));
      });
      right.appendChild(el('div', { class: 'ct-h' }, el('div', {},
        el('p', { class: 'ct-eye', text: 'Terms with the most definitions' }),
        el('p', { class: 'ct-sub', text: 'Click a term for its papers, spellings, years and one definition.' })), chips));
      var rightRows = el('div', { class: 'ct-plot' });
      right.appendChild(rightRows);

      function setN(n) {
        state.n = n;
        if (state.open >= n) state.open = -1;
        [].forEach.call(chips.children, function (b, i) { b.setAttribute('aria-pressed', String(CHOICES[i] === n)); });
        drawTerms();
      }

      // ---------------------------------------------------------------- one bar chart (HTML rows on a px scale)
      // rows: [{label, seed, cited}]; opt: {rowH, barH, axis, listRole, listLabel, attrs(r, i), wire(rowEl, r, i)}
      function bars(host, rows, opt) {
        host.textContent = '';
        var W = host.clientWidth || 600, gap = 12;
        var labW = Math.ceil(Math.max.apply(null, rows.map(function (r) { return textW(r.label, 13, 500); }))) + 4;
        var stacked = labW > W * 0.36;
        var x0 = stacked ? 0 : labW + gap;
        var trackW = W - x0;
        var vmax = Math.max.apply(null, rows.map(function (r) { return r.seed + r.cited; }));
        var reserve = Math.ceil(textW(nf(vmax), 12, 600)) + 10;
        var scale = (trackW - reserve) / vmax;
        host.classList.toggle('is-stacked', stacked);
        host.style.setProperty('--x0', x0 + 'px');
        host.style.setProperty('--row', (stacked ? opt.barH + 30 : opt.rowH) + 'px');
        host.style.setProperty('--bar', opt.barH + 'px');

        var tv = ticks(vmax, trackW - reserve, Math.max(56, textW(nf(vmax), 11) + 18));
        var lines = el('div', { class: 'ct-lines', 'aria-hidden': 'true' });
        tv.forEach(function (v) { lines.appendChild(el('i', { class: v ? '' : 'zero', style: 'left:' + (x0 + v * scale).toFixed(1) + 'px' })); });
        var list = el('div', { class: 'ct-rows', role: opt.listRole, 'aria-label': opt.listLabel });
        host.appendChild(el('div', { class: 'ct-area' }, lines, list));

        var rowEls = rows.map(function (r, i) {
          var tot = r.seed + r.cited, ws = r.seed * scale, wc = r.cited * scale, bw = ws + wc;
          var sl = nf(r.seed), cl = nf(r.cited), fit = function (w, s) { return w >= textW(s, 11.5, 500) + 10 && opt.barH >= 15; };
          // as in the printed figure: the two numbers inside the bar when both fit, else after its total when there is room
          var inS = fit(ws, sl) && fit(wc, cl), inC = inS, after = nf(tot);
          if (!inS && trackW - bw - 6 >= textW(after + ' (' + sl + ', ' + cl + ')', 12, 600) + 4) after += ' (' + sl + ', ' + cl + ')';
          var row = el('div', Object.assign({ class: 'ct-row', style: '--d:' + (i * 40) + 'ms' }, opt.attrs(r, i)),
            el('span', { class: 'ct-lab', text: r.label, title: r.label }),
            el('span', { class: 'ct-track' },
              el('span', { class: 'ct-bar', style: 'width:' + bw.toFixed(1) + 'px' },
                el('i', { class: 'ct-s', style: 'width:' + ws.toFixed(1) + 'px' }, inS ? el('em', { text: sl }) : null),
                el('i', { class: 'ct-c', style: 'width:' + wc.toFixed(1) + 'px' }, inC ? el('em', { text: cl }) : null)),
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
        node.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch') k.tip.show(e, html()); });
        node.addEventListener('pointermove', function (e) { if (e.pointerType !== 'touch') k.tip.show(e, html()); });
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
          rowH: 34, barH: 22, axis: 'Extracted records', listRole: 'list', listLabel: 'Records by field',
          attrs: function (r) {
            var m = MEANS[r.f.key];
            return { role: 'listitem', tabindex: '0',
              'aria-label': r.label + ': ' + nf(r.seed + r.cited) + ' records, ' + nf(r.seed) + ' from seed papers and ' + nf(r.cited) + ' from cited papers. ' + m[0] };
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
        var rows = terms.slice(0, state.n).map(function (t, i) { return { label: t.name, seed: t.seed, cited: t.cited, t: t, i: i }; });
        termRows = bars(rightRows, rows, {
          rowH: 27, barH: 18, axis: 'Definitions', listRole: 'group', listLabel: 'Terms by definitions; each opens its details',
          attrs: function (r, i) {
            return { role: 'button', tabindex: '0', 'aria-expanded': String(state.open === i), 'aria-controls': 'ct-detail',
              'aria-label': '#' + (i + 1) + ' ' + r.label + ': ' + nf(r.seed + r.cited) + ' definitions from ' + nf(r.t.papers[0] + r.t.papers[1]) + ' papers. Press to open its details.' };
          },
          wire: function (row, r, i) {
            var t = r.t, np = t.papers[0] + t.papers[1];
            tipOn(row, function () {
              return '<b>' + esc(t.name) + '</b> · #' + (i + 1) + ' · ' + nf(t.seed + t.cited) + ' definitions<br>' + split(r) +
                '<div class="ct-tmean">Defined by <b>' + nf(np) + '</b> distinct papers (' + nf(t.papers[0]) + ' seed, ' + nf(t.papers[1]) + ' cited), ' +
                k.f((t.seed + t.cited) / np, 1) + ' definitions per paper.</div><div class="ct-tex">' + (state.open === i ? 'Click to close.' : 'Click for its spellings, years and one definition.') + '</div>';
            });
            var go = function () { k.tip.hide(); toggle(i); };
            row.addEventListener('click', go);
            row.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
          }
        });
        termRows.rows.forEach(function (row, i) { row.classList.toggle('is-open', i === state.open); });
        if (state.open >= 0) placeDetail(false);
        reveal();
      }

      function toggle(i) {
        state.open = state.open === i ? -1 : i;
        termRows.rows.forEach(function (row, j) { row.classList.toggle('is-open', j === state.open); row.setAttribute('aria-expanded', String(j === state.open)); });
        var old = rightRows.querySelector('.ct-detail');
        if (old) old.remove();
        if (state.open >= 0) placeDetail(true);
      }

      // ---------------------------------------------------------------- the detail line under a clicked term
      function placeDetail(scroll) {
        var i = state.open, t = terms[i], row = termRows.rows[i], np = t.papers[0] + t.papers[1], nd = t.seed + t.cited;
        var box = el('div', { class: 'ct-detail', id: 'ct-detail', role: 'region', 'aria-label': 'Details of ' + t.name });
        var close = el('button', { type: 'button', class: 'ct-close', 'aria-label': 'Close the details', text: '×', onclick: function () { toggle(i); row.focus(); } });
        box.appendChild(el('div', { class: 'ct-dh' },
          el('div', {}, el('p', { class: 'ct-eye', text: '#' + (i + 1) + ' of ' + nf(T.terms) + ' terms by definitions' }),
            el('h4', { class: 'ct-dname', text: t.name })), close));

        var spell = el('span', { class: 'ct-spell' });
        t.spellings.forEach(function (s, j) {
          spell.appendChild(el('span', {}, el('q', { text: s[0] }), ' ', el('small', { text: nf(s[1]) })));
        });
        var yrs = el('div', { class: 'ct-years' });
        var defn = t.def, ttl = defn.title ? '“' + short(defn.title, 90) + '”' : 'an untitled paper';
        var src = defn.shared > 1
          ? 'The wording ' + nf(defn.shared) + ' papers give; here from ' + ttl
          : 'No two papers share a wording; this one is from the paper whose use of the term MBDef scores as most relevant to media bias, ' + ttl;
        src += ' (' + (defn.year || 'no year') + ', ' + (defn.seed ? 'seed' : 'cited') + ' paper).';

        var dl = el('dl', { class: 'ct-dl' },
          el('dt', { text: 'Papers' }), el('dd', { html: '<b>' + nf(np) + '</b> papers define it: ' + nf(t.papers[0]) + ' seed, ' + nf(t.papers[1]) + ' cited. ' +
            nf(nd) + ' definitions, ' + k.f(nd / np, 1) + ' per paper.' }),
          el('dt', { text: 'Spellings' }), el('dd', {}, spell, el('span', { class: 'ct-note', text: t.spellings.length > 1 ? ' merged into one term; the number is the papers that write each' : ' papers' })),
          el('dt', { text: 'Years' }), el('dd', {}, yrs),
          el('dt', { text: 'A definition' }), el('dd', {}, el('blockquote', { text: '“' + defn.text + '”' }), el('p', { class: 'ct-note', text: src })));
        box.appendChild(dl);
        box.appendChild(el('p', { class: 'ct-go' },
          el('a', { class: 'fig-link', href: k.explorer('concepts'), target: '_blank', rel: 'noopener', text: 'Search it in the MBDef Explorer →' }),
          el('span', { class: 'ct-note', text: ' type “' + t.name + '” in its search: it shows every definition with its paper.' })));
        row.after(box);
        drawYears(yrs, t, box);
        if (scroll && box.scrollIntoView) {
          var r = box.getBoundingClientRect();
          if (r.bottom > window.innerHeight) box.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' });
        }
      }

      // the term's papers by year, a small stacked histogram: one bin before 2000, then one per year
      function drawYears(host, t, box) {
        var bins = data.yearBins, hs = t.hist[0], hc = t.hist[1], nb = bins.length;
        var W = Math.min(380, Math.max(200, host.clientWidth || 300)), H = 46, bw = Math.floor((W - 2) / nb), w = bw * nb;
        var mx = Math.max.apply(null, hs.map(function (v, j) { return v + hc[j]; })) || 1;
        var svg = k.svg('svg', { width: w, height: H + 16, viewBox: '0 0 ' + w + ' ' + (H + 16), class: 'ct-hist', role: 'img',
          'aria-label': 'Papers per year: from ' + t.years[0] + ' to ' + t.years[1] + ', half of them between ' + t.mid[0] + ' and ' + t.mid[1] + '.' });
        for (var j = 0; j < nb; j++) {
          var s = hs[j], c = hc[j], hS = H * s / mx, hC = H * c / mx, x = j * bw;
          var g = k.svg('g', { class: 'ct-hb' },
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
        [0, bins.indexOf('2010'), bins.indexOf('2020'), nb - 1].forEach(function (j, q) {
          if (j < 0) return;
          var anchor = q === 0 ? 'start' : q === 3 ? 'end' : 'middle', x = q === 0 ? 0 : q === 3 ? w : j * bw + bw / 2;
          svg.appendChild(k.svg('text', { x: x, y: H + 13, 'text-anchor': anchor, text: bins[j] }));
        });
        host.appendChild(svg);
        host.appendChild(el('p', { class: 'ct-note', html: 'From ' + t.years[0] + ' to ' + t.years[1] + '; half of its papers from ' + t.mid[0] +
          (t.mid[1] !== t.mid[0] ? ' to ' + t.mid[1] : '') + '.' + (t.noyear ? ' ' + nf(t.noyear) + ' paper' + (t.noyear === 1 ? ' has' : 's have') + ' no year in the data.' : '') }));
      }

      // ---------------------------------------------------------------- one entrance: the bars grow when the chart is first seen
      function reveal() {
        if (state.played) { body.classList.remove('ct-pre'); return; }
        body.classList.add('ct-pre');
        if (reveal.io) return;
        var go = function () { state.played = true; requestAnimationFrame(function () { requestAnimationFrame(function () { body.classList.remove('ct-pre'); }); }); };
        if (!('IntersectionObserver' in window)) { go(); return; }
        reveal.io = new IntersectionObserver(function (es) {
          if (es.some(function (e) { return e.isIntersecting; })) { reveal.io.disconnect(); go(); }
        }, { threshold: 0.3 });
        reveal.io.observe(leftRows);   // the short chart: a tall terms list could never be a quarter on screen
      }

      k.onResize(function (w) {
        grid.classList.toggle('is-wide', w >= 860);
        drawFields();
        drawTerms();
      });

      // ---------------------------------------------------------------- notes and method
      var np0 = ex.papers[0] + ex.papers[1], top = ex.spellings[0], mb = data.mediaBias, hs = terms.filter(function (t) { return t.label === 'hate speech'; })[0];
      var fr = terms.filter(function (t) { return t.name === 'frame'; })[0], fg = terms.filter(function (t) { return t.name === 'framing'; })[0];
      k.notes({
        what: 'Left: the <b>' + nf(T.records) + ' records</b> extracted from the papers, by field. A record is one item a paper states about a term: a definition, or an item of six other fields (descriptions, synonyms, related terms, subtypes, supertypes, examples). ' +
          'Right: the terms with the most definitions. A <b>term</b> merges the spellings papers use for it (<i>Fake news</i>, <i>fake-news</i>, …). ' +
          'Grey counts what <b>seed papers</b> gave, blue what <b>cited papers</b> gave.',
        why: 'Definitions are ' + defShare + ' of all records, so MBDef is first a collection of competing definitions with their sources; the other fields place each term among its neighbours. ' +
          'The most defined terms are <i>' + esc(ex.name) + '</i>, <i>' + esc(terms[1].name) + '</i> and <i>' + esc(terms[2].name) + '</i>: papers define the phenomena around media bias more often than bias itself (<i>media bias</i> ranks ' + mb.rank + 'th, with ' + nf(mb.definitions) + ' definitions from ' + nf(mb.papers) + ' papers).',
        read: 'Bars count records, not papers: one paper can define a term several times (<i>hate speech</i>: ' + nf(hs.seed + hs.cited) + ' definitions from ' + nf(hs.papers[0] + hs.papers[1]) + ' papers). ' +
          'Spellings merge only when they match up to case, plural, spelling variant and word order, so <i>frame</i> (' + nf(fr.seed + fr.cited) + ') and <i>framing</i> (' + nf(fg.seed + fg.cited) + ') stay two terms.',
        example: 'The term with the most definitions, <i>' + esc(ex.name) + '</i>: <b>' + nf(ex.seed + ex.cited) + '</b> definitions from <b>' + nf(np0) + '</b> papers (' + k.f((ex.seed + ex.cited) / np0, 1) + ' per paper); ' +
          nf(ex.seed) + ' of them in ' + nf(ex.papers[0]) + ' seed papers, ' + nf(ex.cited) + ' in ' + nf(ex.papers[1]) + ' cited ones. It is written ' + ex.spellings.length + ' ways, most often “' + esc(top[0]) + '” (' + nf(top[1]) + ' papers), and ' +
          nf(ex.def.shared) + ' papers give the same wording: “' + esc(ex.def.text) + '”.'
      });

      // every printed number against the data: fields (seed, cited, total) and the ten printed terms (name, seed, cited, total)
      var nums = 0, same = 0, diffs = [];
      data.fields.forEach(function (f) {
        [[f.seed, f.printed[0]], [f.cited, f.printed[1]], [f.seed + f.cited, f.printed[0] + f.printed[1]]].forEach(function (p) {
          nums++; if (p[0] === p[1]) same++; else diffs.push(f.name + ': ' + nf(p[0]) + ' in the data, ' + nf(p[1]) + ' printed');
        });
      });
      terms.forEach(function (t) {
        if (!t.printed) return;
        [[t.seed, t.printed[1]], [t.cited, t.printed[2]], [t.seed + t.cited, t.printed[1] + t.printed[2]]].forEach(function (p) {
          nums++; if (p[0] === p[1]) same++; else diffs.push(t.name + ': ' + nf(p[0]) + ' in the data, ' + nf(p[1]) + ' printed');
        });
        if (t.name !== t.printed[0]) diffs.push('“' + t.printed[0] + '” is named “' + t.name + '” here');
      });
      if (diffs.length) body.appendChild(el('p', { class: 'ct-diff', text: 'Differs from the printed figure (this page shows the data): ' + diffs.join('; ') + '.' }));

      k.method(
        '<p><b>Left.</b> Definitions are the rows of MBDef’s <code>definitions</code> table. Every other field counts the items papers list for a term in the <code>instances</code> table, where one row is one term as one paper defines it. ' +
        'Each record is grey or blue by its paper’s group in the <code>papers</code> table: a seed paper (the media-bias literature the collection started from) or a cited paper (added because a seed paper cites it; the paper calls them closure papers).</p>' +
        '<p><b>Right.</b> The definitions counted per merged term (the <code>concepts</code> table) and ranked, ties by name. A merged term joins the spellings that are the same up to case, punctuation, spacing, plural, British or American spelling and word order; synonyms are not merged. ' +
        'The paper prints each name in lower case and in the singular (<i>frame</i>, <i>echo chamber</i>), while the dataset and the MBDef Explorer name a term by its most used spelling (<i>frames</i>, <i>echo chambers</i>). This page follows the paper: the most used lower-case spelling in the singular. The details list every spelling.</p>' +
        '<p><b>A click.</b> Papers are the distinct papers with at least one definition of the term. Spellings come from the <code>terms</code> table, with the number of papers that write each. ' +
        'Years are as the <code>papers</code> table records them, mostly from OpenAlex: ' + nf(T.noYear) + ' of the ' + nf(T.papers) + ' papers have none, and a few look wrong (“' + esc(data.earliest.title) + '”, which defines <i>' + esc(data.earliest.term) + '</i>, is dated ' + data.earliest.year + '). ' +
        'The definition shown: among the term’s definitions of 3 to 40 words, the wording the most papers give (wordings that differ only in case, punctuation or spacing count as one); on a tie, the one whose paper scores highest on MBDef’s relevance score (the score that decided whether the dataset keeps the term from that paper); then the shorter. It is shown with that paper.</p>' +
        '<p><b>Tooltips.</b> Each field’s example is from <i>' + esc(data.exampleTerm) + '</i>, the term with the most definitions: the item the most papers state, then the shortest.</p>' +
        '<p><b>Checks.</b> <code>scripts/figs/content.py</code> computes every number from MBDef’s five released tables and compares it with the printed figure: ' +
        (diffs.length ? same + ' of ' + nums + ' numbers match; the differences are listed under the chart.' : 'all ' + nums + ' printed numbers and the ten printed names match.') + '</p>');
    }
  });
})();
