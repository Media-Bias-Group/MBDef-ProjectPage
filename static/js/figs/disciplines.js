/* The interactive Fig. 2: which research fields the 6,115 papers come from (data: static/data/figs/disciplines.json,
   made by scripts/figs/disciplines.py).

   One row per field, as printed: a stacked bar (seed papers grey, cited papers blue) on one shared scale, the total
   and its share on the right. Hover or focus a row for its numbers; click (or Enter) opens the field in place: its
   subfields, each as a share of the field, and the papers with the most definitions. A click on a subfield narrows
   the paper list to it. The bars and the Social Sciences subfields carry the printed counts; everything else in an
   opened field comes from a fresh OpenAlex lookup and says so. */
(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) { var p = iso.split('-'); return +p[2] + ' ' + MONTHS[+p[1] - 1] + ' ' + p[0]; }
  function sum(n) { return n[0] + n[1]; }
  function words(n) { return ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][n] || String(n); }
  function niceMax(v) { var step = Math.pow(10, Math.floor(Math.log10(v))); return Math.ceil(v / step) * step; }

  FIG.register('disciplines', {
    build: function (panel, data, k) {
      var el = k.el, nf = k.nf, pct = k.pct;
      function share(a, b) { return pct(a, b, a / b < 0.1 ? 1 : 0); }   // 49%, 6.2%, 0.3%
      var N = data.total, NS = data.seeds, NC = data.cited, F = data.fields, L = data.lookup;
      var social = F[0], cs = F[1];
      var when = day(L.to);
      var OTHER = 'Other classified fields', UNCL = 'Unclassified';

      // ---------------------------------------------------------------- head
      k.head({
        fig: 'Fig. 2',
        title: 'Which research fields do the 6,115 papers come from?',
        lead: 'Mostly the social sciences: <b>' + nf(sum(social.n)) + ' of the ' + nf(N) + ' papers (' + pct(sum(social.n), N) +
          ')</b>, each counted once under the field OpenAlex gives it. Computer science follows with ' + nf(sum(cs.n)) +
          ' (' + pct(sum(cs.n), N) + ').',
        stats: [
          { value: pct(sum(social.n), N), label: 'social sciences' },
          { value: pct(sum(cs.n), N), label: 'computer science' }
        ]
      });

      // ---------------------------------------------------------------- the chart
      var body = k.body();
      body.classList.add('dsc');
      body.appendChild(el('div', { class: 'fig-legend dsc-legend' },
        el('span', null, el('i', { style: 'background:var(--fig-seed)' }), el('b', { text: 'Seed papers' }), ' found by the keyword search (' + nf(NS) + ')'),
        el('span', null, el('i', { style: 'background:var(--fig-closure)' }), el('b', { text: 'Cited papers' }), ' added through the seed papers’ citations (' + nf(NC) + ')'),
        el('span', { class: 'dsc-hint', text: 'Click a field to open its subfields and papers' })));

      var max = niceMax(Math.max.apply(null, F.map(function (f) { return sum(f.n); })));
      var chart = el('div', { class: 'dsc-chart' });
      body.appendChild(chart);
      var axis = el('div', { class: 'dsc-axis', 'aria-hidden': 'true' }, el('span', { class: 'dsc-axis-pad' }), el('span', { class: 'dsc-ticks' }), el('span', { class: 'dsc-axis-lab', text: 'papers' }));
      chart.appendChild(axis);

      var rows = [], open = -1;
      F.forEach(function (f, i) {
        var t = sum(f.n);
        var segS = el('i', { class: 'dsc-s', style: 'width:' + (100 * f.n[0] / t) + '%' }, el('span', { text: nf(f.n[0]) }));
        var segC = el('i', { class: 'dsc-c', style: 'width:' + (100 * f.n[1] / t) + '%' }, el('span', { text: nf(f.n[1]) }));
        var bar = el('span', { class: 'dsc-bar', style: 'width:' + (100 * t / max) + '%;--i:' + i }, segS, segC);
        var name = f.name === UNCL ? el('span', { class: 'dsc-name' }, 'Unclassified', el('small', { text: 'no field in OpenAlex' })) : el('span', { class: 'dsc-name', text: f.name });
        var btn = el('button', {
          type: 'button', class: 'dsc-btn', 'aria-expanded': 'false', 'aria-controls': 'dsc-detail-' + i,
          'aria-label': f.name + ': ' + nf(t) + ' papers, ' + pct(t, N) + ' of all; ' + nf(f.n[0]) + ' seed, ' + nf(f.n[1]) + ' cited.'
        },
          name,
          el('span', { class: 'dsc-track' }, bar),
          el('span', { class: 'dsc-val' }, el('b', { text: nf(t) }), el('span', { text: pct(t, N) })));
        var detail = el('div', { class: 'dsc-detail', id: 'dsc-detail-' + i, hidden: true });
        var row = el('div', { class: 'dsc-row' + (f.name === UNCL ? ' is-uncl' : f.name === OTHER ? ' is-other' : '') }, btn, detail);
        chart.appendChild(row);
        rows.push({ f: f, row: row, btn: btn, detail: detail, segs: [[segS, f.n[0]], [segC, f.n[1]]], t: t, built: false });

        btn.addEventListener('mouseenter', function (e) { k.tip.show(e, fieldTip(f)); });
        btn.addEventListener('mousemove', function (e) { k.tip.show(e, fieldTip(f)); });
        btn.addEventListener('mouseleave', k.tip.hide);
        btn.addEventListener('focus', function (e) { if (btn.matches(':focus-visible')) k.tip.show(e, fieldTip(f)); });
        btn.addEventListener('blur', k.tip.hide);
        btn.addEventListener('click', function () { k.tip.hide(); toggle(i); });
      });

      // the fresh lookup against the print, said once under the chart
      var up = [], down = null;
      F.forEach(function (f) {
        var d = sum(f.today) - sum(f.n);
        if (f.name === UNCL) down = d; else if (d > 0) up.push([f.name, d]);
      });
      var driftText = L.same_as_print
        ? 'Asked again on ' + when + ', OpenAlex gives every count printed here.'
        : 'Asked again on ' + when + ', OpenAlex classifies ' + nf(-down) + ' more papers (' + nf(sum(F[F.length - 1].today)) +
          ' unclassified instead of ' + nf(sum(F[F.length - 1].n)) + '): ' + driftList(up) + '; the other bars are unchanged.';
      body.appendChild(el('p', { class: 'dsc-note' },
        el('b', { text: 'Bars as printed in the paper. ' }), driftText,
        ' Subfields of the other fields and the papers listed come from that lookup.'));

      function driftList(list) {
        var groups = {};
        list.forEach(function (x) { (groups[x[1]] = groups[x[1]] || []).push(x[0]); });
        return Object.keys(groups).map(Number).sort(function (a, b) { return b - a; }).map(function (d) {
          var names = groups[d];
          var who = names.length === 1 ? names[0] : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
          return who + ' +' + nf(d) + (names.length > 1 ? ' each' : '');
        }).join(', ');
      }

      // ---------------------------------------------------------------- tooltips
      function sw(c) { return '<i class="dsc-sw" style="background:var(' + c + ')"></i>'; }
      function fieldTip(f) {
        var t = sum(f.n);
        return '<b>' + f.name + '</b><br>' + nf(t) + ' papers · ' + pct(t, N) + ' of all ' + nf(N) + '<br>' +
          sw('--fig-seed') + nf(f.n[0]) + ' seed · <span class="k">' + pct(f.n[0], NS) + ' of all seed papers</span><br>' +
          sw('--fig-closure') + nf(f.n[1]) + ' cited · <span class="k">' + pct(f.n[1], NC) + ' of all cited papers</span>' +
          (f.name === UNCL ? '<br><span class="k">Not a field: OpenAlex gave these papers no topic.</span>' : '') +
          '<br><span class="k">' + (open >= 0 && rows[open].f === f ? 'Click to close' : 'Click to open its ' + (f.name === UNCL ? 'reasons' : f.name === OTHER ? 'fields and papers' : 'subfields and papers')) + '</span>';
      }
      function subTip(s, whole, parent, today) {
        var t = sum(s.n);
        return '<b>' + s.name + '</b> <span class="k">(' + parent + ')</span><br>' + nf(t) + ' papers · ' + pct(t, whole) + ' of the ' + nf(whole) + '<br>' +
          sw('--fig-seed') + nf(s.n[0]) + ' seed · ' + sw('--fig-closure') + nf(s.n[1]) + ' cited' +
          (s.members ? '<br><span class="k">' + s.members + ' smaller ' + (parent === OTHER ? 'fields' : 'subfields') + ' together</span>' : '') +
          '<br><span class="k">' + (today ? 'OpenAlex, ' + when : 'As printed in the paper') + '</span>';
      }

      // ---------------------------------------------------------------- open a field in place
      function toggle(i) {
        if (open >= 0) { rows[open].detail.hidden = true; rows[open].btn.setAttribute('aria-expanded', 'false'); rows[open].row.classList.remove('is-open'); }
        if (open === i) { open = -1; return; }
        var r = rows[i];
        if (!r.built) { fillDetail(r); r.built = true; }
        r.detail.hidden = false; r.btn.setAttribute('aria-expanded', 'true'); r.row.classList.add('is-open');
        open = i;
      }

      function fillDetail(r) {
        var f = r.f, d = r.detail, printed = !!f.printed_inset;
        if (f.name === UNCL) return fillUnclassified(r);
        var whole = printed ? sum(f.n) : sum(f.today);
        var kind = f.name === OTHER ? 'fields' : 'subfields';
        var src = printed ? 'as printed in the paper' : 'OpenAlex, ' + when;
        var cap = 'Each bar is a share of the ' + nf(whole) + ' papers' + (printed ? '' : ' OpenAlex puts in this ' + (f.name === OTHER ? 'bar' : 'field') + ' today') + '.';
        if (!printed && whole !== sum(f.n)) cap += ' The paper’s lookup counted ' + nf(sum(f.n)) + '.';
        if (f.parts) cap += ' ' + f.parts.map(function (p) { return p[0] + ' (' + nf(p[1]) + ')'; }).join(' and ') + ' are drawn as one bar, as in the paper.';

        var list = el('ol', { class: 'dsc-papers' });
        var listName = el('span');
        var listHead = el('p', { class: 'dsc-k' }, listName, el('span', { class: 'dsc-src is-today', text: 'OpenAlex, ' + when }));
        var reset = el('button', { type: 'button', class: 'dsc-reset', hidden: true, text: '← All of ' + f.name });
        var subs = [], sel = -1;
        function showPapers(items, where) {
          listName.textContent = where ? 'Top papers in ' + where : 'Papers with the most definitions';
          list.textContent = '';
          items.forEach(function (p) {
            list.appendChild(el('li', null,
              el('i', { class: 'dsc-dot', style: 'background:var(' + (p.c === 's' ? '--fig-seed' : '--fig-closure') + ')', title: p.c === 's' ? 'seed paper' : 'cited paper' }),
              el('span', { class: 'dsc-ptitle', text: p.t }),
              el('span', { class: 'dsc-pmeta', text: (p.y ? p.y + ' · ' : '') + (p.c === 's' ? 'seed' : 'cited') + ' paper · ' + nf(p.d) + ' definitions' })));
          });
          if (!items.length) list.appendChild(el('li', { class: 'dsc-none', text: 'None of its papers has a title that OpenAlex confirms.' }));
        }
        function pick(j) {
          sel = sel === j ? -1 : j;
          subs.forEach(function (b, m) { b.setAttribute('aria-pressed', m === sel ? 'true' : 'false'); });
          reset.hidden = sel < 0;
          if (sel < 0) showPapers(f.papers); else showPapers(f.subfields[sel].papers, f.subfields[sel].name);
        }
        reset.addEventListener('click', function () { pick(sel); });

        var subWrap = el('div', { class: 'dsc-subs', role: 'group', 'aria-label': (kind === 'fields' ? 'Fields in ' : 'Subfields of ') + f.name });
        f.subfields.forEach(function (s, j) {
          var t = sum(s.n);
          var b = el('button', {
            type: 'button', class: 'dsc-sub', 'aria-pressed': 'false',
            'aria-label': s.name + ': ' + nf(t) + ' papers, ' + pct(t, whole) + ' of the field; ' + nf(s.n[0]) + ' seed, ' + nf(s.n[1]) + ' cited. Show its papers.'
          },
            el('span', { class: 'dsc-name', text: s.name }),
            el('span', { class: 'dsc-track' }, el('span', { class: 'dsc-bar', style: 'width:' + (100 * t / whole) + '%' },
              el('i', { class: 'dsc-s', style: 'width:' + (100 * s.n[0] / Math.max(t, 1)) + '%' }),
              el('i', { class: 'dsc-c', style: 'width:' + (100 * s.n[1] / Math.max(t, 1)) + '%' }))),
            el('span', { class: 'dsc-val' }, el('b', { text: nf(t) }), el('span', { text: share(t, whole) })));
          var tipFn = function (e) { k.tip.show(e, subTip(s, whole, f.name, !printed)); };
          b.addEventListener('mouseenter', tipFn); b.addEventListener('mousemove', tipFn);
          b.addEventListener('mouseleave', k.tip.hide); b.addEventListener('blur', k.tip.hide);
          b.addEventListener('focus', function (e) { if (b.matches(':focus-visible')) tipFn(e); });
          b.addEventListener('click', function () { k.tip.hide(); pick(j); });
          subs.push(b); subWrap.appendChild(b);
        });

        showPapers(f.papers);
        d.appendChild(el('div', { class: 'dsc-detail-in' },
          el('div', { class: 'dsc-col' },
            el('p', { class: 'dsc-k' }, (kind === 'fields' ? 'The fields in this bar' : 'Subfields of ' + f.name), el('span', { class: 'dsc-src' + (printed ? '' : ' is-today'), text: src })),
            el('p', { class: 'dsc-cap', text: cap }),
            subWrap),
          el('div', { class: 'dsc-col' },
            el('div', { class: 'dsc-phead' }, listHead, reset),
            el('p', { class: 'dsc-cap' }, 'Picked by the number of definitions MBDef holds from each, among the papers whose title OpenAlex confirms.'),
            list,
            el('a', { class: 'fig-link', href: k.explorer('papers'), target: '_blank', rel: 'noopener', text: 'Search a title in the Explorer’s Papers tab →' }))));
      }

      function fillUnclassified(r) {
        var f = r.f, whole = sum(f.today);
        var wrap = el('div', { class: 'dsc-subs is-static' });
        f.reasons.forEach(function (s) {
          var t = sum(s.n);
          var tip = function (e) { k.tip.show(e, '<b>' + s.name.charAt(0).toUpperCase() + s.name.slice(1) + '</b><br>' + nf(t) + ' papers \u00b7 ' + share(t, whole) + ' of the ' + nf(whole) + '<br>' + sw('--fig-seed') + nf(s.n[0]) + ' seed \u00b7 ' + sw('--fig-closure') + nf(s.n[1]) + ' cited<br><span class="k">OpenAlex, ' + when + '</span>'); };
          var item = el('div', { class: 'dsc-sub', tabindex: '0', role: 'img', 'aria-label': s.name + ': ' + nf(t) + ' papers, ' + nf(s.n[0]) + ' seed, ' + nf(s.n[1]) + ' cited.', onmouseenter: tip, onmousemove: tip, onmouseleave: k.tip.hide, onfocus: tip, onblur: k.tip.hide },
            el('span', { class: 'dsc-name', text: s.name.charAt(0).toUpperCase() + s.name.slice(1) }),
            el('span', { class: 'dsc-track' }, el('span', { class: 'dsc-bar', style: 'width:' + (100 * t / whole) + '%' },
              el('i', { class: 'dsc-s', style: 'width:' + (100 * s.n[0] / t) + '%' }),
              el('i', { class: 'dsc-c', style: 'width:' + (100 * s.n[1] / t) + '%' }))),
            el('span', { class: 'dsc-val' }, el('b', { text: nf(t) }), el('span', { text: share(t, whole) })));
          wrap.appendChild(item);
        });
        r.detail.appendChild(el('div', { class: 'dsc-detail-in' },
          el('div', { class: 'dsc-col' },
            el('p', { class: 'dsc-k' }, 'Why a paper has no field', el('span', { class: 'dsc-src is-today', text: 'OpenAlex, ' + when })),
            el('p', { class: 'dsc-cap', text: 'Each bar is a share of the ' + nf(whole) + ' papers OpenAlex leaves unclassified today; the paper’s lookup left ' + nf(sum(f.n)) + '.' }),
            wrap),
          el('div', { class: 'dsc-col' },
            el('p', { class: 'dsc-k', text: 'What this bar is' }),
            el('p', { class: 'dsc-text', html: 'These papers are in MBDef like any other; they only lack a field here. Most are seed papers for which MBDef has neither an OpenAlex id nor a DOI, so there is nothing to look up. No field is guessed from a title.' }),
            el('p', { class: 'dsc-text', html: 'Seed papers are ' + pct(f.n[0], NS) + ' unclassified, cited papers ' + pct(f.n[1], NC) + ' (as printed).' }))));
      }

      // ---------------------------------------------------------------- width: layout, ticks, labels inside the segments
      k.onResize(function (w) {
        var narrow = w < 600;
        chart.classList.toggle('is-narrow', narrow);
        body.classList.toggle('is-narrow', narrow);
        var step = narrow ? max / 2 : max / 4;
        chart.style.setProperty('--dsc-grid', (100 * step / max) + '%');
        var ticks = axis.querySelector('.dsc-ticks');
        ticks.textContent = '';
        for (var v = 0; v <= max + 1e-9; v += step) ticks.appendChild(el('span', { style: 'left:' + (100 * v / max) + '%', text: nf(v) }));
        var trackW = rows[0].btn.querySelector('.dsc-track').getBoundingClientRect().width;
        rows.forEach(function (r) {
          r.segs.forEach(function (s) {
            var px = trackW * s[1] / max;
            s[0].classList.toggle('fits', px >= String(nf(s[1])).length * 7.5 + 14);
          });
        });
      });

      // ---------------------------------------------------------------- Social Sciences open, as the printed inset; bars grow once
      toggle(0);
      if (k.motion && 'IntersectionObserver' in window) {
        chart.classList.add('is-pre');
        var io = new IntersectionObserver(function (es) {
          if (!es.some(function (e) { return e.isIntersecting; })) return;
          io.disconnect();
          void chart.offsetWidth;   // the bars are drawn at zero first, so the change below is a transition
          chart.classList.add('is-grow'); chart.classList.remove('is-pre');
          setTimeout(function () { chart.classList.remove('is-grow'); }, 1600);
        }, { threshold: 0.2 });
        io.observe(chart);
      }

      // ---------------------------------------------------------------- notes and method
      var ssSub = social.subfields[0];
      k.notes({
        what: 'Each of the ' + nf(N) + ' papers counted once, under the field of its <i>primary topic</i> in OpenAlex, an open catalogue of research that tags every paper with topics, each inside a subfield and a field. <b>Seed papers</b> (grey) are the ' +
          nf(NS) + ' papers found by a keyword search in Scopus; <b>cited papers</b> (blue) are the ' + nf(NC) + ' works the seed papers cite when they define or describe a term, added by following those citations (the <i>corpus closure</i>).',
        why: 'The two published classification schemes of media bias, by Spinde et al. (2025) and Rodrigo-Ginés et al. (2024), rest on literature reviews that focus on computer science. MBDef draws ' +
          pct(sum(social.n), N) + ' of its papers from the social sciences, where media bias is mainly studied, and ' + pct(sum(cs.n), N) + ' from computer science.',
        read: 'All bars share one scale from zero; grey and blue add up to the total. An opened field has its own scale: each subfield bar is a share of that field. <i>Unclassified</i> is not a field: OpenAlex gave these papers no topic.',
        example: '<b>Social Sciences</b>, the largest bar: ' + nf(sum(social.n)) + ' of the ' + nf(N) + ' papers (' + pct(sum(social.n), N) + '), ' + nf(social.n[0]) + ' seed and ' + nf(social.n[1]) +
          ' cited. Its largest subfield, ' + ssSub.name + ', holds ' + nf(sum(ssSub.n)) + ' papers alone, more than twice the ' + nf(sum(cs.n)) + ' of computer science.'
      });

      var R = data.rule;
      k.method(
        '<p><b>Rule.</b> Each paper is looked up in OpenAlex by its OpenAlex id, else by its DOI, and counted once, under the field of its primary topic. OpenAlex assigns topics automatically; nobody checked them. ' +
        'Medicine and Health Professions form one bar, as in the paper. The ten largest fields are named, the remaining classified fields form one bar, and a paper OpenAlex cannot find or gives no topic is counted as unclassified, never guessed from its title. ' +
        'An opened field shows its ' + words(R.subfields) + ' largest subfields, then the rest as one bar.</p>' +
        '<p><b>Numbers.</b> The bars and the Social Sciences subfields show the counts printed in the paper; they add up to the ' + nf(N) + ' papers of the released papers table (' + nf(NS) + ' seed, ' + nf(NC) + ' cited). ' +
        'OpenAlex reclassifies papers over time. ' + driftText + ' The subfields of the other fields, the papers listed and the reasons a paper is unclassified come from that lookup.</p>' +
        '<p><b>Papers listed.</b> Per field the ' + words(R.papers) + ' papers with the most definitions in MBDef (' + words(R.papers_sub) + ' per subfield), among the ' + nf(R.confirmed) + ' of ' + nf(R.classified) +
        ' classified papers whose title in MBDef is the title of the OpenAlex record they were matched to, so the field shown is surely theirs.</p>' +
        '<p><b>Data.</b> MBDef’s papers table (OpenAlex ids, DOIs, titles, years, seed or cited, definitions per paper) and OpenAlex’s answers, kept in a cache file. ' +
        'Made by <code>scripts/figs/disciplines.py</code>, which runs the discipline lookup of the MBDef code (tutorial 5 in the MBDef repository).</p>');
    }
  });
})();
