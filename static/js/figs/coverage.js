/* Fig. 4, interactive: the printed figure come alive. The eleven bias types that two published classification schemes
   both report, grouped left to right by level as printed. Each type is a column: its count, one dot per MBDef paper
   that defines it (grey seed papers at the bottom, blue cited papers on top, like the printed bar), the two schemes'
   marks and its name. When the names do not fit side by side (phones), the types become rows.

   Arrival (k.onArrive): the dots grow out of the printed bars, line by line from the bottom (left to right in rows).
   Hover or focus: a dot lights the same paper's dots in the other types; a type, its column; a scheme's mark or name,
   that scheme's row of marks; a level, its types; a legend key, its marks. Everything else dims a little and the
   tooltip gives the numbers. On a touch screen a tap does what hover does; a second tap on a dot or mark acts.
   A click on a type lists its papers; a second click, the × or Esc closes the list.
   Data: static/data/figs/coverage.json, made by scripts/figs/coverage.py from the released tables. */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function lower(name) { return name.charAt(0).toLowerCase() + name.slice(1); }
  function plural(n, one) { return n + ' ' + one + (n === 1 ? '' : 's'); }
  function pair(d) { return '(' + d[1] + ', ' + d[2] + ')'; }
  function list(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
  // a title as a reader sees it (one title in the released table carries markup from its source)
  function title(p) { return p.t.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim(); }
  function paperKey(p) { return title(p).toLowerCase() + '|' + (p.y || ''); }

  FIG.register('coverage', {
    build: function (panel, data, k) {
      var el = k.el, svgEl = k.svg, schemes = data.schemes, types = data.types, levels = data.levels;
      var LIMIT = 6;         // papers listed before 'Show all'
      var COLS_MIN = 940;    // from this chart width the types stand in columns, as printed (if their names fit)
      var PER = 5;           // dots per line of a column
      var selected = null, hit = null, expanded = false, mode = '', recs = [], heads = {}, labels = [], lastDot = null;
      var hot = null, clearT = 0, firstTap = false, still = false, stillAt = null;

      function isDiff(t) { return data.differences.indexOf(t.name) >= 0; }
      function ofLevel(lv) { return types.filter(function (t) { return t.level === lv; }); }

      // a paper can define several types: the types each paper is counted under, and the papers of each level
      var owners = {}, perLevel = {}, keys = new Map();
      types.forEach(function (t) {
        keys.set(t, t.papers.map(paperKey));
        t.papers.forEach(function (p) {
          var key = paperKey(p);
          (owners[key] = owners[key] || []).push(t);
          (perLevel[t.level] = perLevel[t.level] || {})[key] = 1;
        });
      });

      // ---------------------------------------------------------------- marks and tooltips
      function markSvg(kind, s) {
        var c = s / 2, r = s / 2 - 2.6;
        var g = svgEl('svg', { width: s, height: s, viewBox: '0 0 ' + s + ' ' + s, 'aria-hidden': 'true', class: 'cov-mark-svg' });
        if (kind === 'full') g.appendChild(svgEl('circle', { cx: c, cy: c, r: r + 0.6, class: 'cov-mark-fill' }));
        else {
          g.appendChild(svgEl('circle', { cx: c, cy: c, r: r, class: 'cov-mark-ring' }));
          g.appendChild(svgEl('path', { d: 'M' + c + ' ' + (c - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + c + ' ' + (c + r) + ' Z', class: 'cov-mark-fill' }));
        }
        return g;
      }
      function markText(sch, t) {
        var a = t.alias[sch.key];
        if (t.marks[sch.key] === 'full') return 'Listed as a type of its own.';
        if (a) return 'Covered under a different name: ' + a[0] + ' (its Section ' + a[1] + ').';
        return 'Covered under a different name; the comparison table behind the printed figure does not say which.';
      }
      function countTip(t) {
        return el('div', null, el('b', { text: t.name }),
          el('div', { text: plural(t.data[0], 'paper') + ': ' + t.data[1] + ' seed, ' + t.data[2] + ' cited' }),
          isDiff(t) ? el('div', { class: 'k', text: '† Printed: ' + t.printed[0] + ' ' + pair(t.printed) }) : null);
      }
      function termsText(p) {
        return p.w.map(function (w) { return '“' + w[0] + '”' + (w[1] ? ', synonym “' + w[1] + '”' : ''); }).join('; ');
      }
      function paperTip(t, p) {
        var also = owners[paperKey(p)].filter(function (o) { return o !== t; }).map(function (o) { return lower(o.name); });
        return el('div', null, el('b', { text: title(p) }),
          el('div', { class: 'k', text: (p.y ? p.y + ' · ' : '') + (p.s ? 'seed paper' : 'cited paper') }),
          el('div', { text: 'Defines ' + termsText(p) }),
          also.length ? el('div', { class: 'k', text: 'Also counted under ' + list(also) + '.' }) : null);
      }
      function markTip(sch, t) {
        return el('div', null, el('b', { text: sch.short }), el('div', { class: 'k', text: t.name }), el('div', { text: markText(sch, t) }));
      }
      function schemeTip(sch) {
        return el('div', null, el('b', { text: sch.authors + ' (' + sch.year + ')' }), el('div', { text: sch.title + '. ' + sch.venue + '.' }));
      }
      function levelTip(lv) {
        var group = ofLevel(lv), n = Object.keys(perLevel[lv] || {}).length;
        return el('div', null, el('b', { text: lv }),
          el('div', { text: plural(group.length, 'type') + '; ' + plural(n, 'paper') + ' define at least one of them' }));
      }
      function schemeLink(sch, si) {
        var a = el('a', { class: 'cov-scheme', href: 'https://doi.org/' + sch.doi, target: '_blank', rel: 'noopener', 'data-s': si, text: sch.short });
        labels.push(a);
        return a;
      }

      // ---------------------------------------------------------------- the frame: chart, legend, † line, list
      var body = k.body();
      var chart = el('div', { class: 'cov-chart' });
      var keysOfLegend = [ // each key lights its marks in the chart
        el('span', { 'data-legend': 'seed' }, el('i', { class: 'cov-sw is-seed' }), 'Seed paper'),
        el('span', { 'data-legend': 'cited' }, el('i', { class: 'cov-sw is-cited' }), 'Cited paper'),
        el('span', { 'data-legend': 'full' }, markSvg('full', 14), 'Listed'),
        el('span', { 'data-legend': 'half' }, markSvg('half', 14), 'Covered under a different name')];
      var legend = el('p', { class: 'cov-legend' }, keysOfLegend);
      var diffs = types.filter(isDiff);
      var note = diffs.length ? el('p', { class: 'cov-diff' }, el('span', { class: 'cov-dag', text: '†' }),
        ' Printed: ' + diffs.map(function (t) { return t.printed[0] + ' ' + pair(t.printed); }).join(' and ') +
        '. The dots follow the released data.') : null;
      var detail = el('section', { class: 'cov-detail', hidden: true, 'aria-live': 'polite' });
      body.appendChild(chart);
      body.appendChild(legend);
      if (note) body.appendChild(note);
      body.appendChild(detail);

      // ---------------------------------------------------------------- one type's parts
      function parts(t, ti) {
        var rec = { t: t, ti: ti, dots: [] };
        rec.name = el('button', {
          type: 'button', class: 'cov-name', 'aria-expanded': selected === t ? 'true' : 'false',
          'aria-label': t.name + ': ' + plural(t.data[0], 'paper') + ', ' + t.data[1] + ' seed and ' + t.data[2] + ' cited. List the papers.',
          text: mode === 'cols' ? t.name.replace(/ \//g, ' /') : t.name // keep 'Gatekeeping /' on one line, as printed
        });
        rec.count = el('span', { class: 'cov-count' },
          el('b', null, String(t.data[0]), isDiff(t) ? el('sup', { class: 'cov-dag', text: '†' }) : null),
          el('small', null, '(', el('span', { class: 's', text: t.data[1] }), ', ', el('span', { class: 'c', text: t.data[2] }), ')'));
        rec.marks = schemes.map(function (sch, si) {
          return el('span', { class: 'cov-mark', tabindex: 0, role: 'img', 'data-s': si, 'aria-label': sch.short + ': ' + markText(sch, t) },
            markSvg(t.marks[sch.key], 16));
        });
        rec.cell = el('div', { class: 'cov-dotcell' });
        return rec;
      }
      function bindBox(rec, box) {
        rec.box = box;
        box.setAttribute('data-ti', rec.ti);
        box.addEventListener('click', function (e) {
          var d = e.target.closest('.cov-dot');
          // on a touch screen the first tap on a dot or a mark does what hover does; a second tap on it acts
          if (firstTap && e.target.closest('.cov-dot, .cov-mark')) { firstTap = false; return; }
          pick(rec.t, d ? +d.getAttribute('data-i') : null);
        });
        recs.push(rec);
      }

      // the dots: in columns they stack from the bottom up, PER to a line; in rows they run left to right. Each dot's
      // delay is when it appears in the entrance: line by line from the bottom (columns) or along the row (rows)
      function drawDots(rec, per, pitch) {
        var t = rec.t, n = t.papers.length, r = pitch * 0.37, up = mode === 'cols';
        var lines = Math.ceil(n / per), step = up ? 0 : Math.min(22, 460 / Math.max(1, per - 1));
        var w = up ? (per - 1) * pitch + 2 * r + 4 : Math.max(60, Math.floor(rec.cell.clientWidth));
        var h = (lines - 1) * pitch + 2 * r + 4;
        var g = svgEl('svg', {
          class: 'cov-dots', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, role: 'group',
          'aria-label': plural(n, 'paper') + ' define ' + lower(t.name) + ', one dot each'
        });
        var dots = t.papers.map(function (p, i) {
          var col = i % per, line = Math.floor(i / per);
          var c = svgEl('circle', {
            cx: r + 2 + col * pitch, cy: up ? h - r - 2 - line * pitch : r + 2 + line * pitch, r: r, 'data-i': i,
            class: 'cov-dot ' + (p.s ? 'is-seed' : 'is-cited'),
            tabindex: i === 0 ? 0 : -1, role: 'button',
            'aria-label': title(p) + ', ' + (p.y ? p.y + ', ' : '') + (p.s ? 'seed' : 'cited') + ' paper; defines ' +
              p.w.map(function (x) { return x[0]; }).join(', ')
          });
          var delay = up ? line * 55 + col * 7 : col * step + line * 40;
          c.style.animationDelay = Math.round(delay) + 'ms';
          if (!lastDot || delay > lastDot.delay) lastDot = { node: c, delay: delay };
          c.addEventListener('keydown', function (e) {
            var j = null, jump = up ? -per : per;
            if (e.key === 'ArrowRight') j = i + 1; else if (e.key === 'ArrowLeft') j = i - 1;
            else if (e.key === 'ArrowDown') j = i + jump; else if (e.key === 'ArrowUp') j = i - jump;
            else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); pick(t, i); return; }
            if (j == null) return;
            e.preventDefault();
            j = Math.max(0, Math.min(n - 1, j));
            dots[i].setAttribute('tabindex', '-1');
            dots[j].setAttribute('tabindex', '0');
            dots[j].focus();
          });
          g.appendChild(c);
          return c;
        });
        rec.dots = dots;
        rec.cell.textContent = '';
        rec.cell.appendChild(g);
      }

      // ---------------------------------------------------------------- columns, as printed (wide screens)
      function renderCols(width) {
        var gut = 112, gap = 22, cg = 6, nT = types.length, nL = levels.length;
        var colW = (width - gut - (nL - 1) * gap - (nT + nL - 1) * cg) / nT;
        var pitch = Math.max(12, Math.min(16, Math.floor((colW - 12) / PER)));
        var tpl = [gut + 'px'], c = 2, ti = 0;
        chart.appendChild(el('div', { class: 'cov-gut' }, el('span'), schemes.map(schemeLink), el('span')));
        levels.forEach(function (lv, li) {
          if (li) { tpl.push(gap + 'px'); c++; }
          var group = ofLevel(lv);
          chart.appendChild(heads[lv] = el('div', { class: 'cov-lv', 'data-lv': lv, style: 'grid-column: ' + c + ' / span ' + group.length, text: lv }));
          group.forEach(function (t) {
            tpl.push('minmax(min-content, 1fr)');
            var rec = parts(t, ti++);
            var box = el('div', { class: 'cov-col', style: 'grid-column: ' + (c++) },
              el('div', { class: 'cov-bar' }, rec.count, rec.cell), rec.marks, rec.name);
            bindBox(rec, box);
            chart.appendChild(box);
            drawDots(rec, PER, pitch);
          });
        });
        chart.style.gridTemplateColumns = tpl.join(' ');
      }

      // ---------------------------------------------------------------- rows (phones and narrow windows)
      function renderRows(width) {
        var narrow = width < 640, pitch = narrow ? 13 : 14, ti = 0;
        chart.classList.toggle('is-narrow', narrow);
        chart.appendChild(el('div', { class: 'cov-row cov-headrow' }, el('span'), schemes.map(schemeLink), el('span')));
        levels.forEach(function (lv) {
          chart.appendChild(heads[lv] = el('div', { class: 'cov-lv', 'data-lv': lv, text: lv }));
          ofLevel(lv).forEach(function (t) {
            var rec = parts(t, ti++);
            var box = el('div', { class: 'cov-row cov-type' }, rec.name, rec.marks, rec.count, rec.cell);
            bindBox(rec, box);
            chart.appendChild(box);
          });
        });
        recs.forEach(function (rec) {
          var w = Math.max(60, Math.floor(rec.cell.clientWidth)), r = pitch * 0.37;
          drawDots(rec, Math.max(1, Math.floor((w - 2 * r - 4) / pitch) + 1), pitch);
        });
      }

      function draw(m, width) {
        var entering = chart.classList.contains('is-entering');
        mode = m;
        chart.className = 'cov-chart is-' + mode + (entering ? ' is-entering' : '');
        chart.style.gridTemplateColumns = '';
        chart.textContent = '';
        recs = []; heads = {}; labels = []; lastDot = null;
        legend.className = 'cov-legend' + (mode === 'rows' ? ' is-top' : '');
        body.insertBefore(legend, mode === 'cols' ? chart.nextSibling : chart); // under the chart as printed; above the rows
        if (mode === 'cols') renderCols(width); else renderRows(width);
      }
      function render(width) {
        draw(width >= COLS_MIN ? 'cols' : 'rows', width);
        if (mode === 'cols' && chart.scrollWidth > chart.clientWidth + 1) draw('rows', width); // the names do not fit side by side
        hot = null;
        k.tip.hide();
        paint();
      }

      // ---------------------------------------------------------------- the arrival: the dots grow out of the printed bars
      chart.addEventListener('animationend', function (e) {
        if (lastDot && e.target === lastDot.node) chart.classList.remove('is-entering');
      });
      k.onArrive(function () {
        release(true);
        still = true; stillAt = null; // the pointer rests where the print was clicked: it hovers once it moves
        chart.classList.remove('is-entering');
        if (!k.motion) return;
        void chart.offsetWidth; // restart the entrance on every arrival
        chart.classList.add('is-entering');
      });

      // ---------------------------------------------------------------- focus: what the pointer or keyboard is on
      // one state at a time: a paper (its dots in every type), a type, a scheme (its row of marks), a level, or a legend key
      function resolve(node) {
        if (!node || !node.closest || !body.contains(node)) return null;
        var key = node.closest('[data-legend]');
        if (key) return { id: 'k' + key.getAttribute('data-legend'), kind: 'legend', which: key.getAttribute('data-legend') };
        if (!chart.contains(node)) return null;
        var s = node.closest('.cov-scheme');
        if (s) {
          var sch = schemes[+s.getAttribute('data-s')];
          return { id: 's' + s.getAttribute('data-s'), kind: 'scheme', si: +s.getAttribute('data-s'), t: null, tip: function () { return schemeTip(sch); } };
        }
        var lv = node.closest('.cov-lv');
        if (lv) {
          var name = lv.getAttribute('data-lv');
          return { id: 'l' + name, kind: 'level', lv: name, tip: function () { return levelTip(name); } };
        }
        var box = node.closest('[data-ti]');
        if (!box) return null;
        var rec = recs[+box.getAttribute('data-ti')], t = rec.t;
        var dot = node.closest('.cov-dot');
        if (dot) {
          var i = +dot.getAttribute('data-i'), p = t.papers[i];
          return { id: 'p' + rec.ti + ':' + i, kind: 'paper', key: paperKey(p), dot: dot, types: owners[paperKey(p)], tip: function () { return paperTip(t, p); } };
        }
        var mark = node.closest('.cov-mark');
        if (mark) {
          var si = +mark.getAttribute('data-s');
          return { id: 'm' + rec.ti + ':' + si, kind: 'scheme', si: si, t: t, mark: mark, tip: function () { return markTip(schemes[si], t); } };
        }
        return { id: 't' + rec.ti, kind: 'type', t: t, tip: function () { return countTip(t); } };
      }
      function hover(e, byKey) {
        var s = resolve(e.target);
        if (e.pointerType) firstTap = !!s && e.pointerType === 'touch' && (!hot || hot.id !== s.id);
        if (!s) { release(); return; }
        clearTimeout(clearT);
        s.byKey = !!byKey;
        if (!hot || hot.id !== s.id) {
          hot = s; paint();
          if (s.tip) k.tip.show(e, s.tip()); else k.tip.hide();
        } else {
          hot.byKey = s.byKey;
          if (s.tip) k.tip.show(e, null); // the same mark: the tooltip only follows the pointer
        }
      }
      function release(now) { // a short grace, so passing between two marks does not flash everything back
        clearTimeout(clearT);
        function go() { if (!hot) return; hot = null; paint(); k.tip.hide(); }
        if (now) go(); else clearT = setTimeout(go, 90);
      }
      function byKeyboard(n) { try { return n.matches(':focus-visible'); } catch (x) { return true; } }
      body.addEventListener('pointerover', function (e) { if (!(still && e.pointerType === 'mouse')) hover(e); });
      body.addEventListener('pointermove', function (e) {
        if (e.pointerType !== 'mouse') return;
        if (still) { // the browser's own move after the arrival does not count, the reader's first real one does
          if (!stillAt && !(e.movementX || e.movementY)) { stillAt = [e.clientX, e.clientY]; return; }
          if (stillAt && Math.abs(e.clientX - stillAt[0]) + Math.abs(e.clientY - stillAt[1]) < 3) return;
          still = false;
          hover(e);
        } else if (hot && !hot.byKey && hot.tip) k.tip.show(e, null);
      });
      // the pointer leaves: its focus goes (a tap's stays until the next tap, a keyboard's until the focus moves)
      body.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch' && hot && !hot.byKey) release(); });
      panel.addEventListener('pointerdown', function (e) { if (e.pointerType === 'touch' && !body.contains(e.target)) release(true); });
      body.addEventListener('focusin', function (e) { if (byKeyboard(e.target)) hover(e, true); }); // keyboard focus, not a click's
      body.addEventListener('focusout', function () { if (hot && hot.byKey) release(); });

      function dim(node, off) { if (node) node.classList.toggle('is-dim', !!off); }
      function paint() {
        // an open list keeps its type in focus while nothing else is
        var h = hot || (selected ? { kind: 'type', t: selected, quiet: true } : null);
        var kind = h ? h.kind : '', lit = {}; // lit: the levels in focus
        recs.forEach(function (rec) {
          var t = rec.t, on = t === selected, inType = true;
          if (kind === 'type') inType = h.t === t;
          else if (kind === 'level') inType = t.level === h.lv;
          else if (kind === 'paper') inType = h.types.indexOf(t) >= 0;
          else if (kind === 'scheme') inType = h.t === t; // the hovered mark's type, if any
          if (inType) lit[t.level] = 1;
          rec.box.classList.toggle('is-on', on);
          rec.box.classList.toggle('is-hot', (kind === 'type' || kind === 'level') && !h.quiet && inType);
          rec.name.setAttribute('aria-expanded', on ? 'true' : 'false');
          dim(rec.name, !(inType || (kind === 'scheme' && !h.t)));
          dim(rec.count, !inType);
          rec.marks.forEach(function (m, si) {
            var mine = kind === 'scheme' ? si === h.si : kind === 'legend' ? t.marks[schemes[si].key] === h.which : kind !== 'paper' && inType;
            dim(m, !mine);
            m.classList.toggle('is-lit', (kind === 'scheme' || kind === 'legend') && mine);
            m.classList.toggle('is-hover', kind === 'scheme' && m === h.mark);
          });
          rec.dots.forEach(function (d, j) {
            var mine = kind === 'paper' ? keys.get(t)[j] === h.key : kind === 'legend' ? (t.papers[j].s ? 'seed' : 'cited') === h.which : inType;
            dim(d, !mine);
            d.classList.toggle('is-hover', kind === 'paper' && d === h.dot);
            d.classList.toggle('is-twin', kind === 'paper' && mine && d !== h.dot);
            d.classList.toggle('is-hit', on && j === hit);
          });
        });
        Object.keys(heads).forEach(function (lv) {
          dim(heads[lv], kind && kind !== 'scheme' && kind !== 'legend' && !lit[lv]);
          heads[lv].classList.toggle('is-lit', kind === 'level' && h.lv === lv);
        });
        labels.forEach(function (a) {
          var si = +a.getAttribute('data-s');
          a.classList.toggle('is-lit', kind === 'scheme' && si === h.si);
          dim(a, kind === 'scheme' && si !== h.si);
        });
        keysOfLegend.forEach(function (n) {
          var mine = kind === 'legend' && n.getAttribute('data-legend') === h.which;
          n.classList.toggle('is-lit', mine);
          dim(n, kind === 'legend' && !mine);
        });
      }

      // ---------------------------------------------------------------- the list of papers, on a click
      function renderDetail() {
        detail.textContent = '';
        detail.hidden = !selected;
        if (!selected) return;
        var t = selected;
        var shown = expanded ? t.papers.length : Math.min(LIMIT, t.papers.length);
        var order = t.papers.map(function (p, i) { return i; });
        if (hit != null) order = [hit].concat(order.filter(function (i) { return i !== hit; })); // the clicked paper first
        var ol = el('ol', { class: 'cov-list', 'aria-label': 'Papers that define ' + lower(t.name) });
        order.slice(0, shown).forEach(function (i) {
          var p = t.papers[i];
          var written = p.w.map(function (w) { return (w[1] || w[0]).toLowerCase(); });
          var other = p.m.filter(function (m) { return written.indexOf(m) < 0; });
          ol.appendChild(el('li', { class: 'cov-item' + (hit === i ? ' is-hit' : '') },
            el('i', { class: 'cov-sw ' + (p.s ? 'is-seed' : 'is-cited') }),
            el('div', null,
              el('p', { class: 'cov-it' }, el('b', { text: title(p) }), ' ',
                el('span', { class: 'cov-faint', text: (p.y ? p.y + ' · ' : '') + (p.s ? 'seed' : 'cited') })),
              el('p', { class: 'cov-iw' }, 'Defines ' + termsText(p),
                other.length && p.m.length === other.length ? el('span', { class: 'cov-faint', text: ' (counted as ' + p.m.join(', ') + ')' }) : null),
              el('p', { class: 'cov-iq', text: '“' + p.q + '”' }))));
        });
        detail.appendChild(el('div', { class: 'cov-dhead' },
          el('div', null,
            el('h4', { class: 'cov-dtitle' }, t.name, ' ',
              el('span', { class: 'cov-dmeta' }, plural(t.data[0], 'paper') + ' ',
                el('span', null, '(', el('span', { class: 's', text: t.data[1] + ' seed' }), ', ', el('span', { class: 'c', text: t.data[2] + ' cited' }), ')'))),
            el('p', {
              class: 'cov-drule', html: 'Matched names: ' + t.search.map(function (s) { return '<i>' + esc(s) + '</i>'; }).join(', ') +
                (t.context ? '; the definition must also mention the ' + esc(data.context_words) : '') + '.'
            })),
          el('button', { type: 'button', class: 'cov-close', 'aria-label': 'Close the list', title: 'Close (Esc)', text: '×', onclick: function () { pick(null); } })));
        detail.appendChild(ol);
        detail.appendChild(el('p', { class: 'cov-foot' },
          shown < t.papers.length ? el('button', {
            type: 'button', class: 'fig-chip', text: 'Show all ' + t.papers.length,
            onclick: function () { expanded = true; renderDetail(); }
          }) : null,
          el('a', {
            class: 'fig-link', href: k.explorer('concepts'), target: '_blank', rel: 'noopener',
            text: t.explore.map(function (s) { return '“' + s + '”'; }).join(' or ') + ' in the Explorer →'
          })));
      }

      // a click on a type opens its list; the same click again (or on the dot already marked) closes it
      function pick(t, i) {
        if (i === undefined) i = null;
        if (t && t === selected && (i == null || i === hit)) t = null;
        var was = selected, inList = detail.contains(document.activeElement);
        if (t !== selected) expanded = false;
        selected = t;
        hit = t ? i : null;
        paint();
        renderDetail();
        if (!t) recs.forEach(function (rec) { // closed: back to the type the list belonged to
          if (rec.t !== was) return;
          if (inList) rec.name.focus({ preventScroll: true });
          rec.box.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' });
        });
        if (t) detail.scrollIntoView({ block: 'nearest', behavior: k.motion ? 'smooth' : 'auto' }); // the stage's own box scrolls, not the page
      }

      // Esc closes the list first (and keeps the stage open); a second Esc closes the stage
      document.addEventListener('keydown', function (e) {
        if (e.key !== 'Escape' || !selected || panel.hidden || !panel.offsetParent) return;
        e.preventDefault();
        e.stopPropagation();
        pick(null);
      }, true);

      k.onResize(render);

      // ---------------------------------------------------------------- how this is made
      var ctx = types.filter(function (t) { return t.context; }).map(function (t) { return lower(t.name); });
      var cite = function (s) {
        return '<a href="https://doi.org/' + esc(s.doi) + '" target="_blank" rel="noopener">' + esc(s.short.replace(/ (\d{4})$/, ' ($1)')) + '</a>';
      };
      k.method(
        '<p><b>The rule.</b> The eleven types are those that both ' + schemes.map(cite).join(' and ') + ' report, by name or under ' +
        'another name, with their levels and search names from the comparison table behind the printed figure. A paper counts once ' +
        'for a type when a term it defines, or a synonym its own paper gives for that term, matches one of the type’s search names ' +
        'once case, punctuation, spacing, plurals, British or American spelling and word order are set aside. For ' + ctx.map(esc).join(' and ') +
        ', which are also everyday words, the definition must also mention the ' + esc(data.context_words) + '. No match was removed by hand.</p>' +
        '<p><b>The data.</b> <code>scripts/figs/coverage.py</code> runs the MBDef code’s taxonomy-coverage analysis (tutorial 06) on the ' +
        'released definitions, term entries and papers, writes this figure’s data and checks every count against the print' +
        (diffs.length ? ': ' + diffs.map(function (t) { return esc(lower(t.name)) + ' has ' + t.data[0] + ' papers against ' + t.printed[0] + ' printed'; }).join(', and ') +
          '; all other counts are as printed' : '') + '. Quotes are cut after 30 words.</p>');
    }
  });
})();
