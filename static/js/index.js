// Page behaviour from the group's project-page template: the More Works dropdown, the BibTeX copy button, the
// scroll-to-top button and the figure carousel (bulma-carousel without jQuery).

function toggleMoreWorks() {
    var dropdown = document.getElementById('moreWorksDropdown');
    var button = document.querySelector('.more-works-btn');
    if (!dropdown || !button) return;
    var open = !dropdown.classList.contains('show');
    dropdown.classList.toggle('show', open);
    button.classList.toggle('active', open);
}

// Close the dropdown when clicking outside it, or on Escape
document.addEventListener('click', function (event) {
    var container = document.querySelector('.more-works-container');
    var dropdown = document.getElementById('moreWorksDropdown');
    var button = document.querySelector('.more-works-btn');
    if (container && dropdown && button && !container.contains(event.target)) {
        dropdown.classList.remove('show');
        button.classList.remove('active');
    }
});
document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    var dropdown = document.getElementById('moreWorksDropdown');
    var button = document.querySelector('.more-works-btn');
    if (!dropdown || !button) return;
    dropdown.classList.remove('show');
    button.classList.remove('active');
});

// Copy BibTeX to clipboard
function copyBibTeX() {
    var bibtexElement = document.getElementById('bibtex-code');
    var button = document.querySelector('.copy-bibtex-btn');
    var copyText = button.querySelector('.copy-text');
    if (!bibtexElement) return;

    function done() {
        button.classList.add('copied');
        copyText.textContent = 'Cop';
        setTimeout(function () {
            button.classList.remove('copied');
            copyText.textContent = 'Copy';
        }, 2000);
    }
    function fallback() { // select the entry, so that the reader can copy it by hand where the clipboard is refused
        var range = document.createRange();
        range.selectNodeContents(bibtexElement);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        try { if (document.execCommand('copy')) done(); } catch (e) { /* the selection stays for a manual copy */ }
    }
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(bibtexElement.textContent).then(done).catch(fallback);
    } else {
        fallback();
    }
}

// Scroll to top
function scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.addEventListener('scroll', function () {
    var scrollButton = document.querySelector('.scroll-to-top');
    if (scrollButton) scrollButton.classList.toggle('visible', window.pageYOffset > 300);
}, { passive: true });

// The interactive figures. Each printed figure is a [data-open-fig] button; a click opens the figure's interactive
// version (the .fig-panel with data-fig=<name>) on the stage, a full-screen <dialog>, and figkit.js draws it.
//
// The way in is one movement: the stage's card opens out of the printed figure (it grows from the figure's outline
// to its full size), while the printed image glides to where its live version is drawn and turns from
// print-white to the stage's night colours; then it hands over to the live chart, which plays its entrance
// (k.onArrive in figkit.js). Closing plays the same movement backwards, to wherever the printed figure is on the
// page. The arrows slide from one figure to the next; Esc, the close button or a click beside the card closes it.
// An address ending in #fig-<name> opens that figure on arrival, so other pages (the MBDef Explorer) can link to it.
var carousels = [];
var FIG_ORDER = ['pipeline', 'disciplines', 'content', 'coverage', 'divergence', 'network'];
var EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';     // a soft ease-out, for things that only arrive (a slide, a fade)
var GLIDE = 'cubic-bezier(0.65, 0, 0.25, 1)';     // a gentle start and a long, soft landing: the morph itself
var MORPH_MS = 860, HANDOVER_MS = 460;
var NIGHT = 'invert(0.94) hue-rotate(180deg) saturate(1.15)'; // the print, in the stage's colours
var stageFig = null, stageBusy = false, stageNext = null;
// a request made during a movement (Esc, an arrow) runs as soon as the movement ends, never lost
function settle() {
    stageBusy = false;
    var next = stageNext; stageNext = null;
    if (next) next();
}

function figStage() { return document.getElementById('fig-stage'); }
function figMotion() { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function figPanel(name) { return document.querySelector('.fig-stage .fig-panel[data-fig="' + name + '"]'); }
function figParts() {
    var stage = figStage();
    return { stage: stage, veil: stage.querySelector('.fig-veil'), card: stage.querySelector('.fig-stage-inner'),
             head: stage.querySelector('.fig-stage-head'), body: stage.querySelector('.fig-stage-body') };
}
// the printed figure of NAME as it sits on the screen now (the carousel keeps clones of its slides: take one in view)
function printedImg(name) {
    var found = null;
    document.querySelectorAll('[data-open-fig="' + name + '"] img').forEach(function (img) {
        var r = img.getBoundingClientRect();
        if (!found && r.width > 40 && r.bottom > 0 && r.top < innerHeight && r.left >= -1 && r.right <= innerWidth + 1) found = img;
    });
    return found;
}
function rectOf(el) { var r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }
// where the live chart stands: the print's proportions fitted into the panel's chart area (its .fig-body once drawn;
// before that, the stage body's content box, where the chart will be drawn)
function landing(panel, from) {
    var body = panel.closest('.fig-stage-body'), cs = getComputedStyle(body), b = rectOf(body);
    var area = panel.dataset.ready && panel.querySelector('.fig-body') ? rectOf(panel.querySelector('.fig-body')) : null;
    var box = area && area.width > 40 && area.height > 40 ? area : {
        left: b.left + parseFloat(cs.paddingLeft), top: b.top + parseFloat(cs.paddingTop),
        width: b.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), height: b.height - parseFloat(cs.paddingTop) - 24 };
    var k = Math.min(box.width / from.width, Math.max(box.height, 120) / from.height);
    return { left: box.left + (box.width - from.width * k) / 2, top: box.top, width: from.width * k, height: from.height * k };
}
function cardAt(r, card) { // the transform that lays the card (origin at its top left) exactly over rect R
    var c = rectOf(card);
    return 'translate(' + (r.left - c.left) + 'px,' + (r.top - c.top) + 'px) scale(' + (r.width / c.width) + ',' + (r.height / c.height) + ')';
}
function ghostOf(img, r) {
    var g = img.cloneNode(false);
    g.removeAttribute('loading'); g.removeAttribute('srcset');
    g.className = 'fig-ghost'; g.alt = '';
    g.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px';
    figStage().appendChild(g);
    return g;
}
function moveTo(from, to) {
    var k = to.width / from.width;
    return 'translate(' + (to.left - from.left) + 'px,' + (to.top - from.top) + 'px) scale(' + k + ')';
}
function arrive(panel) {
    panel.classList.remove('is-arriving');
    // a mouse resting where the print was clicked is not a hover: the figure answers it once it moves (a touch screen
    // has no resting pointer, so taps work at once)
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) { panel.dispatchEvent(new CustomEvent('fig:arrive')); return; }
    panel.classList.add('is-settling');
    var x0 = null, y0 = null;
    function moved(e) {
        if (e.pointerType !== 'mouse') return;
        if (x0 === null) { x0 = e.clientX; y0 = e.clientY; return; }
        if (Math.abs(e.clientX - x0) + Math.abs(e.clientY - y0) < 3) return;
        panel.classList.remove('is-settling');
        document.removeEventListener('pointermove', moved, true);
    }
    document.addEventListener('pointermove', moved, true);
    panel.dispatchEvent(new CustomEvent('fig:arrive'));
}
function setHead(panel) {
    document.getElementById('fig-stage-k').textContent = 'Fig. ' + panel.dataset.num + ' · interactive';
    document.getElementById('fig-stage-title').textContent = panel.dataset.title;
}
function showOnly(panel) {
    figStage().querySelectorAll('.fig-panel').forEach(function (p) { p.hidden = p !== panel; });
}
function finished(anims) { return Promise.all(anims.map(function (a) { return a.finished.catch(function () {}); })); }
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
// the carousel holds still while the stage is open (its autoplay would restart when the pointer leaves it)
function holdCarousel(hold) {
    carousels.forEach(function (c) {
        c.options.autoplay = !hold;
        if (hold) c.stop(); else c.start();
    });
}
var SLIDES = ['disciplines', 'content', 'coverage', 'divergence', 'network']; // the carousel's slides, in order
// turn the carousel to NAME's slide (the reader may have stepped to another figure on the stage); resolves when done
function showSlide(name) {
    var c = carousels[0], i = SLIDES.indexOf(name);
    if (!c || i < 0 || c.state.index === i) return Promise.resolve();
    c.state.next = i; // bulma-carousel's show(n) ignores its number argument: set the target, then show
    c.show();
    return wait(380);
}

function openFig(name, img) {
    var panel = figPanel(name), P = figParts();
    if (!panel || !window.FIG || stageBusy || P.stage.open) return;
    setHead(panel); showOnly(panel); stageFig = name;
    document.documentElement.classList.add('has-stage');
    P.stage.showModal();
    P.stage.focus({ preventScroll: true });
    P.body.scrollTop = 0;
    holdCarousel(true);
    try { history.replaceState(null, '', '#fig-' + name); } catch (e) { /* some hosts refuse it */ }
    panel.classList.add('is-arriving');
    var built = window.FIG.start(panel);
    if (!figMotion()) { built.then(function () { arrive(panel); }); return; }

    stageBusy = true;
    P.veil.animate([{ opacity: 0 }, { opacity: 1 }], { duration: MORPH_MS * 0.8, easing: 'ease-out' });
    if (!img) { // opened by a link: the card rises in, then the chart arrives
        var rise = P.card.animate([{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
                                  { duration: 520, easing: EASE });
        Promise.all([built, rise.finished]).then(function () {
            panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: HANDOVER_MS, easing: 'ease-out' });
            arrive(panel); settle();
        });
        return;
    }
    // the print lifts off the page at once; the movement starts when the figure is drawn (its data was fetched on hover,
    // so this takes a moment at most) and the card has its final size; then the card opens out of the printed figure
    // while the figure glides to where its chart stands, turning to night on the way: one movement, on one curve
    var from = rectOf(img), ghost = ghostOf(img, from), to;
    panel.style.opacity = '0';
    P.card.style.opacity = '0';
    var fly = { finished: Promise.race([built, wait(450)]).then(function () {
        to = landing(panel, from);
        P.card.style.opacity = '';
        P.card.animate([{ transform: cardAt(from, P.card), borderRadius: '10px' }, { transform: 'none', borderRadius: '18px' }],
                       { duration: MORPH_MS, easing: GLIDE });
        P.head.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
                       { duration: 420, delay: MORPH_MS * 0.72, easing: 'ease-out', fill: 'backwards' });
        return ghost.animate([
            { offset: 0, transform: 'none', filter: 'none', boxShadow: '0 18px 50px rgba(0,0,0,0.35)' },
            { offset: 0.35, filter: 'none' },
            { offset: 1, transform: moveTo(from, to), filter: NIGHT, boxShadow: '0 0 0 rgba(0,0,0,0)' }],
            { duration: MORPH_MS, easing: GLIDE, fill: 'forwards' }).finished;
    }) };
    Promise.all([fly.finished, built]).then(function () {
        // the handover: the print settles onto the drawn chart and dissolves into it as the chart comes up
        var land = landing(panel, from);
        panel.style.opacity = '';
        panel.animate([{ opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: HANDOVER_MS, easing: 'ease-out' });
        var fade = ghost.animate([{ transform: moveTo(from, to), filter: NIGHT, opacity: 1 },
                                  { transform: moveTo(from, land), filter: NIGHT + ' blur(3px)', opacity: 0 }],
                                 { duration: HANDOVER_MS, easing: 'ease-in-out', fill: 'forwards' });
        arrive(panel);
        return fade.finished;
    }).catch(function () {}).then(function () {
        ghost.remove(); panel.style.opacity = ''; P.card.style.opacity = ''; settle();
    });
}

function closeFig() {
    var P = figParts();
    if (!P.stage.open) return;
    if (stageBusy) { stageNext = closeFig; return; }
    var panel = figPanel(stageFig), name = stageFig;
    function done() {
        P.stage.close();
        document.documentElement.classList.remove('has-stage');
        P.stage.querySelectorAll('.fig-ghost').forEach(function (g) { g.remove(); });
        stageBusy = false; stageNext = null;
        holdCarousel(false);
    }
    if (!figMotion()) { showSlide(name).then(done); return; }
    stageBusy = true;
    if (window.FIG && FIG.hideTip) FIG.hideTip();
    showSlide(name).then(function () { closeMove(P, panel, printedImg(name), done); });
}
function closeMove(P, panel, img, done) {
    var veil = P.veil.animate([{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 300 + MORPH_MS * 0.9, easing: 'ease-in-out', fill: 'forwards' });
    if (!img) { // the printed figure is off screen: the card sinks away
        var sink = P.card.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(14px)' }],
                                  { duration: 360, easing: 'ease-in', fill: 'forwards' });
        finished([veil, sink]).then(function () { done(); veil.cancel(); sink.cancel(); });
        return;
    }
    // backwards: the live chart hands back to the print, which flies home in its own colours as the card closes on it
    var home = rectOf(img), here = landing(panel, home), ghost = ghostOf(img, home);
    ghost.style.transform = moveTo(home, here); ghost.style.filter = NIGHT; ghost.style.opacity = '0';
    var out = panel.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(3px)' }], { duration: 300, easing: 'ease-in-out', fill: 'forwards' });
    ghost.animate([{ opacity: 0, filter: NIGHT + ' blur(3px)' }, { opacity: 1, filter: NIGHT }], { duration: 300, easing: 'ease-in-out', fill: 'forwards' });
    P.head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 240, easing: 'ease-out', fill: 'forwards' });
    out.finished.then(function () {
        var fly = ghost.animate([
            { offset: 0, transform: moveTo(home, here), filter: NIGHT, opacity: 1 },
            { offset: 0.65, filter: 'none' },
            { offset: 1, transform: 'none', filter: 'none', opacity: 1 }],
            { duration: MORPH_MS * 0.9, easing: GLIDE, fill: 'forwards' });
        var clip = P.card.animate([{ transform: 'none', borderRadius: '18px' }, { transform: cardAt(home, P.card), borderRadius: '10px' }],
                                  { duration: MORPH_MS * 0.9, easing: GLIDE, fill: 'forwards' });
        return finished([fly, clip, veil]).then(function () {
            done();
            [out, clip, veil].forEach(function (a) { a.cancel(); });
            P.head.getAnimations().forEach(function (a) { a.cancel(); });
        });
    });
}

// the arrows: the figure slides away and the next slides in from the other side
function stepFig(dir) {
    if (!stageFig) return;
    if (stageBusy) { stageNext = function () { stepFig(dir); }; return; }
    var n = FIG_ORDER.length, next = FIG_ORDER[(FIG_ORDER.indexOf(stageFig) + dir + n) % n];
    var P = figParts(), old = figPanel(stageFig), panel = figPanel(next);
    stageFig = next;
    try { history.replaceState(null, '', '#fig-' + next); } catch (e) { /* as above */ }
    if (window.FIG && FIG.hideTip) FIG.hideTip();
    function swap() {
        setHead(panel); showOnly(panel); P.body.scrollTop = 0;
        panel.classList.add('is-arriving');
        return window.FIG.start(panel);
    }
    if (!figMotion()) { swap().then(function () { arrive(panel); }); return; }
    stageBusy = true;
    var leave = [old.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateX(' + (-28 * dir) + 'px)' }],
                             { duration: 220, easing: 'ease-in', fill: 'forwards' }),
                 P.head.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 180, easing: 'ease-in', fill: 'forwards' })];
    finished(leave).then(function () {
        var h0 = P.card.offsetHeight, built = swap();
        leave.forEach(function (a) { a.cancel(); });
        P.head.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
        panel.style.opacity = '0';
        return built.then(function () {
            var h1 = P.card.offsetHeight;
            if (Math.abs(h1 - h0) > 2) P.card.animate([{ height: h0 + 'px' }, { height: h1 + 'px' }], { duration: 460, easing: GLIDE });
            panel.style.opacity = '';
            var enter = panel.animate([{ opacity: 0, transform: 'translateX(' + (28 * dir) + 'px)' }, { opacity: 1, transform: 'none' }],
                                      { duration: 420, easing: EASE });
            arrive(panel);
            return enter.finished;
        });
    }).catch(function () {}).then(settle);
}

document.addEventListener('DOMContentLoaded', function () {
    var stage = figStage();
    if (!stage) return;
    stage.addEventListener('cancel', function (e) { e.preventDefault(); closeFig(); }); // Esc: close with the movement
    stage.addEventListener('close', function () {
        document.documentElement.classList.remove('has-stage');
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* as above */ }
        var back = document.querySelector('[data-open-fig="' + stageFig + '"]');
        if (back) back.focus({ preventScroll: true });
        stageFig = null;
        if (window.FIG && FIG.hideTip) FIG.hideTip();
    });
    stage.querySelector('.fig-veil').addEventListener('click', closeFig); // a click beside the card
    // a hover on a printed figure fetches its data, so the figure is ready when it is clicked
    document.querySelectorAll('[data-open-fig]').forEach(function (b) {
        b.addEventListener('pointerenter', function () { if (window.FIG) FIG.prefetch(figPanel(b.dataset.openFig)); }, { once: true });
    });
});
document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-open-fig]');
    if (open) { openFig(open.dataset.openFig, open.querySelector('img')); return; }
    var step = e.target.closest('[data-step-fig]');
    if (step) { stepFig(+step.dataset.stepFig); return; }
    if (e.target.closest('[data-close-fig]')) closeFig();
});
function openFromHash() {
    var m = /^#fig-([a-z]+)$/.exec(location.hash);
    if (m && FIG_ORDER.indexOf(m[1]) >= 0 && !figStage().open) openFig(m[1], null);
}
window.addEventListener('hashchange', openFromHash);

// The figure carousel, with the template's options
document.addEventListener('DOMContentLoaded', function () {
    if (window.bulmaCarousel) carousels = window.bulmaCarousel.attach('.carousel', {
        slidesToScroll: 1,
        slidesToShow: 1,
        loop: true,
        infinite: true,
        autoplay: true,
        autoplaySpeed: 10000,
        pauseOnHover: true
    });
    openFromHash();
});
