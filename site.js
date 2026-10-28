/* ShiftBoard product site: theme switch, scroll-in animation, tour highlighting and screenshot zoom. */
(function () {
  'use strict';
  var root = document.documentElement;
  root.classList.add('js');

  // Light/dark: follows the device until the visitor picks one, then remembers it
  try { var saved = localStorage.getItem('sb-theme'); if (saved) root.dataset.theme = saved; } catch (e) { /* storage off */ }
  var toggle = document.querySelector('[data-theme-toggle]');
  if (toggle) toggle.addEventListener('click', function () {
    var dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    try { localStorage.setItem('sb-theme', root.dataset.theme); } catch (e) { /* storage off */ }
  });

  // Border under the header once the page scrolls
  var nav = document.querySelector('[data-nav]');
  function onScroll() { nav.classList.toggle('scrolled', window.scrollY > 8); }
  window.addEventListener('scroll', onScroll, {passive: true}); onScroll();

  // Sections fade up as they come into view
  var reveals = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, {rootMargin: '0px 0px -8% 0px', threshold: 0.08});
    reveals.forEach(function (el) { io.observe(el); });
  } else reveals.forEach(function (el) { el.classList.add('in'); });

  // Highlight the tour chapter being read, and keep its pill in view
  var links = Array.prototype.slice.call(document.querySelectorAll('.tour-nav a'));
  var targets = links.map(function (a) { return document.querySelector(a.getAttribute('href')); });
  var current = null;
  function highlight() {
    var y = window.scrollY + 200, active = null;
    targets.forEach(function (t, i) { if (t && t.getBoundingClientRect().top + window.scrollY <= y) active = links[i]; });
    if (active === current) return;
    if (current) current.classList.remove('on');
    current = active;
    if (current) {
      current.classList.add('on');
      var bar = current.parentNode, left = current.offsetLeft - bar.clientWidth / 2 + current.clientWidth / 2;
      bar.scrollTo({left: left, behavior: 'smooth'});
    }
  }
  window.addEventListener('scroll', highlight, {passive: true}); highlight();

  // Click a screenshot to see it full size
  var box = document.querySelector('[data-zoombox]');
  if (box && box.showModal) {
    var big = box.querySelector('img');
    document.addEventListener('click', function (ev) {
      var img = ev.target.closest('[data-zoom]');
      if (img) { big.src = img.currentSrc || img.src; big.alt = img.alt; box.showModal(); return; }
      if (ev.target === box || ev.target.closest('[data-zoom-close]')) box.close();
    });
  }

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
