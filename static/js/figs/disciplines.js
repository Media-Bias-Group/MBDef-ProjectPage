/* The interactive Fig. 2: which research fields the 6,115 papers come from (data: static/data/figs/disciplines.json,
   made by scripts/figs/disciplines.py).

   As printed: one column per field on one scale, seed papers grey under cited papers blue, the total (and its two
   parts, where they do not fit inside) on top, and the Social Sciences subfields in an inset tied to their column by
   dashed lines. A click on another column shows its subfields in the inset; a second click closes it. The inset's
   Papers button, or a click on a subfield, lists the papers with the most definitions under the chart; a second
   click, the list's × or Esc closes it. On a narrow screen the columns become rows, in the same order, and a field
   opens in place. † marks a count that today's OpenAlex lookup gives differently; the numbers are in the tooltip and
   in "How this is made".

   Arrival (k.onArrive): the columns grow up from the axis, largest first, their totals riding on top; then the inset
   fades in and its bars extend. Hover, keyboard focus or a tap lights one mark and dims the rest: a column gets a
   guide line to the axis and its value there; a subfield also lights its slice of its field's column. */
(function () {
  'use strict';

  var YMAX = 4000, WIDE = 900, PH = 400; // the printed axis; the narrowest chart drawn as columns; the plot's height
  var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  var GROW = 640, STEP = 30;             // the entrance: one column's growth, and the step between columns (largest first)
  var MARKS = '.dsc-col, .dsc-rb, .dsc-sub';
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var p = iso.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function sum(n) { return n[0] + n[1]; }
  function same(a, b) { return !a || (a[0] === b[0] && a[1] === b[1]); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function niceStep(v) { // 1, 2, 2.5 or 5 × 10^k, at least v
    var p = Math.pow(10, Math.floor(Math.log10(v))), m = v / p;
    return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  }
  function shown(node) { return parseFloat(getComputedStyle(node).opacity) > 0.05; } // still visible, or fading out
  function jump(nodes, set) { // place the nodes at once (no slide), when they are not on screen
    nodes.forEach(function (n) { n.style.transition = 'none'; });
    set();
    void nodes[0].offsetWidth;
    nodes.forEach(function (n) { n.style.transition = ''; });
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
      var W = 0, cols = null;
      var hot = null, leaveT = 0;           // the lit mark; the short wait before a mark the pointer left goes dark
      var anims = [], growing = false;      // the entrance's animations, and whether it is still playing
      var pointer = 'mouse', clickAt = null; // the last pointer's kind; where a click on a mark was (it redraws)
      var rank = [];                        // each field's place by size: the entrance grows the largest first
      F.map(function (f, i) { return i; }).sort(function (a, b) { return sum(F[b].n) - sum(F[a].n); })
        .forEach(function (i, r) { rank[i] = r; });

      function share(a, b) { return pct(a, b, a / b < 0.1 ? 1 : 0); }   // 49%, 6.2%
      function sw(c) { return '<i class="dsc-sw ' + c + '"></i>'; }
      function dagger(on) { return on ? el('sup', { class: 'dsc-dg', text: '†' }) : null; }
      function todayLine(n, today) {
        return same(today, n) ? '' : '<br><span class="k">† OpenAlex today: ' + nf(sum(today)) + ' (' + nf(today[0]) + ' seed, ' + nf(today[1]) + ' cited)</span>';
      }
      function itemsOf(f) { return f.name === UNCL ? f.reasons : f.subfields; }

      // ---------------------------------------------------------------- tooltips
      function fieldTip(f) {
        var t = sum(f.n);
        return '<b>' + f.name + '</b><br>' + nf(t) + ' papers · ' + pct(t, N) + ' of all ' + nf(N) + '<br>' +
          sw('s') + nf(f.n[0]) + ' seed (' + share(f.n[0], t) + ') · ' + sw('c') + nf(f.n[1]) + ' cited (' + share(f.n[1], t) + ')' +
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

      // ---------------------------------------------------------------- one mark: hover, focus and a tap light it
      function mark(node, html) {
        node._tip = html;
        node.addEventListener('mouseenter', function (e) { light(node, e); });
        node.addEventListener('mousemove', function (e) { if (hot === node) k.tip.show(e); else light(node, e); });
        node.addEventListener('mouseleave', function () {
          clearTimeout(leaveT);   // a moment's grace, so crossing the gap between two rows does not flicker
          leaveT = setTimeout(function () { if (hot === node) unlight(); }, 60);
        });
        node.addEventListener('focus', function (e) { if (node.matches(':focus-visible')) light(node, e); });
        node.addEventListener('blur', function () { if (hot === node && !node.matches(':hover')) unlight(); });
      }
      function light(node, ev) {
        if (growing || !body.contains(node)) return;
        clearTimeout(leaveT);
        if (hot !== node) {
          if (hot) unlight(true);
          hot = node;
          var key = node.getAttribute('data-k'), sub = key.charAt(0) === 's', i = +key.slice(1);
          node.classList.add('is-hot');
          node.closest('.dsc-subs, .dsc-cols, .dsc-rows').classList.add('is-hl');
          if (cols) {
            cols.classList.toggle('is-hl-open', !sub && i === open);
            cols.classList.toggle('is-hl-sub', sub);
          }
          if (sub) slice(i); else if (cols) guide(i);
        }
        k.tip.show(ev, node._tip());
      }
      function unlight(keepTip) {
        clearTimeout(leaveT);
        if (!hot) return;
        hot.classList.remove('is-hot');
        body.querySelectorAll('.is-hl').forEach(function (g) { g.classList.remove('is-hl'); });
        if (cols) { cols.classList.remove('is-hl-open', 'is-hl-sub'); guide(-1); }
        slice(-1);
        hot = null;
        if (!keepTip) k.tip.hide();
      }

      // a column's guide line to the axis, and its value on the axis; it slides from one column to the next
      function guide(i) {
        var g = cols.querySelector('.dsc-guide'), y = cols.querySelector('.dsc-yval'), ticks = cols.querySelectorAll('.dsc-ytick');
        var t = i < 0 ? -1e9 : sum(F[i].n), ph = cols.querySelector('.dsc-yax').offsetHeight;
        ticks.forEach(function (n, j) { n.classList.toggle('is-near', Math.abs(j * 1000 - t) / YMAX * ph < 15); }); // under the value
        if (i < 0) { g.classList.remove('on'); y.classList.remove('on'); return; }
        var at = 100 * t / YMAX + '%';
        var grid = cols.querySelector('.dsc-grid'), v = cols.querySelector('[data-k="f' + i + '"] .dsc-v');
        var z = cols.getBoundingClientRect().width / cols.offsetWidth || 1;
        var w = Math.max(0, (v.getBoundingClientRect().left - grid.getBoundingClientRect().left) / z - 3);
        function set() { g.style.bottom = y.style.bottom = at; g.style.width = w + 'px'; }
        if (shown(g)) set(); else jump([g, y], set);
        y.textContent = nf(t);
        g.classList.add('on'); y.classList.add('on');
      }

      // a subfield's slice of its field's column: its seed papers within the grey part, its cited within the blue
      // (the printed counts for the printed inset; another field's subfields are shares of today's lookup)
      function slice(j) {
        var b = open < 0 ? null : body.querySelector('.dsc-col.is-open .dsc-v, .dsc-row.is-open > .dsc-rb .dsc-h');
        if (!b) return;
        var holder = b.closest('.dsc-col, .dsc-rb'), f = F[open], items = itemsOf(f), s = items[j];
        if (!s) { holder.classList.remove('is-sliced'); return; }
        var basis = f.printed_inset ? f.n : f.today, v = b.classList.contains('dsc-v');
        var bands = b.querySelectorAll('.dsc-band'), slide = shown(bands[0]);
        [0, 1].forEach(function (p) {
          var part = bands[p].parentNode, before = 0;
          for (var q = 0; q < j; q++) before += items[q].n[p];
          var off = basis[p] ? before / basis[p] : 0, size = basis[p] ? s.n[p] / basis[p] : 0, txt = nf(s.n[p]);
          var room = size * (v ? part.offsetHeight : part.offsetWidth), wide = v ? part.offsetWidth : room;
          function set() {
            bands[p].style[v ? 'bottom' : 'left'] = 100 * off + '%';
            bands[p].style[v ? 'height' : 'width'] = 100 * size + '%';
          }
          if (slide) set(); else jump([bands[p]], set);
          bands[p].firstChild.textContent = (v ? room >= 18 : true) && wide >= txt.length * 7.4 + 10 ? txt : '';
        });
        holder.classList.add('is-sliced');
      }

      // ---------------------------------------------------------------- one stacked bar: seed, then cited
      function bar(cls, n, f, bands) {
        var t = Math.max(sum(n), 1), axis = cls === 'dsc-v' ? 'height' : 'width';
        function part(c, x) {
          return el('i', { class: c, style: axis + ':' + (100 * x / t) + '%' }, el('span', { class: 'dsc-in', text: nf(x) }),
            bands ? el('b', { class: 'dsc-band' }, el('span')) : null);
        }
        return el('span', { class: cls, style: '--f:' + f, 'data-n': n.join(',') }, part('dsc-s', n[0]), part('dsc-c', n[1]));
      }
      // its numbers: the total, and the two parts unless they show inside the bar (as printed)
      function count(cls, n, drift) {
        return el('span', { class: cls }, el('b', null, nf(sum(n)), dagger(drift)),
          el('span', { class: 'dsc-pair' }, '(', el('span', { class: 'ps', text: nf(n[0]) }), ', ', el('span', { class: 'pc', text: nf(n[1]) }), ')'));
      }

      // ---------------------------------------------------------------- a field's subfields (the inset, or a row opened in place)
      function detail(f, wide) {
        var printed = !!f.printed_inset, uncl = f.name === UNCL, items = itemsOf(f);
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
          mark(row, function () { return subTip(f, s, whole); });
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
        yax.appendChild(el('b', { class: 'dsc-yval' }));
        grid.appendChild(el('b', { class: 'dsc-guide' }));
        cols.appendChild(yax);
        cols.appendChild(grid);
        F.forEach(function (f, i) {
          var t = sum(f.n);
          var col = el('button', {
            type: 'button', class: 'dsc-col' + (open === i ? ' is-open' : ''), style: 'grid-column:' + (i + 2), 'data-k': 'f' + i,
            'aria-expanded': open === i ? 'true' : 'false', 'aria-controls': 'dsc-inset',
            'aria-label': f.name + ': ' + nf(t) + ' papers, ' + nf(f.n[0]) + ' seed, ' + nf(f.n[1]) + ' cited.'
          },
            el('span', { class: 'dsc-cell' }, count('dsc-top', f.n, !same(f.today, f.n)), bar('dsc-v', f.n, t / YMAX, open === i)),
            el('span', { class: 'dsc-name', text: f.name }));
          col.addEventListener('click', function () { setOpen(open === i ? -1 : i); });
          mark(col, function () { return fieldTip(f); });
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
          var w = b.offsetWidth, h = b.offsetHeight;
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
        var yt = B.b - v.offsetHeight, segs;   // the bar's top
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
            type: 'button', class: 'dsc-rb', 'data-k': 'f' + i, 'aria-expanded': open === i ? 'true' : 'false',
            'aria-label': f.name + ': ' + nf(t) + ' papers, ' + nf(f.n[0]) + ' seed, ' + nf(f.n[1]) + ' cited.'
          },
            el('span', { class: 'dsc-rname', text: f.name }),
            el('span', { class: 'dsc-track' }, bar('dsc-h', f.n, t / YMAX, open === i), count('dsc-end', f.n, !same(f.today, f.n))));
          btn.addEventListener('click', function () { setOpen(open === i ? -1 : i); });
          mark(btn, function () { return fieldTip(f); });
          rows.appendChild(el('div', { class: 'dsc-row' + (open === i ? ' is-open' : '') }, btn, open === i ? detail(f, false) : null));
        });
        body.appendChild(rows);
      }

      // ---------------------------------------------------------------- state and drawing
      function render() {
        var was = body.contains(document.activeElement) ? document.activeElement.getAttribute('data-k') : null;
        stop();
        hot = null;
        clearTimeout(leaveT);
        k.tip.hide();
        body.textContent = '';
        cols = null;
        var wide = W >= WIDE;
        body.classList.toggle('is-wide', wide);
        body.classList.toggle('is-tight', wide && (W - 58) / 12 < 88);   // narrow columns: smaller names
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
        relight();
      }
      // a click on a mark redraws the chart: the mark keeps its light (under the pointer, or where a finger tapped)
      function relight() {
        var at = clickAt, m = at && body.querySelector('[data-k="' + at.k + '"]');
        clickAt = null;
        if (!m || !m.matches(MARKS)) return;
        var under = document.elementFromPoint(at.x, at.y), still = !!under && m.contains(under);
        if (still) light(m, { target: m, clientX: at.x, clientY: at.y });
        else if (at.touch) light(m, { target: m, clientX: at.x, clientY: m.getBoundingClientRect().bottom });
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

      body.addEventListener('pointerdown', function (e) { pointer = e.pointerType || 'mouse'; }, true);
      body.addEventListener('click', function (e) {
        var m = e.detail && e.target.closest && e.target.closest(MARKS);
        clickAt = m ? { k: m.getAttribute('data-k'), x: e.clientX, y: e.clientY, touch: pointer !== 'mouse' } : null;
      }, true);
      // a tap outside the marks puts the light out (a touch screen has no pointer leaving)
      document.addEventListener('pointerdown', function (e) {
        if (!hot || e.pointerType === 'mouse') return;
        var m = e.target.closest && e.target.closest(MARKS);
        if (!m || !body.contains(m)) unlight();
      }, true);

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

      // each visit starts from the print: when the stage shows this figure again, it is the printed view
      var dlg = panel.closest('dialog');
      if (dlg && 'MutationObserver' in window) {
        new MutationObserver(function () {
          if (!dlg.open || panel.hidden) { unlight(); return; }
          if (W && (open !== 0 || list != null)) { open = 0; list = null; render(); }
        }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
        new MutationObserver(function () {
          if (panel.hidden) unlight();
          else if (dlg.open && W && (open !== 0 || list != null)) { open = 0; list = null; render(); }
        }).observe(panel, { attributes: true, attributeFilter: ['hidden'] });
      }

      k.onResize(function (w) { W = w; render(); });

      // ---------------------------------------------------------------- the entrance, each time the figure arrives
      function stop() {
        anims.forEach(function (a) { a.cancel(); });
        anims = [];
        growing = false;
      }
      function enter() {
        unlight();
        stop();
        if (!k.motion) return;
        function play(node, frames, delay, dur) {
          if (node) anims.push(node.animate(frames, { duration: dur, delay: delay, easing: EASE, fill: 'backwards' }));
        }
        // a bar extends from its base (clipped, so the numbers inside it are never squeezed); its total rides its end
        function grow(b, lab, delay, dur) {
          var v = b.classList.contains('dsc-v'), d = v ? b.offsetHeight : b.offsetWidth;
          play(b, [{ clipPath: v ? 'inset(100% 0 0 0)' : 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], delay, dur);
          play(lab, [{ opacity: 0, transform: v ? 'translateY(' + d + 'px)' : 'translateX(' + -d + 'px)' },
            { opacity: 1, offset: 0.35 }, { opacity: 1, transform: 'none' }], delay, dur);
        }
        body.querySelectorAll('.dsc-col, .dsc-rb').forEach(function (c) {
          var i = +c.getAttribute('data-k').slice(1);
          grow(c.querySelector('.dsc-v, .dsc-h'), c.querySelector('.dsc-top, .dsc-end'), rank[i] * STEP, GROW);
        });
        // then the open field's subfields: the inset fades in as the print's inset dissolves and its column nears the
        // top, and its bars extend once the column is up
        var det = body.querySelector('.dsc-inset, .dsc-open');
        if (det) {
          var t0 = (open >= 0 ? rank[open] * STEP : 0) + 100;
          play(det, [{ opacity: 0 }, { opacity: 1 }], t0, 360);
          play(cols && cols.querySelector('.dsc-lead'), [{ opacity: 0 }, { opacity: 1 }], t0 + 60, 360);
          det.querySelectorAll('.dsc-sub').forEach(function (s, j) {
            grow(s.querySelector('.dsc-h'), s.querySelector('.dsc-end'), t0 + 140 + j * 34, 520);
          });
        }
        play(body.querySelector('.dsc-pp'), [{ opacity: 0 }, { opacity: 1 }], 300, 380);
        if (!anims.length) return;
        growing = true;   // the marks answer the pointer once the chart stands
        var mine = anims;
        Promise.all(mine.map(function (a) { return a.finished; })).then(function () { if (anims === mine) growing = false; }, function () {});
      }
      k.onArrive(enter);

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
