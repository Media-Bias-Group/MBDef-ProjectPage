/* Fig. 4, interactive: the printed figure come alive. The eleven bias types that two published classification schemes
   both report, grouped left to right by level as printed. Each type is a column: its count, one dot per MBDef paper
   that defines it (grey seed papers at the bottom, blue cited papers on top, like the printed bar), the two schemes'
   marks and its name. When the names do not fit side by side (phones), the types become rows. Hover or focus shows the
   numbers; a click on a type lists its papers, and a second click, the × or Esc closes the list. Data: static/data/figs/coverage.json, made by
   scripts/figs/coverage.py from the released tables. */
(function () {
  'use strict';

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function lower(name) { return name.charAt(0).toLowerCase() + name.slice(1); }
  function plural(n, one) { return n + ' ' + one + (n === 1 ? '' : 's'); }
  function pair(d) { return '(' + d[1] + ', ' + d[2] + ')'; }

  FIG.register('coverage', {
    build: function (panel, data, k) {
      var el = k.el, svgEl = k.svg, schemes = data.schemes, types = data.types, levels = data.levels;
      var LIMIT = 6;         // papers listed before 'Show all'
      var COLS_MIN = 940;    // from this chart width the types stand in columns, as printed (if their names fit)
      var PER = 5;           // dots per line of a column
      var selected = null, hit = null, expanded = false, mode = '', animate = k.motion, recs = [];

      function isDiff(t) { return data.differences.indexOf(t.name) >= 0; }
      function ofLevel(lv) { return types.filter(function (t) { return t.level === lv; }); }

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
      function tipOn(node, make) {
        function on(e) { k.tip.show(e, make()); }
        node.addEventListener('mouseenter', on);
        node.addEventListener('mousemove', on);
        node.addEventListener('mouseleave', k.tip.hide);
        node.addEventListener('focus', on);
        node.addEventListener('blur', k.tip.hide);
      }
      function countTip(t) {
        return el('div', null, el('b', { text: t.name }),
          el('div', { text: plural(t.data[0], 'paper') + ': ' + t.data[1] + ' seed, ' + t.data[2] + ' cited' }),
          isDiff(t) ? el('div', { class: 'k', text: '† Printed: ' + t.printed[0] + ' ' + pair(t.printed) }) : null);
      }
      function termsText(p) {
        return p.w.map(function (w) { return '“' + w[0] + '”' + (w[1] ? ', synonym “' + w[1] + '”' : ''); }).join('; ');
      }
      function paperTip(p) {
        return el('div', null, el('b', { text: p.t }),
          el('div', { class: 'k', text: (p.y ? p.y + ' · ' : '') + (p.s ? 'seed paper' : 'cited paper') }),
          el('div', { text: 'Defines ' + termsText(p) }));
      }
      function schemeLink(sch) {
        var a = el('a', { class: 'cov-scheme', href: 'https://doi.org/' + sch.doi, target: '_blank', rel: 'noopener', text: sch.short });
        tipOn(a, function () {
          return el('div', null, el('b', { text: sch.authors + ' (' + sch.year + ')' }), el('div', { text: sch.title + '. ' + sch.venue + '.' }));
        });
        return a;
      }

      // ---------------------------------------------------------------- the frame: chart, legend, † line, list
      var body = k.body();
      var chart = el('div', { class: 'cov-chart' });
      var legend = el('p', { class: 'cov-legend' },
        el('span', null, el('i', { class: 'cov-sw is-seed' }), 'Seed paper'),
        el('span', null, el('i', { class: 'cov-sw is-cited' }), 'Cited paper'),
        el('span', null, markSvg('full', 14), 'Listed'),
        el('span', null, markSvg('half', 14), 'Covered under a different name'));
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
        var rec = { t: t, ti: ti };
        rec.name = el('button', {
          type: 'button', class: 'cov-name', 'aria-expanded': selected === t ? 'true' : 'false',
          'aria-label': t.name + ': ' + plural(t.data[0], 'paper') + ', ' + t.data[1] + ' seed and ' + t.data[2] + ' cited. List the papers.',
          text: mode === 'cols' ? t.name.replace(/ \//g, '\u00a0/') : t.name // keep 'Gatekeeping /' on one line, as printed
        });
        tipOn(rec.name, function () { return countTip(t); });
        rec.count = el('span', { class: 'cov-count' },
          el('b', null, String(t.data[0]), isDiff(t) ? el('sup', { class: 'cov-dag', text: '†' }) : null),
          el('small', null, '(', el('span', { class: 's', text: t.data[1] }), ', ', el('span', { class: 'c', text: t.data[2] }), ')'));
        tipOn(rec.count, function () { return countTip(t); });
        rec.marks = schemes.map(function (sch) {
          var m = el('span', { class: 'cov-mark', tabindex: 0, role: 'img', 'aria-label': sch.short + ': ' + markText(sch, t) }, markSvg(t.marks[sch.key], 16));
          tipOn(m, function () { return el('div', null, el('b', { text: sch.short }), el('div', { text: markText(sch, t) })); });
          return m;
        });
        rec.cell = el('div', { class: 'cov-dotcell' });
        return rec;
      }
      function bindBox(rec, box) {
        rec.box = box;
        box.addEventListener('click', function (e) {
          var d = e.target.closest('.cov-dot');
          pick(rec.t, d ? +d.getAttribute('data-i') : null);
        });
        recs.push(rec);
      }

      // the dots: in columns they stack from the bottom up, PER to a line; in rows they run left to right
      function drawDots(rec, per, pitch) {
        var t = rec.t, n = t.papers.length, r = pitch * 0.37, up = mode === 'cols';
        var lines = Math.ceil(n / per);
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
            class: 'cov-dot ' + (p.s ? 'is-seed' : 'is-cited') + (selected === t && hit === i ? ' is-hit' : ''),
            tabindex: i === 0 ? 0 : -1, role: 'button',
            'aria-label': p.t + ', ' + (p.y ? p.y + ', ' : '') + (p.s ? 'seed' : 'cited') + ' paper; defines ' +
              p.w.map(function (x) { return x[0]; }).join(', ')
          });
          if (animate) c.style.animationDelay = (up ? 250 + rec.ti * 45 + line * 45 + col * 8 : rec.ti * 55 + i * 12) + 'ms';
          tipOn(c, function () { return paperTip(p); });
          c.addEventListener('keydown', function (e) {
            var j = null, step = up ? -per : per;
            if (e.key === 'ArrowRight') j = i + 1; else if (e.key === 'ArrowLeft') j = i - 1;
            else if (e.key === 'ArrowDown') j = i + step; else if (e.key === 'ArrowUp') j = i - step;
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
          chart.appendChild(el('div', { class: 'cov-lv', style: 'grid-column: ' + c + ' / span ' + group.length, text: lv }));
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
          chart.appendChild(el('div', { class: 'cov-lv', text: lv }));
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
        mode = m;
        chart.className = 'cov-chart is-' + mode + (animate ? ' is-entering' : '');
        chart.style.gridTemplateColumns = '';
        chart.textContent = '';
        recs = [];
        legend.className = 'cov-legend' + (mode === 'rows' ? ' is-top' : '');
        body.insertBefore(legend, mode === 'cols' ? chart.nextSibling : chart); // under the chart as printed; above the rows
        if (mode === 'cols') renderCols(width); else renderRows(width);
      }
      function render(width) {
        draw(width >= COLS_MIN ? 'cols' : 'rows', width);
        if (mode === 'cols' && chart.scrollWidth > chart.clientWidth + 1) draw('rows', width); // the names do not fit side by side
        paint();
        if (animate) {
          animate = false;
          setTimeout(function () { chart.classList.remove('is-entering'); }, 2400);
        }
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
        var list = el('ol', { class: 'cov-list', 'aria-label': 'Papers that define ' + lower(t.name) });
        order.slice(0, shown).forEach(function (i) {
          var p = t.papers[i];
          var written = p.w.map(function (w) { return (w[1] || w[0]).toLowerCase(); });
          var other = p.m.filter(function (m) { return written.indexOf(m) < 0; });
          list.appendChild(el('li', { class: 'cov-item' + (hit === i ? ' is-hit' : '') },
            el('i', { class: 'cov-sw ' + (p.s ? 'is-seed' : 'is-cited') }),
            el('div', null,
              el('p', { class: 'cov-it' }, el('b', { text: p.t }), ' ',
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
        detail.appendChild(list);
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

      function paint() {
        chart.classList.toggle('has-sel', !!selected);
        recs.forEach(function (rec) {
          var on = rec.t === selected;
          rec.box.classList.toggle('is-on', on);
          rec.name.setAttribute('aria-expanded', on ? 'true' : 'false');
          [].forEach.call(rec.cell.querySelectorAll('.cov-dot'), function (d, j) { d.classList.toggle('is-hit', on && j === hit); });
        });
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
