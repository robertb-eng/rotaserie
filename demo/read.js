/* Type to Build on the site: reads typed lines with the app's own parser (vendor/typebuild.js, never edited here) and
   draws what it read the way the app's panel does. Pure functions of (text, language, week): the build uses them to
   write the page's starting example, and the page uses the same ones when a visitor types. Nothing is stored or sent. */
(function (root) {
  'use strict';
  var node = typeof module !== 'undefined' && module.exports;
  var ST = node ? require('./state.js') : root.RotaDemoState;
  function parser() { return node ? require('../vendor/typebuild.js') : root.TypeBuild; }

  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MAX_CHARS = 400, MAX_LINES = 6;
  var W = {
    en: {
      days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], read: 'What I read', assumed: 'Assumed', questions: 'Questions',
      shifts: 'Shifts', shift1: '1 shift', shiftN: '{n} shifts', add0: 'Add shifts', add1: 'Add 1 shift', addN: 'Add {n} shifts',
      team: 'Team', typed: 'typed', hours: '{h} hours', hrs: '{h}h', week: 'Nov 16 – 22',
      empty: 'Type a name, days and times.',
      later: 'Rotaserie understands that in the app. This demo sticks to adding shifts.',
      clash: '{name} already has a shift then on {days}. The app asks whether to replace it or join the two; this demo leaves the week as it is.',
      whois: '{x} isn’t on the sample team. Try {names}.', or: 'or',
      hint: 'Type the answer in the box.', sr_assumed: 'assumed', sr_unknown: 'not understood', sr_ignored: 'ignored',
      wait_time: 'needs times', wait_days: 'needs days', wait: 'needs an answer',
      live0: 'Nothing to add yet.', live: '{shifts} read for {names}.', and: 'and', added: '{shifts} added to the week.',
      total: '{shifts} · {h} hours', totalTyped: '{shifts} · {h} hours, {n} typed'
    },
    es: {
      days: ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'], read: 'Lo que entendí', assumed: 'Lo que supuse', questions: 'Preguntas',
      shifts: 'Turnos', shift1: '1 turno', shiftN: '{n} turnos', add0: 'Agregar turnos', add1: 'Agregar 1 turno', addN: 'Agregar {n} turnos',
      team: 'Equipo', typed: 'escrito', hours: '{h} horas', hrs: '{h} h', week: '16 – 22 nov',
      empty: 'Escribe un nombre, días y horas.',
      later: 'Rotaserie entiende eso en la app. Esta demostración solo agrega turnos.',
      clash: '{name} ya tiene un turno a esa hora el {days}. La app pregunta si reemplazarlo o unir los dos; esta demostración deja la semana como está.',
      whois: '{x} no está en el equipo de ejemplo. Prueba con {names}.', or: 'o',
      hint: 'Escribe la respuesta en el cuadro.', sr_assumed: 'supuesto', sr_unknown: 'no lo entendí', sr_ignored: 'ignorado',
      wait_time: 'faltan las horas', wait_days: 'faltan los días', wait: 'falta una respuesta',
      live0: 'Todavía no hay nada que agregar.', live: '{shifts} para {names}.', and: 'y', added: '{shifts} en la semana.',
      total: '{shifts} · {h} horas', totalTyped: '{shifts} · {h} horas, {n} escritos'
    }
  };
  // The parser answers in English; these are the app's own Spanish for the lines this demo can show (rotaserie/i18n_es.py).
  var ES = [
    [/^(.*), from your business hours$/, '$1, según tu horario de atención'],
    [/^(.*), from your usual shift times$/, '$1, según tus horarios habituales'],
    [/^(.*), from your business hours and shift times$/, '$1, según tu horario de atención y tus horarios de turnos'],
    [/^Until when\?$/, '¿Hasta qué hora?'], [/^Until (.*)$/, 'Hasta $1'], [/^Starts (.*)$/, 'Empieza $1'],
    [/^What times\?$/, '¿A qué horas?'], [/^(.*): which days\?$/, '$1: ¿qué días?'], [/^Which days\?$/, '¿Qué días?'],
    [/^Who is “(.*)”\?$/, '¿Quién es “$1”?'], [/^Ignore it$/, 'Ignorarlo'], [/^Just this week$/, 'Solo esta semana'],
    [/^not understood yet$/, 'todavía no lo entiendo'], [/^not understood$/, 'no lo entendí'],
    [/^a name that is also a word$/, 'un nombre que también es una palabra'],
    [/^“(.*)” read as (.*)$/, '“$1” leído como $2'], [/^A line typed twice: read once$/, 'Una línea escrita dos veces: leída una vez'], [/^Noon$/, 'Mediodía'], [/^Midnight$/, 'Medianoche']
  ];
  function tr(lang, s) {
    if (lang !== 'es' || !s) return s || '';
    for (var i = 0; i < ES.length; i++) if (ES[i][0].test(s)) return s.replace(ES[i][0], ES[i][1]);
    return s;
  }
  function known(s) { return ES.some(function (p) { return p[0].test(s); }); }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function mins(t) { var p = t.split(':'); return +p[0] * 60 + +p[1]; }
  function fmt(t) { var m = mins(t), h = Math.floor(m / 60) % 24, mm = m % 60; return (h % 12 || 12) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (h < 12 ? 'a' : 'p'); }
  function len(a, b) { return (((mins(b) - mins(a)) % 1440) + 1440) % 1440 || 1440; }
  function hoursText(m) { var h = m / 60; return String(Math.round(h * 100) / 100); }
  function plural(lang, n) { return n === 1 ? W[lang].shift1 : W[lang].shiftN.replace('{n}', n); }
  function person(id) { for (var i = 0; i < ST.people.length; i++) if (ST.people[i].id === id) return ST.people[i]; return null; }
  function role(key) { for (var i = 0; i < ST.roles.length; i++) if (ST.roles[i].key === key) return ST.roles[i]; return ST.roles[0]; }
  function roleKey(label) {
    var l = String(label || '').toLowerCase();
    for (var i = 0; i < ST.roles.length; i++) if (ST.roles[i].key === l || ST.roles[i].en.toLowerCase() === l) return ST.roles[i].key;
    return null;
  }
  function first(name) { return name.split(' ')[0]; }
  function daysText(lang, days) {  // ['Mon','Tue','Wed'] -> 'Mon–Wed'; ['Mon','Wed'] -> 'Mon, Wed' (as the app says it)
    var ix = days.map(function (d) { return DAYS.indexOf(d); }).sort(function (a, b) { return a - b; });
    var run = ix.length > 2 && ix[ix.length - 1] - ix[0] === ix.length - 1, day = function (i) { return W[lang].days[i]; };
    return run ? day(ix[0]) + '–' + day(ix[ix.length - 1]) : ix.map(day).join(', ');
  }
  function list(lang, names) {
    if (names.length < 2) return names.join('');
    return names.slice(0, -1).join(', ') + ' ' + (lang === 'es' ? W.es.and : W.en.and) + ' ' + names[names.length - 1];
  }

  function ctx() {
    return {
      people: ST.people.map(function (p) { return {id: p.id, name: p.name, nick: null, aliases: [], roles: p.roles}; }),
      removed: [],
      roles: ST.roles.map(function (r) { var l = r.en.toLowerCase(); return {key: r.key, label: r.en, words: [l, l + 's'].concat(r.words)}; }),
      words: [], hours: ST.hours, hoursFrom: {}, allDay: false, defaultLen: null, week: ST.week, now: ST.now
    };
  }
  function clip(text) { return String(text || '').replace(/\r/g, '').split('\n').slice(0, MAX_LINES).join('\n').slice(0, MAX_CHARS); }

  /* Read the box. Answer: {text, res (the parser's own answer), rows (one per person and time, ready to add),
     ops (one per shift: {p, d, a, b, r}), waiting (read, but a question comes first), other (things the app does and
     this demo doesn't), n (shifts ready)} */
  function read(text, week) {
    text = clip(text);
    var res = text.trim() ? parser().parse(text, ctx()) : null, out = {text: text, res: res, rows: [], ops: [], waiting: [], clash: [], other: false, n: 0};
    if (!res) return out;
    var seen = {};
    (res.shifts || []).forEach(function (sh) {
      var p = person(sh.personId);
      if (!sh.ready || !p || !sh.start || !sh.end || !sh.days.length) { out.waiting.push(sh); return; }
      var key = roleKey(sh.role) || p.roles[0], days = [];
      sh.days.forEach(function (dn) {
        var d = DAYS.indexOf(dn), k = p.id + '|' + d + '|' + sh.start + '|' + sh.end;
        if (seen[k]) return;  // (the same shift typed twice is one shift)
        seen[k] = 1;
        // a shift this person already has that day, at overlapping hours: the app asks "replace or join"; this demo says so
        var hit = (week || []).filter(function (s) { return s.p === p.id && s.d === d && mins(sh.start) < mins(s.a) + len(s.a, s.b) && mins(s.a) < mins(sh.start) + len(sh.start, sh.end); })[0];
        if (hit) { out.clash.push({name: p.name, d: d, a: hit.a, b: hit.b}); return; }
        days.push(dn);
        out.ops.push({p: p.id, d: d, a: sh.start, b: sh.end, r: key});
      });
      if (days.length) out.rows.push({p: p.id, name: p.name, days: days, a: sh.start, b: sh.end, r: key, n: days.length});
    });
    out.n = out.ops.length;
    out.other = (res.actions || []).length > 0 || (res.ask || []).some(function (q) { return q.kind === 'later'; });
    return out;
  }

  function marksHTML(lang, r) {
    var text = r.text, out = '', at = 0, sr = {assumed: W[lang].sr_assumed, unknown: W[lang].sr_unknown, ignored: W[lang].sr_ignored};
    (r.res.marks || []).forEach(function (m) {
      if (m.from < at) return;
      if (m.from > at) out += esc(text.slice(at, m.from));
      var why = tr(lang, m.why) || sr[m.state] || '';
      out += '<span class="tb-m ' + m.state + '"' + (why ? ' title="' + esc(why) + '"' : '') + '>' + esc(text.slice(m.from, m.to))
        + (sr[m.state] ? '<span class="sr"> (' + esc(sr[m.state]) + ')</span>' : '') + '</span>';
      at = m.to;
    });
    return (out + esc(text.slice(at))).replace(/\n/g, '<br>');
  }

  /* The preview under the box, as the app's panel orders it: what I read, shifts, questions, assumed. */
  function previewHTML(lang, r) {
    var L = W[lang];
    if (!r.res) return '<p class="tb-empty">' + esc(L.empty) + '</p>';
    var h = '<div class="tb-read"><span class="tb-k">' + esc(L.read) + '</span><p translate="no">' + marksHTML(lang, r) + '</p></div>';
    var rows = r.rows.map(function (x) {
      return '<li class="tb-shift"><span class="tb-who" translate="no">' + esc(x.name) + '</span><span class="tb-when">' + esc(daysText(lang, x.days))
        + ' · ' + fmt(x.a) + '–' + fmt(x.b) + ' · ' + esc(role(x.r)[lang]) + '</span><span class="tb-n">' + esc(plural(lang, x.n)) + '</span></li>';
    }).join('') + r.waiting.map(function (sh) {
      var p = person(sh.personId), why = !sh.start || !sh.end ? L.wait_time : !sh.days.length ? L.wait_days : L.wait;
      return '<li class="tb-shift wait"><span class="tb-who" translate="no">' + esc(p ? p.name : sh.person || '?') + '</span><span class="tb-when">'
        + esc(sh.days.length ? daysText(lang, sh.days) : '?') + ' · ' + (sh.start ? fmt(sh.start) : '?') + '–' + (sh.end ? fmt(sh.end) : '?')
        + '</span><span class="tb-n">' + esc(why) + '</span></li>';
    }).join('');
    if (rows) h += '<ul class="tb-shifts" aria-label="' + esc(L.shifts) + '">' + rows + '</ul>';
    var asks = '', later = r.other;
    (r.res.ask || []).forEach(function (q, i) {
      if (q.kind === 'later' || later) return;  // (what the demo doesn't do gets one plain line, below)
      if (q.kind === 'whois') {
        var m = /“(.*)”/.exec(q.question || ''), names = ST.people.map(function (p) { return first(p.name); });
        asks += '<li><span class="tb-q" aria-hidden="true">?</span><div class="tb-qbody"><span>'
          + esc(L.whois.replace('{x}', m ? m[1] : '?').replace('{names}', names.slice(0, -1).join(', ') + ' ' + L.or + ' ' + names[names.length - 1]))
          + '</span><span class="tb-chips">' + names.map(function (n) {
            return '<button type="button" class="tb-chip" data-tb="name" data-q="' + i + '" data-name="' + esc(n.toLowerCase()) + '" translate="no">' + esc(n) + '</button>';
          }).join('') + '</span></div></li>';
        return;
      }
      var chips = (q.options || []).map(function (o, k) {
        return q.fixes && q.fixes[k] ? '<button type="button" class="tb-chip" data-tb="fix" data-q="' + i + '" data-o="' + k + '">' + esc(tr(lang, o)) + '</button>' : '';
      }).join('');
      asks += '<li><span class="tb-q" aria-hidden="true">?</span><div class="tb-qbody"><span>' + esc(tr(lang, q.question)) + '</span>'
        + (chips ? '<span class="tb-chips">' + chips + '</span>' : '<span class="tb-hint">' + esc(L.hint) + '</span>') + '</div></li>';
    });
    if (asks) h += '<ul class="tb-asks" aria-label="' + esc(L.questions) + '">' + asks + '</ul>';
    var why = {}, order = [];  // each assumption once, with the words it's about
    (r.res.marks || []).forEach(function (mk) {
      if (mk.state !== 'assumed' || !mk.why) return;
      if (!why[mk.why]) { why[mk.why] = {from: mk.from, to: mk.to}; order.push(mk.why); } else why[mk.why].to = Math.max(why[mk.why].to, mk.to);
    });
    if (order.length) h += '<div class="tb-assumed"><span class="tb-k">' + esc(L.assumed) + '</span><ul>' + order.map(function (k) {
      return '<li><span class="tb-m assumed" translate="no">' + esc(r.text.slice(why[k].from, why[k].to)) + '</span> ' + esc(tr(lang, k)) + '</li>';
    }).join('') + '</ul></div>';
    (r.res.notes || []).forEach(function (n) { h += '<p class="tb-note">' + esc(tr(lang, n)) + '</p>'; });
    var clash = {}, who = [];  // one line per person
    r.clash.forEach(function (c) { if (!clash[c.name]) { clash[c.name] = []; who.push(c.name); } if (clash[c.name].indexOf(L.days[c.d]) < 0) clash[c.name].push(L.days[c.d]); });
    who.forEach(function (n) { h += '<p class="tb-note">' + esc(L.clash.replace('{name}', first(n)).replace('{days}', list(lang, clash[n]))) + '</p>'; });
    if (later) h += '<p class="tb-note">' + esc(L.later) + '</p>';
    return h;
  }

  /* An answer edits the typed text, as the app does, and the box is read again. */
  function applyFix(text, fix) {
    (fix || []).slice().sort(function (a, b) { return b.from - a.from; }).forEach(function (f) { text = text.slice(0, f.from) + f.text + text.slice(f.to); });
    return text.replace(/[ \t]+\n/g, '\n').replace(/^\s+/, '');
  }

  function addLabel(lang, n) { return n === 0 ? W[lang].add0 : n === 1 ? W[lang].add1 : W[lang].addN.replace('{n}', n); }
  function totals(week) {
    var m = 0; week.forEach(function (s) { m += len(s.a, s.b); });
    return {shifts: week.length, hours: hoursText(m)};
  }
  function totalsText(lang, week, typed) {
    var t = totals(week.concat(typed || []));
    return (typed && typed.length ? W[lang].totalTyped : W[lang].total).replace('{shifts}', plural(lang, t.shifts)).replace('{h}', t.hours).replace('{n}', typed ? typed.length : 0);
  }
  function liveText(lang, r) {
    if (!r.n) return W[lang].live0;
    var names = []; r.rows.forEach(function (x) { if (names.indexOf(x.name) < 0) names.push(x.name); });
    return W[lang].live.replace('{shifts}', plural(lang, r.n)).replace('{names}', list(lang, names));
  }

  /* The week: one row per person, the saved shifts solid and the typed ones dashed (as the Builder draws them). */
  function gridHTML(lang, week, typed, fresh) {
    var L = W[lang], h = '<table class="wk"><thead><tr><th scope="col" class="wk-team">' + esc(L.team) + '</th>';
    L.days.forEach(function (d, i) { h += '<th scope="col"><span>' + esc(d) + '</span> <b>' + ST.dates[i] + '</b></th>'; });
    h += '</tr></thead><tbody>';
    ST.people.forEach(function (p) {
      var m = 0, mine = function (s) { return s.p === p.id; };
      week.filter(mine).concat((typed || []).filter(mine)).forEach(function (s) { m += len(s.a, s.b); });
      h += '<tr><th scope="row"><span class="wk-name" translate="no">' + esc(first(p.name)) + '</span><span class="wk-h">' + esc(L.hrs.replace('{h}', hoursText(m))) + '</span></th>';
      for (var d = 0; d < 7; d++) {
        h += '<td>';
        var cell = function (s, cls) {
          return '<span class="sh s' + role(s.r).tone + cls + '"><b>' + fmt(s.a) + '–</b><b>' + fmt(s.b) + '</b><small>' + esc(role(s.r)[lang])
            + (cls.indexOf('typed') >= 0 ? '<span class="sr"> · ' + esc(L.typed) + '</span>' : '') + '</small></span>';
        };
        week.forEach(function (s) { if (s.p === p.id && s.d === d) h += cell(s, fresh && fresh.indexOf(s) >= 0 ? ' new' : ''); });
        (typed || []).forEach(function (s) { if (s.p === p.id && s.d === d) h += cell(s, ' typed'); });
        h += '</td>';
      }
      h += '</tr>';
    });
    return h + '</tbody></table>';
  }

  var api = {read: read, previewHTML: previewHTML, gridHTML: gridHTML, applyFix: applyFix, addLabel: addLabel, totalsText: totalsText,
             liveText: liveText, clip: clip, known: known, plural: plural, words: W, MAX_CHARS: MAX_CHARS, MAX_LINES: MAX_LINES};
  if (node) module.exports = api;
  root.RotaDemoRead = api;
})(typeof window !== 'undefined' ? window : this);
