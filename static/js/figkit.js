/* The shared kit of the interactive figures (window.FIG). Each figure is one script in static/js/figs/ that calls

     FIG.register('<name>', { build(panel, data, k) { ... } })

   and one <article class="fig-panel" data-fig="<name>" data-src="static/data/figs/<name>.json"> in index.html.
   The kit fetches the data when the panel comes near the screen (so a hidden panel costs nothing), then calls build
   with the panel, the parsed JSON and the helpers k below. When build returns, the panel gets data-ready="1"; when
   every shown panel is built, <body> gets data-figs-ready="1" (screenshots wait for it).

   Helpers (k):
     k.el(tag, attrs, ...children)     an HTML element; attrs.text sets textContent, attrs.html innerHTML, on* adds listeners
     k.svg(tag, attrs, ...children)    an SVG element, the same way
     k.head({fig, title, lead, stats}) the panel's head: "Paper, Fig. N" eyebrow, the title (a reader's question),
                                       one lead line, and key numbers [{value, label}] on the right; returns the head
     k.body()                          the chart area (appended after the head); returns it
     k.notes({what, why, read, example})  the labelled parts under the chart: what it shows, why it matters, how to
                                       read it (optional), one real worked example; values are strings with simple HTML
     k.method(nodeOrHtml, title)       a "How this is made" toggle at the bottom
     k.tip.show(event, nodeOrHtml) / k.tip.hide()   the one tooltip, placed next to the pointer and kept on screen
     k.onResize(fn)                    fn(width) now and whenever the chart area's width changes (debounced)
     k.nf(n) / k.pct(part, whole, digits=1) / k.f(x, digits)   1,234 / 58.6% / 0.25
     k.color(name)                     a CSS custom property's value, e.g. k.color('--fig-closure')
     k.explorer(tab)                   the MBDef Explorer's address, at one of its tabs (overview, map, concepts,
                                       relations, relevance, papers)
     k.motion                          false when the reader asked for reduced motion */
(function () {
  'use strict';
  var registry = {}, started = new WeakSet(), pending = 0;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, attrs) {
    var e = document.createElement(tag);
    setAttrs(e, attrs);
    append(e, [].slice.call(arguments, 2));
    return e;
  }
  function svg(tag, attrs) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    setAttrs(e, attrs);
    append(e, [].slice.call(arguments, 2));
    return e;
  }
  function setAttrs(e, attrs) {
    if (!attrs) return;
    Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
  }
  function append(e, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) append(e, c);
      else e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
  }
  function put(target, content) {
    if (content == null) return;
    if (content.nodeType) target.appendChild(content);
    else target.innerHTML = String(content);
  }

  var nfmt = new Intl.NumberFormat('en-US');
  function nf(n) { return nfmt.format(n); }
  function f(x, d) { return Number(x).toFixed(d == null ? 2 : d); }
  function pct(a, b, d) { return (100 * a / b).toFixed(d == null ? 1 : d) + '%'; }

  // ------------------------------------------------------------ the tooltip
  var tipEl = null, tipFocus = null; // tipFocus: the element a keyboard-shown tooltip belongs to
  var tip = {
    show: function (ev, content) {
      if (!tipEl) { tipEl = el('div', { class: 'fig-tip', role: 'tooltip' }); document.body.appendChild(tipEl); }
      if (content != null) { tipEl.textContent = ''; put(tipEl, content); }
      tipEl.classList.add('on');
      var x = ev.clientX, y = ev.clientY;
      tipFocus = null;
      if (x == null && ev.target && ev.target.getBoundingClientRect) { // keyboard focus: next to the element
        var r = ev.target.getBoundingClientRect(); x = r.right; y = r.top + r.height / 2;
        tipFocus = ev.target;
      }
      var w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = document.documentElement.clientWidth, vh = window.innerHeight;
      var left = x + 14 + w > vw - 8 ? x - 14 - w : x + 14;
      var top = y + 14 + h > vh - 8 ? y - 14 - h : y + 14;
      tipEl.style.left = Math.max(8, left) + 'px';
      tipEl.style.top = Math.max(8, top) + 'px';
    },
    hide: function () { tipFocus = null; if (tipEl) tipEl.classList.remove('on'); }
  };
  // a scroll moves the page under a pointer's tooltip, so it goes; a keyboard tooltip follows its element instead
  // (moving focus to a mark off screen scrolls the page)
  window.addEventListener('scroll', function () {
    if (tipFocus && document.activeElement === tipFocus) tip.show({ target: tipFocus });
    else tip.hide();
  }, { passive: true });

  // ------------------------------------------------------------ one panel
  function kit(panel) {
    var bodyEl = null;
    var k = {
      el: el, svg: svg, nf: nf, f: f, pct: pct, tip: tip, motion: !reduced.matches,
      color: function (name) { return getComputedStyle(panel).getPropertyValue(name).trim(); },
      explorer: function (tab) {
        var base = (window.PROJECT && PROJECT.explorerUrl ? PROJECT.explorerUrl : 'https://media-bias-group.github.io/MBDef/#overview').split('#')[0];
        return base + '#' + (tab || 'overview');
      },
      head: function (o) {
        var stats = (o.stats || []).map(function (s) {
          return el('div', { class: 'fig-stat' }, el('b', { text: s.value }), el('span', { text: s.label }));
        });
        var h = el('header', { class: 'fig-head' },
          el('div', { class: 'fig-head-text' },
            o.fig ? el('p', { class: 'fig-eyebrow', text: 'Paper, ' + o.fig }) : null,
            el('h3', { class: 'fig-title', text: o.title }),
            o.lead ? el('p', { class: 'fig-lead', html: o.lead }) : null),
          stats.length ? el('div', { class: 'fig-stats' }, stats) : null);
        panel.insertBefore(h, panel.firstChild);
        return h;
      },
      body: function () {
        if (!bodyEl) { bodyEl = el('div', { class: 'fig-body' }); panel.appendChild(bodyEl); }
        return bodyEl;
      },
      notes: function (o) {
        var parts = [['What it shows', o.what], ['Why it matters', o.why], ['How to read it', o.read], ['Example', o.example]]
          .filter(function (p) { return p[1]; })
          .map(function (p) { return el('div', { class: 'fig-note' }, el('span', { class: 'fig-note-k', text: p[0] }), el('p', { html: p[1] })); });
        var n = el('div', { class: 'fig-notes' }, parts);
        panel.appendChild(n);
        return n;
      },
      method: function (content, title) {
        var inner = el('div', { class: 'fig-method-body' });
        put(inner, content);
        var d = el('details', { class: 'fig-method' }, el('summary', { text: title || 'How this is made' }), inner);
        panel.appendChild(d);
        return d;
      },
      onResize: function (fn) {
        var target = k.body(), lastW = -1, t = 0;
        function run() { var w = Math.round(target.clientWidth); if (w && w !== lastW) { lastW = w; fn(w); } }
        run();
        if ('ResizeObserver' in window) new ResizeObserver(function () { clearTimeout(t); t = setTimeout(run, 120); }).observe(target);
        else window.addEventListener('resize', function () { clearTimeout(t); t = setTimeout(run, 120); });
      }
    };
    return k;
  }

  function note(panel, msg) { panel.appendChild(el('p', { class: 'fig-fail', text: msg })); }

  function start(panel) {
    if (started.has(panel)) return;
    started.add(panel);
    var name = panel.getAttribute('data-fig'), def = registry[name], src = panel.getAttribute('data-src');
    if (!def) { note(panel, 'This figure is not available yet.'); return; }
    pending++;
    panel.classList.add('is-loading');
    (src ? fetch(src).then(function (r) { if (!r.ok) throw new Error(r.status + ' ' + src); return r.json(); }) : Promise.resolve(null))
      .then(function (data) { return def.build(panel, data, kit(panel)); })
      .then(function () { panel.dataset.ready = '1'; })
      .catch(function (e) { console.error(e); note(panel, 'This figure could not be drawn: ' + e.message); panel.dataset.ready = 'failed'; })
      .then(function () {
        panel.classList.remove('is-loading');
        pending--;
        if (!pending) document.body.dataset.figsReady = '1';
      });
  }

  window.FIG = {
    register: function (name, def) { registry[name] = def; },
    start: start
  };

  document.addEventListener('DOMContentLoaded', function () {
    var panels = [].slice.call(document.querySelectorAll('.fig-panel[data-fig]'));
    if (!panels.length) { document.body.dataset.figsReady = '1'; return; }
    if (!('IntersectionObserver' in window)) { panels.forEach(start); return; }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); start(e.target); } });
    }, { rootMargin: '600px 0px' });
    panels.forEach(function (p) { io.observe(p); });
  });
})();
