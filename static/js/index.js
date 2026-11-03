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

// Each printed figure opens its interactive version in place: a [data-open-fig] button shows the matching
// .fig-panel (id fig-<name>) and figkit.js draws it on first open. An address ending in #fig-<name> opens that
// figure on arrival, so other pages (the MBDef Explorer) can link to it.
var carousels = [];

function syncFigButtons() {
    document.querySelectorAll('[data-open-fig]').forEach(function (b) {
        var p = document.getElementById('fig-' + b.dataset.openFig);
        b.setAttribute('aria-expanded', String(!!p && !p.hidden && !p.closest('.fig-live').hidden));
    });
}
function openFig(name, scroll) {
    var panel = document.getElementById('fig-' + name);
    if (!panel || !panel.classList.contains('fig-panel') || !window.FIG) return;
    var box = panel.closest('.fig-live');
    box.hidden = false;
    box.querySelectorAll('.fig-panel').forEach(function (p) { p.hidden = p !== panel; });
    window.FIG.start(panel);
    carousels.forEach(function (c) { c.stop(); }); // hold the carousel still while a figure is open
    syncFigButtons();
    if (scroll) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function closeFig(box) {
    box.hidden = true;
    syncFigButtons();
}
document.addEventListener('click', function (e) {
    var open = e.target.closest('[data-open-fig]');
    if (open) {
        if (open.getAttribute('aria-expanded') === 'true') closeFig(document.getElementById('fig-' + open.dataset.openFig).closest('.fig-live'));
        else openFig(open.dataset.openFig, true);
        return;
    }
    var close = e.target.closest('[data-close-fig]');
    if (close) closeFig(close.closest('.fig-live'));
});
function openFromHash() {
    var m = /^#fig-([a-z]+)$/.exec(location.hash);
    if (!m) return;
    openFig(m[1], false);
    // the carousel and the images above settle their height only once the page has loaded: scroll after that
    function go() { var p = document.getElementById('fig-' + m[1]); if (p) p.closest('.fig-live').scrollIntoView({ block: 'start' }); }
    if (document.readyState === 'complete') go();
    else window.addEventListener('load', function () { go(); setTimeout(go, 400); }, { once: true });
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
