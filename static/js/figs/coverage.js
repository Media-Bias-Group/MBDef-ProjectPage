/* Fig. 4, interactive: how many MBDef papers define each of the eleven bias types that two published classification
   schemes both report. One row per type, grouped by level as printed; one dot per paper (grey seed, blue cited); two
   marks per row say how each scheme covers the type. Hover or focus a dot for the paper, click a dot or a type's name
   for the list of its papers with the term each one defines. Data: static/data/figs/coverage.json, made by
   scripts/figs/coverage.py from the released tables. */
(function () {
  'use strict';

  var GLOSS = {
    'Reporting level': 'what gets reported',
    'Statement level': 'how statements are presented',
    'Language level': 'which words are chosen'
  };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function lower(name) { return name.charAt(0).toLowerCase() + name.slice(1); }
  function shortTitle(t) { var i = t.indexOf(':'); return i > 12 ? t.slice(0, i) : t; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }

  FIG.register('coverage', {
    build: function (panel, data, k) {
      var el = k.el, svgEl = k.svg;
      var schemes = data.schemes, types = data.types;
      var byName = {};
      types.forEach(function (t) { byName[t.name] = t; });
      var selected = null, hit = null, narrow = false, entered = !k.motion, expanded = false;
      var LIMIT = 12; // papers listed before 'Show all'
      var rowsByName = {};

      // ---------------------------------------------------------------- head
      var defined = types.filter(function (t) { return t.data[0] > 0; }).length;
      k.head({
        fig: 'Fig. 4',
        title: 'Does MBDef cover the bias types that existing classification schemes name?',
        lead: 'Yes. All <b>' + (defined === 11 ? 'eleven' : defined) + '</b> bias types that two published classification ' +
          'schemes both report are defined in MBDef papers. Types about what gets reported and how statements are ' +
          'presented are defined often; language-level types are rare under the names the schemes use.',
        stats: [
          { value: defined + ' of ' + types.length, label: 'types defined in MBDef' },
          { value: String(data.in8), label: 'types defined in 8 or more papers' }
        ]
      });

      // ---------------------------------------------------------------- legend
      function markSvg(kind, size) {
        var s = size || 16, c = s / 2, r = s / 2 - 2;
        var g = svgEl('svg', { width: s, height: s, viewBox: '0 0 ' + s + ' ' + s, 'aria-hidden': 'true', class: 'cov-mark-svg' });
        if (kind === 'full') g.appendChild(svgEl('circle', { cx: c, cy: c, r: r, class: 'cov-mark-fill' }));
        else {
          g.appendChild(svgEl('circle', { cx: c, cy: c, r: r - 0.6, class: 'cov-mark-ring' }));
          g.appendChild(svgEl('path', { d: 'M' + c + ' ' + (c - r + 0.6) + ' A' + (r - 0.6) + ' ' + (r - 0.6) + ' 0 0 0 ' + c + ' ' + (c + r - 0.6) + ' Z', class: 'cov-mark-fill' }));
        }
        return g;
      }
      var body = k.body();
      body.appendChild(el('div', { class: 'fig-legend cov-legend' },
        el('span', { class: 'cov-leg-group' },
          el('span', { class: 'cov-leg-k', text: 'One dot per paper' }),
          el('span', null, el('i', { class: 'cov-sw is-seed' }), el('b', { text: 'Seed paper' }), ', found by the literature search'),
          el('span', null, el('i', { class: 'cov-sw is-cited' }), el('b', { text: 'Cited paper' }), ', added because a seed paper cites it')),
        el('span', { class: 'cov-leg-group' },
          el('span', { class: 'cov-leg-k', text: 'Scheme marks' }),
          el('span', { class: 'cov-leg-mark' }, markSvg('full', 14), 'Listed by the scheme'),
          el('span', { class: 'cov-leg-mark' }, markSvg('half', 14), 'Covered under a different name'))));

      var chart = el('div', { class: 'cov-chart' + (k.motion ? ' cov-pre' : '') });
      body.appendChild(chart);

      // ---------------------------------------------------------------- the note on printed numbers
      var diffs = data.differences.map(function (n) { return byName[n]; });
      function diffWords(t) {
        var parts = [];
        [[1, 'seed'], [2, 'cited']].forEach(function (p) {
          var d = t.data[p[0]] - t.printed[p[0]];
          if (d) parts.push((Math.abs(d) === 1 ? 'one' : Math.abs(d)) + (d > 0 ? ' more ' : ' fewer ') + p[1] + ' paper' + (Math.abs(d) === 1 ? '' : 's'));
        });
        return parts.join(' and ');
      }
      if (diffs.length) {
        body.appendChild(el('p', {
          class: 'cov-diff', html: '<span class="cov-dag">†</span> ' + (diffs.length === 1 ? 'One count differs' : 'Two counts differ') +
            ' from the printed figure: ' + diffs.map(function (t) {
              return '<i>' + esc(lower(t.name)) + '</i> has ' + t.data[0] + ' papers here and ' + t.printed[0] + ' in print (' + diffWords(t) + ')';
            }).join('; ') + '. The dots follow the released data.'
        }));
      }

      var detail = el('div', { class: 'cov-detail', 'aria-live': 'polite' });
      body.appendChild(detail);

      // ---------------------------------------------------------------- tooltips
      function paperNode(t, p) {
        var terms = p.w.map(function (w) {
          return w[1] ? '“' + w[0] + '”, giving “' + w[1] + '” as a synonym' : '“' + w[0] + '”';
        }).join('; ');
        return el('div', null,
          el('b', { text: p.t }),
          el('div', { class: 'k', text: (p.y || 'year unknown') + ' · ' + (p.s ? 'seed paper' : 'cited paper') }),
          el('div', { text: 'Defines ' + terms }),
          el('div', { class: 'k', text: 'Click to list all ' + plural(t.data[0], 'paper') + ' of this type' }));
      }
      function markText(sch, t) {
        var kind = t.marks[sch.key], a = t.alias[sch.key];
        if (kind === 'full') return 'Listed as a type of its own.';
        if (a) return 'Covered under a different name: ' + a[0] + ' (its Section ' + a[1] + ').';
        return 'Covered under a different name; the comparison table behind the printed figure does not say which.';
      }
      function refNode(sch) {
        return el('div', null, el('b', { text: sch.authors + ' (' + sch.year + ')' }),
          el('div', { text: sch.title + '. ' + sch.venue + '.' }),
          el('div', { class: 'k', text: 'Opens the publication' }));
      }
      function tipOn(node, make) {
        node.addEventListener('mouseenter', function (e) { k.tip.show(e, make()); });
        node.addEventListener('mousemove', function (e) { k.tip.show(e, make()); });
        node.addEventListener('mouseleave', k.tip.hide);
        node.addEventListener('focus', function (e) { k.tip.show(e, make()); });
        node.addEventListener('blur', k.tip.hide);
      }

      // ---------------------------------------------------------------- rows
      function headRow() {
        var row = el('div', { class: 'cov-row cov-headrow' },
          el('span', { class: 'cov-h cov-h-name', text: 'Bias type' }),
          schemes.map(function (sch) {
            var a = el('a', { class: 'cov-h cov-h-scheme', href: 'https://doi.org/' + sch.doi, target: '_blank', rel: 'noopener', text: sch.short });
            tipOn(a, function () { return refNode(sch); });
            return a;
          }),
          el('span', { class: 'cov-h cov-h-n', text: 'Papers' }));
        return row;
      }

      function typeRow(t, ti) {
        var name = el('button', {
          type: 'button', class: 'cov-name', 'aria-expanded': selected === t ? 'true' : 'false',
          'aria-label': t.name + ': ' + plural(t.data[0], 'paper') + ', ' + t.data[1] + ' seed and ' + t.data[2] + ' cited. Show the papers.',
          text: t.name,
          onclick: function () { select(selected === t ? null : t, null); }
        });
        var marks = schemes.map(function (sch) {
          var b = el('button', { type: 'button', class: 'cov-mark', 'aria-label': sch.short + ': ' + markText(sch, t) }, markSvg(t.marks[sch.key]));
          tipOn(b, function () { return el('div', null, el('b', { text: sch.short }), el('div', { text: markText(sch, t) })); });
          return b;
        });
        var isDiff = data.differences.indexOf(t.name) >= 0;
        var count = el('span', { class: 'cov-count' },
          el('b', null, String(t.data[0]), isDiff ? el('sup', { class: 'cov-dag', text: '†' }) : null),
          el('small', null, el('span', { class: 's', text: t.data[1] }), ' + ', el('span', { class: 'c', text: t.data[2] })));
        tipOn(count, function () {
          return el('div', null, el('b', { text: plural(t.data[0], 'paper') }),
            el('div', { text: t.data[1] + ' seed, ' + t.data[2] + ' cited' }),
            isDiff ? el('div', { class: 'k', text: 'Printed figure: ' + t.printed[0] + ' (' + t.printed[1] + ' seed, ' + t.printed[2] + ' cited)' }) : null);
        });
        var dotCell = el('div', { class: 'cov-dotcell' });
        var row = el('div', { class: 'cov-row cov-type' + (selected === t ? ' is-on' : '') }, name, marks, count, dotCell);
        rowsByName[t.name] = { row: row, name: name, cell: dotCell, t: t, ti: ti };
        return row;
      }

      function drawDots(rec) {
        var t = rec.t, w = Math.max(60, Math.floor(rec.cell.clientWidth));
        var pitch = narrow ? 13 : 14, r = narrow ? 4.8 : 5.2;
        var per = Math.max(1, Math.floor((w - 2 * r - 2) / pitch) + 1);
        var n = t.papers.length, lines = Math.max(1, Math.ceil(n / per));
        var h = (lines - 1) * pitch + 2 * r + 4;
        var g = svgEl('svg', {
          class: 'cov-dots', width: w, height: h, viewBox: '0 0 ' + w + ' ' + h, role: 'group',
          'aria-label': plural(n, 'paper') + ' define ' + lower(t.name) + ', one dot each; use the arrow keys to move between them'
        });
        var dots = [];
        t.papers.forEach(function (p, i) {
          var c = svgEl('circle', {
            cx: r + 2 + (i % per) * pitch, cy: r + 2 + Math.floor(i / per) * pitch, r: r,
            class: 'cov-dot ' + (p.s ? 'is-seed' : 'is-cited') + (selected === t && hit === i ? ' is-hit' : ''),
            tabindex: i === 0 ? 0 : -1, role: 'button',
            'aria-label': p.t + ', ' + (p.y || 'year unknown') + ', ' + (p.s ? 'seed' : 'cited') + ' paper; defines ' +
              p.w.map(function (x) { return x[0]; }).join(', ')
          });
          if (!entered) c.style.transitionDelay = (rec.ti * 55 + i * 16) + 'ms';
          tipOn(c, function () { return paperNode(t, p); });
          c.addEventListener('click', function () { select(t, i); });
          c.addEventListener('keydown', function (e) {
            var j = null;
            if (e.key === 'ArrowRight') j = i + 1; else if (e.key === 'ArrowLeft') j = i - 1;
            else if (e.key === 'ArrowDown') j = i + per; else if (e.key === 'ArrowUp') j = i - per;
            else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = n - 1;
            else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(t, i); return; }
            if (j == null) return;
            e.preventDefault();
            j = Math.max(0, Math.min(n - 1, j));
            dots[i].setAttribute('tabindex', '-1');
            dots[j].setAttribute('tabindex', '0');
            dots[j].focus();
          });
          dots.push(c);
          g.appendChild(c);
        });
        rec.cell.textContent = '';
        rec.cell.appendChild(g);
      }

      function render(width) {
        narrow = width < 640;
        chart.classList.toggle('is-narrow', narrow);
        chart.classList.toggle('has-sel', !!selected);
        chart.textContent = '';
        rowsByName = {};
        chart.appendChild(headRow());
        var ti = 0;
        data.levels.forEach(function (lv) {
          chart.appendChild(el('div', { class: 'cov-level' },
            el('span', { class: 'cov-level-k', text: lv }), el('span', { class: 'cov-level-g', text: GLOSS[lv] || '' })));
          types.forEach(function (t) { if (t.level === lv) chart.appendChild(typeRow(t, ti++)); });
        });
        Object.keys(rowsByName).forEach(function (n) { drawDots(rowsByName[n]); });
      }

      // ---------------------------------------------------------------- the list of papers
      function hint() {
        detail.classList.remove('is-open');
        detail.textContent = '';
        detail.appendChild(el('p', { class: 'cov-hint', text: 'Click a type’s name or any dot to list the papers behind it, with the term each paper defines and a short quote.' }));
      }

      function renderDetail() {
        if (!selected) { hint(); return; }
        var t = selected;
        detail.classList.add('is-open');
        detail.textContent = '';
        var schemeLine = schemes.map(function (sch) { return '<b>' + esc(sch.short) + '</b>: ' + esc(lower(markText(sch, t))); }).join(' ');
        var isDiff = data.differences.indexOf(t.name) >= 0;
        var list = el('ol', { class: 'cov-list', 'aria-label': 'Papers that define ' + lower(t.name) });
        var shown = expanded || (hit != null && hit >= LIMIT) ? t.papers.length : Math.min(LIMIT, t.papers.length);
        t.papers.slice(0, shown).forEach(function (p, i) {
          var terms = p.w.map(function (w) {
            return '“' + esc(w[0]) + '”' + (w[1] ? ', giving “' + esc(w[1]) + '” as a synonym' : '');
          }).join('; ');
          var written = p.w.map(function (w) { return (w[1] || w[0]).toLowerCase(); });
          var other = p.m.filter(function (m) { return written.indexOf(m) < 0; });
          var counted = other.length && p.m.length === other.length ? ' <span class="cov-faint">(counted as ' + p.m.map(esc).join(', ') + ')</span>' : '';
          list.appendChild(el('li', { class: 'cov-item' + (hit === i ? ' is-hit' : '') },
            el('i', { class: 'cov-sw ' + (p.s ? 'is-seed' : 'is-cited') }),
            el('div', null,
              el('p', { class: 'cov-it' }, el('b', { text: p.t }), ' ',
                el('span', { class: 'cov-faint', text: (p.y || 'year unknown') + ' · ' + (p.s ? 'seed' : 'cited') + (p.n > 1 ? ' · ' + p.n + ' matching definitions' : '') })),
              el('p', { class: 'cov-iw', html: 'Defines ' + terms + counted }),
              el('p', { class: 'cov-iq', text: '“' + p.q + '”' }))));
        });
        detail.appendChild(el('div', { class: 'cov-dhead' },
          el('div', null,
            el('p', { class: 'cov-deyebrow', text: t.level }),
            el('h4', { class: 'cov-dtitle', text: t.name }),
            el('p', { class: 'cov-dmeta' }, el('b', { text: plural(t.data[0], 'paper') }), ': ',
              el('span', { class: 's', text: t.data[1] + ' seed' }), ', ', el('span', { class: 'c', text: t.data[2] + ' cited' }),
              isDiff ? el('span', { class: 'cov-faint', text: ' (printed: ' + t.printed[0] + ', with ' + t.printed[1] + ' seed)' }) : null)),
          el('button', { type: 'button', class: 'cov-close', 'aria-label': 'Close the list', text: '×', onclick: function () { select(null, null); } })));
        detail.appendChild(el('p', {
          class: 'cov-drule', html: 'Counted when a paper defines one of these names, or gives one as a synonym of the term it defines: ' +
            t.search.map(function (s) { return '<i>' + esc(s) + '</i>'; }).join(', ') + '.' +
            (t.context ? ' Because these are also everyday words, the definition must also mention the ' + esc(data.context_words) + '.' : '')
        }));
        detail.appendChild(el('p', { class: 'cov-drule', html: schemeLine }));
        detail.appendChild(list);
        if (shown < t.papers.length) {
          detail.appendChild(el('button', {
            type: 'button', class: 'fig-chip cov-more', text: 'Show all ' + t.papers.length + ' papers',
            onclick: function () { expanded = true; renderDetail(); }
          }));
        }
        detail.appendChild(el('p', { class: 'cov-explore' },
          el('a', {
            class: 'fig-link', href: k.explorer('concepts'), target: '_blank', rel: 'noopener',
            text: 'Search ' + t.explore.map(function (s) { return '“' + s + '”'; }).join(' or ') + ' in the Explorer’s Concepts tab for every definition →'
          })));
      }

      function select(t, i) {
        if (t !== selected) expanded = false;
        selected = t;
        hit = t ? i : null;
        chart.classList.toggle('has-sel', !!t);
        Object.keys(rowsByName).forEach(function (n) {
          var rec = rowsByName[n], on = rec.t === t;
          rec.row.classList.toggle('is-on', on);
          rec.name.setAttribute('aria-expanded', on ? 'true' : 'false');
          [].forEach.call(rec.cell.querySelectorAll('.cov-dot'), function (d, j) { d.classList.toggle('is-hit', on && j === hit); });
        });
        renderDetail();
        if (t) {
          var r = detail.getBoundingClientRect();
          if (r.top > window.innerHeight - 140) window.scrollBy({ top: r.top - window.innerHeight * 0.3, behavior: k.motion ? 'smooth' : 'auto' });
        }
      }

      k.onResize(render);
      hint();

      // ---------------------------------------------------------------- one entrance: the dots fill in, row by row
      function enter() {
        entered = true;
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            chart.classList.remove('cov-pre');
            setTimeout(function () {
              [].forEach.call(chart.querySelectorAll('.cov-dot'), function (d) { d.style.transitionDelay = ''; });
            }, 1600);
          });
        });
      }
      if (!entered) {
        if ('IntersectionObserver' in window) {
          var io = new IntersectionObserver(function (es) {
            if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); enter(); }
          }, { threshold: 0.15 });
          io.observe(chart);
        } else enter();
      }

      // ---------------------------------------------------------------- notes and method
      var top = byName[data.example.top], few = byName[data.example.fewest];
      var topWord = top.explore[0], topWordN = top.papers.filter(function (p) { return p.m.indexOf(topWord) >= 0; }).length;
      var fp = few.papers[0], plain = data.example.plain[few.name];
      var fewAlias = schemes.filter(function (s) { return few.alias[s.key]; })[0];
      var framing = byName['Framing bias'], framePlain = data.example.plain['Framing bias'];
      var stanceN = framing.papers.filter(function (p) { return p.m.indexOf('stance') >= 0; }).length;
      var topDiff = data.differences.indexOf(top.name) >= 0;

      k.notes({
        what: 'The eleven bias types that both <b>' + esc(schemes[0].short.replace(/ (\d{4})$/, ' ($1)')) + '</b> and <b>' +
          esc(schemes[1].short.replace(/ (\d{4})$/, ' ($1)')) + '</b> report, grouped by the level at which the bias works. ' +
          'Each dot is one MBDef paper that defines the type: grey for a seed paper, blue for a paper added because a seed paper cites it. ' +
          'The two marks per row say how each scheme covers the type.',
        why: 'Both schemes come from reviews of mostly computer-science work aimed at detection systems. MBDef collects definitions from many ' +
          'disciplines, so it shows which of the schemes’ types the wider literature defines, and gives each one its competing definitions with their sources.',
        read: 'The matching is automatic, not a semantic review: a paper counts when the term it defines, or a synonym it gives, matches one of ' +
          'the type’s search names once case, spelling, plurals and word order are set aside. It counts names, not meanings: <b>' + k.nf(framePlain.papers) +
          '</b> MBDef papers define <i>' + esc(framePlain.word) + '</i>, but framing bias counts only papers that use one of its search names (' +
          framing.search.map(esc).join(', ') + '): ' + framing.data[0] + ', ' + stanceN + ' of them for <i>stance</i>.',
        example: '<b>' + esc(top.name) + '</b>, the type with the most papers: ' + top.data[0] + ' (' + top.data[1] + ' seed, ' + top.data[2] + ' cited' +
          (topDiff ? '; ' + top.printed[0] + ' in print' : '') + '), ' + topWordN + ' of them under the word <i>' + esc(topWord) + '</i>. <b>' + esc(few.name) +
          '</b>, the language-level type with the fewest: ' + plural(few.data[0], 'paper') + (few.data[0] === 1 ? ', a ' + (fp.s ? 'seed' : 'cited') +
          ' paper' + (fp.y ? ' from ' + fp.y : '') + ', <i>' + esc(shortTitle(fp.t)) + '</i>' : '') + '. Yet ' + plain.papers + ' MBDef papers define <i>' + esc(plain.word) +
          '</i> itself' + (fewAlias ? ', and ' + esc(fewAlias.short.replace(/ \d{4}$/, '')) + ' cover it as ' + esc(few.alias[fewAlias.key][0]) : '') +
          ': the idea is there, under other names.'
      });

      var ref = function (s) {
        return esc(s.authors) + ' (' + s.year + '). ' + esc(s.title) + '. <i>' + esc(s.venue) + '</i>. <a href="https://doi.org/' + esc(s.doi) +
          '" target="_blank" rel="noopener">doi.org/' + esc(s.doi) + '</a>';
      };
      k.method(
        '<p><b>The types.</b> The eleven types, their levels, how each scheme covers them and the search names of each type come from the ' +
        'comparison table behind the printed figure. Only types that both schemes report, by name or under another name, are shown.</p>' +
        '<p><b>The rule.</b> A definition counts for a type when one of the type’s search names matches the term it defines, or a synonym its own ' +
        'paper gives for that term, once case, punctuation, spacing, plurals, British or American spelling and word order are set aside (the rule ' +
        'that merged MBDef’s terms). For gatekeeping / selection bias and framing bias, which are also everyday words, the definition must also ' +
        'mention the ' + esc(data.context_words) + '. A paper counts once per type, however many of its definitions match. No match was rejected ' +
        'by hand: every dot is an automatic match, and the list under the chart lets a reader judge each one.</p>' +
        '<p><b>The data.</b> MBDef’s released tables of definitions (each defined term and its text), term entries (the synonyms each paper gives) ' +
        'and papers (title, year, seed or cited). The MBDef code’s taxonomy-coverage analysis (tutorial 06) does the matching; ' +
        '<code>scripts/figs/coverage.py</code> runs it, writes this figure’s data and checks every count against the printed figure' +
        (diffs.length ? ': ' + diffs.map(function (t) { return esc(lower(t.name)) + ' has ' + t.data[0] + ' papers in the released data against ' + t.printed[0] + ' printed'; }).join(', and ') + '; all other counts are as printed' : '') + '. Quotes are cut after 30 words.</p>' +
        '<p><b>The schemes.</b> ' + schemes.map(ref).join('<br>') + '</p>');
    }
  });
})();
