/* Try Type to Build: the pane on the home page. A visitor types (or taps an example); the app's own parser reads it in
   the browser and the pane shows what it read, as the app does. Nothing typed is stored, sent or logged.
   Loaded by site.js when the pane nears the screen. The parser itself (vendor/typebuild.js) is fetched on first use. */
(function () {
  'use strict';
  var pane = document.querySelector('[data-ttb]');
  if (!pane) return;
  var base = pane.getAttribute('data-src').replace(/demo\/ttb\.js.*$/, ''), lang = pane.getAttribute('data-lang') || 'en';
  var $ = function (sel) { return pane.querySelector(sel); };
  var box = $('[data-ttb-text]'), out = $('[data-ttb-out]'), add = $('[data-ttb-add]'), reset = $('[data-ttb-reset]');
  var grid = $('[data-ttb-grid]'), totals = $('[data-ttb-totals]'), live = $('[data-ttb-live]'), done = $('[data-ttb-done]');
  var first = box.value, R = null, ST = null, last = null, timer = null, ready = false, waiting = [];

  function script(src) {
    if (window.RotaLoad) return window.RotaLoad(base + src);  // (site.js: each file once, whoever asks)
    return new Promise(function (ok, fail) {
      var s = document.createElement('script'); s.src = base + src; s.onload = ok; s.onerror = fail; document.head.appendChild(s);
    });
  }
  // state and drawing first (small), then the parser; each once
  var loading = null;
  function load() {
    if (!loading) loading = script('demo/state.js').then(function () { return script('demo/read.js'); }).then(function () { return script('vendor/typebuild.js'); })
      .then(function () {
        R = window.RotaDemoRead; ST = window.RotaDemoState; ready = true;
        ST.on(function (from) { if (from !== 'ttb') draw(false); });  // (the week changed somewhere else on the page)
        pane.classList.add('ready');
        waiting.splice(0).forEach(function (f) { f(); });
      }).catch(function () { loading = null; pane.classList.add('failed'); });
    return loading;
  }
  function whenReady(f) { if (ready) f(); else { waiting.push(f); load(); } }

  function fresh(ops) { return ops; }  // (R.read leaves out anything that overlaps the week as it stands)

  function draw(announce) {
    var text = R.clip(box.value);
    if (text !== box.value.replace(/\r/g, '')) box.value = text;
    last = R.read(text, ST.shifts);
    var ops = fresh(last.ops);
    out.innerHTML = R.previewHTML(lang, last);
    grid.innerHTML = R.gridHTML(lang, ST.shifts, ops);
    add.textContent = R.addLabel(lang, ops.length);
    add.disabled = !ops.length;
    totals.textContent = R.totalsText(lang, ST.shifts, ops);
    if (announce) live.textContent = R.liveText(lang, last);
  }
  function soon() { clearTimeout(timer); timer = setTimeout(function () { whenReady(function () { draw(true); }); }, 120); }

  box.readOnly = false;
  box.addEventListener('input', function () { done.hidden = true; soon(); });
  box.addEventListener('focus', load);
  pane.addEventListener('pointerdown', load, {passive: true});

  add.addEventListener('click', function () {
    whenReady(function () {
      if (!last) draw(false);
      var ops = fresh(last.ops);
      if (!ops.length) return;
      ST.last = ops[ops.length - 1].p;
      ST.set(ST.shifts.concat(ops), 'ttb');
      box.value = '';
      last = R.read('', ST.shifts);
      out.innerHTML = R.previewHTML(lang, last);
      grid.innerHTML = R.gridHTML(lang, ST.shifts, [], ops);
      add.textContent = R.addLabel(lang, 0); add.disabled = true;
      totals.textContent = R.totalsText(lang, ST.shifts, []);
      done.hidden = false;
      live.textContent = R.words[lang].added.replace('{shifts}', R.plural(lang, ops.length));
    });
  });
  if (reset) reset.addEventListener('click', function () {
    whenReady(function () { ST.set(ST.fresh(), 'ttb'); box.value = first; done.hidden = true; draw(true); });
  });

  // an answer edits the typed text, as the app does, and the box is read again
  out.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-tb]');
    if (!b) return;
    whenReady(function () {
      if (!last || last.text !== R.clip(box.value)) draw(false);
      var q = last.res && last.res.ask[+b.getAttribute('data-q')];
      if (!q) return;
      if (b.getAttribute('data-tb') === 'fix') box.value = R.applyFix(last.text, q.fixes[+b.getAttribute('data-o')]);
      else if (b.getAttribute('data-tb') === 'name' && q.fixes && q.fixes[0] && q.fixes[0][0]) {
        var f = q.fixes[0][0];
        box.value = last.text.slice(0, f.from) + b.getAttribute('data-name') + last.text.slice(f.to);
      }
      draw(true);
      var next = out.querySelector('[data-tb]') || add;
      if (next && !next.disabled) next.focus({preventScroll: true});
    });
  });

  // examples anywhere on the page fill the box
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('[data-ttb-try]');
    if (!b) return;
    var text = b.getAttribute('data-ttb-try');
    whenReady(function () {
      box.value = text; done.hidden = true; draw(true);
      if (!pane.contains(b)) {
        var calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
        pane.scrollIntoView({block: 'center', behavior: calm ? 'auto' : 'smooth'});
      }
    });
  });

  // in view for two seconds: fetch the parser, so the first keystroke answers at once
  if ('IntersectionObserver' in window) {
    var t2 = null;
    new IntersectionObserver(function (en, io) {
      if (en[0].isIntersecting) t2 = setTimeout(function () { load(); io.disconnect(); }, 2000); else clearTimeout(t2);
    }, {threshold: 0.3}).observe(pane);
  }
})();
