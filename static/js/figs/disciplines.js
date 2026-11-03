/* The interactive Fig. 2: which research fields the 6,115 papers come from (data: static/data/figs/disciplines.json,
   made by scripts/figs/disciplines.py).

   As printed: one column per field on one scale, seed papers grey under cited papers blue, the total (and its two
   parts, where they do not fit inside) on top, and the Social Sciences subfields in an inset tied to their column by
   dashed lines. A click on another column shows its subfields in the inset; a second click closes it. The inset's
   Papers button, or a click on a subfield, lists the papers with the most definitions under the chart; a second
   click, the list's × or Esc closes it. On a narrow screen the columns become rows, in the same order, and a field
   opens in place. † marks a count that today's OpenAlex lookup gives differently; the numbers are in the tooltip and
   in "How this is made". */
(function () {
  'use strict';

  var YMAX = 4000, WIDE = 900, PH = 400; // the printed axis; the narrowest chart drawn as columns; the plot's height
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var p = iso.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function sum(n) { return n[0] + n[1]; }
  function same(a, b) { return !a || (a[0] === b[0] && a[1] === b[1]); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function niceStep(v) { // 1, 2, 2.5 or 5 × 10^k, at least v
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }

  FIG.register('disciplines', {
    build: function (panel, data, k) {
      var el = k.el, nf = k.nf, pct = k.pct;
      var N = data.total, F = data.fields, when = day(data.lookup.to);
      var UNCL = 'Unclassified', OTHER = 'Other classified fields';
      var body = k.body();
      body.classList.add('dsc');

      var open = 0;      // the field shown in the inset: Social Sciences, as printed (-1: none)
      var list = null;   // the papers listed: null, 'f' (the open field) or a subfield's index
      var W = 0, entered = false, cols = null;

      function share(a, b) { return pct(a, b, a / b < 0.1 ? 1 : 0); }   // 49%, 6.2%
      function sw(c) { return '<i class="dsc-sw ' + c + '"></i>'; }
      function dagger(on) { return on ? el('sup', { class: 'dsc-dg', text: '†' }) : null; }
      function todayLine(n, today) {
        return same(today, n) ? '' : '<br><span class="k">† OpenAlex today: ' + nf(sum(today)) + ' (' + nf(today[0]) + ' seed, ' + nf(today[1]) + ' cited)</span>';
      }
      function hover(node, html) {
        var show = function (e) { k.tip.show(e, html()); };
        node.addEventListener('mouseenter', show);
        node.addEventListener('mousemove', show);
        node.addEventListener('mouseleave', k.tip.hide);
        node.addEventListener('focus', function (e) { if (node.matches(':focus-visible')) show(e); });
        node.addEventListener('blur', k.tip.hide);
      }

      // ---------------------------------------------------------------- tooltips
      function fieldTip(f) {
        var t = sum(f.n);
        return '<b>' + f.name + '</b><br>' + nf(t) + ' papers · ' + pct(t, N) + ' of all ' + nf(N) + '<br>' +
          sw('s') + nf(f.n[0]) + ' seed · ' + sw('c') + nf(f.n[1]) + ' cited' +
          (f.parts ? '<br><span class="k">' + f.parts.map(function (p) { return p[0] + ' ' + nf(p[1]); }).join(' + ') + '</span>' : '') +
          (f.name === UNCL ? '<br><span class="k">No field in OpenAlex</span>' : '') + todayLine(f.n, f.today);
      }
      function subTip(f, s, whole) {
        var t = sum(s.n);
        return '<b>' + cap(s.name) + '</b><br>' + nf(t) + ' papers · ' + share(t, whole) + ' of ' + (f.name === UNCL ? 'the ' + nf(whole) + ' unclassified' : f.name) + '<br>' +
          sw('s') + nf(s.n[0]) + ' seed · ' + sw('c') + nf(s.n[1]) + ' cited' +
          (s.members ? '<br><span class="k">' + s.members + ' smaller ' + (f.name === OTHER ? 'fields' : 'subfields') + '</span>' : '') +
          todayLine(s.n, s.today);
      }

      // ---------------------------------------------------------------- one stacked bar: seed, then cited
      function bar(cls, n, f) {
        var t = Math.max(sum(n), 1), axis = cls === 'dsc-v' ? 'height' : 'width';
        return el('span', { class: cls, style: '--f:' + f, 'data-n': n.join(',') },
          el('i', { class: 'dsc-s', style: axis + ':' + (100 * n[0] / t) + '%' }, el('span', { class: 'dsc-in', text: nf(n[0]) })),
          el('i', { class: 'dsc-c', style: axis + ':' + (100 * n[1] / t) + '%' }, el('span', { class: 'dsc-in', text: nf(n[1]) })));
      }
      // its numbers: the total, and the two parts unless they show inside the bar (as printed)
      function count(cls, n, drift) {
        return el('span', { class: cls }, el('b', null, nf(sum(n)), dagger(drift)),
          el('span', { class: 'dsc-pair', text: '(' + nf(n[0]) + ', ' + nf(n[1]) + ')' }));
      }

      // ---------------------------------------------------------------- a field's subfields (the inset, or a row opened in place)
      function detail(f, wide) {
        var printed = !!f.printed_inset, uncl = f.name === UNCL, items = uncl ? f.reasons : f.subfields;
        var whole = printed ? sum(f.n) : sum(f.today);
        var top = Math.max.apply(null, items.map(function (s) { return sum(s.n); }));
        var step = niceStep(top / 3), smax = Math.ceil(top / step) * step;

        var papersBtn = uncl ? null : el('button', {
          type: 'button', class: 'dsc-pbtn', 'data-k': 'papers', 'aria-pressed': list === 'f' ? 'true' : 'false',
          title: 'Papers with the most definitions', text: 'Papers',
          onclick: function () { setList(list === 'f' ? null : 'f'); }
        });
        var head = el('div', { class: 'dsc-ih' },
          wide ? el('span', { class: 'dsc-it', text: f.name }) : null,
          printed ? null : el('span', { class: 'dsc-src', title: 'From a fresh OpenAlex lookup, not the paper', text: 'OpenAlex · ' + when }),
          papersBtn);

        var rows = el('div', { class: 'dsc-subs', role: 'group', 'aria-label': (uncl ? 'Why ' : 'Subfields of ') + f.name + (uncl ? ' papers have no field' : '') });
        items.forEach(function (s, j) {
          var name = cap(s.name), t = sum(s.n), drift = !same(s.today, s.n);
          var label = name + ': ' + nf(t) + ' papers, ' + nf(s.n[0]) + ' seed, ' + nf(s.n[1]) + ' cited.';
          var row = uncl
            ? el('div', { class: 'dsc-sub is-static', tabindex: '0', 'data-k': 's' + j, role: 'img', 'aria-label': label })
            : el('button', {
              type: 'button', class: 'dsc-sub', 'data-k': 's' + j, 'aria-pressed': list === j ? 'true' : 'false', 'aria-label': label + ' Its papers.',
              onclick: function () { setList(list === j ? null : j); }
            });
          row.appendChild(el('span', { class: 'dsc-sname', text: name }));
          row.appendChild(el('span', { class: 'dsc-track' }, bar('dsc-h', s.n, t / smax), count('dsc-end', s.n, drift)));
          hover(row, function () { return subTip(f, s, whole); });
          rows.appendChild(row);
        });

        var ticks = null;
        if (wide) {
          ticks = el('div', { class: 'dsc-iax', 'aria-hidden': 'true' }, el('span'), el('span', { class: 'dsc-iticks' }));
          for (var v = 0; v <= smax + 1e-9; v += step) {
            ticks.lastChild.appendChild(el('span', { style: 'left:calc((100% - var(--rsv)) * ' + (v / smax) + ')', text: nf(v) }));
          }
        }
        return el('div', { class: wide ? 'dsc-inset' : 'dsc-open', id: 'dsc-inset' }, head, rows, ticks, wide ? null : papers());
      }

      // ---------------------------------------------------------------- the papers with the most definitions
      function papers() {
        if (list == null || open < 0) return null;
        var f = F[open], sub = typeof list === 'number' ? f.subfields[list] : null, items = (sub || f).papers;
        return el('section', { class: 'dsc-pp', 'aria-label': 'Papers with the most definitions in ' + (sub || f).name },
          el('div', { class: 'dsc-pph' },
            el('p', { class: 'dsc-ppt' }, el('b', { text: (sub || f).name }), 'papers with the most definitions'),
            el('button', {
              type: 'button', class: 'dsc-x', 'data-k': 'x', 'aria-label': 'Close the list', title: 'Close (Esc)', text: '×',
              onclick: function () { setList(null); }
            })),
          el('ol', { class: 'dsc-pl' }, items.map(function (p) {
            var kind = p.c === 's' ? 'seed' : 'cited';
            return el('li', null,
              el('i', { class: 'dsc-dot ' + p.c, title: kind + ' paper' }),
              el('span', { class: 'dsc-pt', title: p.t, text: p.t }),
              el('span', { class: 'dsc-pm', text: (p.y ? p.y + ' · ' : '') + kind + ' · ' + nf(p.d) + ' definitions' }));
          })));
      }

      var key = el('p', { class: 'dsc-key' },
        el('span', null, el('i', { class: 's' }), 'Seed papers'),
        el('span', null, el('i', { class: 'c' }), 'Cited papers'));

      // ---------------------------------------------------------------- wide: the printed columns and the inset
      function drawColumns() {
        cols = el('div', { class: 'dsc-cols', style: '--ph:' + PH + 'px' });
        var yax = el('div', { class: 'dsc-yax', 'aria-hidden': 'true' }, el('span', { class: 'dsc-ytitle', text: 'Number of papers' }));
        var grid = el('div', { class: 'dsc-grid', 'aria-hidden': 'true' });
        for (var v = 0; v <= YMAX; v += 1000) {
          yax.appendChild(el('span', { class: 'dsc-ytick', style: 'bottom:' + (100 * v / YMAX) + '%', text: nf(v) }));
          if (v) grid.appendChild(el('i', { style: 'bottom:' + (100 * v / YMAX) + '%' }));
        }
        cols.appendChild(yax);
        cols.appendChild(grid);
        F.forEach(function (f, i) {
          var t = sum(f.n);
          var col = el('button', {
            type: 'button', class: 'dsc-col' + (open === i ? ' is-open' : ''), style: '--i:' + i + ';grid-column:' + (i + 2), 'data-k': 'f' + i,
            'aria-expanded': open === i ? 'true' : 'false', 'aria-controls': 'dsc-inset',
            'aria-label': f.name + ': ' + nf(t) + ' papers, ' + nf(f.n[0]) + ' seed, ' + nf(f.n[1]) + ' cited.'
          },
            el('span', { class: 'dsc-cell' }, count('dsc-top', f.n, !same(f.today, f.n)), bar('dsc-v', f.n, t / YMAX)),
            el('span', { class: 'dsc-name', text: f.name }));
          col.addEventListener('click', function () { setOpen(open === i ? -1 : i); });
          hover(col, function () { return fieldTip(f); });
          cols.appendChild(col);
        });
        cols.appendChild(key);
        if (open >= 0) {
          cols.appendChild(detail(F[open], true));
          cols.appendChild(k.svg('svg', { class: 'dsc-lead', 'aria-hidden': 'true' }));
        }
        body.appendChild(cols);
      }

      // after layout: the parts inside the bars where they fit, the inset clear of the columns, the dashed lines
      function fit() {
        body.querySelectorAll('[data-n]').forEach(function (b) {
          var n = b.dataset.n.split(',').map(Number), t = Math.max(sum(n), 1), v = b.classList.contains('dsc-v');
          var w = b.offsetWidth, h = b.offsetHeight;   // offset sizes: the entrance scales the bars
          var ok = n.every(function (x) {
            var need = nf(x).length * 7.4 + 10;
            return v ? h * x / t >= 22 && w >= need : w * x / t >= need;
          });
          b.closest('.dsc-col, .dsc-sub, .dsc-rb').classList.toggle('is-in', ok);
        });
      }
      function place() {
        var inset = cols && cols.querySelector('.dsc-inset');
        if (!inset) return;
        function box(node) { // in the chart's own pixels: the stage scales in when it opens
          var C = cols.getBoundingClientRect(), z = C.width / cols.offsetWidth || 1, r = node.getBoundingClientRect();
          return { l: (r.left - C.left) / z, r: (r.right - C.left) / z, t: (r.top - C.top) / z, b: (r.bottom - C.top) / z };
        }
        var I = box(inset), lift = 0;
        cols.querySelectorAll('.dsc-col').forEach(function (c) {   // a column under the inset: its numbers stay clear
          var r = box(c.querySelector('.dsc-top')), f = c.querySelector('.dsc-v').style.getPropertyValue('--f');
          if (r.r > I.l && r.l < I.r && r.t < I.b + 10) lift = Math.max(lift, (I.b + 10 - r.t) / (1 - f));
        });
        if (lift) { cols.style.setProperty('--ph', Math.ceil(PH + lift) + 'px'); I = box(inset); }
        var c = cols.querySelector('.dsc-col.is-open'), v = c.querySelector('.dsc-v'), B = box(v);
        var yt = B.b - v.offsetHeight, segs;   // the bar's top at rest (the entrance scales it)
        if (B.r <= I.l) segs = [[B.r, yt, I.l, I.t + 14], [B.r, B.b, I.l, I.b - 14]];          // left of the inset, as printed
        else if (B.l >= I.r) segs = [[B.l, yt, I.r, I.t + 14], [B.l, B.b, I.r, I.b - 14]];     // right of it, mirrored
        else { var yl = box(c.querySelector('.dsc-top')).t - 4; segs = [[B.l, yl, B.l, I.b], [B.r, yl, B.r, I.b]]; } // under it
        var svg = cols.querySelector('.dsc-lead');
        svg.textContent = '';
        segs.forEach(function (q) { svg.appendChild(k.svg('line', { x1: q[0], y1: q[1], x2: q[2], y2: q[3] })); });
      }

      // ---------------------------------------------------------------- narrow: the columns as rows, opened in place
      function drawRows() {
        body.appendChild(key);
        var rows = el('div', { class: 'dsc-rows' });
        F.forEach(function (f, i) {
          var t = sum(f.n);
          var btn = el('button', {
            type: 'button', class: 'dsc-rb', style: '--i:' + i, 'data-k': 'f' + i, 'aria-expanded': open === i ? 'true' : 'false',
            'aria-label': f.name + ': ' + nf(t) + ' papers, ' + nf(f.n[0]) + ' seed, ' + nf(f.n[1]) + ' cited.'
          },
            el('span', { class: 'dsc-rname', text: f.name }),
            el('span', { class: 'dsc-track' }, bar('dsc-h', f.n, t / YMAX), count('dsc-end', f.n, !same(f.today, f.n))));
          btn.addEventListener('click', function () { setOpen(open === i ? -1 : i); });
          hover(btn, function () { return fieldTip(f); });
          rows.appendChild(el('div', { class: 'dsc-row' + (open === i ? ' is-open' : '') }, btn, open === i ? detail(f, false) : null));
        });
        body.appendChild(rows);
      }

      // ---------------------------------------------------------------- state and drawing
      function render() {
        var was = body.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
        k.tip.hide();
        body.textContent = '';
        cols = null;
        var wide = W >= WIDE;
        body.classList.toggle('is-wide', wide);
        body.classList.toggle('is-tight', wide && (W - 58) / 12 < 88);   // narrow columns: smaller names
        body.classList.toggle('is-enter', !entered && k.motion);
        if (!entered) { entered = true; setTimeout(function () { body.classList.remove('is-enter'); }, 2200); }
        if (wide) drawColumns(); else drawRows();
        if (!data.lookup.same_as_print) {
          body.appendChild(el('p', { class: 'dsc-dag' }, el('b', { text: '† ' }),
            'OpenAlex classifies a few of these papers differently today (' + when + '); the bars keep the paper’s counts.'));
        }
        var pp = wide && papers();
        if (pp) body.appendChild(pp);
        fit();
        place();
        var t = was && body.querySelector('[data-k="' + was + '"]');
        if (t) t.focus({ preventScroll: true });
      }
      function setOpen(i) { open = i; list = null; render(); }
      function setList(v) {
        var back = list === 'f' ? 'papers' : 's' + list;
        list = v;
        render();
        var pp = body.querySelector('.dsc-pp');
        if (pp) pp.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' });
        else if (document.activeElement === body || !body.contains(document.activeElement)) {
          var t = body.querySelector('[data-k="' + back + '"]');   // the list closed under the focus: back to what opened it
          if (t) t.focus({ preventScroll: true });
        }
      }

      // Esc closes the list first, then goes back to the printed view; a further Esc closes the stage
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || panel.hidden || !panel.offsetParent || (list == null && open <= 0)) return;
        e.preventDefault();
        e.stopPropagation();
        if (list != null) { setList(null); return; }
        var back = body.contains(document.activeElement) && 'f' + open;   // back to the print; the focus to the column that was open
        setOpen(0);
        var t = back && body.querySelector('[data-k="' + back + '"]');
        if (t) t.focus({ preventScroll: true });
      }, true);

      k.onResize(function (w) { W = w; render(); });

      // ---------------------------------------------------------------- how this is made
      var R = data.rule;
      function words(n) { return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n); }
      function diffs(items) {
        return items.filter(function (x) { return !same(x.today, x.n); }).map(function (x) {
          return x.name + ' ' + nf(sum(x.today)) + ' (' + nf(x.today[0]) + ' seed, ' + nf(x.today[1]) + ' cited) instead of ' + nf(sum(x.n));
        }).join('; ');
      }
      var inset = F.filter(function (f) { return f.printed_inset; })[0];
      k.method(
        '<p><b>Rule.</b> Each of the ' + nf(N) + ' papers is counted once, under the field of its primary topic in OpenAlex (looked up by its OpenAlex id, else by its DOI; OpenAlex assigns topics automatically). ' +
        'As in the paper, Medicine and Health Professions form one bar, the fields after the ten largest another, and a paper OpenAlex cannot find or gives no topic is unclassified, never guessed from its title. ' +
        'The columns and the Social Sciences subfields carry the printed counts. Another field’s subfields (its ' + words(R.subfields) + ' largest, then the rest as one bar), the reasons behind Unclassified and the papers listed come from a fresh lookup on ' + when + '. ' +
        '† marks where it differs from the print: ' + diffs(F) + (inset && diffs(inset.subfields) ? '; and within ' + inset.name + ', ' + diffs(inset.subfields) : '') + '.</p>' +
        '<p><b>Papers listed.</b> The ' + words(R.papers) + ' papers of a field (' + words(R.papers_sub) + ' of a subfield) with the most definitions in MBDef, among the ' + nf(R.confirmed) + ' of ' + nf(R.classified) +
        ' classified papers whose title in MBDef is the title of the OpenAlex record they were matched to. A title of fewer than three words, or made only of heading words and numbers (“Introduction and Background”, “EDITED BY”), is left out, as it names a chapter or a page rather than the work; ' +
        'footnote marks (*) and stray symbol glyphs that PDF extraction leaves at a title’s end are dropped. Made by <code>scripts/figs/disciplines.py</code>, which runs the discipline lookup of the MBDef code (tutorial 5 in the MBDef repository).</p>');
    }
  });
})();
