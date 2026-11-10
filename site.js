/* Rotaserie product site: theme switch, scroll-in animation, the Type to Build demo, early access, screenshot zoom. */
(function () {
  'use strict';
  // When signup opens (LLC + Stripe live mode), put 'https://app.rotaserie.com/signup' here: every
  // "Get early access" button and the form then go straight to signup instead of an email.
  var SIGNUP_URL = '';
  var EMAIL = 'robert@rotaserie.com';

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

  // The walkthrough: real app clips, one at a time, once through. One state, `going` (not `running`: the demo above has one, and `var`s share the function), says whether the walkthrough is
  // going (playing, or between two clips): the button shows it (pause while going, play otherwise; WCAG 2.2.2), the
  // visitor's pause stops it, picking a chapter or Play starts it. Off screen the clip waits and picks up on return.
  // Nothing loads (not even the still) until the section is seen; clips come in the visitor's theme (a theme change
  // starts the chapter again in the new colours). Reduced motion: nothing plays until asked, and no next clip follows.
  // The section shows only once this runs (class tour-on, styles.css); the clips are described in README.
  var tour = document.querySelector('.tour');
  if (tour) (function () {  // (its own scope: the demo above has `var running`, `timer`... and vars share a function)
    var tabs = [].slice.call(tour.querySelectorAll('[data-clip]'));
    var stage = tour.querySelector('.tour-stage'), video = stage.querySelector('video'), btn = stage.querySelector('.tour-play');
    var still = matchMedia('(prefers-reduced-motion: reduce)'), calm = still.matches, hasIO = 'IntersectionObserver' in window;
    var onChange = function (mq, fn) { if (mq.addEventListener) mq.addEventListener('change', fn); else if (mq.addListener) mq.addListener(fn); };  // (older Safari)
    onChange(still, function () { calm = still.matches; if (calm && going) { setGoing(false); video.pause(); } });
    var seen = !hasIO, met = !hasIO, going = false, cur = 0, played = 0, timer = 0, atEnd = false, failed = false, seekTo = 0;
    var setGoing = function (on) {
      going = on;
      if (!on) clearTimeout(timer);
      btn.classList.toggle('pausing', on);
      btn.setAttribute('aria-label', on ? 'Pause the walkthrough' : 'Play the walkthrough');
    };
    var play = function () {
      var p = video.play();
      if (p && p.catch) p.catch(function (err) { if (!err || err.name !== 'AbortError') { failed = err && err.name !== 'NotAllowedError'; setGoing(false); } });  // (refused or unplayable: it rests)
    };
    // load chapter i (its still once the section has been seen; its clip only when `withClip`), and play it if going and seen
    var load = function (i, withClip, atEndKeep, picked) {
      clearTimeout(timer);
      cur = i; atEnd = false; failed = false; seekTo = 0;
      var b = tabs[i], base = 'img/tour/' + b.dataset.clip + '-' + (isDark() ? 'dark' : 'light');
      var kb = tabs.indexOf(document.activeElement) >= 0 && !picked;  // (a keyboard user's place among the tabs stays put)
      tabs.forEach(function (x, k) { x.setAttribute('aria-selected', k === i ? 'true' : 'false'); if (!kb) x.tabIndex = k === i ? 0 : -1; });
      if (!atEndKeep) b.style.setProperty('--p', 0);  // (finished chapters keep their full bar)
      stage.dataset.frame = b.dataset.frame;
      stage.setAttribute('aria-labelledby', b.id);
      video.setAttribute('aria-label', b.dataset.label || '');
      if (met) video.poster = base + '-poster.webp';
      video.innerHTML = withClip ? '<source src="' + base + '.webm" type="video/webm"><source src="' + base + '.mp4" type="video/mp4">' : '';
      video.preload = 'none';
      video.load();
      if (withClip && going && seen) play();
    };
    var start = function (i) { played = 0; setGoing(true); load(i, true, false, true); };
    video.addEventListener('loadedmetadata', function () { if (seekTo) { video.currentTime = seekTo; seekTo = 0; } });
    var nextClip = function () { load((cur + 1) % tabs.length, true); };
    video.addEventListener('error', function (ev) {  // (a clip that won't load: it rests; only when the LAST source fails:
      var last = video.querySelector('source:last-of-type');  // Safari refuses the WebM, then plays the MP4)
      if (ev.target === video || ev.target === last) { failed = true; setGoing(false); }
    }, true);
    video.addEventListener('timeupdate', function () {
      if (video.duration) tabs[cur].style.setProperty('--p', (video.currentTime / video.duration).toFixed(3));
    });
    video.addEventListener('ended', function () {
      tabs[cur].style.setProperty('--p', 1);
      played++;
      atEnd = true;
      if (!going || calm || played >= tabs.length) { setGoing(false); return; }  // (once through, then it rests)
      timer = setTimeout(nextClip, 900);  // (off screen, the next one waits: see below)
    });
    btn.addEventListener('click', function () {
      if (going) { setGoing(false); video.pause(); return; }
      if (atEnd) start((cur + 1) % tabs.length);  // (after a clip ended: the next one)
      else if (video.currentSrc && !failed) { setGoing(true); play(); }  // (after a pause: on from the same moment; a failed clip starts afresh)
      else start(cur);
    });
    var bring = function () {  // on a phone the stage sits above the list: a picked chapter's clip comes into view
      setTimeout(function () {  // (after the frame has changed size)
        var r = stage.getBoundingClientRect(), shown = Math.min(r.bottom, innerHeight) - Math.max(r.top, 0);
        if (shown < r.height * 0.6) stage.scrollIntoView({block: 'nearest', behavior: calm ? 'auto' : 'smooth'});
      }, calm ? 0 : 520);
    };
    tabs.forEach(function (b, i) {
      b.addEventListener('click', function () { start(i); bring(); });
      b.addEventListener('keydown', function (ev) {  // a tab list: arrows, Home and End move the focus; Enter or Space plays
        var n = {ArrowDown: i + 1, ArrowRight: i + 1, ArrowUp: i - 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1}[ev.key];
        if (n === undefined || ev.altKey || ev.ctrlKey || ev.metaKey) return;  // (browser shortcuts pass)
        ev.preventDefault(); n = (n + tabs.length) % tabs.length;
        tabs.forEach(function (x, k) { x.tabIndex = k === n ? 0 : -1; }); tabs[n].focus();  // (Tab returns to it)
      });
    });
    var retheme = function () {  // the same chapter in the new colours: on from its start, paused at the same moment, its still if ended
      if (!met) return;  // (nothing shown yet: the first sight loads the right theme)
      var ended = atEnd, at = video.currentSrc && !ended ? video.currentTime : 0;
      load(cur, !ended && (going || !!video.currentSrc), ended);
      if (ended) { atEnd = true; if (going) timer = setTimeout(nextClip, 900); }
      else if (at && !going) { seekTo = at; video.preload = 'metadata'; video.load(); }  // (paused: the same moment, in the new colours)
    };
    if (toggle) toggle.addEventListener('click', retheme);
    var dark = matchMedia('(prefers-color-scheme: dark)');
    onChange(dark, function () { if (!root.dataset.theme) retheme(); });
    setGoing(!calm && hasIO);  // (it starts by itself the first time it's seen)
    load(0, false);
    if (hasIO) new IntersectionObserver(function (entries) {
      seen = entries[entries.length - 1].isIntersecting;  // (the newest, after a fast flick)
      if (seen && !met) { met = true; load(cur, going); return; }
      if (seen && going && video.paused && !video.ended) { if (!video.currentSrc) load(cur, true); else play(); }
      else if (!seen && !video.paused) video.pause();  // (still going: it picks up when back in view)
    }, {threshold: 0.35}).observe(stage);
    tour.classList.add('tour-on');  // (shown only now that it can play; a #tour link lands once it's there)
    if (location.hash === '#tour' && scrollY < 10) tour.scrollIntoView({behavior: 'instant'});  // (not over a restored scroll)
    document.querySelectorAll('a[data-tour]').forEach(function (a) { a.href = a.getAttribute('href').replace('#managers', '#tour'); });  // (in step with the section)
    document.addEventListener('visibilitychange', function () {  // (a hidden browser tab: the clip waits)
      if (document.hidden) { if (!video.paused) video.pause(); } else if (going && seen && video.paused && !atEnd && video.currentSrc) play();
    });
  })();


  // v2: the product plays in its frames (hero, call-out, Spanish): each clip loads only when first seen, plays only
  // while seen and shown (the other theme's copy stays still), loops; reduced motion leaves the still (its poster).
  var calmMQ = matchMedia('(prefers-reduced-motion: reduce)');
  var loops = [].slice.call(document.querySelectorAll('video[data-loop]'));
  if (loops.length && 'IntersectionObserver' in window) {
    var inView = new Map();
    var shown = function (v) { return v.offsetParent !== null; };
    var settle = function (v) {
      var want = inView.get(v) && shown(v) && !calmMQ.matches && !document.hidden;
      if (want) {
        if (!v.dataset.loaded) { v.querySelectorAll('source[data-src]').forEach(function (s) { s.src = s.dataset.src; }); v.dataset.loaded = '1'; v.load(); }
        var p = v.play(); if (p && p.catch) p.catch(function () {});
      } else if (!v.paused) v.pause();
    };
    var loopIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { inView.set(en.target, en.isIntersecting); settle(en.target); });
    }, {threshold: 0.25});
    loops.forEach(function (v) { loopIO.observe(v); });
    var all = function () { setTimeout(function () { loops.forEach(settle); }, 30); };
    if (toggle) toggle.addEventListener('click', all);
    document.addEventListener('visibilitychange', all);
    if (calmMQ.addEventListener) calmMQ.addEventListener('change', all);
    var darkMQ = matchMedia('(prefers-color-scheme: dark)');
    if (darkMQ.addEventListener) darkMQ.addEventListener('change', all);
  }

  // v2: the hero's devices lean toward the pointer (a mouse, not touch) and drift with the scroll
  var stageEl = document.querySelector('[data-tilt]');
  if (stageEl && matchMedia('(pointer: fine)').matches) {
    var hero2 = stageEl.closest('section') || stageEl;
    hero2.addEventListener('pointermove', function (ev) {
      if (calmMQ.matches) return;
      var r = stageEl.getBoundingClientRect();
      var x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
      stageEl.style.setProperty('--ry', (x * 6).toFixed(2) + 'deg');
      stageEl.style.setProperty('--rx', (-y * 4).toFixed(2) + 'deg');
    });
    hero2.addEventListener('pointerleave', function () { stageEl.style.setProperty('--ry', '0deg'); stageEl.style.setProperty('--rx', '0deg'); });
  }
  var pars = [].slice.call(document.querySelectorAll('[data-par]'));
  if (pars.length) {
    var ticking = false;
    var drift = function () {
      ticking = false;
      var mid = innerHeight / 2;
      pars.forEach(function (el) {
        if (calmMQ.matches) { el.style.removeProperty('--py'); return; }
        var r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > innerHeight + 200) return;
        el.style.setProperty('--py', ((r.top + r.height / 2 - mid) * parseFloat(el.dataset.par)).toFixed(1) + 'px');
      });
    };
    addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(drift); } }, {passive: true});
    drift();
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
