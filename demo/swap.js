/* The swap, both sides: the app's four steps as a walkthrough a visitor taps through. Request swap, ask a coworker,
   they accept, the manager approves. The screens are drawn here with the app's own labels (its Trade page, the
   coworker's home page, the manager's Requests page); the people and shifts are made up. Nothing is stored or sent. */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var W = {
    en: {
      who: ['Maya\'s phone', 'Maya\'s phone', 'Diego\'s phone', 'Your phone', 'Done'],
      forb: 'for Harbor Street Bistro', hello: 'Good afternoon, {name}', next: 'My next shift', inn: 'in 5d 1h',
      mine: 'Thursday, November 19 · 11am–5pm', role: 'Server', at: 'Harbor Street Bistro', withp: 'With Priya and Sam',
      swap: 'Request swap', give: 'Give away', trade: 'Trade your shift', yougive: 'You give:', a: 'Thu, Nov 19 · 11am', b: 'Sat, Nov 21 · 4pm', b2: 'Sun, Nov 22 · 4pm',
      pick: 'Pick the shift you\'d like in return. The other person accepts, then a manager approves.', ask: 'Ask Diego',
      sent: 'Trade request sent to Diego.', reqs: 'Trade requests for you', wants: 'wants to trade:', youget: 'You get:', theyget: 'They get:',
      accept: 'Accept', decline: 'Decline', accepted: 'Trade accepted. A manager will approve it and you\'ll both get an email.',
      requests: 'Requests', kind: 'Trade', takes: '{name} takes', along: 'Thu, Nov 19 · 11am–5pm', blong: 'Sat, Nov 21 · 4pm–10pm', b2long: 'Sun, Nov 22 · 4pm–9pm',
      valid: 'Valid: no double booking, overtime or time off', approve: 'Approve', declinem: 'Decline...',
      done: 'Shift trade approved', now: '{name} now works {gets} instead of {gives}.', both: 'Both people get an email.',
      declined: 'Trade declined.', declined2: 'Maya still has her shift. Nothing changed on the schedule.',
      denied: 'Shift trade not approved', denied2: 'They both keep their original shifts, and both are told.',
      again: 'Start over', step: 'Step {n} of 4', home: 'Home', sched: 'Schedule', shifts: 'Shifts', me: 'Me', today: 'Today', team: 'Team', more: 'More'
    },
    es: {
      who: ['El teléfono de Maya', 'El teléfono de Maya', 'El teléfono de Diego', 'Tu teléfono', 'Listo'],
      forb: 'para Harbor Street Bistro', hello: 'Buenas tardes, {name}', next: 'Mi próximo turno', inn: 'en 5d 1h',
      mine: 'jueves, 19 de noviembre · 11am–5pm', role: 'Mesero', at: 'Harbor Street Bistro', withp: 'Con Priya y Sam',
      swap: 'Pedir cambio', give: 'Dejar turno', trade: 'Cambia tu turno', yougive: 'Das:', a: 'jue, 19 nov · 11am', b: 'sáb, 21 nov · 4pm', b2: 'dom, 22 nov · 4pm',
      pick: 'Elige el turno que quieres a cambio. La otra persona acepta y luego un gerente lo aprueba.', ask: 'Pedir a Diego',
      sent: 'Solicitud de cambio enviada a Diego.', reqs: 'Solicitudes de cambio para ti', wants: 'quiere cambiar:', youget: 'Recibes:', theyget: 'Recibe:',
      accept: 'Aceptar', decline: 'Rechazar', accepted: 'Cambio aceptado. Un gerente lo aprobará y a los dos les llegará un correo.',
      requests: 'Solicitudes', kind: 'Cambio', takes: '{name} toma', along: 'jue, 19 nov · 11am–5pm', blong: 'sáb, 21 nov · 4pm–10pm', b2long: 'dom, 22 nov · 4pm–9pm',
      valid: 'Válido: sin doble turno, horas extra ni días libres', approve: 'Aprobar', declinem: 'Rechazar...',
      done: 'Cambio de turno aprobado', now: '{name} ahora trabaja el {gets} en lugar del {gives}.', both: 'A las dos personas les llega un correo.',
      declined: 'Cambio rechazado.', declined2: 'Maya conserva su turno. No cambió nada en el horario.',
      denied: 'Cambio de turno no aprobado', denied2: 'Los dos mantienen sus turnos originales, y se les avisa a los dos.',
      again: 'Empezar de nuevo', step: 'Paso {n} de 4', home: 'Inicio', sched: 'Horario', shifts: 'Turnos', me: 'Mi cuenta', today: 'Hoy', team: 'Equipo', more: 'Más'
    }
  };
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function top(L) { return '<div class="ph-top"><span class="ph-logo" aria-hidden="true"></span><b>Rotaserie</b><span>' + esc(L.forb) + '</span></div>'; }
  function navbar(L, mgr, on) {
    var items = mgr ? [L.today, L.sched, L.requests, L.team, L.more] : [L.home, L.sched, L.shifts, L.me];
    return '<div class="ph-nav' + (mgr ? ' five' : '') + '" aria-hidden="true">' + items.map(function (t, i) { return '<span' + (i === on ? ' class="on"' : '') + '>' + esc(t) + '</span>'; }).join('') + '</div>';
  }
  function tag(L) { return ' <span class="ph-role s0">' + esc(L.role) + '</span>'; }
  function go(label, to, gold) { return '<button type="button" class="ph-btn' + (gold ? ' gold go' : '') + '" data-swap-to="' + to + '">' + esc(label) + '</button>'; }

  /* The screen for a step. st: {step: 0..4 | 'declined' | 'denied', pick: 'b' | 'b2' (the shift asked for)} */
  function screenHTML(lang, st) {
    var L = W[lang], step = st.step, pick = st.pick === 'b2' ? 'b2' : 'b', h = '<div class="ph">' + top(L) + '<div class="ph-body">';
    if (step === 0) {
      h += '<p class="ph-hello">' + esc(L.hello.replace('{name}', 'Maya')) + '</p><div class="ph-card"><span class="ph-k">' + esc(L.next) + '</span><p class="ph-in">' + esc(L.inn) + '</p>'
        + '<p class="ph-when">' + esc(L.mine) + tag(L) + '</p><p class="ph-at">' + esc(L.at) + '</p><p class="ph-with"><i aria-hidden="true">P</i><i aria-hidden="true">S</i>' + esc(L.withp) + '</p>'
        + '<p class="ph-btns">' + go(L.swap, 1, true) + '<span class="ph-btn" aria-hidden="true">' + esc(L.give) + '</span></p></div>';
    } else if (step === 1) {
      h += '<p class="ph-hello">' + esc(L.trade) + '</p><div class="ph-card flat"><p><b>' + esc(L.yougive) + '</b> ' + esc(L.a) + tag(L) + '</p><p class="ph-at">' + esc(L.pick) + '</p></div>'
        + '<p class="ph-h" translate="no">Diego Ruiz</p><div class="ph-list"><p><span>' + esc(L.b) + tag(L) + '</span><button type="button" class="ph-btn gold go" data-swap-to="2" data-pick="b">' + esc(L.ask) + '</button></p>'
        + '<p><span>' + esc(L.b2) + tag(L) + '</span><button type="button" class="ph-btn gold" data-swap-to="2" data-pick="b2">' + esc(L.ask) + '</button></p></div>';
    } else if (step === 2) {
      h += '<p class="ph-hello">' + esc(L.hello.replace('{name}', 'Diego')) + '</p><p class="ph-h">' + esc(L.reqs) + '</p><div class="ph-card flat"><p><b translate="no">Maya</b> ' + esc(L.wants) + '</p>'
        + '<p class="ph-at">' + esc(L.youget) + ' ' + esc(L.a) + tag(L) + '<br>' + esc(L.theyget) + ' ' + esc(L[pick]) + tag(L) + '</p><p class="ph-btns">' + go(L.accept, 3, true) + go(L.decline, 'declined', false) + '</p></div>';
    } else if (step === 3) {
      h += '<p class="ph-hello">' + esc(L.requests) + '</p><div class="ph-card"><span class="ph-k">' + esc(L.kind) + '</span><p class="ph-pair"><i aria-hidden="true">M</i><i aria-hidden="true">D</i><b translate="no">Maya ↔ Diego</b></p>'
        + '<p class="ph-at">' + esc(L.takes.replace('{name}', 'Diego')) + ' <b>' + esc(L.along) + '</b>' + tag(L) + '<br>' + esc(L.takes.replace('{name}', 'Maya')) + ' <b>' + esc(L[pick + 'long']) + '</b>' + tag(L) + '</p>'
        + '<p class="ph-valid">✓ ' + esc(L.valid) + '</p><p class="ph-btns">' + go(L.approve, 4, true) + go(L.declinem, 'denied', false) + '</p></div>';
    } else {
      var okd = step === 4;
      h += '<div class="ph-card ph-end' + (okd ? ' ok' : '') + '"><span class="ph-k">' + esc(okd ? L.done : step === 'declined' ? L.declined : L.denied) + '</span>';
      if (okd) h += '<p>' + esc(L.now.replace('{name}', 'Maya').replace('{gets}', L[pick + 'long']).replace('{gives}', L.along)) + '</p><p>' + esc(L.now.replace('{name}', 'Diego').replace('{gets}', L.along).replace('{gives}', L[pick + 'long'])) + '</p><p class="ph-valid">✓ ' + esc(L.both) + '</p>';
      else h += '<p>' + esc(step === 'declined' ? L.declined2 : L.denied2) + '</p>';
      h += '<p class="ph-btns">' + go(L.again, 0, true) + '</p></div>';
    }
    var mgr = step === 3;
    return h + '</div>' + (typeof step === 'number' && step < 4 ? navbar(L, mgr, mgr ? 2 : step === 1 ? 2 : 0) : '') + '</div>';
  }
  function whose(lang, st) {
    var s = st.step, n = typeof s === 'number' ? s : s === 'declined' ? 2 : 3;
    return (typeof s === 'number' && s < 4 ? W[lang].step.replace('{n}', s + 1) + ' · ' : '') + W[lang].who[typeof s === 'number' ? s : n];
  }
  /* What a tap says to a screen reader: the app's own confirmation line for that step. */
  function said(lang, st) { var L = W[lang], s = st.step; return s === 2 ? L.sent : s === 3 ? L.accepted : s === 4 ? L.done + '. ' + L.both : s === 'declined' ? L.declined : s === 'denied' ? L.denied : ''; }

  var api = {screenHTML: screenHTML, whose: whose, said: said, words: W};
  if (node) { module.exports = api; return; }
  root.RotaDemoSwap = api;

  var box = document.querySelector('[data-swap]');
  if (!box) return;
  var lang = box.getAttribute('data-lang') || 'en', stage = box.querySelector('[data-swap-stage]'), label = box.querySelector('[data-swap-who]');
  var live = box.querySelector('[data-swap-live]'), steps = box.querySelectorAll('[data-swap-step]'), flash = box.querySelector('[data-swap-flash]');
  var st = {step: 0, pick: 'b'};
  function draw(focus) {
    stage.innerHTML = screenHTML(lang, st);
    label.textContent = whose(lang, st);
    var n = typeof st.step === 'number' ? st.step : st.step === 'declined' ? 2 : 3;
    steps.forEach(function (li, i) { li.classList.toggle('on', i === Math.min(n, 3) && st.step !== 4); li.classList.toggle('done', i < n || st.step === 4); });
    var msg = said(lang, st);
    flash.hidden = !msg || typeof st.step !== 'number' || st.step === 4; flash.textContent = msg;
    live.textContent = (msg ? msg + ' ' : '') + label.textContent + '.';
    if (focus) { var b = stage.querySelector('.go') || stage.querySelector('button'); if (b) b.focus({preventScroll: true}); }
  }
  stage.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-swap-to]');
    if (!b) return;
    var to = b.getAttribute('data-swap-to');
    if (b.hasAttribute('data-pick')) st.pick = b.getAttribute('data-pick');
    st.step = /^\d$/.test(to) ? +to : to;
    if (st.step === 0) st.pick = 'b';
    draw(true);
  });
  box.classList.add('ready');
  draw(false);
})(typeof window !== 'undefined' ? window : this);
