/* Rotaserie product site: light/dark switch, the phone menu, the film, early access, screenshot zoom, fade-in on scroll.
   The Type to Build demo is its own script (demo/ttb.js), loaded only when the pane is near the screen. */
(function () {
  'use strict';
  // When signup opens, put the signup address here: every call-to-action button and the form then go straight to it.
  var SIGNUP_URL = '';
  var EMAIL = 'robert@rotaserie.com';

  var root = document.documentElement;
  root.classList.add('js');
  var $ = function (sel, el) { return (el || document).querySelector(sel); };
  var $$ = function (sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); };
  var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Light/dark: follows the device until the visitor picks one, then remembers it
  try { var saved = localStorage.getItem('sb-theme'); if (saved) root.dataset.theme = saved; } catch (e) { /* storage off */ }
  var toggle = $('[data-theme-toggle]');
  function isDark() { return root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function showState() { if (toggle) toggle.setAttribute('aria-pressed', isDark() ? 'true' : 'false'); }
  if (toggle) toggle.addEventListener('click', function () {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('sb-theme', root.dataset.theme); } catch (e) { /* storage off */ }
    showState();
  });
  showState();

  // Top bar: a line once the page scrolls; the menu on phones
  var nav = $('[data-nav]'), menu = $('[data-menu]');
  function onScroll() { if (nav) nav.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, {passive: true}); onScroll();
  function setMenu(open) { nav.classList.toggle('open', open); menu.setAttribute('aria-expanded', open ? 'true' : 'false'); }
  if (nav && menu) {
    menu.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
    $$('.nav-links a', nav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menu.focus(); } });
    document.addEventListener('click', function (ev) { if (nav.classList.contains('open') && !nav.contains(ev.target)) setMenu(false); });
  }

  // The language a visitor picked is remembered (the links work without this). A visitor whose browser is set to
  // Spanish, and who hasn't picked, sees one small bar on English pages offering Spanish. Never a redirect.
  var picked = null;
  try { picked = localStorage.getItem('rs-lang'); } catch (e) { /* storage off */ }
  var pick = function (l) { try { localStorage.setItem('rs-lang', l); } catch (e) { /* storage off */ } };
  $$('[data-lang]').forEach(function (a) { a.addEventListener('click', function () { pick(a.getAttribute('data-lang')); }); });
  var bar = $('[data-langbar]');
  if (bar && !picked && /^es\b/i.test(navigator.language || '')) {
    bar.hidden = false;
    $('[data-langbar-close]', bar).addEventListener('click', function () { bar.hidden = true; pick('en'); });
  }

  // Where-from code: a postcard, letter or email links to rotaserie.com/?from=pc-shoreline. The code is kept while the
  // visitor looks around (this tab only) and goes with them to signup (the app counts sign-ups by code), or into the
  // early-access email. Letters, digits and dashes only, as the app accepts.
  var FROM = '';
  try {
    var m = /[?&]from=([a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?)(?:&|$)/i.exec(location.search);
    if (m) sessionStorage.setItem('rs-from', m[1].toLowerCase());
    FROM = sessionStorage.getItem('rs-from') || '';
  } catch (e) { /* storage off: the code only lasts on this page */ if (m) FROM = m[1].toLowerCase(); }
  if (SIGNUP_URL && FROM) SIGNUP_URL += (SIGNUP_URL.indexOf('?') < 0 ? '?' : '&') + 'from=' + FROM;

  // Early access: an email to Robert with the business filled in (until signup opens)
  if (SIGNUP_URL) {
    $$('[data-start]').forEach(function (a) { a.href = SIGNUP_URL; });
    $$('[data-early], [data-mailnote]').forEach(function (el) { el.hidden = true; });
  }
  var form = $('[data-early]');
  if (form) form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (SIGNUP_URL) { location.href = SIGNUP_URL; return; }
    var biz = form.elements.business.value.trim(), kind = form.elements.kind.value;
    var fill = function (t) { return t.replace('{biz}', biz).replace('{kind}', kind); };
    var body = fill(form.getAttribute('data-body') || '') + (FROM ? '\n\n(Code: ' + FROM + ')' : '');
    location.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(fill(form.getAttribute('data-subject') || 'Rotaserie')) + '&body=' + encodeURIComponent(body);
  });

  // The film: nothing loads until Play. The file is picked for the screen (4K on very large ones, 720p on phones) and
  // for what the browser can play (AV1, else H.264).
  var film = $('[data-film]');
  if (film) {
    var frame = $('[data-film-frame]', film), video = $('[data-film-video]', film), play = $('[data-film-play]', film), loaded = false;
    var pickSource = function () {
      var stem = video.getAttribute('data-stem'), w = Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1);
      var can = function (type) { try { return !!video.canPlayType(type).replace('no', ''); } catch (e) { return false; } };
      var saver = navigator.connection && navigator.connection.saveData;
      if (window.innerWidth < 800 || saver) return stem + '-720.h264.mp4';
      if (video.hasAttribute('data-4k') && w >= 3000) return stem + '-2160.h264.mp4';
      if (can('video/mp4; codecs="av01.0.09M.08"')) return stem + '-1080.av1.mp4';
      return stem + '-1080.h264.mp4';
    };
    var start = function (at) {
      if (!loaded) {
        loaded = true;
        video.muted = true;  // (the film has no sound; muted, a browser always lets it start)
        video.src = pickSource();
        video.controls = true;
        var tr = video.textTracks && video.textTracks[0];
        if (tr) tr.mode = 'hidden';  // (the film's words are in the picture; the track is there for anyone who turns it on)
        frame.classList.add('on');
      }
      var go = function () { if (at != null) { try { video.currentTime = at; } catch (e) { /* not ready */ } } var p = video.play(); if (p && p.catch) p.catch(function () {}); };
      if (at != null && video.readyState < 1) video.addEventListener('loadedmetadata', go, {once: true}); else go();
      if (at != null && video.readyState < 1) video.load();
    };
    play.addEventListener('click', function () { start(null); video.focus(); });
    $$('[data-film-seek]', film).forEach(function (b) {
      b.addEventListener('click', function () { start(parseFloat(b.getAttribute('data-film-seek'))); frame.scrollIntoView({block: 'center', behavior: calm ? 'auto' : 'smooth'}); });
    });
    var full = $('[data-film-full]', film);
    if (full) full.addEventListener('click', function () {
      start(null);
      var fs = video.requestFullscreen || video.webkitRequestFullscreen || video.webkitEnterFullscreen;
      if (fs) { try { var r = fs.call(video); if (r && r.catch) r.catch(function () {}); } catch (e) { /* not allowed */ } }
    });
    $$('[data-film-go]').forEach(function (a) {
      a.addEventListener('click', function (ev) {
        ev.preventDefault();
        film.scrollIntoView({block: 'start', behavior: calm ? 'auto' : 'smooth'});
        start(null);
      });
    });
    // out of view: pause
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting && loaded && !video.paused && !document.fullscreenElement) video.pause();
    }, {threshold: 0}).observe(frame);
  }

  // Click a screenshot to see it large
  var box = $('[data-zoombox]');
  if (box && box.showModal) {
    var big = $('img', box);
    document.addEventListener('click', function (ev) {
      var img = ev.target.closest && ev.target.closest('img[data-zoom]');
      if (!img) return;
      big.src = img.getAttribute('data-zoom') || img.currentSrc || img.src;
      big.alt = img.alt;
      box.showModal();
    });
    box.addEventListener('click', function (ev) { if (ev.target === box || ev.target.closest('[data-zoom-close]') || ev.target === big) box.close(); });
    box.addEventListener('close', function () { big.removeAttribute('src'); });
  } else $$('img[data-zoom]').forEach(function (i) { i.style.cursor = 'auto'; });

  // The staff phones are a swipe row on small screens: arrow keys move it
  $$('[data-rail]').forEach(function (rail) {
    var wrap = rail.parentNode, prev = $('[data-rail-prev]', wrap), next = $('[data-rail-next]', wrap);
    if (prev && next) {
      var step = function (dir) { rail.scrollBy({left: dir * rail.clientWidth * 0.7, behavior: calm ? 'auto' : 'smooth'}); };
      var ends = function () { prev.disabled = rail.scrollLeft < 8; next.disabled = rail.scrollLeft + rail.clientWidth > rail.scrollWidth - 8; };
      prev.addEventListener('click', function () { step(-1); }); next.addEventListener('click', function () { step(1); });
      rail.addEventListener('scroll', ends, {passive: true}); ends();
    }
    rail.addEventListener('keydown', function (ev) {
      if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
      if (rail.scrollWidth <= rail.clientWidth) return;
      rail.scrollBy({left: (ev.key === 'ArrowRight' ? 1 : -1) * rail.clientWidth * 0.7, behavior: calm ? 'auto' : 'smooth'});
      ev.preventDefault();
    });
  });

  // Sections fade up as they come into view (only what starts below the screen, so nothing above the fold waits)
  if ('IntersectionObserver' in window && !calm) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, {rootMargin: '0px 0px -6% 0px', threshold: 0.05});
    $$('.sec-head, .point, .tile, .type-shot, .type-end, .steps, .swap-art, .phones figure, .devices, .photo, .faq, .founder, .values, .split').forEach(function (el) {
      if (el.getBoundingClientRect().top > window.innerHeight) { el.classList.add('rv'); io.observe(el); }
    });
  }

  // The Type to Build demo: its script arrives when the pane is near the screen and the browser is idle
  var pane = $('[data-ttb]');
  if (pane && pane.hasAttribute('data-live')) {
    var slow = (navigator.deviceMemory && navigator.deviceMemory < 2) || (navigator.connection && navigator.connection.saveData);
    var load = function () {
      if (load.done) return; load.done = true;
      var s = document.createElement('script'); s.src = pane.getAttribute('data-src'); s.defer = true; document.head.appendChild(s);
    };
    if (!slow) {
      var idle = window.requestIdleCallback || function (f) { return setTimeout(f, 300); };
      if ('IntersectionObserver' in window) {
        var po = new IntersectionObserver(function (en) { if (en[0].isIntersecting) { po.disconnect(); idle(load); } }, {rootMargin: '300px'});
        po.observe(pane);
      } else idle(load);
    }
  }

  $$('[data-year]').forEach(function (el) { el.textContent = new Date().getFullYear(); });
})();
