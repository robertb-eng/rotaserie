/* Rotaserie product site: theme switch, scroll-in animation, the Type to Build demo, early access, screenshot zoom. */
(function () {
  'use strict';
  // When signup opens (LLC + Stripe live mode), put 'https://app.rotaserie.com/signup' here: every
  // "Get early access" button and the form then go straight to signup instead of an email.
  var SIGNUP_URL = '';
  var EMAIL = 'robertebanchero@gmail.com';

  var root = document.documentElement;
  root.classList.add('js');  // (also set by the inline script in <head>, before first paint)

  // Light/dark: follows the device until the visitor picks one, then remembers it
  try { var saved = localStorage.getItem('sb-theme'); if (saved) root.dataset.theme = saved; } catch (e) { /* storage off */ }
  var toggle = document.querySelector('[data-theme-toggle]');
  function isDark() { return root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function showState() { if (toggle) toggle.setAttribute('aria-pressed', isDark() ? 'true' : 'false'); }
  if (toggle) toggle.addEventListener('click', function () {
    root.dataset.theme = isDark() ? 'light' : 'dark';
    try { localStorage.setItem('sb-theme', root.dataset.theme); } catch (e) { /* storage off */ }
    showState();
  });
  showState();

  // A line under the header once the page scrolls
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

  // Get early access: an email to Robert with the business filled in (until signup opens)
  if (SIGNUP_URL) {
    document.querySelectorAll('[data-start]').forEach(function (a) { a.href = SIGNUP_URL; });
    document.querySelectorAll('[data-early], [data-mailnote]').forEach(function (el) { el.hidden = true; });
  }
  var form = document.querySelector('[data-early]');
  if (form) form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (SIGNUP_URL) { location.href = SIGNUP_URL; return; }
    var biz = form.elements.business.value.trim(), kind = form.elements.kind.value;
    var body = 'Hi Robert,\n\nI\'d like early access to Rotaserie.\n\nBusiness: ' + biz + '\nKind of business: ' + kind +
      '\nHow many people work there: \nHow we schedule today: \n\nThanks!';
    location.href = 'mailto:' + EMAIL + '?subject=' + encodeURIComponent('Rotaserie early access: ' + biz) + '&body=' + encodeURIComponent(body);
  });

  // The Type to Build demo: each line is typed, then its shifts appear on the week
  var demo = document.querySelector('[data-demo]');
  if (demo) {
    var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    var PEOPLE = ['Maria', 'Sam', 'Lee'];
    var LINES = [
      {text: 'maria tue-fri 9-5', who: 0, days: [1, 2, 3, 4], time: '9a–5p', hours: 8, role: 'Server', cls: '', read: 'Maria Lopez · Tue–Fri · 9a–5p'},
      {text: 'sam sat 4p-11p', who: 1, days: [5], time: '4p–11p', hours: 7, role: 'Busser', cls: 'bus', read: 'Sam Okafor · Sat · 4p–11p'},
      {text: 'lee sun 10-6 cook', who: 2, days: [6], time: '10a–6p', hours: 8, role: 'Cook', cls: 'cook', read: 'Lee Park · Sun · 10a–6p · Cook'}
    ];
    var box = demo.querySelector('[data-demo-box]'), read = demo.querySelector('[data-demo-read]');
    var week = demo.querySelector('[data-demo-week]'), count = demo.querySelector('[data-demo-count]');
    var cells = [];
    var html = '<span></span>' + DAYS.map(function (d) { return '<span class="h">' + d + '</span>'; }).join('');
    PEOPLE.forEach(function (p) { html += '<span class="who">' + p + '</span>' + DAYS.map(function () { return '<span class="cell"></span>'; }).join(''); });
    week.innerHTML = html;
    week.querySelectorAll('.cell').forEach(function (c, i) { (cells[Math.floor(i / 7)] = cells[Math.floor(i / 7)] || []).push(c); });

    var shifts = 0, hours = 0;
    function place(line) {
      line.days.forEach(function (d, i) {
        var chip = document.createElement('span');
        chip.className = 'chip ' + line.cls;
        chip.style.animationDelay = (i * 90) + 'ms';
        chip.innerHTML = line.time + '<small>' + line.role + '</small>';
        cells[line.who][d].appendChild(chip);
        shifts += 1; hours += line.hours;
      });
      count.textContent = shifts + (shifts === 1 ? ' shift · ' : ' shifts · ') + hours + ' hours';
    }
    function typedHTML(done, current, caret) {
      var esc = function (s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;'); };
      return done.map(function (l) { return '<span class="done">' + esc(l) + '</span>\n'; }).join('') + esc(current) + (caret ? '<span class="caret"></span>' : '');
    }
    function reset() {
      cells.forEach(function (row) { row.forEach(function (c) { c.textContent = ''; }); });
      shifts = 0; hours = 0; count.textContent = '0 shifts'; read.textContent = ''; box.innerHTML = typedHTML([], '', true);
    }
    var still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still || !('IntersectionObserver' in window)) {  // the finished week, no animation
      reset(); LINES.forEach(place); box.innerHTML = typedHTML(LINES.map(function (l) { return l.text; }), '', false);
      read.textContent = LINES[LINES.length - 1].read;
    } else {
      var visible = false, running = false, timer = null;
      var wait = function (ms) { return new Promise(function (ok) { timer = setTimeout(ok, ms); }); };
      var whenVisible = function () { return new Promise(function (ok) { (function check() { if (visible) ok(); else timer = setTimeout(check, 300); })(); }); };
      var run = async function () {
        running = true;
        for (;;) {
          reset(); await wait(700);
          var done = [];
          for (var n = 0; n < LINES.length; n++) {
            var line = LINES[n];
            for (var k = 1; k <= line.text.length; k++) {
              await whenVisible();
              box.innerHTML = typedHTML(done, line.text.slice(0, k), true);
              await wait(55 + Math.random() * 70);
            }
            await wait(350);
            read.textContent = line.read;
            place(line);
            done.push(line.text);
            await wait(1100);
          }
          box.innerHTML = typedHTML(done, '', true);
          await wait(4500);
        }
      };
      reset();
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible && !running) run();
      }, {threshold: 0.3}).observe(demo);
    }
  }

  // The walkthrough: real app clips, one at a time. A clip loads only when the section is in view, in the visitor's
  // theme (light or dark); when it ends the next chapter plays; tapping a chapter jumps to it. With reduced motion
  // nothing plays by itself: the still shows, with a play button.
  var tour = document.querySelector('.tour');
  if (tour) {
    var tabs = [].slice.call(tour.querySelectorAll('[data-clip]'));
    var stage = tour.querySelector('.tour-stage'), video = stage.querySelector('video'), play = stage.querySelector('.tour-play');
    var LABELS = {ttb: 'Type to Build on a phone: three typed lines become three shifts',
      publish: 'Review and publish on a phone: the week at a glance, then Publish schedule',
      fill: 'Fill open shifts on a computer: who can take each open shift and why, then Fill these shifts',
      staff: 'A staff member picks up an open shift from their phone'};
    var calm = matchMedia('(prefers-reduced-motion: reduce)').matches, seen = false, cur = 0, chosen = false, next = 0;
    var go = function () { var p = video.play(); if (p && p.catch) p.catch(function () { play.hidden = false; }); };
    var src = function (name) {
      var t = isDark() ? 'dark' : 'light';
      return {webm: 'img/tour/' + name + '-' + t + '.webm', mp4: 'img/tour/' + name + '-' + t + '.mp4', poster: 'img/tour/' + name + '-' + t + '-poster.webp'};
    };
    var show = function (i, start) {
      clearTimeout(next);  // (a chapter picked meanwhile wins over the automatic next one)
      cur = i;
      var b = tabs[i], s = src(b.dataset.clip);
      tabs.forEach(function (x, k) { x.setAttribute('aria-selected', k === i ? 'true' : 'false'); x.style.setProperty('--p', 0); });
      stage.dataset.frame = b.dataset.frame;
      video.poster = s.poster;
      video.setAttribute('aria-label', LABELS[b.dataset.clip] || '');
      video.innerHTML = start ? '<source src="' + s.webm + '" type="video/webm"><source src="' + s.mp4 + '" type="video/mp4">' : '';
      video.load();
      if (start) go();
    };
    video.addEventListener('timeupdate', function () {
      if (video.duration) tabs[cur].style.setProperty('--p', (video.currentTime / video.duration).toFixed(3));
    });
    video.addEventListener('ended', function () {
      tabs[cur].style.setProperty('--p', 1);
      if (!calm) next = setTimeout(function () { if (seen) show((cur + 1) % tabs.length, true); }, 900);
    });
    video.addEventListener('play', function () { play.hidden = true; });
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { chosen = true; show(i, true); });
      b.addEventListener('keydown', function (ev) {  // arrow keys move between chapters, as in any tab list
        var d = ev.key === 'ArrowDown' || ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowUp' || ev.key === 'ArrowLeft' ? -1 : 0;
        if (d) { ev.preventDefault(); var n = (i + d + tabs.length) % tabs.length; tabs[n].focus(); chosen = true; show(n, true); }
      });
    });
    play.addEventListener('click', function () { chosen = true; show(cur, true); });
    if (toggle) toggle.addEventListener('click', function () { show(cur, chosen || (seen && !calm)); });
    show(0, false);
    if (calm || !('IntersectionObserver' in window)) play.hidden = false;
    else new IntersectionObserver(function (entries) {
      seen = entries[0].isIntersecting;
      if (seen && video.paused) {  // (a clip that ended while out of view: on to the next one)
        if (!video.currentSrc) show(cur, true); else if (video.ended) show(calm ? cur : (cur + 1) % tabs.length, true); else go();
      }
      else if (!seen && !video.paused) video.pause();
    }, {threshold: 0.35}).observe(stage);
  }

  // Click a screenshot to see it full size
  var zoom = document.querySelector('[data-zoombox]');
  if (zoom && zoom.showModal) {
    var big = zoom.querySelector('img');
    document.addEventListener('click', function (ev) {
      var img = ev.target.closest('[data-zoom]');
      if (img) { big.src = img.currentSrc || img.src; big.alt = img.alt; zoom.showModal(); return; }
      if (ev.target === zoom || ev.target.closest('[data-zoom-close]')) zoom.close();
    });
  }

  var year = document.querySelector('[data-year]');
  if (year) year.textContent = new Date().getFullYear();
})();
