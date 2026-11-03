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

// The interactive figures. Each printed figure is a [data-open-fig] button: a click opens the figure's interactive
// version (the .fig-panel with data-fig=<name>) on the stage, a <dialog> above the page, and figkit.js draws it on first
// open. The printed image flies into the stage and fades into the live chart. The arrows step through the six
// figures; Esc, the close button or a click beside the stage closes it. An address ending in #fig-<name> opens that
// figure on arrival, so other pages (the MBDef Explorer) can link to it.
var carousels = [];
var FIG_ORDER = ['pipeline', 'disciplines', 'content', 'coverage', 'divergence', 'network'];
var stageFig = null, stageOpener = null;

function figStage() { return document.getElementById('fig-stage'); }
function figMotion() { return !window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

// the printed image grows from its place on the page to the top of the stage, then fades as the chart appears
function flyIn(img, panel) {
    var stage = figStage(), body = stage.querySelector('.fig-stage-body');
    var from = img.getBoundingClientRect(), to = body.getBoundingClientRect();
    if (!from.width || !to.width) return;
    var w = to.width - 32;
    var ghost = img.cloneNode(false);
    ghost.removeAttribute('loading');
    ghost.className = 'fig-ghost';
    ghost.style.cssText = 'left:' + from.left + 'px;top:' + from.top + 'px;width:' + from.width + 'px;height:' + from.height + 'px';
    stage.appendChild(ghost);
    var dx = to.left + 16 - from.left, dy = to.top + 16 - from.top, k = w / from.width;
    panel.classList.add('is-arriving');
    requestAnimationFrame(function () {
        ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + k + ')';
    });
    var t0 = performance.now();
    (function wait() { // keep the printed figure in view until the chart is drawn (at most 4 s)
        if ((panel.dataset.ready || performance.now() - t0 > 4000) && performance.now() - t0 > 520) {
            ghost.classList.add('is-gone');
            panel.classList.remove('is-arriving');
            setTimeout(function () { ghost.remove(); }, 450);
        } else requestAnimationFrame(wait);
    })();
}

function showFig(name, opener) {
    // panels carry no id: an id equal to the address's #fig-<name> would make the browser jump to it on its own
    var panel = document.querySelector('.fig-stage .fig-panel[data-fig="' + name + '"]'), stage = figStage();
    if (!panel || !stage || !window.FIG) return;
    stage.querySelectorAll('.fig-panel').forEach(function (p) { p.hidden = p !== panel; });
    document.getElementById('fig-stage-k').textContent = 'Fig. ' + panel.dataset.num + ' · interactive';
    document.getElementById('fig-stage-title').textContent = panel.dataset.title;
    stageFig = name;
    if (!stage.open) {
        stageOpener = opener || null;
        stage.showModal();
        stage.focus({ preventScroll: true }); // the stage itself, not its first button, takes the focus
        document.documentElement.classList.add('has-stage');
        carousels.forEach(function (c) { c.stop(); }); // hold the carousel still while a figure is open
    }
    stage.querySelector('.fig-stage-body').scrollTop = 0;
    window.FIG.start(panel);
    var img = opener && opener.querySelector('img');
    if (img && figMotion()) flyIn(img, panel);
    else if (figMotion()) { // stepping with the arrows: the next figure fades in
        panel.classList.add('is-arriving');
        requestAnimationFrame(function () { requestAnimationFrame(function () { panel.classList.remove('is-arriving'); }); });
    }
    try { history.replaceState(null, '', '#fig-' + name); } catch (e) { /* some hosts refuse it */ }
}
function closeFig() {
    var stage = figStage();
    if (stage && stage.open) stage.close();
}
document.addEventListener('DOMContentLoaded', function () {
    var stage = figStage();
    if (!stage) return;
    stage.addEventListener('close', function () {
        document.documentElement.classList.remove('has-stage');
        stage.querySelectorAll('.fig-ghost').forEach(function (g) { g.remove(); });
        try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* as above */ }
        if (stageOpener) stageOpener.focus({ preventScroll: true });
        stageFig = null;
        if (window.FIG && FIG.hideTip) FIG.hideTip();
    });
    // a click on the dimmed page around the stage closes it
    stage.addEventListener('click', function (e) { if (e.target === stage) closeFig(); });
});
document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-open-fig]');
    if (open) { showFig(open.dataset.openFig, open); return; }
    var step = e.target.closest('[data-step-fig]');
    if (step && stageFig) {
        var i = FIG_ORDER.indexOf(stageFig), n = FIG_ORDER.length;
        showFig(FIG_ORDER[(i + +step.dataset.stepFig + n) % n]);
        return;
    }
    if (e.target.closest('[data-close-fig]')) closeFig();
});
function openFromHash() {
    var m = /^#fig-([a-z]+)$/.exec(location.hash);
    if (m && FIG_ORDER.indexOf(m[1]) >= 0) showFig(m[1]);
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
