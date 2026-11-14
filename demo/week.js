/* The week, both sides: a small copy of the Builder's week (move, add and remove shifts; it warns, never blocks) and
   one person's phone, drawn from the same made-up week the Type to Build pane uses (demo/state.js). The rules are the
   app's: overtime after 40 hours, approved time off, double booking. Nothing is stored or sent.
   Pure drawing functions first (the build uses them for the page's starting state), then the page wiring. */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var ST = node ? require('./state.js') : root.RotaDemoState;
  var LIMIT = 40;
  var W = {
    en: {
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], full: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      month: 'November', team: 'Team', hours: 'Hours', hrs: '{h}h', off: 'Time off', over: 'over 40 hours',
      add: 'Add a shift: {name}, {day}', shift: '{name}, {day} {a}–{b}, {role}', pick: 'Enter picks it up; arrow keys move it; Delete removes it',
      hint: 'Drag a shift to another person or day. Tap an empty cell to add one. Tap a shift to move or remove it.',
      sel: '{name} · {day} {a}–{b}. Tap any cell to move it there.', remove: 'Remove', cancel: 'Cancel',
      addFor: 'Add for {name} on {day}:', undo: 'Undo', keep: 'Keep it', who: 'Who can take it', reset: 'Reset',
      ot: '{name} would reach {h} hours. Overtime starts after 40. Keep it, or see who else can take it.',
      toff: '{name} has approved time off on {day}. Keep it, or see who else can take it.',
      dbl: '{name} already has a shift then on {day}. Keep it, or see who else can take it.',
      free: 'Free that day: {names}.', nofree: 'No one else is free that day.',
      moved: 'Moved to {name}, {day}.', added: 'Added: {name}, {day} {a}–{b}.', removed: 'Removed: {name}, {day} {a}–{b}.', kept: 'Kept.',
      total: '{n} shifts · {h} hours', and: 'and',
      hello: 'Good afternoon, {name}', next: 'My next shift', inn: 'in {d}d {h}h', inh: 'in {h}h', none: 'No shifts this week',
      at: 'Harbor Street Bistro', withp: 'With {names}', alone: 'First one in', swap: 'Request swap', give: 'Give away',
      week: 'This week', offday: 'off', of: '{h} of 40 hours', open1: '1 open shift you could pick up', openN: '{n} open shifts you could pick up',
      open0: 'No open shifts for you this week', home: 'Home', sched: 'Schedule', shifts: 'Shifts', me: 'Me', forb: 'for Harbor Street Bistro',
      am: 'am', pm: 'pm'
    },
    es: {
      days: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'], full: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'],
      month: 'noviembre', team: 'Equipo', hours: 'Horas', hrs: '{h} h', off: 'Día libre', over: 'más de 40 horas',
      add: 'Agregar un turno: {name}, {day}', shift: '{name}, {day} {a}–{b}, {role}', pick: 'Enter lo toma; las flechas lo mueven; Suprimir lo quita',
      hint: 'Arrastra un turno a otra persona o a otro día. Toca una celda vacía para agregar uno. Toca un turno para moverlo o quitarlo.',
      sel: '{name} · {day} {a}–{b}. Toca cualquier celda para moverlo ahí.', remove: 'Quitar', cancel: 'Cancelar',
      addFor: 'Agregar para {name} el {day}:', undo: 'Deshacer', keep: 'Dejarlo así', who: 'Quién puede tomarlo', reset: 'Reiniciar',
      ot: '{name} llegaría a {h} horas. El tiempo extra empieza después de 40. Déjalo así, o mira quién más puede tomarlo.',
      toff: '{name} tiene un día libre aprobado el {day}. Déjalo así, o mira quién más puede tomarlo.',
      dbl: '{name} ya tiene un turno a esa hora el {day}. Déjalo así, o mira quién más puede tomarlo.',
      free: 'Libres ese día: {names}.', nofree: 'Nadie más está libre ese día.',
      moved: 'Movido a {name}, {day}.', added: 'Agregado: {name}, {day} {a}–{b}.', removed: 'Quitado: {name}, {day} {a}–{b}.', kept: 'Se dejó así.',
      total: '{n} turnos · {h} horas', and: 'y',
      hello: 'Buenas tardes, {name}', next: 'Mi próximo turno', inn: 'en {d}d {h}h', inh: 'en {h}h', none: 'Sin turnos esta semana',
      at: 'Harbor Street Bistro', withp: 'Con {names}', alone: 'Llegas primero', swap: 'Pedir cambio', give: 'Dejar turno',
      week: 'Esta semana', offday: 'libre', of: '{h} de 40 horas', open1: '1 turno abierto que podrías tomar', openN: '{n} turnos abiertos que podrías tomar',
      open0: 'Sin turnos abiertos para ti esta semana', home: 'Inicio', sched: 'Horario', shifts: 'Turnos', me: 'Mi cuenta', forb: 'para Harbor Street Bistro',
      am: 'am', pm: 'pm'
    }
  };

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mins(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function fmt(t) { var m = mins(t), h = Math.floor(m / 60) % 24, mm = m % 60; return (h % 12 || 12) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (h < 12 ? 'a' : 'p'); }
  function fmtLong(lang, t) { var m = mins(t), h = Math.floor(m / 60) % 24, mm = m % 60; return (h % 12 || 12) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (h < 12 ? W[lang].am : W[lang].pm); }
  function len(s) { return (((mins(s.b) - mins(s.a)) % 1440) + 1440) % 1440 || 1440; }
  function num(m) { return String(Math.round(m / 60 * 100) / 100); }
  function first(name) { return name.split(' ')[0]; }
  function person(id) { for (var i = 0; i < ST.people.length; i++) if (ST.people[i].id === id) return ST.people[i]; return null; }
  function role(key) { for (var i = 0; i < ST.roles.length; i++) if (ST.roles[i].key === key) return ST.roles[i]; return ST.roles[0]; }
  function fill(s, o) { return s.replace(/\{(\w+)\}/g, function (m, k) { return k in o ? o[k] : m; }); }
  function list(lang, names) { return names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' ' + W[lang].and + ' ' + names[names.length - 1]; }

  function hoursOf(week, p) { var m = 0; week.forEach(function (s) { if (s.p === p) m += len(s); }); return m; }
  function isOff(p, d) { return (ST.off || []).some(function (o) { return o.p === p && o.d === d; }); }
  function overlaps(a, b) { return mins(a.a) < mins(b.a) + len(b) && mins(b.a) < mins(a.a) + len(a); }

  /* What the app would say about one shift where it now sits: time off first, then double booking, then overtime. */
  function problem(week, s) {
    if (isOff(s.p, s.d)) return 'toff';
    if (week.some(function (x) { return x !== s && x.p === s.p && x.d === s.d && overlaps(x, s); })) return 'dbl';
    if (hoursOf(week, s.p) > LIMIT * 60) return 'ot';
    return null;
  }
  function problemText(lang, week, s, kind) {
    return fill(W[lang][kind], {name: first(person(s.p).name), day: W[lang].days[s.d], h: num(hoursOf(week, s.p))});
  }
  /* People who could take a shift: no shift that day, no time off, and still within 40 hours with it. */
  function whoCanTake(week, s) {
    return ST.people.filter(function (p) {
      return p.id !== s.p && !isOff(p.id, s.d) && !week.some(function (x) { return x.p === p.id && x.d === s.d; }) && hoursOf(week, p.id) + len(s) <= LIMIT * 60;
    }).map(function (p) { return p.id; });
  }

  /* The week as a table. opts: {sel: the picked-up shift's number, free: [person ids to light up], kept: {person id: true}, live: true = with buttons} */
  function gridHTML(lang, week, opts) {
    opts = opts || {};
    var L = W[lang], h = '<table class="wk wk-live"><thead><tr><th scope="col" class="wk-team">' + esc(L.team) + '</th>';
    L.days.forEach(function (d, i) { h += '<th scope="col"><span>' + esc(d) + '</span> <b>' + ST.dates[i] + '</b></th>'; });
    h += '</tr></thead><tbody>';
    ST.people.forEach(function (p) {
      var m = hoursOf(week, p.id), over = m > LIMIT * 60, lit = (opts.free || []).indexOf(p.id) >= 0;
      h += '<tr' + (lit ? ' class="lit"' : '') + '><th scope="row"><span class="wk-name" translate="no">' + esc(first(p.name)) + '</span><span class="wk-h' + (over ? ' over' : '') + '">'
        + esc(L.hrs.replace('{h}', num(m))) + (over ? '<span class="sr"> (' + esc(L.over) + ')</span>' : '') + '</span></th>';
      for (var d = 0; d < 7; d++) {
        var off = isOff(p.id, d), any = false;
        h += '<td data-p="' + p.id + '" data-d="' + d + '"' + (off ? ' class="off"' : '') + '>';
        if (off) h += '<span class="wk-off">' + esc(L.off) + '</span>';
        week.forEach(function (s, i) {
          if (s.p !== p.id || s.d !== d) return;
          any = true;
          var label = fill(L.shift, {name: first(p.name), day: L.days[d], a: fmt(s.a), b: fmt(s.b), role: role(s.r)[lang]});
          var inner = '<b>' + fmt(s.a) + '–</b><b>' + fmt(s.b) + '</b>', cls = 'sh s' + role(s.r).tone + (opts.sel === i ? ' sel' : '') + (s.n ? ' new' : '');
          h += opts.live ? '<button type="button" class="' + cls + '" data-i="' + i + '" aria-pressed="' + (opts.sel === i ? 'true' : 'false') + '" aria-label="' + esc(label) + '">' + inner + '</button>'
                         : '<span class="' + cls + '">' + inner + '<span class="sr"> ' + esc(role(s.r)[lang]) + '</span></span>';
        });
        if (opts.live && !any) h += '<button type="button" class="wk-add" data-add aria-label="' + esc(fill(L.add, {name: first(p.name), day: L.days[d]})) + '"><span aria-hidden="true">+</span></button>';
        h += '</td>';
      }
      h += '</tr>';
    });
    h += '</tbody><tfoot><tr><th scope="row">' + esc(L.hours) + '</th>';
    for (var d2 = 0; d2 < 7; d2++) { var dm = 0; week.forEach(function (s) { if (s.d === d2) dm += len(s); }); h += '<td>' + esc(L.hrs.replace('{h}', num(dm))) + '</td>'; }
    return h + '</tr></tfoot></table>';
  }
  function totalText(lang, week) { var m = 0; week.forEach(function (s) { m += len(s); }); return fill(W[lang].total, {n: week.length, h: num(m)}); }

  /* One person's phone: their next shift, who's on with them, their week, the open shifts they could take. */
  function phoneHTML(lang, week, pid) {
    var L = W[lang], p = person(pid), mine = week.filter(function (s) { return s.p === pid; }).sort(function (a, b) { return a.d - b.d || mins(a.a) - mins(b.a); });
    var now = new Date(ST.now + ':00Z'), nx = mine[0];
    var h = '<div class="ph"><div class="ph-top"><span class="ph-logo" aria-hidden="true"></span><b>Rotaserie</b><span>' + esc(L.forb) + '</span></div>'
      + '<div class="ph-body"><p class="ph-hello">' + esc(fill(L.hello, {name: first(p.name)})) + '</p><div class="ph-card"><span class="ph-k">' + esc(L.next) + '</span>';
    if (nx) {
      var start = new Date(ST.week[nx.d] + 'T' + nx.a + ':00Z'), hrs = Math.floor((start - now) / 3600000), dd = Math.floor(hrs / 24);
      var mates = [];
      week.forEach(function (s) { if (s.p !== pid && s.d === nx.d && overlaps(s, nx) && mates.indexOf(first(person(s.p).name)) < 0) mates.push(first(person(s.p).name)); });
      h += '<p class="ph-in">' + esc(dd ? fill(L.inn, {d: dd, h: hrs % 24}) : fill(L.inh, {h: hrs})) + '</p>'
        + '<p class="ph-when">' + esc(L.full[nx.d] + (lang === 'es' ? ', ' + ST.dates[nx.d] + ' de ' + L.month : ', ' + L.month + ' ' + ST.dates[nx.d])) + ' · ' + fmtLong(lang, nx.a) + '–' + fmtLong(lang, nx.b)
        + ' <span class="ph-role s' + role(nx.r).tone + '">' + esc(role(nx.r)[lang]) + '</span></p><p class="ph-at">' + esc(L.at) + '</p>'
        + '<p class="ph-with">' + (mates.length ? mates.slice(0, 3).map(function (n) { return '<i aria-hidden="true">' + esc(n.charAt(0)) + '</i>'; }).join('') + esc(fill(L.withp, {names: list(lang, mates.slice(0, 3))})) : esc(L.alone)) + '</p>'
        + '<p class="ph-btns" aria-hidden="true"><span class="ph-btn gold">' + esc(L.swap) + '</span><span class="ph-btn">' + esc(L.give) + '</span></p>';
    } else h += '<p class="ph-in none">' + esc(L.none) + '</p>';
    h += '</div><p class="ph-h">' + esc(L.week) + '</p><ol class="ph-week">';
    for (var d = 0; d < 7; d++) {
      var day = mine.filter(function (s) { return s.d === d; });
      h += '<li' + (day.length ? ' class="on"' : '') + '><span>' + esc(L.days[d]) + '</span><b>' + ST.dates[d] + '</b><em>' + (day.length ? day.map(function (s) { return fmt(s.a) + '–' + fmt(s.b); }).join('<br>') : esc(L.offday)) + '</em></li>';
    }
    var open = (ST.open || []).filter(function (o) { return p.roles.indexOf(o.r) >= 0 && !mine.some(function (s) { return s.d === o.d && overlaps(s, o); }) && !isOff(pid, o.d); }).length;
    h += '</ol><p class="ph-row"><span class="ph-ring" aria-hidden="true"></span>' + esc(fill(L.of, {h: num(hoursOf(week, pid))})) + '</p>'
      + '<p class="ph-row open">' + esc(open === 0 ? L.open0 : open === 1 ? L.open1 : fill(L.openN, {n: open})) + '</p></div>'
      + '<div class="ph-nav" aria-hidden="true"><span class="on">' + esc(L.home) + '</span><span>' + esc(L.sched) + '</span><span>' + esc(L.shifts) + '</span><span>' + esc(L.me) + '</span></div></div>';
    return h;
  }

  var api = {gridHTML: gridHTML, phoneHTML: phoneHTML, totalText: totalText, problem: problem, problemText: problemText, whoCanTake: whoCanTake,
             hoursOf: hoursOf, words: W, fmt: fmt, LIMIT: LIMIT};
  if (node) { module.exports = api; return; }
  root.RotaDemoWeek = api;

  // ------------------------------------------------------------------------------------------------ the page
  var box = document.querySelector('[data-week]');
  if (!box) return;
  var lang = box.getAttribute('data-lang') || 'en', L = W[lang];
  var $ = function (sel) { return box.querySelector(sel); };
  var grid = $('[data-week-grid]'), bar = $('[data-week-bar]'), warn = $('[data-week-warn]'), total = $('[data-week-total]'), live = $('[data-week-live]');
  var phone = $('[data-week-phone]'), who = $('[data-week-who]'), views = box.querySelectorAll('[data-week-view]'), panes = box.querySelectorAll('[data-week-pane]');
  var sel = null, adding = null, free = [], before = null, flagged = null, calm = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var USUAL = [['11:00', '17:00'], ['16:00', '22:00'], ['17:00', '23:00']];

  function week() { return ST.shifts; }
  function say(t) { live.textContent = ''; setTimeout(function () { live.textContent = t; }, 30); }
  function draw(keepFocus) {
    var at = keepFocus && document.activeElement && grid.contains(document.activeElement) ? document.activeElement.closest('td') : null;
    var key = at ? [at.getAttribute('data-p'), at.getAttribute('data-d')] : null;
    grid.innerHTML = gridHTML(lang, week(), {sel: sel, free: free, live: true});
    week().forEach(function (s) { delete s.n; });
    total.textContent = totalText(lang, week());
    var s = sel != null ? week()[sel] : null;
    if (s) bar.innerHTML = '<span>' + esc(fill(L.sel, {name: first(person(s.p).name), day: L.days[s.d], a: fmt(s.a), b: fmt(s.b)})) + '</span><button type="button" class="chip" data-act="remove">' + esc(L.remove) + '</button><button type="button" class="chip" data-act="cancel">' + esc(L.cancel) + '</button>';
    else if (adding) bar.innerHTML = '<span>' + esc(fill(L.addFor, {name: first(person(adding.p).name), day: L.days[adding.d]})) + '</span>' + USUAL.map(function (u, i) { return '<button type="button" class="chip" data-act="add" data-u="' + i + '">' + fmt(u[0]) + '–' + fmt(u[1]) + '</button>'; }).join('') + '<button type="button" class="chip" data-act="cancel">' + esc(L.cancel) + '</button>';
    else bar.innerHTML = '<span>' + esc(L.hint) + '</span><button type="button" class="chip" data-act="reset">' + esc(L.reset) + '</button>';
    if (key) {
      var td = grid.querySelector('td[data-p="' + key[0] + '"][data-d="' + key[1] + '"]'), f = td && (td.querySelector('.sh.sel') || td.querySelector('button'));
      if (f) f.focus({preventScroll: true});
    }
    if (phone && !phone.closest('[hidden]')) drawPhone();
  }
  function drawPhone() { phone.innerHTML = phoneHTML(lang, week(), +who.value); }
  function showWarn(s) {
    var kind = s && problem(week(), s);
    flagged = kind ? s : null; free = [];
    if (!kind) { warn.hidden = true; warn.innerHTML = ''; return; }
    warn.hidden = false;
    warn.innerHTML = '<p>' + esc(problemText(lang, week(), s, kind)) + '</p><div><button type="button" class="chip" data-act="keep">' + esc(L.keep) + '</button><button type="button" class="chip" data-act="who">' + esc(L.who)
      + '</button><button type="button" class="chip" data-act="undo">' + esc(L.undo) + '</button></div><p class="week-free" data-free hidden></p>';
  }
  function change(next, msg, s) {
    before = week().map(function (x) { return {p: x.p, d: x.d, a: x.a, b: x.b, r: x.r}; });
    ST.set(next, 'week');
    sel = null; adding = null;
    showWarn(s);
    draw(true);
    say(msg + (flagged ? ' ' + warn.querySelector('p').textContent : ''));
  }
  function moveTo(i, p, d) {
    var s = week()[i];
    if (s.p === p && s.d === d) { sel = null; draw(true); return; }
    var next = week().slice(), moved = {p: p, d: d, a: s.a, b: s.b, r: person(p).roles.indexOf(s.r) >= 0 ? s.r : person(p).roles[0], n: 1};
    next[i] = moved;
    change(next, fill(L.moved, {name: first(person(p).name), day: L.days[d]}), moved);
  }
  function remove(i) {
    var s = week()[i], next = week().slice(); next.splice(i, 1);
    change(next, fill(L.removed, {name: first(person(s.p).name), day: L.days[s.d], a: fmt(s.a), b: fmt(s.b)}), null);
  }

  grid.addEventListener('click', function (ev) {
    if (dragged) { dragged = false; return; }
    var sh = ev.target.closest('.sh'), td = ev.target.closest('td');
    if (!td) return;
    var p = +td.getAttribute('data-p'), d = +td.getAttribute('data-d');
    if (sel != null) { if (sh && +sh.getAttribute('data-i') === sel) { sel = null; draw(true); } else moveTo(sel, p, d); return; }
    if (sh) { sel = +sh.getAttribute('data-i'); adding = null; draw(true); return; }
    adding = {p: p, d: d}; draw(true);
  });
  grid.addEventListener('keydown', function (ev) {
    var sh = ev.target.closest('.sh');
    if (!sh) return;
    var i = +sh.getAttribute('data-i'), s = week()[i];
    if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); remove(i); return; }
    if (ev.key === 'Escape' && sel != null) { sel = null; draw(true); return; }
    var dir = {ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0]}[ev.key];
    if (!dir || sel !== i) return;
    ev.preventDefault();
    var row = ST.people.map(function (x) { return x.id; }).indexOf(s.p) + dir[0], d = s.d + dir[1];
    if (row < 0 || row >= ST.people.length || d < 0 || d > 6) return;
    var p = ST.people[row].id, next = week().slice(), moved = {p: p, d: d, a: s.a, b: s.b, r: person(p).roles.indexOf(s.r) >= 0 ? s.r : person(p).roles[0]};
    next[i] = moved; before = before || week().slice(); ST.set(next, 'week'); sel = i; showWarn(moved); draw(false);
    var b = grid.querySelector('.sh[data-i="' + i + '"]'); if (b) b.focus({preventScroll: true});
    say(fill(L.moved, {name: first(person(p).name), day: L.days[d]}) + (flagged ? ' ' + warn.querySelector('p').textContent : ''));
  });
  box.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    if (act === 'remove' && sel != null) remove(sel);
    else if (act === 'cancel') { sel = null; adding = null; draw(false); }
    else if (act === 'add' && adding) {
      var u = USUAL[+b.getAttribute('data-u')], s = {p: adding.p, d: adding.d, a: u[0], b: u[1], r: person(adding.p).roles[0], n: 1};
      change(week().concat([s]), fill(L.added, {name: first(person(s.p).name), day: L.days[s.d], a: fmt(s.a), b: fmt(s.b)}), s);
    } else if (act === 'reset') { before = null; ST.set(ST.fresh(), 'week'); sel = null; adding = null; showWarn(null); draw(false); }
    else if (act === 'keep') { showWarn(null); draw(false); say(L.kept); }
    else if (act === 'undo' && before) { ST.set(before, 'week'); before = null; showWarn(null); draw(false); }
    else if (act === 'who' && flagged) {
      free = whoCanTake(week(), flagged);
      var out = warn.querySelector('[data-free]');
      out.hidden = false;
      out.textContent = free.length ? fill(L.free, {names: list(lang, free.map(function (id) { return first(person(id).name); }))}) : L.nofree;
      grid.innerHTML = gridHTML(lang, week(), {sel: sel, free: free, live: true});
      say(out.textContent);
    }
  });

  // dragging, with a mouse (touch taps instead, so the page still scrolls under a finger)
  var drag = null, dragged = false;
  grid.addEventListener('pointerdown', function (ev) {
    var sh = ev.target.closest('.sh');
    if (!sh || ev.pointerType !== 'mouse' || ev.button !== 0) return;
    drag = {i: +sh.getAttribute('data-i'), x: ev.clientX, y: ev.clientY, el: sh, ghost: null, over: null};
  });
  window.addEventListener('pointermove', function (ev) {
    if (!drag) return;
    if (!drag.ghost) {
      if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) < 6) return;
      var r = drag.el.getBoundingClientRect(), g = drag.el.cloneNode(true);
      g.className += ' ghost'; g.style.width = r.width + 'px'; document.body.appendChild(g);
      drag.ghost = g; drag.dx = ev.clientX - r.left; drag.dy = ev.clientY - r.top; drag.el.classList.add('lifted');
    }
    drag.ghost.style.transform = 'translate(' + (ev.clientX - drag.dx) + 'px,' + (ev.clientY - drag.dy) + 'px)';
    var el = document.elementFromPoint(ev.clientX, ev.clientY), td = el && el.closest ? el.closest('[data-week-grid] td') : null;
    if (td !== drag.over) { if (drag.over) drag.over.classList.remove('tgt'); if (td) td.classList.add('tgt'); drag.over = td; }
  });
  window.addEventListener('pointerup', function () {
    if (!drag) return;
    var d = drag; drag = null;
    if (!d.ghost) return;
    d.ghost.remove(); d.el.classList.remove('lifted'); dragged = true; setTimeout(function () { dragged = false; }, 0);
    if (d.over) { d.over.classList.remove('tgt'); sel = null; moveTo(d.i, +d.over.getAttribute('data-p'), +d.over.getAttribute('data-d')); }
  });

  // Manager / Employee
  function show(view) {
    views.forEach(function (b) { var on = b.getAttribute('data-week-view') === view; b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    panes.forEach(function (p) { p.hidden = p.getAttribute('data-week-pane') !== view; });
    if (view === 'employee') { if (ST.last && who.querySelector('option[value="' + ST.last + '"]')) who.value = ST.last; drawPhone(); }
  }
  views.forEach(function (b) { b.addEventListener('click', function () { show(b.getAttribute('data-week-view')); }); });
  who.addEventListener('change', function () { ST.last = +who.value; drawPhone(); });

  ST.on(function (from) { if (from !== 'week') { sel = null; adding = null; showWarn(null); draw(false); } });
  box.classList.add('ready');
  show('manager');
  draw(false);
})(typeof window !== 'undefined' ? window : this);
