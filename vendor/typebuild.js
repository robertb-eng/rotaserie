/* Rotaserie Type to Build: the parser (docs/type-to-build.md). A pure function: TypeBuild.parse(text, ctx) reads what a
   manager typed and answers what it understood, with no page, network or clock of its own (ctx carries "now"), so the
   same text always gives the same answer, on a phone or in the golden-set runner.

   English and Spanish (and both mixed): people, days, times (ranges, a/p, digit runs, 24-hour, start only), roles, this
   week or every week, shift words, off, remove, exceptions, take-backs, corrections and changes to shifts in the schedule.
   What later steps add (dates, headcount, groups, "same") is recognised as "not yet" and never becomes a change that
   could be confirmed: never confidently wrong (Robert's bar). Every assumption is said; anything with two readings is
   asked.

   ctx: {people: [{id, name, nick, aliases, roles: [key]}], removed: [name], roles: [{key, label, words: [..]}],
         hours: {0..6: ["11:00", "22:00"]} (Mon = 0; optional), allDay: bool (24/7), defaultLen: hours or null (only when
         the business set one), week: [7 ISO dates, Mon first], now: "YYYY-MM-DDTHH:MM"}
   Answer: {shifts: [{person, personId, days: ["Mon"..], start, end, role?, ready}], scope: "this_week"|"standing",
            ask: [{kind, question, options}], marks: [{from, to, state: "ok"|"assumed"|"unknown"|"ignored", why}],
            notes: []} (ready: false = shown, but waits for a question or an unknown word first) */
(function (root) {
  'use strict';
  var DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var DAY_FULL = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var DAY_WORDS = {monday: 0, mon: 0, mo: 0, tuesday: 1, tues: 1, tue: 1, tu: 1, wednesday: 2, weds: 2, wed: 2, we: 2,
    wensday: 2, wendsday: 2, wednsday: 2, thursday: 3, thurs: 3, thur: 3, thu: 3, thrusday: 3, thursdy: 3, friday: 4, fri: 4,
    frid: 4, fr: 4, saturday: 5, satur: 5, sat: 5, sa: 5, sunday: 6, sunda: 6, sun: 6, su: 6};
  var LETTER_DAYS = {m: [0], w: [2], r: [3], f: [4], th: [3], t: [1, 3], s: [5, 6]};  // t and s: two readings
  var PACK = ['thurs', 'thur', 'tues', 'weds', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'th', 'tu', 'sa', 'su', 'm', 't', 'w', 'r', 'f', 's'];
  var RANGE_WORDS = {thru: 1, through: 1, thro: 1, tru: 1, to: 1, til: 1, till: 1, tilll: 1, until: 1, untill: 1};
  var GLUE = {is: 1, on: 1, at: 1, from: 1, the: 1, a: 0, and: 1, works: 1, work: 1, working: 1, shift: 1, shifts: 1, start: 1,
    starts: 1, starting: 1, startin: 1, pls: 1, please: 1, plz: 1, ok: 1, okay: 1, so: 1, hi: 1, hey: 1, thanks: 1, thx: 1,
    ty: 1, lol: 1, um: 1, uh: 1, will: 0, be: 1, every: 1, each: 1, week: 1, usually: 1, wks: 0, wk: 1, hrs: 0};
  var STANDING = {works: 1, work: 1, every: 1, usually: 1, each: 1, always: 1, weekly: 1};
  // Words that later steps understand: until then an instruction with one of them is shown, never made ready
  var LATER = ('off of ofd pff no nope not out pto vac vacay sick ro req na n except xcept exc but minus without w o move moves moved ' +
    'swap swp switch trade covers cover cvr sub subs give remove rm cancel delete del clear instead change changes nvm nevermind ' +
    'jk oops scratch actually wait mean sorry undo same ditto tbd maybe prob probably pending need needs ppl people everyone all ' +
    'cooks servers bartenders hosts close closes closing cl cls clse clos open opens opening op opn mid double doubles dbl ' +
    'lunch dinner brunch am pm morning afternoon aft evening eve night nite tonight tonite late early graveyard grave overnight ' +
    'today tomorrow tmrw tmr tdy yesterday next nxt last week ' +
    'jan feb mar apr april may jun june jul july aug sep sept oct nov dec january february march august september october ' +
    'november december st nd rd th ish around abt about like hour hours hr h for half quarter past noon midnight ' +
    'can cant who whos what when why how if manana tarde noche cierra also too tb tmb tambien igual mismo plus split both them her him he ' +
    'she they hoy pasado proximo proxima prox siguiente viene todos todas nadie necesito falta cocineros meseros meseras otro otra nada broma').split(' ');
  // time-of-day and shift words a business may define (Shift times > Your shift words): undefined, they're asked about
  var TEACH = {};
  ('open opens opening opn close closes closing clse mid mids double doubles dbl lunch dinner brunch graveyard grave swing ' +
   'early late night nite morning evening afternoon overnight').split(' ').forEach(function (w) { TEACH[w] = 1; });
  // step 4's own words: off, remove, exceptions, take-backs
  var OFF_W = {off: 1, out: 1, pto: 1, vac: 1, vacay: 1, vacation: 1, sick: 1};
  var OFF_TYPO = {of: 1, ofd: 1, pff: 1, o: 1};  // (only right next to a day: "sam tue o", "sam of wed")
  var REMOVE_W = {remove: 1, rm: 1, delete: 1, del: 1, drop: 1, cancel: 1};
  var EXCEPT_W = {except: 1, xcept: 1, exc: 1, excpt: 1, minus: 1, without: 1};
  var UNDO_W = {nvm: 1, nevermind: 1, nvmd: 1, jk: 1, oops: 1, undo: 1};
  // step 4b: corrections and changes to shifts already in the schedule
  var FIX_W = {sorry: 1, sry: 1, srry: 1, actually: 1, actualy: 1, acutally: 1, wait: 1, correction: 1};
  var FIX_FILL = {make: 1, that: 1, it: 1, its: 1, be: 1, is: 1, should: 1, at: 1, to: 1, from: 1, the: 1, a: 1};  // ("make that 5", "should be 12")
  var MOVE_W = {move: 1, mv: 1, moves: 1, moved: 1};
  var SWAP_W = {swap: 1, swp: 1, swaps: 1, switch: 1, trade: 1, trades: 1, swop: 1};
  var COVER_W = {covers: 1, cover: 1, cvr: 1, covering: 1, sub: 1, subs: 1, subbing: 1};
  var GIVE_W = {give: 1, gives: 1};
  var START_W = {start: 1, starts: 1, starting: 1, startin: 1};
  var END_W = {til: 1, till: 1, tilll: 1, until: 1, untill: 1, end: 1, ends: 1, ending: 1, cut: 1};
  // (4b's own words: a name only where an instruction starts, never a nickname; the verbs and markers never a shift word)
  var W4B = {}, W4B_FILL = {that: 1, it: 1, its: 1, be: 1, make: 1, should: 1, meant: 1, imean: 1, come: 1, extend: 1, extended: 1, instead: 1, clear: 1};
  // ---------------------------------------------------------------- Spanish (step 5): the same reading, its own words
  // (accents are folded away: "miércoles" = "miercoles"). Days, "a"/"al"/"hasta" between times or days, the joining words,
  // off/remove/except/take-back/correction words and the change verbs join the English ones.
  var ES_DAYS = {lunes: 0, lun: 0, martes: 1, mar: 1, miercoles: 2, mie: 2, mier: 2, miercols: 2, jueves: 3, jue: 3, viernes: 4, vie: 4,
                 sabado: 5, sab: 5, sabdo: 5, domingo: 6, dom: 6};
  var ES_LETTER = {l: 0, m: 1, x: 2, j: 3, v: 4, s: 5, d: 6};  // ("L-V", "LMXJV": M is martes there, X miércoles)
  // (every word the English reading already had: a Spanish-only word counts as a keyword only in a Spanish message)
  var EN_KEYS = {};
  [DAY_WORDS, LETTER_DAYS, GLUE, STANDING, RANGE_WORDS, OFF_W, REMOVE_W, EXCEPT_W, UNDO_W, FIX_W, MOVE_W, SWAP_W, COVER_W, GIVE_W, START_W, END_W]
    .forEach(function (o) { for (var w in o) EN_KEYS[w] = 1; });
  var EN_DAYS = {};
  for (var end_ in DAY_WORDS) EN_DAYS[end_] = DAY_WORDS[end_];
  for (var esd in ES_DAYS) DAY_WORDS[esd] = ES_DAYS[esd];
  var ES_ERASE = {borra: 1, borrar: 1};  // (no one named: "borra el sábado" clears the day; "quita"/"elimina" don't, as English "remove sun")
  ['a', 'al', 'hasta'].forEach(function (w) { RANGE_WORDS[w] = 1; });
  ('trabaja trabajan trabajar pon ponle poner el la los las lo de y desde turno turnos porfa favor gracias hola buenas jaja jajaja ' +
   'solo esta semana que siempre cada del por').split(' ').forEach(function (w) { GLUE[w] = 1; });
  ['trabaja', 'trabajan', 'trabajar', 'siempre', 'cada'].forEach(function (w) { STANDING[w] = 1; });
  ['libre', 'descansa', 'descanso', 'descansan', 'enfermo', 'enferma', 'vacaciones'].forEach(function (w) { OFF_W[w] = 1; });
  ['quita', 'quitar', 'quitale', 'borra', 'borrar', 'elimina', 'eliminar', 'cancela', 'cancelar'].forEach(function (w) { REMOVE_W[w] = 1; });
  ['excepto', 'salvo', 'menos', 'sin'].forEach(function (w) { EXCEPT_W[w] = 1; });
  ['olvidalo', 'olvida', 'deshacer', 'deshaz'].forEach(function (w) { UNDO_W[w] = 1; });
  ['perdon', 'perdona', 'espera', 'digo'].forEach(function (w) { FIX_W[w] = 1; });
  ['mueve', 'mover', 'pasa', 'pasar', 'cambia', 'cambiar'].forEach(function (w) { MOVE_W[w] = 1; });
  ['intercambia', 'intercambiar', 'intercambian'].forEach(function (w) { SWAP_W[w] = 1; });
  ['cubre', 'cubrir', 'cubra', 'reemplaza'].forEach(function (w) { COVER_W[w] = 1; });
  ['empieza', 'entra', 'comienza'].forEach(function (w) { START_W[w] = 1; });
  ['hasta', 'sale', 'termina'].forEach(function (w) { END_W[w] = 1; });
  // English days said another way (stranger test C, Nov 11 2026), read by esDaysAt as "fin de semana" is: the weekend
  // (Sat and Sun; plural: this week or every week?), weekdays (Mon to Fri), daily and every day (the whole week)
  var EN_DAYS_W = {weekend: 'we', wknd: 'we', wkend: 'we', weekends: 'wes', wknds: 'wes', wkends: 'wes',
    weekday: 'wd', weekdays: 'wd', wkday: 'wd', wkdays: 'wd', daily: 'all', everyday: 'all'};
  var ES_MISC = {};
  ('vacia mejor dicho era eso fin fines finde entre toda dias dia medio media cuarto mediodia medianoche madrugada horas hs semanas')
    .split(' ').forEach(function (w) { ES_MISC[w] = 1; });
  var ES_ONLY = {};
  [ES_MISC, DAY_WORDS, GLUE, STANDING, RANGE_WORDS, OFF_W, REMOVE_W, EXCEPT_W, UNDO_W, FIX_W, MOVE_W, SWAP_W, COVER_W, START_W, END_W]
    .forEach(function (o) { for (var w in o) if (!(w in EN_KEYS)) ES_ONLY[w] = 1; });
  // what makes a message Spanish (with an accent or ¿¡ anywhere): then its Spanish-only words are keywords, "mar" is
  // martes, "sale" a new end, "11 hrs a 19 hrs" 24-hour. Otherwise it reads as English does.
  var ES_SIGNAL = {de: 1, las: 1, los: 1, el: 1, la: 1, y: 1, al: 1, hasta: 1, desde: 1, trabaja: 1, trabajan: 1};
  // ("a" counts only between two numbers, "11 a 7"; English "a" and "del" never; a word that is someone's name here,
  // "Dom", "Al", never)
  for (var esd2 in ES_DAYS) if (esd2 !== 'mar') ES_SIGNAL[esd2] = 1;
  [OFF_W, REMOVE_W, UNDO_W, FIX_W, MOVE_W, SWAP_W, COVER_W].forEach(function (o) { for (var w in o) if (w in ES_ONLY && w !== 'pasa' && w !== 'pasar') ES_SIGNAL[w] = 1; });  // ("sam descansa mar")
  var ARTICLE = {the: 1, a: 1, an: 1, el: 1, la: 1, los: 1, las: 1, un: 1, una: 1};  // ("the cook": the role, never someone's surname)
  var andWord = function (x) { return !!x && ((x.k === 'word' && x.v in {and: 1, y: 1, n: 1}) || (x.k === 'punct' && (x.v === '&' || x.v === '+'))); };  // ("and", "y", "n", "&", "+": joins two people)
  var esOn = false;  // (set at the start of each parse: the reading is synchronous)
  var enKept = {};  // (the same: EN_DAYS_W words this business taught as its own shift words before they meant days)
  var NO_COME = {viene: 1, trabaja: 1, puede: 1, va: 1, llega: 1};  // "sam no viene el martes": off
  var ES_PART = {manana: 'a', madrugada: 'a', tarde: 'p', noche: 'p'};  // "5 de la tarde", "11 de la mañana"
  // common Spanish nicknames, when the business hasn't taught its own (said as an assumption)
  var ES_NICK = {pepe: 'jose', chema: 'jose', paco: 'francisco', pancho: 'francisco', lupe: 'guadalupe', chuy: 'jesus', nacho: 'ignacio',
                 memo: 'guillermo', lalo: 'eduardo', beto: 'alberto', tono: 'antonio', quique: 'enrique', lola: 'dolores', rafa: 'rafael'};
  // a business's shift words in English, typed in Spanish ("al cierre", "abre el sábado")
  var ES_GLOSS = {cierre: 'close', cierra: 'close', cerrar: 'close', apertura: 'open', abre: 'open', abrir: 'open', doble: 'double',
                  comida: 'lunch', almuerzo: 'lunch', cena: 'dinner'};
  var CLEAR_FILL = {the: 1, this: 1, week: 1, whole: 1, entire: 1, all: 1, everything: 1, shifts: 1, shift: 1, schedule: 1, of: 1, on: 1, for: 1};
  [FIX_W, MOVE_W, SWAP_W, COVER_W, GIVE_W, START_W, END_W, W4B_FILL].forEach(function (o) { for (var w in o) W4B[w] = 1; });
  var LATER_SET = {};
  LATER.forEach(function (w) { LATER_SET[w] = 1; });
  ['week', 'every', 'each'].forEach(function (w) { delete LATER_SET[w]; });  // (standing words are understood)

  // ---------------------------------------------------------------- normalizing (one character for one, so marks map back)
  function fold(text) {
    var out = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i], b = ch.normalize ? ch.normalize('NFD')[0] : ch;
      if (/[đĐ]/.test(ch)) b = 'd';  // (letters with no accent to take off: Vietnamese đ, ø, ł)
      else if (/[øØ]/.test(ch)) b = 'o';
      else if (/[łŁ]/.test(ch)) b = 'l';
      else if (/[‐-―−﹘﹣－]/.test(ch)) b = '-';
      else if (/[‘’‛′`]/.test(ch)) b = "'";
      else if (/[  -​  　\t]/.test(ch)) b = ' ';
      else if (/[０-９]/.test(ch)) b = String.fromCharCode(ch.charCodeAt(0) - 0xFF10 + 48);
      out += b.toLowerCase().length === 1 ? b.toLowerCase() : b;
    }
    return out;
  }

  // ---------------------------------------------------------------- tokens: {k: word|num|sep|nl|punct|other, v, from, to}
  var NUM = /^(\d{1,4})(?:([:.;,h])(\d{2}))?(?:(\s?)(a\.?m\.?|p\.?m\.?|a|p)(?![a-z]))?/;
  function tokens(f) {
    var out = [], i = 0, m;
    while (i < f.length) {
      var ch = f[i], rest = f.slice(i);
      if (ch === '\n' || ch === '\r') { out.push({k: 'nl', v: '\n', from: i, to: i + 1}); i++; continue; }
      if (ch === ' ') { i++; continue; }
      if ((m = NUM.exec(rest))) {
        var ap = m[5] ? m[5][0] : null;
        if (m[4] && m[5] && m[5].length === 1) ap = null;  // "11 a 7": a spaced lone a is a word (Spanish "to"), not AM
        var len = ap || !m[5] ? m[0].length : (m[1].length + (m[2] ? 1 + m[3].length : 0));
        out.push({k: 'num', v: m[1], mm: m[3] || null, msep: m[2] || null, ap: ap, from: i, to: i + len});
        i += len; continue;
      }
      if ((m = /^[a-z]+(?:'[a-z]+)?/.exec(rest))) {
        var w = m[0].replace(/'s$/, '').replace(/'/g, ''), pv = out[out.length - 1];
        out.push({k: 'word', v: w, from: i, to: i + m[0].length, stuck: !!(pv && pv.k === 'num' && pv.to === i)});
        i += m[0].length; continue;
      }
      // "<->", "↔": a swap; "->", "=>", "→", ">": a move ("sat>sun")
      if ((m = /^(<-+>|<>|↔|⇄|⇆)/.exec(rest))) { out.push({k: 'swaparrow', v: '<->', from: i, to: i + m[0].length}); i += m[0].length; continue; }
      if ((m = /^(-+>|=>|→|⇒|>)/.exec(rest))) { out.push({k: 'arrow', v: '>', from: i, to: i + m[0].length}); i += m[0].length; continue; }
      if ('-~'.indexOf(ch) >= 0) { out.push({k: 'sep', v: '-', from: i, to: i + 1}); i++; continue; }
      if (',/&+.!?*@;:()[]"\''.indexOf(ch) >= 0) { out.push({k: 'punct', v: ch, from: i, to: i + 1}); i++; continue; }
      var cp = f.codePointAt(i), w2 = cp > 0xFFFF ? 2 : 1;
      // ❌ / 🚫 / ✖ / ⛔: "off" (said as an assumption); other emoji are ignored
      if (cp === 0x274C || cp === 0x1F6AB || cp === 0x2716 || cp === 0x2717 || cp === 0x26D4) { out.push({k: 'word', v: 'off', from: i, to: i + w2, said: '“' + f.substr(i, w2) + '” read as off'}); i += w2; continue; }
      out.push({k: 'other', v: f.substr(i, w2), from: i, to: i + w2});
      i += w2;
    }
    return out;
  }

  // ---------------------------------------------------------------- step 6: pasted messages, tables and repeats
  // Read line by line on the folded text (one character for one, so its places are the typed text's): what isn't an
  // instruction is left out of the reading and marked ignored, with why, so nothing seems lost and nothing in it can
  // become a shift time: message stamps ("[10:32 AM]", "11/3/26, 9:41 PM -", a "Robert, 10:32 AM" line), senders
  // ("Robert:" in a pasted thread), "Sent from my iPhone", separator lines ("---"), list numbers ("1.", "2)"), a table's
  // column names ("Name | Days | Hours"), questions and short replies in a thread ("can you do fri?", "Manny: yes"), and
  // a line typed again word for word ("duplicate ignored").
  // A thread is a message stamp anywhere, or two lines or more starting with a sender, one of them not someone here.
  // Answer: {toks: the tokens left, ign: [{from, to, why}], dups: how many lines were repeats}
  var REPLY_W = {yes: 1, yeah: 1, yea: 1, yep: 1, yup: 1, ya: 1, sure: 1, ok: 1, okay: 1, k: 1, kk: 1, np: 1, thanks: 1, thank: 1, you: 1,
                 thx: 1, ty: 1, got: 1, it: 1, sounds: 1, good: 1, great: 1, cool: 1, will: 1, do: 1, can: 1, si: 1, vale: 1, gracias: 1,
                 claro: 1, perfecto: 1, listo: 1, dale: 1, bueno: 1, lol: 1, haha: 1, jaja: 1, no: 1, problem: 1, problema: 1, de: 1, nada: 1};
  var HEAD_W = {name: 1, names: 1, employee: 1, employees: 1, staff: 1, person: 1, who: 1, day: 1, days: 1, date: 1, dates: 1, hours: 1,
                hour: 1, time: 1, times: 1, shift: 1, shifts: 1, role: 1, roles: 1, position: 1, start: 1, end: 1, notes: 1, note: 1,
                nombre: 1, empleado: 1, empleados: 1, dia: 1, dias: 1, fecha: 1, horas: 1, horario: 1, hora: 1, turno: 1, turnos: 1, puesto: 1,
                inicio: 1, fin: 1, entrada: 1, salida: 1};
  var STAMP_AP = '(?:\\s*[ap]\\.?\\s?m\\.?)?';
  var STAMP_BR = /^\s*\[[^\]\n]{0,24}\d{1,2}:\d{2}[^\]\n]{0,16}\]\s*/;  // "[10:32 AM]", "[11/3/26, 9:41:05 PM]"
  var STAMP_DT = new RegExp('^\\s*\\d{1,2}[/.-]\\d{1,2}[/.-]\\d{2,4},?\\s+\\d{1,2}:\\d{2}(?::\\d{2})?' + STAMP_AP + '\\s*(?:-\\s+|:\\s+)?');  // "11/3/26 9:41 PM", "3/11/2026, 21:41 - "
  var SENDER = /^([a-z][a-z.'-]*(?: [a-z][a-z.'-]*){0,2}):\s+/;  // "Robert:", "Anita R.:"
  var STAMP_LINE = new RegExp('^\\s*([a-z][a-z.\'-]*(?: [a-z][a-z.\'-]*){0,2}),\\s*\\d{1,2}:(\\d{2})(' + STAMP_AP + ')\\s*$');  // "Robert, 10:32 AM"
  // a heading at a line's start ("Update:", "FYI:", "Aviso:"): structure, never who sent it and never someone to schedule
  var HEADING_W = {update: 1, updates: 1, fyi: 1, btw: 1, edit: 1, edits: 1, ps: 1, re: 1, reminder: 1, schedule: 1, changes: 1, change: 1,
                   correction: 1, subject: 1, important: 1, urgent: 1, aviso: 1, nota: 1, notas: 1, cambio: 1, cambios: 1, ojo: 1, importante: 1,
                   urgente: 1, recordatorio: 1, actualizacion: 1, correccion: 1};
  // chat: {stamped, senders} is what the whole message was read as, when one of its lines is read again on its own
  function pasted(text, f, raw, named, chat, people, notSender) {
    var ign = [], lines = [], at = 0, dups = 0, seen = {}, asks = [], senderAt = [];
    f.split('\n').forEach(function (l) { lines.push({s: at, t: l}); at += l.length + 1; });
    var near = function (w) { return (people || []).some(function (x) { return x.first && (edit1(w, x.first) || (w.length >= 3 && x.first.indexOf(w) === 0) || (x.nick && edit1(w, x.nick))); }); };
    var nameish = function (who) { return who.split(/[ .'-]+/).filter(Boolean).every(function (w) { return !(w in named) && !keyword(w, true) && !(w in HEAD_W) && !near(w); }); };
    var lead = function (s) { return s.length - s.replace(/^\s+/, '').length; };
    // everyone's names here (Sam and Will too, though they're also words)
    var team = {};
    (people || []).forEach(function (x) { [x.first, x.nick].concat(x.lastParts || [], x.aliases || []).forEach(function (w) { if (w) team[w] = 1; }); });
    var heading = function (who) { var w0 = who.split(/[ .'-]+/).filter(Boolean)[0] || ''; return w0 in HEADING_W && !(w0 in team); };
    // (who could have sent a message: a name, an initial after it ("Anita R."), never a day ("mon:", "m-f:"), a role or a
    // shift word ("Server:", "Close:"), a heading ("Update:") or a column name)
    var sender = function (who) {
      var parts = who.split(/[ .'-]+/).filter(Boolean), w0 = parts[0] || '';
      if (w0 in DAY_WORDS || w0 in LETTER_DAYS || packedDays(w0) || /-/.test(who) && parts.every(function (w) { return w in LETTER_DAYS || w in DAY_WORDS; })) return false;
      if (notSender[who] || notSender[w0] || w0 in HEAD_W || heading(who)) return false;
      return w0 in team || !keyword(w0, true);
    };
    // A "Name, 10:32 AM" line alone is a message stamp when the name isn't anyone's here; with a name here or near one it
    // needs am/pm and either odd minutes or a name that isn't exactly someone's ("Dan, 10:32 AM" with a Daniel here is a
    // stamp; "Manny, 10:30 AM" may be Manny at 10:30, days asked; "anita, 9:50" is Anita at 9:50)
    var exact = function (who) { return who.split(/[ .'-]+/).filter(Boolean).every(function (w) { return w in team; }); };
    var stampLine = function (t) { var sl = STAMP_LINE.exec(t); return !!sl && (nameish(sl[1]) || (!!sl[3].trim() && (+sl[2] % 15 !== 0 || !exact(sl[1])))); };
    var onTeam = function (who) { return who.split(/[ .'-]+/).filter(Boolean).some(function (w) { return w in team; }); };
    var wordsOf = function (L, from) { return raw.filter(function (x) { return x.k === 'word' && x.from >= L.s + from && x.to <= L.s + L.t.length; }).map(function (x) { return x.v; }); };
    var replyW = function (x) { return x in REPLY_W && !(x in team); };  // ("will", "can" here are people, not replies)
    var replyish = function (L, from) { var r = L.t.slice(from), w = wordsOf(L, from); return /\?\s*$/.test(r) || (w.length && w.length <= 4 && !/\d/.test(r) && w.every(replyW)); };
    // the first word after the sender and any reply words ("Robert: ok manny fri"): someone here?
    var namesFirst = function (L, from, who) { var w = wordsOf(L, from).filter(function (x, k, all) { return !all.slice(0, k + 1).every(function (y) { return y in REPLY_W; }); }); return !!w[0] && w[0] in team && who.split(' ').indexOf(w[0]) < 0; };
    var stripStamps = function (L, off) {  // the stamps at a place in a line ("[10:32 AM]", "11/3/26 9:41 PM -"): how far they go
      var m, rest = L.t.slice(off), o = off;
      while ((m = STAMP_BR.exec(rest) || STAMP_DT.exec(rest)) && m[0].trim()) { o += m[0].length; rest = L.t.slice(o); }
      if (o > off) ign.push({from: L.s + off + lead(L.t.slice(off)), to: L.s + o, why: 'a message stamp'});
      return o;
    };
    // Message stamps make it a chat copied from a phone: then every "Name:" at a line's start is who sent it, and a
    // "Name, 10:33 AM" line is a stamp whoever the name is.
    var stamped = !!(chat && chat.stamped) || lines.some(function (L) { return STAMP_BR.test(L.t) || STAMP_DT.test(L.t) || stampLine(L.t); });
    // Without stamps, "Name:" is who sent it only when the name isn't someone here and the rest of the line names someone
    // here first, or is a reply or a question ("Robert: ok manny fri 5-10"); that name is then the sender on every line.
    // Someone here followed by someone else ("Jordan: manny fri 5-10") is asked, never guessed; a list ("Manny: m-f 11-7")
    // keeps its people. (A line read again on its own keeps the whole message's senders, and only those.)
    var outside = {};
    ((chat && chat.senders) || []).forEach(function (w) { outside[w] = 1; });
    if (!stamped && !chat) lines.forEach(function (L) {
      var sm = SENDER.exec(L.t.replace(/^\s+/, '')), from = sm ? lead(L.t) + sm[0].length : 0;
      if (sm && sender(sm[1]) && !onTeam(sm[1]) && nameish(sm[1]) && (namesFirst(L, from, sm[1]) || replyish(L, from))) outside[sm[1]] = 1;
    });
    var thread = stamped || Object.keys(outside).length > 0;
    // (never after a take-back or a correction: a line typed again may then be meant again)
    var undoish = raw.some(function (t) { return (t.k === 'word' && (t.v in UNDO_W || t.v in FIX_W || t.v === 'no' || t.v === 'not' || t.v === 'scratch' || t.v === 'mean')) || (t.k === 'punct' && t.v === '*'); });
    // the whole message pasted twice (its lines again, in order): the second copy is left out
    var full = lines.filter(function (L) { return L.t.trim(); }), half = full.length / 2;
    var lkey = function (L) { return raw.filter(function (x) { return x.from >= L.s && x.to <= L.s + L.t.length; }).map(function (x) { return x.k + ':' + x.v + (x.mm ? ':' + x.mm : '') + (x.ap || ''); }).join(' '); };
    if (full.length >= 2 && full.length % 2 === 0 && !undoish && full.slice(0, half).every(function (L, k) { return lkey(L) === lkey(full[half + k]); })) {
      full.slice(half).forEach(function (L) { L.again = true; });
      dups += half;
    }
    lines.forEach(function (L, n) {
      var t = L.t, off = 0, rest = t, m;
      var whole = function (why) { var a = L.s + off + lead(rest), b = L.s + t.replace(/\s+$/, '').length; if (b > a) ign.push({from: a, to: b, why: why}); };
      senderAt[n] = n ? senderAt[n - 1] : null;  // (a line with no "Name:" of its own, a blank or a separator continues the message before it)
      if (!t.trim()) return;
      if (L.again) { whole('the same line again'); return; }
      if (/^[-_=*~.•·|:\s]+$/.test(t) && /[-_=*~]{2,}/.test(t)) { whole('a separator line'); return; }
      if (/^\s*(sent from my|enviado desde mi|get outlook for)\b/.test(t)) { whole('a message signature'); return; }
      var sl = STAMP_LINE.exec(t);
      if (sl && (stampLine(t) || (stamped && sender(sl[1])))) { whole('a message stamp'); return; }
      off = stripStamps(L, 0); rest = t.slice(off);
      var sm = SENDER.exec(rest.replace(/^\s+/, ''));
      if (sm && sender(sm[1])) {
        var a0 = L.s + off + lead(rest), from = off + lead(rest) + sm[0].length;
        if (stamped || outside[sm[1]] || (thread && replyish(L, from))) {
          ign.push({from: a0, to: a0 + sm[0].length, why: 'who sent it'}); off = stripStamps(L, from); rest = t.slice(off); senderAt[n] = sm[1];
        } else if (onTeam(sm[1]) && namesFirst(L, from, sm[1])) {
          asks.push({from: a0, to: a0 + sm[0].length, name: text.slice(a0, a0 + sm[0].length).replace(/:\s*$/, '')});
        }
      } else if (sm && heading(sm[1])) {
        var h0 = L.s + off + lead(rest);
        ign.push({from: h0, to: h0 + sm[0].length, why: 'a heading'}); off += lead(rest) + sm[0].length; rest = t.slice(off);
      }
      // a numbered list's number ("1. manny ...", "2) anita ..."): structure, never a time
      var ln = /^(\s*)(\d{1,2}[.)])\s+(?=[a-z])/.exec(rest);
      if (ln) { var a1 = L.s + off + ln[1].length; ign.push({from: a1, to: a1 + ln[2].length, why: 'a list number'}); off += ln[0].length; rest = t.slice(off); }
      var words = wordsOf(L, off);  // (read words: a held-down "yesss" is "yes")
      // a table's column names: cells (tabs or |) holding only header words
      if (/\t|\|/.test(text.slice(L.s, L.s + t.length)) && words.length && words.every(function (w) { return w in HEAD_W; }) && !/\d/.test(rest)) { whole('column names'); return; }
      // in a thread: a question or a short reply ("yes", "ok thanks") is conversation
      if (thread && rest.trim() && (/\?\s*$/.test(rest) || (words.length <= 4 && words.length && words.every(replyW) && !/\d/.test(rest)))) {
        whole(/\?\s*$/.test(rest) ? 'a question in the thread' : 'a reply in the thread'); return;
      }
      // the same line again, word for word, when it's a whole instruction (someone, or a change, with days or times): one
      // shift, not two. (A piece alone, "11-7", may be meant again for the next person.)
      var lt = raw.filter(function (x) { return x.from >= L.s + off && x.to <= L.s + t.length && x.k !== 'punct' && x.k !== 'other'; });
      var key = lt.map(function (x) { return x.v + (x.mm ? ':' + x.mm : '') + (x.ap || ''); }).join(' ');
      // (someone: a person's name, never the business's role or shift words, which `named` holds too: "sat close" after "jordan" is Jordan's piece)
      var actor = lt.some(function (x) { return x.k === 'word' && ((x.v in named && !notSender[x.v]) || x.v in REMOVE_W || x.v in OFF_W || x.v === 'clear' || x.v in MOVE_W || x.v in SWAP_W); });
      var when_ = lt.some(function (x) { return x.k === 'num' || (x.k === 'word' && (x.v in DAY_WORDS || x.v in LETTER_DAYS || x.v === 'week' || x.v === 'semana' || !!packedDays(x.v))); });
      if (key && !undoish && actor && when_ && seen[key]) { whole('the same line again'); dups++; return; }
      if (key) seen[key] = 1;
    });
    var inIgn = function (x) { return ign.some(function (g) { return x.from >= g.from && x.to <= g.to; }); };
    return {toks: raw.filter(function (x) { return x.k === 'nl' || !inIgn(x); }), ign: ign, dups: dups, thread: thread, asks: asks,
            chat: {stamped: stamped, senders: Object.keys(outside)}, senderAt: senderAt};
  }

  // ---------------------------------------------------------------- step 6: dictation
  // What a phone's dictation writes, read as what was meant: number words ("eleven to seven", "four forty five", "once
  // a siete", "cuatro cuarenta y cinco"), "a.m." / "p.m." / "o'clock" / "in the evening" after them, spoken punctuation
  // ("period", "comma", "dash", "colon", "new line", "punto", "coma", "nueva línea"), and the mix-ups by position: "too",
  // "two" or "2" between two times is "to" ("11 2 7"), "2" between two days a range ("m 2 f"), "for" or "4" between a
  // name and a day is "for" ("manny 4 fri"), "for" before minutes is 4 ("for 45 to 8"), "won day" Monday. A word that is
  // someone's name here is never read as one of these. Every mix-up is marked as assumed, with why (t.said); what has two
  // readings ("ate to for": 8 to 4?) is left as it is and asked, with a one-tap answer (hints).
  var EN_N = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
              thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19};
  var ES_N = {uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12,
              trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21,
              veintidos: 22, veintitres: 23};
  var TENS = {twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, treinta: 30, cuarenta: 40, cincuenta: 50};
  var ONES = {one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4,
              cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9};
  var LOOSE_N = {one: 1, una: 1, uno: 1, once: 1, two: 1};  // ("no one", "una semana", "once a week": numbers only where a time goes)
  var TIME_BEFORE = {at: 1, from: 1, til: 1, till: 1, until: 1, to: 1, a: 1, las: 1, la: 1, desde: 1, hasta: 1, al: 1, starting: 1, start: 1, starts: 1};
  var SAID_PUNCT = {period: '.', comma: ',', coma: ',', punto: '.'};
  var SAID_NL = {'new line': 1, newline: 1, 'next line': 1, 'new paragraph': 1, 'nueva linea': 1, 'nuevo parrafo': 1, 'punto y aparte': 1};
  var HOMO = {ate: 8, 'for': 4, won: 1};
  function spoken(toks, named, persons) {
    var out = [], hints = [], W = function (t, v) { return !!t && t.k === 'word' && !(t.v in named) && (v === undefined || t.v === v); };
    var numW = function (t) { return W(t) && (t.v in EN_N || t.v in ES_N || t.v in TENS); };
    var isNum = function (t) { return !!t && (t.k === 'num' || numW(t)); };
    var isRange = function (t) { return !!t && (t.k === 'sep' || (t.k === 'word' && t.v in RANGE_WORDS)); };
    // ("ate", "for", "won" are English dictation's, so Spanish "a" never joins them: "for a 6 hour shift" isn't "4 to 6")
    var rangeW = function (t) { return isRange(t) && !(t.k === 'word' && t.v === 'a'); };
    var dayW = function (t) { return W(t) && (t.v in DAY_WORDS || (t.v in LETTER_DAYS && t.v.length <= 2) || !!packedDays(t.v)); };
    var minsAt = function (i) {  // a minute at i: [value, tokens used] ("45", "forty five", "cuarenta y cinco", "fifteen")
      var t = toks[i];
      if (t && t.k === 'num' && /^\d{2}$/.test(t.v) && +t.v < 60 && !t.mm && !t.ap) return [+t.v, 1];
      if (W(t) && t.v in TENS) {
        var y = W(toks[i + 1], 'y') ? 1 : 0, o = toks[i + 1 + y];
        return W(o) && o.v in ONES ? [TENS[t.v] + ONES[o.v], 2 + y] : [TENS[t.v], 1];
      }
      var v = W(t) && !(t.v in LOOSE_N) ? EN_N[t.v] || ES_N[t.v] : 0;
      return v >= 10 && v < 20 ? [v, 1] : null;
    };
    var toks_text = function (x) { return x.v + (x.mm ? ':' + x.mm : '') + (x.ap ? x.ap + 'm' : ''); };
    var num = function (a, b, v, said) { return {k: 'num', v: String(v), mm: null, msep: null, ap: null, from: a.from, to: b.to, said: said || null}; };
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], pv = out[out.length - 1], pv2 = out[out.length - 2], nx = toks[i + 1], nx2 = toks[i + 2];
      // spoken line ends and punctuation
      var two = W(t) && W(nx) ? t.v + ' ' + nx.v : '', three = two && W(nx2) ? two + ' ' + nx2.v : '';
      if (three && SAID_NL[three]) { out.push({k: 'nl', v: '\n', from: t.from, to: nx2.to, said: '“' + three + '” read as a new line'}); i += 2; continue; }
      if (two && SAID_NL[two]) { out.push({k: 'nl', v: '\n', from: t.from, to: nx.to, said: '“' + two + '” read as a new line'}); i++; continue; }
      if (two === 'full stop' || three === 'punto y seguido') { out.push({k: 'punct', v: '.', from: t.from, to: (two === 'full stop' ? nx : nx2).to, said: 'spoken punctuation'}); i += two === 'full stop' ? 1 : 2; continue; }
      if (pv && pv.k === 'num' && W(t, 'en') && W(nx, 'punto')) { pv.to = nx.to; i++; continue; }  // ("a las 7 en punto")
      if (two === 'never mind') { out.push({k: 'word', v: 'nevermind', from: t.from, to: nx.to}); i++; continue; }
      if (W(t) && SAID_PUNCT[t.v]) { out.push({k: 'punct', v: SAID_PUNCT[t.v], from: t.from, to: t.to, said: 'spoken punctuation'}); continue; }
      if (W(t) && (t.v === 'dash' || t.v === 'hyphen' || t.v === 'guion') && pv && (pv.k === 'num' || dayW(pv)) && (isNum(nx) || dayW(nx))) {
        out.push({k: 'sep', v: '-', from: t.from, to: t.to, said: '“' + t.v + '” read as “-”'}); continue;
      }
      if (pv && pv.k === 'num' && W(t) && (t.v === 'oclock' || t.v === 'oclok')) { pv.to = t.to; continue; }
      // "won day", "mon day", "fri day": one day
      if (W(t) && W(nx, 'day') && (t.v + 'day') in DAY_WORDS) { out.push({k: 'word', v: t.v + 'day', from: t.from, to: nx.to, said: '“' + t.v + ' day” read as ' + DAYS[DAY_WORDS[t.v + 'day']]}); i++; continue; }
      if (W(t, 'won') && W(nx, 'day')) { out.push({k: 'word', v: 'monday', from: t.from, to: nx.to, said: '“won day” read as Monday'}); i++; continue; }
      // "for" / "four" / "4" between a name and a day: "for" ("manny 4 fri")
      if (pv && pv.k === 'word' && pv.v in named && dayW(nx) && !nx.stuck && (W(t, 'for') || W(t, 'four') || (t.k === 'num' && t.v === '4' && !t.mm && !t.ap))) {
        out.push({k: 'word', v: 'on', from: t.from, to: t.to, said: t.v === 'for' ? null : '“' + t.v + '” read as “for”'}); continue;
      }
      // "2", "two", "too" between two days: a range ("m 2 f"); between two times: "to" ("11 2 7", "eleven two seven")
      var bare = function (x) { return !!x && ((x.k === 'num' && !x.mm && x.v.length <= 2 && +x.v >= 1 && +x.v <= 24) || (numW(x) && !(x.v in TENS))); };
      if ((t.k === 'num' && t.v === '2' && !t.mm && !t.ap) || W(t, 'two') || W(t, 'too')) {
        if (pv && dayW(pv) && dayW(nx)) { out.push({k: 'sep', v: '-', from: t.from, to: t.to, said: '“' + t.v + '” read as “to”'}); continue; }
        if (pv && pv.k === 'num' && !pv.ap && bare(nx) && !isRange(pv2) && !(pv2 && pv2.k === 'num') && !isRange(nx2) && !(nx2 && nx2.k === 'num')) {
          out.push({k: 'word', v: 'to', from: t.from, to: t.to, said: '“' + t.v + '” read as “to”'}); continue;
        }
      }
      // "the" where a day goes ("sam off the and thu": autocorrect's "tue"?): asked (doubts), never read as nothing
      if (W(t, 'the')) {
        var dayish = function (x, after) {
          if (!x || x.k === 'nl') return true;
          if (dayW(x)) return true;
          if (x.k === 'punct') return x.v === ',' || x.v === '&';
          return x.k === 'word' && (x.v === 'and' || x.v === 'y' || x.v in OFF_W || (x.v in persons && !(x.v in RANGE_WORDS)) || (!after && x.v in RANGE_WORDS));
        };
        // (at a line's start "the" is ordinary, "the sat close is manny 5-10", and so is a person's "the" before a day, "manny the
        // sat close"; asked after someone, off, a day or "and" where a day is missing, "sam off the and thu", "sam the and thu")
        var det = pv && pv.k === 'word' && pv.v in persons && dayW(nx);
        // (and right after a correction's word, before its times: "jordan mon 9-5 sorry the 10-6", autocorrect's "tue"?
        // Before, the correction went to Monday: found by section 100's autocorrect variants of golden st3-015)
        var fixThe = !!pv && pv.k === 'word' && pv.v in FIX_W && !!nx && nx.k === 'num';
        if (pv && pv.k !== 'nl' && !det && (fixThe || (dayish(pv, false) && dayish(nx, true))) && !(pv.k === 'word' && pv.v in {on: 1, of: 1, 'for': 1, at: 1})) hints.push({from: t.from, to: t.to, the: true});
      }
      // "ate to for", "8 to for", "won to 5": two readings (8 to 4?), so left as words and asked, with one tap
      if (W(t) && t.v in HOMO) {
        var q4 = minsAt(i + 1);  // ("for 45 to 8": 4:45; "for 10-6" stays a word, held)
        if (t.v === 'for' && q4 && (q4[0] === 15 || q4[0] === 30 || q4[0] === 45) && rangeW(toks[i + 1 + q4[1]])) { out.push(num(t, t, 4, '“for” read as 4')); continue; }
        if (rangeW(nx) && !(pv && pv.k === 'num')) {
          var ev = nx2 && nx2.k === 'num' && !nx2.mm ? +nx2.v : W(nx2) ? EN_N[nx2.v] || ES_N[nx2.v] || HOMO[nx2.v] : 0;
          if (ev && ev <= 12 && !(nx2.k === 'word' && nx2.v in LOOSE_N && !(nx2.v in HOMO))) { hints.push({from: t.from, to: nx2.to, text: HOMO[t.v] + '-' + ev}); t.hinted = nx2.hinted = true; }
        } else if (rangeW(pv) && pv2 && pv2.k === 'num' && !pv2.mm && !isNum(nx) && t.v !== 'won') {
          hints.push({from: pv2.from, to: t.to, text: toks_text(pv2) + '-' + HOMO[t.v]}); t.hinted = true;  // ("8pm to for": 8pm-4, the pm kept)
        }
        out.push(t); continue;
      }
      // "los dos" / "las dos" after two people: both of them, not 2 o'clock ("sam y will los dos sáb 5-10"; "a las dos" is a time)
      if (numW(t) && t.v in ES_N && (W(pv, 'los') || W(pv, 'las')) && !(W(pv2) && pv2.v in TIME_BEFORE) && !isRange(nx) && !isNum(nx) && !minsAt(i + 1)
          && (t.v === 'dos' ? out.filter(function (x) { return x.k === 'word' && x.v in persons; }).length >= 2 : t.v === 'tres')) {
        out.push({k: 'word', v: 'both', from: t.from, to: t.to, said: '“' + pv.v + ' ' + t.v + '” read as “both”'}); continue;
      }
      // number words: "eleven", "four forty five" (4, 45: read as "4 45"), "cuarenta y cinco", "once a siete"
      if (numW(t)) {
        if (t.v in TENS) { var mt = minsAt(i), ntm = num(t, toks[i + mt[1] - 1], mt[0]), km = withAp(toks, ntm, i + mt[1]); out.push(ntm); i = km - 1; continue; }
        var timeNear = (pv && ((pv.k === 'word' && pv.v in TIME_BEFORE) || pv.k === 'num' || isRange(pv) || (pv.k === 'punct' && pv.v === '@')))
          || (isRange(nx) && isNum(nx2)) || (!!nx && nx.k === 'word' && /^(am|pm|oclock)$/.test(nx.v)) || !!minsAt(i + 1);
        if (t.v in LOOSE_N && !timeNear) { out.push(t); continue; }
        var nt = num(t, t, EN_N[t.v] || ES_N[t.v]), k = withAp(toks, nt, i + 1);
        out.push(nt); i = k - 1; continue;
      }
      // "in the morning" / "in the afternoon" / "in the evening" / "at night" after a time
      if (pv && pv.k === 'num' && !pv.ap && (W(t, 'in') || W(t, 'at'))) {
        var j0 = W(nx, 'the') ? i + 2 : i + 1, pw = toks[j0], h = +pv.v;
        var apw = W(pw, 'morning') ? 'a' : W(pw, 'afternoon') || W(pw, 'evening') ? 'p' : W(pw, 'night') && h >= 6 && h <= 11 ? 'p' : null;
        if (apw && (t.v === 'in') === (pw.v !== 'night')) { pv.ap = apw; pv.to = pw.to; i = j0; continue; }
      }
      // "4 colon 45"
      if (pv && pv.k === 'num' && !pv.mm && W(t, 'colon') && nx && nx.k === 'num' && /^\d{2}$/.test(nx.v) && +nx.v < 60) { pv.mm = nx.v; pv.msep = ':'; pv.to = nx.to; i++; continue; }
      out.push(t);
    }
    // (a word in a question of its own, "for" in "ate to for", isn't also a later-step word: one question, not two)
    out.forEach(function (x) { if (x.hinted && x.k === 'word' && x.v in HOMO) x.v = x.v + '?'; });
    return {toks: out, hints: hints};
  }

  // Spanish time phrases, read into the numbers they belong to (their words marked as understood, "apw"): "mediodía" and
  // "medio día" (noon), "medianoche", "5 de la tarde" / "11 de la mañana" / "5 tarde" (pm/am), "11h", "17hs", "11 hrs a
  // 19 hrs" (24-hour marks), "4 y media", "4 y cuarto", "4 y 45", "5 menos cuarto"
  // "am"/"pm"/"a.m."/"p.m." right after a number word (whatever else the letters are here): the number's; the index after
  function withAp(toks, nt, k) {
    var R = function (x, v) { return !!x && x.k === 'word' && x.v === v; };
    if (toks[k] && toks[k].k === 'word' && (toks[k].v === 'am' || toks[k].v === 'pm')) { nt.ap = toks[k].v[0]; nt.to = toks[k].to; k++; }
    else if ((R(toks[k], 'a') || R(toks[k], 'p')) && toks[k + 1] && toks[k + 1].k === 'punct' && toks[k + 1].v === '.' && R(toks[k + 2], 'm')) {
      nt.ap = toks[k].v; k += 3;
      if (toks[k] && toks[k].k === 'punct' && toks[k].v === '.' && toks[k].from === toks[k - 1].to) k++;
      nt.to = toks[k - 1].to;
    }
    return k;
  }
  function esTimes(toks) {
    var out = [], W = function (t, v) { return t && t.k === 'word' && (v ? t.v === v : true); };
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i], n = toks[i + 1];
      if (W(t, 'mediodia') || (W(t, 'medio') && W(n, 'dia'))) {
        out.push({k: 'num', v: '12', mm: null, msep: null, ap: 'p', from: t.from, to: t.v === 'medio' ? n.to : t.to, word: true});
        if (t.v === 'medio') i++;
        continue;
      }
      if (W(t) && (t.v === 'las' || t.v === 'la') && n && n.k === 'num' && W(out[out.length - 1]) && out[out.length - 1].v in {a: 1, al: 1, hasta: 1, desde: 1, de: 1}) { t.apw = true; out.push(t); continue; }
      if (W(t, 'medianoche')) { out.push({k: 'num', v: '12', mm: null, msep: null, ap: 'a', from: t.from, to: t.to, word: true}); continue; }
      out.push(t);
      if (t.k !== 'num') continue;
      var j = i + 1;
      // minutes in words
      var pr = out[out.length - 2], nx2 = toks[j + 2], rng = function (x) { return !!x && (x.k === 'sep' || (W(x) && x.v in {a: 1, al: 1, hasta: 1})); };
      var endY = rng(pr) && rng(nx2) && !!toks[j + 3] && toks[j + 3].k === 'num';
      if (!t.mm && !endY && W(toks[j], 'y') && (W(toks[j + 1], 'media') || W(toks[j + 1], 'cuarto') || (toks[j + 1] && toks[j + 1].k === 'num' && /^(15|30|45)$/.test(toks[j + 1].v) && !toks[j + 1].mm))) {
        t.mm = toks[j + 1].v === 'media' ? '30' : toks[j + 1].v === 'cuarto' ? '15' : toks[j + 1].v; t.msep = ':';
        toks[j].apw = toks[j + 1].apw = true; out.push(toks[j], toks[j + 1]); i = j + 1; j = i + 1;
      } else if (!t.mm && W(toks[j], 'menos') && W(toks[j + 1], 'cuarto') && +t.v >= 1 && +t.v <= 24) {
        if (+t.v >= 13) t.h24m = true;  // ("13 menos cuarto": 12:45, 24-hour)
        t.v = String(+t.v - 1 || 12); t.mm = '45'; t.msep = ':';
        toks[j].apw = toks[j + 1].apw = true; out.push(toks[j], toks[j + 1]); i = j + 1; j = i + 1;
      }
      // a part of the day after the time: am or pm
      var k = j, skip = [];
      // (only "de la": "por la tarde" after a range may be about the whole shift, so it's left to ask)
      while (skip.length < 2 && toks[k] && toks[k].k === 'word' && toks[k].v in {de: 1, la: 1}) skip.push(toks[k++]);
      var pw = toks[k];
      if (W(pw) && pw.v in ES_PART && !t.ap && !(skip.length === 0 && pw.v === 'manana')) {
        t.ap = pw.v === 'noche' && (+t.v === 12 || +t.v <= 5) ? 'a' : pw.v === 'manana' && +t.v === 12 ? null : ES_PART[pw.v]; skip.concat([pw]).forEach(function (x) { x.apw = true; out.push(x); }); i = k; continue;
      }
      // 24-hour marks: "11h", "17hs" (stuck), or "hrs" / "horas" next to a range ("11 hrs a 19 hrs")
      var hw = toks[j];
      if (W(hw) && hw.v in {h: 1, hs: 1, hrs: 1, hr: 1, horas: 1}) {
        var ES_R = {a: 1, al: 1, hasta: 1}, stuck = hw.from === t.to,
            rngNext = W(toks[j + 1]) && toks[j + 1].v in ES_R && toks[j + 2] && toks[j + 2].k === 'num',
            rngPrev = W(out[out.length - 2]) && out[out.length - 2].v in ES_R && out[out.length - 3] && (out[out.length - 3].k === 'num' || out[out.length - 3].apw);
        // ("17h", "11h a 19h", "11 hrs a 19 hrs": never "6 hrs til close", a length)
        if ((stuck && hw.v.length <= 2 && (+t.v >= 13 || rngNext || rngPrev)) || (esOn && (rngNext || rngPrev))) { hw.apw = true; t.h24m = true; out.push(hw); i = j; }
      }
    }
    return out;
  }
  // ---------------------------------------------------------------- people
  function edit1(a, b) {  // edit distance at most 1
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    var i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  function near1(a, b) {  // one letter off, or two neighbouring letters swapped ("sahra" is near "sahar" and "sara")
    if (edit1(a, b)) return true;
    if (a.length !== b.length) return false;
    for (var i = 0; i < a.length - 1; i++) if (a[i] !== b[i]) return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
    return false;
  }
  function index(ctx) {
    // (a name's parts as the tokens will come: "O'Brien" is "obrien", "St. James" is "st james", "Jean-Luc" is "jean" + "luc")
    var nameParts = function (s) { return fold(String(s)).replace(/[.']/g, '').split(/[\s-]+/).filter(Boolean); };
    var people = (ctx.people || []).map(function (p) {
      var parts = nameParts(p.name);
      // (hy: the first name is hyphenated, "Jean-Luc", "So-Young": its second part alone names no one, its first part alone
      // only when it is three letters or more and no word of the reading's: "so anita", "el lunes" aren't So-Young, El-Sayed)
      return {p: p, first: parts[0] || '', last: parts.slice(1).join(' '), lastParts: parts.slice(1), hy: /^[^\s-]+-[^\s]/.test(fold(String(p.name)).trim()),  // (a name with no letters: matches nothing)
              nick: p.nick ? nameParts(p.nick).join(' ') || null : null, aliases: (p.aliases || []).map(function (a) { return nameParts(a).join(' '); }).filter(Boolean)};
    });
    var removed = (ctx.removed || []).map(function (n) { var parts = nameParts(n); return {name: n, first: parts[0] || '', last: parts.slice(1).join(' ')}; })
      .filter(function (x) { return x.first; });
    var roleWords = {};
    (ctx.roles || []).forEach(function (r) { [r.key, r.label].concat(r.words || []).forEach(function (w) { roleWords[fold(w)] = r; }); });
    // the business's shift words ("mid" 13:00-19:00, "close" = closing time, codes "O" "C"): {folded form: entry}; a
    // word's -s and -ing forms too ("closes", "closing"), never for a code of one or two letters
    var words = {};
    (ctx.words || []).forEach(function (x) {
      var k = fold(String(x.word || '')).trim().replace(/\s+/g, ' ');
      if (!k || !(x.start || x.end)) return;
      var en = {word: String(x.word), key: k, start: x.start || null, end: x.end || null, code: k.length <= 2};
      (en.code ? [k] : [k, k + 's', k + 'es', k + 'ing', k.replace(/e$/, '') + 'ing']).forEach(function (v) { if (!(v in words)) words[v] = en; });
    });
    for (var es in ES_GLOSS) if (words[ES_GLOSS[es]] && !(es in words)) words[es] = words[ES_GLOSS[es]];
    var nameWords = {}, longest = 2;
    people.forEach(function (x) { [x.first, x.nick].concat(x.lastParts, x.aliases).forEach(function (w) { if (w) nameWords[w] = 1; }); longest = Math.max(longest, x.lastParts.length + 1); });
    return {people: people, removed: removed, roleWords: roleWords, words: words, nameWords: nameWords, longest: longest};
  }
  function keyword(w, es) {  // (es: read as Spanish; by default the message being read)
    if (w in ES_ONLY && !(w in ES_DAYS) && !(es === undefined ? esOn : es)) return false;
    return w in DAY_WORDS || w in LETTER_DAYS || w in GLUE || w in LATER_SET || w in RANGE_WORDS || w in W4B || w in OFF_W || w in REMOVE_W || w in EXCEPT_W || w in UNDO_W || w in ES_MISC || w in EN_DAYS_W || !!packedDays(w);
  }
  // The people a word (and maybe the next) could be: [{cands, used, how}] or null
  var PARTICLE = {de: 1, la: 1, del: 1, los: 1, las: 1, van: 1, der: 1, den: 1, von: 1, di: 1, da: 1, dos: 1, st: 1, mac: 1, mc: 1, el: 1, le: 1, du: 1, bin: 1, al: 1, dela: 1, delos: 1, san: 1};
  var ABBREV = {st: 1, ste: 1, ma: 1, mc: 1, mac: 1, jr: 1, sr: 1, dr: 1, sta: 1, sto: 1};  // (not "fr": Friday)  // ("St. James", "Ma. Elena": a dot that goes on with the name)
  // the word tokens after i that could go on with a name ("jean-luc moreau": a hyphen or a dot stuck between two words is
  // part of the name, as the index splits names; "m-f" after a name is still read as days by what follows)
  function nameRun(toks, i, ix) {
    var out = [], j = i + 1, most = ix ? ix.longest : 4;  // (no name here is longer: the walk stays short on a long line)
    while (toks[j] && out.length < most) {
      var t = toks[j];
      if (t.k === 'word') { out.push({t: t, at: j}); j++; continue; }
      // (a hyphen stuck on both sides, "jean-luc"; a dot stuck to an abbreviation before it, "st. james"; dots between
      // single letters, "j.r.")
      var dot = t.k === 'punct' && t.v === '.' && !toks[j - 1].stuck && (toks[j - 1].v in ABBREV || (toks[j - 1].k === 'word' && toks[j - 1].v.length === 1 && toks[j + 1] && toks[j + 1].k === 'word' && toks[j + 1].v.length === 1));  // (never "1st.")
      if ((t.k === 'sep' || dot) && toks[j - 1].to === t.from && toks[j + 1] && toks[j + 1].k === 'word' && (dot || toks[j + 1].from === t.to)) { j++; continue; }
      break;
    }
    return out;
  }
  function mention(toks, i) {  // ("@mo": an "@" stuck to the word after it names a person, never a day)
    var a = toks[i - 1];
    return !!a && a.k === 'punct' && a.v === '@' && a.to === toks[i].from;
  }
  function personAt(ix, toks, i, lineStart, midNew) {
    var t = toks[i];
    if (!t || t.k !== 'word') return null;
    var run = nameRun(toks, i, ix), w = t.v, n = run.length ? run[0].t.v : null, hits;
    // ("@sam" with a Sam saved with no surname and a Sam Lee here: the one whose whole name it is; what the questions'
    // taps write for someone with no surname to tell them by)
    // (unless a surname follows: "@sam lee" is Sam Lee)
    if (mention(toks, i) && !(n && ix.people.some(function (x) { return x.first === w && (x.last === n || x.lastParts[0] === n); }))) {
      hits = ix.people.filter(function (x) { return x.first === w && !x.lastParts.length; });
      if (hits.length) return {cands: hits, used: 1, how: 'name'};
    }
    // initials with dots, "j.r.", typed as a first name, nickname or alias is written ("J.R. Smith", "JR")
    if (w.length === 1 && n && n.length === 1) {
      var ini = run.filter(function (r, k) { return r.t.v.length === 1 && run.slice(0, k).every(function (q) { return q.t.v.length === 1; }); });
      for (var q = ini.length; q >= 1; q--) {
        var joined = w + ini.slice(0, q).map(function (r) { return r.t.v; }).join('');
        hits = ix.people.filter(function (x) { return x.first === joined || x.nick === joined || x.aliases.indexOf(joined) >= 0; });
        if (hits.length) {
          // (with the surname after it, "j.r. smith": theirs, all of it, the longest typed; only the words of a surname
          // are looked at past the closing dot, so "8 a.m. fri" never reaches "fri")
          var end = ini[q - 1].at, from = toks[end + 1] && toks[end + 1].k === 'punct' && toks[end + 1].v === '.' && toks[end + 1].from === toks[end].to ? end + 2 : end + 1;
          var lastAt = function (x) {
            if (!x.lastParts.length) return -1;
            for (var k = 0, j = from; k < x.lastParts.length; k++, j++) { if (!toks[j] || toks[j].k !== 'word' || toks[j].v !== x.lastParts[k]) return -1; }
            return from + x.lastParts.length - 1;
          };
          var far = Math.max.apply(null, hits.map(lastAt));
          if (far >= 0) return {cands: hits.filter(function (x) { return lastAt(x) === far; }), used: far - i + 1, how: 'name'};
          return {cands: hits, used: end - i + 1, how: 'nick'};
        }
      }
    }
    // first + a surname of several words, all typed ("ana de la cruz"): the whole name
    var full = ix.people.filter(function (x) { return (x.first === w || x.nick === w || x.aliases.indexOf(w) >= 0) && x.lastParts.length > 1
      && x.lastParts.every(function (lp, k) { return !!run[k] && run[k].t.v === lp; }); });
    if (full.length) {  // (the longest surname typed: "ana de la cruz lopez" is Ana de la Cruz Lopez alone)
      var longest = Math.max.apply(null, full.map(function (x) { return x.lastParts.length; }));
      return {cands: full.filter(function (x) { return x.lastParts.length === longest; }), used: run[longest - 1].at - i + 1, how: 'name'};
    }
    // (the rest of a surname of several words typed after its first, the last word maybe a letter off, "ayesha dela cru":
    // how far into the run the surname goes, for the candidates given)
    // (a word that is something else here, a day's, a role's ("cook", "hosts"), a shift's, a reply's or someone's name, is
    // never a surname typed a letter off: "mary beth cook" with a Mary Beth Cooke keeps the role)
    var taken = function (v) { return keyword(v) || v in ix.nameWords || !!ix.words[v] || !!ix.roleWords[v] || !!ix.roleWords[v.replace(/(es|s|ing)$/, '')] || v in REPLY_W || v in TEACH; };
    var tailOf = function (cands) {
      var to = 0;
      cands.forEach(function (x) {
        var k = 1;
        while (run[k] && x.lastParts[k] && (run[k].t.v === x.lastParts[k] || (k === x.lastParts.length - 1 && run[k].t.v.length >= 3 && !taken(run[k].t.v) && near1(run[k].t.v, x.lastParts[k])))) k++;
        to = Math.max(to, k - 1);
      });
      return to;
    };
    if (n) {  // first + last (or its first part), or first + initial
      // (a nickname with the surname counts too: "dom ross", "manny garcia")
      // (a surname typed one letter off after the first name, "li sunn", is still that surname when the word is no one
      // else's and not one of the reading's)
      // ("maria y jose", "juan a las 5", "luis e ana": joining words, an initial only when someone of that first name has a
      // surname that starts with it, "miguel o" with a Miguel Ortiz: then a Miguel Ángel Ortiz counts too, asked)
      var JOIN_L = {y: 1, a: 1, o: 1, e: 1};
      var joinIni = !(n in JOIN_L) || ix.people.some(function (x) { return x.first === w && !!x.lastParts[0] && x.lastParts[0][0] === n; });
      var lastNear = function (x) { return !!x.lastParts[0] && n.length >= 4 && !taken(n) && near1(n, x.lastParts[0]); };
      // (an initial is any surname word's: "maría l" with María José Lozano and María Lara here is both, asked)
      hits = ix.people.filter(function (x) { return (x.first === w || ((x.nick === w || x.aliases.indexOf(w) >= 0) && n.length > 1)) && (x.last === n || x.lastParts[0] === n || (n.length === 1 && joinIni && x.lastParts.some(function (lp) { return lp[0] === n; })) || lastNear(x)); });
      // (a second given name with a later word's initial, "elena r" with a Ma. Elena Rangel here, "carlos d" with a Juan
      // Carlos de la Rosa: them too, asked. Only next to someone the initial already names: alone, "jose y ana" with a José
      // Ruiz and a María José Yáñez, the letter is as likely a word, and the name alone asks about both)
      // (and someone called that by nickname: "joe c" with a Joe Carpenter and a Joseph "Joe" Campbell)
      if (n.length === 1 && !(n in JOIN_L) && hits.length && !keyword(w) && !(w in PARTICLE) && !ix.roleWords[w]) ix.people.forEach(function (x) {
        var k = x.lastParts.indexOf(w);
        if (hits.indexOf(x) < 0 && ((k >= 0 && x.lastParts.slice(k + 1).some(function (lp) { return lp[0] === n; }))
            || ((x.nick === w || x.aliases.indexOf(w) >= 0) && x.lastParts.some(function (lp) { return lp[0] === n; })))) hits.push(x);
      });
      // (two words that are also someone's whole surname, "garcia lopez" with a Verónica García López here: her too, asked)
      // (the second a letter off too: "el-uayed" with an El-Sayed Leung and a Habib El-Sayed)
      if (hits.length && n.length > 1) ix.people.forEach(function (x) {
        if (hits.indexOf(x) < 0 && x.lastParts.length === 2 && x.lastParts[0] === w && (x.lastParts[1] === n || (n.length >= 4 && !taken(n) && near1(n, x.lastParts[1])))) hits.push(x);
      });
      // a day's letter after a first name only one person has is the day ("manny m-f" with Manny Morales): an initial
      // only where it tells two people apart
      if (hits.length && n.length === 1 && n in LETTER_DAYS && ix.people.filter(function (x) { return x.first === w; }).length === 1
          && !hits.some(function (x) { return x.last === n; })) hits = [];
      // (an initial after a given name of several words, "ha-eun c" with Ha-eun Chávez and Ha-eun Ortega, "mary-kate o":
      // theirs where it tells people apart, or isn't a day's letter ("min-jun r fri" is Thursday, as "manny r fri" is);
      // never "y", "a", "o", "e": words)
      var t2 = hits.length && n.length > 1 ? tailOf(hits) : 0, ini2 = hits.length && n.length > 1 ? run[t2 + 1] : null;
      if (ini2 && ini2.t.v.length === 1 && !(ini2.t.v in JOIN_L)) {
        var byIni = hits.filter(function (x) { return x.lastParts.slice(t2 + 1).some(function (lp) { return lp[0] === ini2.t.v; }); });
        if (byIni.length && (byIni.length < hits.length || !(ini2.t.v in LETTER_DAYS))) return {cands: byIni, used: ini2.at - i + 1, how: 'name'};
      }
      // (someone saved as a first name and a letter, "Sam O." beside a Sam Ortiz, "Thu N.": typed so, it is their whole name)
      var whole = n.length === 1 ? hits.filter(function (x) { return x.first === w && x.last === n; }) : [];
      if (whole.length === 1) return {cands: whole, used: run[0].at - i + 1, how: 'name'};
      if (hits.length) return {cands: hits, used: run[tailOf(hits)].at - i + 1, how: hits.length === 1 && n.length === 1 ? 'initial' : 'name'};
    }
    var removed = ix.removed.filter(function (x) { return x.first === w && w.length > 2 && !keyword(w); });
    // a surname of several words typed alone ("de la cruz", "st james", "garcia lopez"): that person, once
    var byLast = ix.people.filter(function (x) {  // ("castro" alone, the last word: every Castro, below)
      var k = x.lastParts.indexOf(w);
      return k >= 0 && k < x.lastParts.length - 1 && !ix.roleWords[w] && (lineStart || !keyword(w)) && x.lastParts.slice(k + 1).every(function (lp, m) { return !!run[m] && run[m].t.v === lp; });
    });
    if (byLast.length) {  // (the longest surname typed: "de la cruz lopez" is Luis de la Cruz Lopez, not Ana de la Cruz too)
      var tail = function (x) { return x.lastParts.length - 1 - x.lastParts.indexOf(w); }, rest = Math.max.apply(null, byLast.map(tail));
      return {cands: byLast.filter(function (x) { return tail(x) === rest; }), used: run[rest - 1].at - i + 1, how: 'name', word: keyword(w)};
    }
    // (a surname that is also a role's word, "Cook", "Host", is the role: never a second person on the line; a particle
    // alone, "de", "la", is never a person)
    // (the last word of a name is a surname whatever it is: "du" with Mei Ling Du and Bob Du, "le", "van")
    hits = ix.people.filter(function (x) {
      if (x.first === w) return !x.hy || (w.length >= 3 && !keyword(w) && !(w in PARTICLE));
      if (x.nick === w || x.aliases.indexOf(w) >= 0) return true;
      var k = x.lastParts.indexOf(w);
      if (k < 0 || ix.roleWords[w] || (x.hy && k === 0)) return false;
      return x.last === w || k === x.lastParts.length - 1 || (!keyword(w) && !(w in PARTICLE));
    });
    if (hits.length) {
      // a name that is also a word ("will", "eve", "april", "sam"/"same") counts as a name only where an instruction starts,
      // and never right after a number ("four p.m. to ten" with a To here)
      // ("four p.m. to ten" with a To here, "fri to sun", "sat sun" with a Sun: a range or day word after a number or a day
      // is that word; "fri 9-5 will" is still Will)
      // (and so is one later in a list of days: "mon, wed, thu", "mon/thu", "mon & thu", "sat and sun")
      var back = i - 1;
      while (toks[back] && ((toks[back].k === 'punct' && toks[back].v in {',': 1, '/': 1, '&': 1}) || (toks[back].k === 'word' && toks[back].v in {and: 1, or: 1, y: 1, o: 1, n: 1}))) back--;
      // (a Spanish day's word, "dom", "mar", only in a Spanish message: "fri dom 11-7" is Dom on Friday)
      var pv = toks[back], whenW = w in RANGE_WORDS || w in EN_DAYS || w in LETTER_DAYS || (esOn && w in DAY_WORDS);
      // (across a "," or "and" only a day's own word counts, and not one that is someone's name: "sam and dom mon" is Sam and Dom)
      var afterWhen = whenW && !!pv && (back === i - 1 ? pv.k === 'num' || pv.k === 'sep' || (pv.k === 'word' && (pv.v in DAY_WORDS || pv.v in LETTER_DAYS || pv.v in RANGE_WORDS || !!packedDays(pv.v)))
        : pv.k === 'word' && pv.v in DAY_WORDS && !(pv.v in ix.nameWords));
      // (stranger test 3, F-074/F-082: mid-line, after someone's days or times, "raul mon 9-5 will tue": a teammate's name
      // that is also a word starts their part, asked: "“will”: Will Thompson, or not a name?". Never passed over silently,
      // which gave Raúl Will's Tuesday. Never a day's or range word of this reading: "raúl de 9 a 5 el mar" is Tuesday)
      // (nor a shift word of this business, "eve", "close", "open": "sam sat eve" with an Eve here is Saturday evening, as before)
      if (keyword(w) && !lineStart && midNew && !whenW && !ix.words[w]) return {cands: hits, used: 1, how: 'name', word: true, mid: true};
      if (keyword(w) && (!lineStart || afterWhen)) return null;
      return {cands: hits, used: 1, how: 'name', word: keyword(w)};
    }
    if (removed.length) return {removed: removed[0], used: 1};
    if (w in ES_NICK && (lineStart || esOn)) {  // ("pepe" for José: only when it's no one's own name or nickname here; "rafa": Rafael, or Rafaela?)
      var nk = ix.people.filter(function (x) { return x.first === ES_NICK[w]; }), byPre = ix.people.filter(function (x) { return x.first.indexOf(w) === 0 && nk.indexOf(x) < 0; });
      if (nk.length) return {cands: nk.concat(byPre), used: 1, how: nk.length + byPre.length === 1 ? 'nick' : 'prefix'};
    }
    if (w.length >= 3 && !keyword(w)) {
      // (a word a letter from someone's first name and also a letter from someone else's surname, nickname or second
      // name: "fielda" with Fields Lynch and Ed Fields, "cark" with a Carl and a Clark, "condy" with Cody and a Cindy: all of
      // them, asked. Never found by this alone: "want" isn't Wang. The start of a first name, "russ", "mart", is that
      // person's short form: others are added only when it is their name with one letter missing, "silv" with Silvia and a
      // Silva, "pao" with Paola and a Paco; a short form a letter off another name, "russ" with a Ross, stays unasked)
      var widen = function (cands, how) {
        return cands.concat(ix.people.filter(function (x) {
          return cands.indexOf(x) < 0 && [x.first, x.nick].concat(x.aliases, x.lastParts).some(function (nw) {
            return !!nw && nw !== w && nw.length >= 3 && Math.max(nw.length, w.length) >= 4 && !(nw in PARTICLE) && !ix.roleWords[nw]
              && (how !== 'prefix' || nw.length === w.length + 1 || nw === w.replace(/([a-z])\1+/g, '$1')) && near1(w, nw);  // ("dann": Danny, or Dan with the n twice)
          });
        }));
      };
      // (a surname typed next says who: "elvra bae" is Elvira Bae, not Elvira and a second Bae)
      var withLast = function (cands, how) {
        // (their own surname typed next is their name, even one that is a day's word: "ócar mar monday" is Óscar Mar on
        // Monday, never Tuesday too; "viviaan sun wed-sat" is Vivian Sun)
        var isLast = function (x) { return x.last === n || x.lastParts[0] === n; }, plain = !!n && !ix.roleWords[n] && !ix.words[n] && !(n in PARTICLE);
        var own = plain ? cands.filter(isLast) : [];
        if (own.length) return {cands: own, used: run[tailOf(own)].at - i + 1, how: how};
        // (nor someone's own first name or nickname: "chris jordan fri" with a Jordan Smith here is Christina and Jordan)
        var aFirst = !!n && ix.people.some(function (x) { return x.first === n || x.nick === n || x.aliases.indexOf(n) >= 0; });
        var byLast2 = plain && !keyword(n) && !aFirst ? ix.people.filter(isLast) : [];  // (never a day's, role's, shift or particle word)
        if (!byLast2.length) return {cands: widen(cands, how), used: 1, how: how};
        // ("eli garcia" with Elizabeth Kim and Manny Garcia here: the two readings disagree, so both are asked)
        return {cands: cands.concat(byLast2), used: run[tailOf(byLast2)].at - i + 1, how: how};
      };
      hits = ix.people.filter(function (x) { return x.first.indexOf(w) === 0 || (x.nick && x.nick.indexOf(w) === 0); });
      if (hits.length && w.length >= 3) return withLast(hits, 'prefix');
      if ((lineStart || /([a-z])\1\1/.test(w)) && w.length >= 4) {  // (held-down letters, "sammm", anywhere on the line)
        // (a word one letter from a day's, "thuu", "frii", is never read as someone: asked)
        var nearDay = false;
        for (var dw in DAY_WORDS) if (dw.length >= 3 && near1(w, dw)) { nearDay = true; break; }
        if (nearDay) return null;
        // (held-down letters, "annna", count as the names they could be, "ana" and "anna", next to the ones a letter off, "annan")
        var held = [w.replace(/([a-z])\1{2,}/g, '$1$1'), w.replace(/([a-z])\1{2,}/g, '$1')].filter(function (v) { return v !== w; });
        // (a surname only by a letter doubled or held, "limm", "annna": one letter off would make "want" Wang, "then" Chen)
        var doubled = w.replace(/([a-z])\1+/g, '$1');
        hits = ix.people.filter(function (x) { return near1(w, x.first) || (x.nick && near1(w, x.nick))
          || x.lastParts.some(function (lp) { return lp.length >= 3 && !ix.roleWords[lp] && (doubled === lp || doubled === lp.replace(/([a-z])\1+/g, '$1') && w.length > lp.length || (w.length === lp.length && !edit1(w, lp) && near1(w, lp))); })  // (or two letters swapped, "robnison")
          || held.some(function (v) { return v === x.first || v === x.nick || x.aliases.indexOf(v) >= 0 || (x.lastParts.indexOf(v) >= 0 && !ix.roleWords[v]); }); });
        if (hits.length) return withLast(hits, 'fuzzy');
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- days
  // "lmxjv", "lv", "lmmjv" (Spanish letters): [[readings]], or null. An M with no X and no second M could be martes or
  // miércoles ("lmv"): esAmb, asked
  function packedEs(w) {
    if (w.length < 3 || w.length > 7 || !/^[lmxjvsd]+$/.test(w) || !/[lxjvd]/.test(w)) return null;  // (never "dj", "vs", "sd")
    var out = [], ms = w.split('m').length - 1, x = w.indexOf('x') >= 0, amb = false, seenM = 0;
    for (var i = 0; i < w.length; i++) {
      var c = w[i];
      if (c === 'm') { seenM++; if (x || ms === 2) out.push([seenM === 1 ? 1 : 2]); else { out.push([1, 2]); amb = true; } }
      else out.push([ES_LETTER[c]]);
    }
    if (ms > 2) return null;
    for (var q = 1; q < out.length; q++) if (out[q][0] <= out[q - 1][0]) return null;  // ("xxx", "jjj", "vl": not days)
    out.esAmb = amb; out.es = true;
    return out;
  }
  // the Spanish ways of saying days that aren't one day's word, read in one place for the instruction splitter and the
  // reading alike: {list | range, used (tokens), kind}, or null. "finde", "fin(es) de semana(s)" (weekend, plural with
  // fines/semanas), "entre semana", "todos los días", "toda la semana", "L-V" / "L a V" (letters; back: into next week),
  // a capital "X" before a time (miércoles, in a Spanish message)
  function esDaysAt(tk, i, text) {
    var w = function (n, v) { var x = tk[i + n]; return !!x && x.k === 'word' && (v === undefined || (typeof v === 'string' ? x.v === v : x.v in v)); };
    var t = tk[i], e2 = tk[i + 2];
    if (!t || t.k !== 'word') return null;
    if (t.v === 'finde') return {list: [5, 6], used: 1, kind: 'weekend'};
    var en = !enKept[t.v] && EN_DAYS_W[t.v];
    if (en === 'we' || en === 'wes') return {list: [5, 6], used: 1, kind: 'weekend', plural: en === 'wes'};
    if (en === 'wd') return {range: [0, 4], used: 1, kind: 'phrase'};
    if (en === 'all') return {range: [0, 6], used: 1, kind: 'phrase'};
    if ((t.v === 'every' || t.v === 'each') && w(1, 'day')) return {range: [0, 6], used: 2, kind: 'phrase'};
    if (w(0, {fin: 1, fines: 1}) && w(1, 'de') && w(2, {semana: 1, semanas: 1})) return {list: [5, 6], used: 3, kind: 'weekend', plural: t.v === 'fines' || e2.v === 'semanas'};
    if (t.v === 'entre' && w(1, 'semana')) return {range: [0, 4], used: 2, kind: 'phrase'};
    if ((w(0, {todos: 1, todas: 1}) && w(1, {los: 1, las: 1}) && w(2, 'dias')) || (t.v === 'toda' && w(1, 'la') && w(2, 'semana'))) return {range: [0, 6], used: 3, kind: 'phrase'};
    if (t.v in ES_LETTER && tk[i + 1] && (tk[i + 1].k === 'sep' || w(1, {a: 1, al: 1})) && w(2) && e2.v in ES_LETTER && /[lxjvd]/.test(t.v + e2.v))
      return {range: [ES_LETTER[t.v], ES_LETTER[e2.v]], used: 3, kind: 'letters', back: ES_LETTER[e2.v] < ES_LETTER[t.v]};
    if (esOn && t.v === 'x' && text.slice(t.from, t.to) === 'X' && !t.stuck && tk[i + 1] && (tk[i + 1].k === 'num' || w(1, {de: 1, a: 1}))) return {list: [2], used: 1, kind: 'x'};
    return null;
  }
  function packedDays(w) {  // "mwf", "mtwthf", "monfri" -> [[readings...]] or null
    if (w.length < 2 || w in DAY_WORDS) return null;
    var en = packedEn(w);
    return en || packedEs(w);
  }
  function packedEn(w) {
    var out = [], i = 0;
    while (i < w.length) {
      var hit = null;
      for (var k = 0; k < PACK.length; k++) if (w.substr(i, PACK[k].length) === PACK[k]) { hit = PACK[k]; break; }
      if (!hit) return null;
      out.push(hit in DAY_WORDS ? [DAY_WORDS[hit]] : LETTER_DAYS[hit]);
      if (hit.length === 1) out.single = true;  // (a one-letter piece: step 7's mask reads it)
      i += hit.length;
    }
    return out.length >= 2 ? out : null;
  }
  function dayAt(toks, i, ctxDays) {  // a single day word at i: {days: [readings], plural}
    var t = toks[i];
    if (!t || t.k !== 'word') return null;
    var w = t.v;
    if (w in DAY_WORDS) return {r: [DAY_WORDS[w]]};
    if (/s$/.test(w) && w.slice(0, -1) in DAY_WORDS && w.length > 4) return {r: [DAY_WORDS[w.slice(0, -1)]], plural: true};
    if (w in LETTER_DAYS && ctxDays) return {r: LETTER_DAYS[w], letter: true};
    return null;
  }
  function span(a, b) { var out = [], d = a; for (var n = 0; n < 7; n++) { out.push(d); if (d === b) break; d = (d + 1) % 7; } return out; }

  // ---------------------------------------------------------------- times
  function hm(h, m) { return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }
  function atom(t) {  // a number token as a time: {h, m, ap, h24} or null; digit runs are read elsewhere
    var v = t.v;
    if (t.mm != null) { var h = +v, m = +t.mm; if (h > 23 || m > 59) return null; return {h: h, m: m, ap: t.ap, h24: h > 12 || v[0] === '0' && v.length === 2 || !!t.h24m}; }
    if (v.length <= 2) { var hh = +v; if (hh > 24) return null; return {h: hh === 24 ? 0 : hh, m: 0, ap: t.ap, h24: hh > 12 || (v.length === 2 && v[0] === '0') || !!t.h24m}; }
    if (v.length === 4 && (v[0] === '0' || +v.slice(0, 2) > 12) && +v.slice(0, 2) < 24 && +v.slice(2) < 60) return {h: +v.slice(0, 2), m: +v.slice(2), ap: null, h24: true};
    return null;
  }
  function runReadings(v, ap) {  // a digit run with no separator: [{a, b}] (b null = start only)
    var out = [], q = function (m) { return m % 15 === 0; };
    if (v.length === 2) {
      var n = +v;
      if (n <= 12) out.push({a: {h: n, m: 0, ap: ap}, b: null});
      else if (n < 24) out.push({a: {h: n, m: 0, h24: true}, b: null});
      if (n > 12 && v[1] !== '0' && v[0] !== v[1]) out.push({a: {h: +v[0], m: 0}, b: {h: +v[1], m: 0, ap: ap}});  // "95": 9-5 ("13": 1-3)
      if (n >= 13 && n < 24) return out;  // asked when two
      if (n > 12) return out;
      return out;
    }
    if (v.length === 3) {
      if (q(+v.slice(1))) out.push({a: {h: +v[0], m: +v.slice(1), ap: ap}, b: null});  // "445": 4:45
      var h1 = +v.slice(0, 2), h2 = +v[2];
      if (h1 >= 10 && h1 <= 12 && h2 > 0) out.push({a: {h: h1, m: 0}, b: {h: h2, m: 0, ap: ap}});  // "117": 11-7
      if (h1 === 12 && out.length === 1) out.push({other: true});  // ("123": 12 to 3, or 1 to 23? asked)
      var h3 = +v[0], h4 = +v.slice(1);
      if (h3 > 0 && h4 >= 10 && h4 <= 12) out.push({a: {h: h3, m: 0}, b: {h: h4, m: 0, ap: ap}});  // "512": 5-12
      return out;
    }
    if (v.length === 4) {
      var a2 = +v.slice(0, 2), b2 = +v.slice(2);
      if ((v[0] === '0' || a2 > 12) && a2 < 24 && b2 < 60) return [{a: {h: a2, m: b2, h24: true}, b: null}];  // "1700"
      if (a2 <= 12 && q(b2)) out.push({a: {h: a2, m: b2, ap: ap}, b: null});  // "1030": 10:30
      if (+v[0] > 0 && q(+v.slice(1, 3)) && +v[3] > 0) out.push({a: {h: +v[0], m: +v.slice(1, 3)}, b: {h: +v[3], m: 0, ap: ap}});  // "4458": 4:45-8
      if (a2 >= 10 && a2 <= 12 && out.length === 1 && !out[0].b) out.push({other: true});  // ("1145": 11:45, or a range? asked)
      return out;
    }
    return out;
  }
  function mins(x) { return x.h * 60 + x.m; }
  function inHours(ctx, wd, a, b) {  // share of [a, b) minutes inside the business's hours that weekday (null: no hours)
    var h = ctx.hours && ctx.hours[wd];
    if (!h) return null;
    var o = +h[0].slice(0, 2) * 60 + +h[0].slice(3), c = +h[1].slice(0, 2) * 60 + +h[1].slice(3);
    if (c <= o) c += 1440;
    var lo = Math.max(a, o), hi = Math.min(b, c);
    return b > a ? Math.max(0, hi - lo) / (b - a) : 0;
  }
  // Every AM/PM reading of a start (and end), scored by the business's hours: [{s, e}] best first, or [] (impossible)
  function readTimes(ctx, wds, a, b) {
    function opts(x) {
      if (x.h24 || x.h > 12 || x.h === 0) return [x.h];
      if (x.ap === 'a') return [x.h % 12];
      if (x.ap === 'p') return [x.h % 12 + 12];
      return [x.h % 12, x.h % 12 + 12];
    }
    var out = [];
    opts(a).forEach(function (sh) {
      var s = sh * 60 + a.m;
      if (!b) { out.push({s: s, e: null}); return; }
      opts(b).forEach(function (eh) {
        var e = eh * 60 + b.m;
        if (e <= s) {
          if (!(ctx.allDay || (b.ap || a.ap) || b.h24)) return;  // overnight only at a 24/7 business or when a/p says so
          e += 1440;
        }
        if (e - s > 12 * 60 && !(b.ap && a.ap) && !(a.h24 && b.h24)) return;  // never a long shift from bare numbers
        out.push({s: s, e: e});
      });
    });
    var score = function (r) {
      var sc = 0, n = 0;
      (wds.length ? wds : [0, 1, 2, 3, 4, 5, 6]).forEach(function (wd) {
        var x = inHours(ctx, wd, r.s, r.e == null ? r.s + 60 : r.e);
        if (x != null) { sc += x; n++; }
      });
      return n ? sc / n : 0;
    };
    out.forEach(function (r) { r.score = score(r); });
    out.sort(function (x, y) { return y.score - x.score; });
    return out;
  }
  function fmtM(m) { m = ((m % 1440) + 1440) % 1440; return hm(Math.floor(m / 60), m % 60); }
  function say(m) { m = ((m % 1440) + 1440) % 1440; var h = Math.floor(m / 60), mm = m % 60; return (h % 12 || 12) + (mm ? ':' + (mm < 10 ? '0' : '') + mm : '') + (h < 12 ? 'a' : 'p'); }

  // ---------------------------------------------------------------- the parse
  function parse(text, ctx) {
    ctx = ctx || {};
    var res = {shifts: [], scope: 'this_week', ask: [], marks: [], notes: []};
    text = String(text || '').slice(0, 4000);
    if (!text.trim()) return res;
    var f = fold(text), raw = tokens(f);
    var ix = index(ctx), named = {};
    ix.people.forEach(function (x) { named[x.first] = 1; x.lastParts.forEach(function (w) { named[w] = 1; }); if (x.nick) named[x.nick] = 1; x.aliases.forEach(function (a) { named[a] = 1; }); });
    ix.removed.forEach(function (x) { named[x.first] = 1; });
    var persons = Object.assign({}, named);  // (people's names only)
    Object.keys(ix.roleWords).concat(Object.keys(ix.words)).forEach(function (w) { w.split(' ').forEach(function (p) { named[p] = 1; }); });  // ("Sauté", "Café")
    // a letter held down ("friiii", "okkk", "annna"): two of it if that's a word or someone here ("anna", "till"), else one
    // ("fri"); a word of one letter repeated ("xxxx") stays. Someone read so is said as assumed.
    raw.forEach(function (t) {
      if (t.k !== 'word' || !/([a-z])\1\1/.test(t.v) || /^([a-z])\1*$/.test(t.v)) return;
      var two = t.v.replace(/([a-z])\1{2,}/g, '$1$1'), one = t.v.replace(/([a-z])\1{2,}/g, '$1');
      var known = function (w) { return keyword(w, true) || w in named || w in EN_N || w in ES_N || w in REPLY_W || w in TEACH; };
      var was = t.v, pick = known(two) || !known(one) ? two : one;
      if (pick in persons && Object.keys(persons).some(function (pw) { return pw !== pick && pw.length >= 4 && near1(was, pw); })) { named[was] = persons[was] = 1; return; }  // (both are found by personAt: asked)
      t.v = pick;
      if (t.v in persons) t.said = '“' + text.slice(t.from, t.to) + '” read as “' + t.v + '”';
      if (was === t.v) delete t.said;
    });
    // step 6: what a pasted thread or table adds is left out (marked ignored), and dictation is read as what was meant
    var notSender = {};  // (a role or a shift word: "Server:", "Close:" start a list's line, never who sent it)
    Object.keys(ix.roleWords).concat(Object.keys(ix.words)).forEach(function (w) { notSender[w] = 1; w.split(' ').forEach(function (p) { notSender[p] = 1; }); });
    var pz = pasted(text, f, raw, named, ctx.chat, ix.people, notSender), sp = spoken(pz.toks, named, persons);
    raw = sp.toks;
    // (ctx.es: the reading the whole message had, when one of its lines is read again on its own). An accent counts in a
    // word that isn't anyone's name here ("Chloé", "José" don't make a message Spanish); ¿ and ¡ always do.
    esOn = typeof ctx.es === 'boolean' ? ctx.es : /[¿¡]/.test(text) || raw.some(function (t, n) {
      if (t.k !== 'word' || t.v in named) return false;
      if (/[áéíóúñ]/i.test(text.slice(t.from, t.to))) return true;
      if (t.v === 'a') return !!(raw[n - 1] && raw[n - 1].k === 'num' && raw[n + 1] && raw[n + 1].k === 'num');
      return t.v in ES_SIGNAL;
    });
    res.es = esOn;
    // (a shift word saved before it became one of the reading's own words: not a shift word now)
    enKept = {};
    for (var wk_ in ix.words) if (wk_ in EN_DAYS_W) enKept[wk_] = 1;  // (a "weekend" shift taught before Nov 2026 stays theirs)
    for (wk_ in ix.words) if (NEVER_SET[wk_] && !enKept[wk_] && (esOn || !(wk_ in ES_ONLY))) delete ix.words[wk_];
    var toks = esTimes(raw);
    var mark = function (t, state, why) { res.marks.push({from: t.from, to: t.to, state: state, why: why || ''}); };
    res.thread = pz.thread; res.chat = pz.chat;  // (a line read again on its own keeps the chat it was in: ctx.chat)
    pz.ign.forEach(function (g) { res.marks.push({from: g.from, to: g.to, state: 'ignored', why: g.why}); });
    if (pz.dups) res.notes.push(pz.dups === 1 ? 'A line typed twice: read once' : 'Lines typed twice: read once (' + pz.dups + ')');
    // a question, its options (best first) and, for each, the fix the panel applies when it's tapped: text edits
    // ([{from, to, text}] on what was typed: the answer becomes words, so it's seen, kept with the draft, undoable) or
    // {yes: key} for an answer words can't say (ctx.yes lists those already given). null: no one-tap answer.
    // The same question from several instructions is one question (batched): when its options are the same, a tap answers
    // every one of them (their edits together); otherwise the first one's answers are offered.
    // (stranger test 3: every question says which words it's about, `words`, as typed: the token(s) given, else the whole
    // part of the line it was asked for. The panel shows them before a question that doesn't already quote them)
    var aboutText = function (about) {
      var ts = about ? [].concat(about).filter(function (x) { return x && x.to != null; }) : insts[curN] && curN >= 0 ? insts[curN].toks : [];
      if (!ts.length) return '';
      var a = Math.min.apply(null, ts.map(function (x) { return x.from; })), b = Math.max.apply(null, ts.map(function (x) { return x.to; }));
      var w = text.slice(a, b).replace(/\s+/g, ' ').trim();
      return w.length > 40 ? w.slice(0, 39).trim() + '…' : w;
    };
    var ask = function (kind, q, options, fixes, about) {  // (answers the question, new or the one it joined)
      options = options || []; fixes = fixes || options.map(function () { return null; });
      var had = res.ask.filter(function (x) { return x.question === q; })[0], words = aboutText(about);
      if (!had) {  // (names: the options that are someone's saved name, shown as saved, never translated)
        had = {kind: kind, question: q, options: options, fixes: fixes, count: 1, inst: [curN], words: words,
               names: options.filter(function (o) { return ix.people.some(function (x) { return x.p.name === o; }); })};
        res.ask.push(had); return had;
      }
      had.count++; had.inst.push(curN);
      if (words && had.words !== words && had.words.split(' · ').indexOf(words) < 0) had.words = had.words ? had.words + ' · ' + words : words;
      if (had.options.join('|') !== options.join('|')) return had;
      had.fixes = had.fixes.map(function (f, i) { var g = fixes[i]; return Array.isArray(f) && Array.isArray(g) ? f.concat(g) : f && g && (f.yes || f.edits) ? f : null; });
      return had;
    };
    var curN = -1;  // (the instruction being read: for its questions, shifts and actions)
    res.actions = [];
    var yes = function (key) { return (ctx.yes || []).indexOf(key) >= 0; };
    var put = function (t, text) { return [{from: t.from, to: t.to, text: text}]; };
    var over = function (toks, text) {  // one edit over the tokens' whole stretch
      var a = Math.min.apply(null, toks.map(function (x) { return x.from; })), b = Math.max.apply(null, toks.map(function (x) { return x.to; }));
      return [{from: a, to: b, text: text}];
    };
    // what the hours on those weekdays came from: ctx.hoursFrom is 'slots', 'business' (the default), or {weekday: either}
    var hoursWord = function (wds) {
      var f = ctx.hoursFrom, kinds = (wds.length ? wds : [0, 1, 2, 3, 4, 5, 6]).map(function (wd) { return typeof f === 'object' && f ? f[wd] || 'slots' : f || 'business'; });
      var b = kinds.indexOf('business') >= 0, sl = kinds.indexOf('slots') >= 0;
      return b && sl ? 'business hours and shift times' : sl ? 'usual shift times' : 'business hours';
    };
    var plain = function (x) { return x.h + (x.m ? ':' + (x.m < 10 ? '0' : '') + x.m : ''); };
    // the shifts someone already has on a weekday (0 = Mon) in the open week (ctx.existing)
    var theirs = function (pid, d) { return (ctx.existing || []).filter(function (x) { return x.personId === pid && x.day === DAYS[d]; }); };
    // the line a place is on (0 = the first line), and who sent that line in a pasted chat (pz.senderAt)
    var nlAt = [0];  // (how many line ends come before each place)
    for (var c0 = 0; c0 < f.length; c0++) nlAt.push(nlAt[c0] + (f[c0] === '\n' ? 1 : 0));
    var lineOf = function (pos) { return nlAt[Math.min(pos, f.length)]; }, senderOf = function (t) { return pz.senderAt[lineOf(t.from)] || null; };
    // Instructions: a new one at each line, and at a person named after the current one has its days or times
    var insts = [], cur = null, lineStart = true;
    function fresh() { cur = {people: [], toks: [], dayToks: [], timeToks: [], later: false, unknown: [], standing: false, role: null, anyDay: false, anyTime: false, own0: -1, ownBad: false}; insts.push(cur); }
    // what a stretch of tokens holds: people, days, times, or anything else (a verb, an off word, an unknown word)
    function kinds(line, noPeople, afterDay) {
      var o = {people: false, day: false, time: false, other: false};
      for (var n = 0; n < line.length; n++) {
        var x = line[n];
        if (x.k === 'num') { o.time = true; continue; }
        if (x.k === 'sep' || x.k === 'other' || (x.k === 'punct' && x.v !== '*' && x.v !== '?')) continue;
        if (x.k !== 'word') { o.other = true; continue; }
        if (afterDay && ix.words[x.v] && (x.v in DAY_WORDS || x.v in LETTER_DAYS)) { o.time = true; continue; }  // ("manny" / "mon" / "M": the M shift)
        var pp = !noPeople && personAt(ix, line, n, true);
        // (a Spanish day's word that is someone's name is that person where the line reads it so: "fri" / "dom" / "11-7")
        if (pp && pp.how === 'name' && (!(x.v in DAY_WORDS) || pp.used >= 2 || mention(line, n) || (x.v in ES_DAYS && !(x.v in EN_DAYS)))) { o.people = true; n += pp.used - 1; continue; }
        var esd = esDaysAt(line, n, text);  // ("L-V", "fin de semana": its words together; an initial that starts "L-V" is the day)
        if (esd) { o.day = true; n += esd.used - 1; continue; }
        if (dayAt(line, n, true) || packedDays(x.v) || (/s$/.test(x.v) && x.v.slice(0, -1) in DAY_WORDS)) { o.day = true; continue; }
        if (pp) { o.people = true; n += pp.used - 1; continue; }
        if (ix.words[x.v]) { o.time = true; continue; }
        if (x.apw || ix.roleWords[x.v] || x.v in GLUE || x.v in RANGE_WORDS || x.v in STANDING) continue;
        o.other = true;
      }
      return o;
    }
    // (F-083) days then times twice ("mon 9-5 tue 10-6"), or times then days twice ("9-5 mon 10-6 tue"), with only a ",",
    // ";", "&", "+" or "and" between: the second group starts at i. Anything else between ("sorry", "not", a role) keeps
    // one part, as before; and so does anything after the second group on that person's part of the line (a role, "every
    // week", "except wed"), which said once would apply to only one of the groups (review of PR #110)
    var JOIN2 = {',': 1, ';': 1, '&': 1, '+': 1, and: 1, y: 1, n: 1};
    var isJoin = function (n) { var x = toks[n]; return !!x && (x.k === 'punct' || x.k === 'word') && x.v in JOIN2; };
    var isDayT = function (n) { var x = toks[n]; return !!x && x.k === 'word' && !t2word(x) && (x.v in DAY_WORDS || (x.v.length > 1 && !!packedDays(x.v))); };
    var isTimeT = function (n) { var x = toks[n]; return !!x && (x.k === 'num' || (x.k === 'word' && !!ix.words[x.v] && !(x.v in DAY_WORDS) && !(x.v in LETTER_DAYS))); };
    var t2word = function (x) { return x.v in ix.nameWords; };
    var dayRun = function (n) { var k = n, any = false; while (toks[k] && (isDayT(k) || toks[k].k === 'sep' || (toks[k].k === 'word' && toks[k].v in RANGE_WORDS) || (any && isJoin(k) && isDayT(k + 1)))) { if (isDayT(k)) any = true; k++; } return any ? k : -1; };
    var timeRun = function (n) { var k = n, any = false; while (toks[k] && (isTimeT(k) || toks[k].k === 'sep' || (toks[k].k === 'word' && toks[k].v in RANGE_WORDS))) { if (isTimeT(k)) any = true; k++; } return any ? k : -1; };
    var groupT = function (n) { var x = toks[n]; return isDayT(n) || isTimeT(n) || isJoin(n) || x.k === 'sep' || (x.k === 'word' && x.v in RANGE_WORDS); };
    // (worked out once, from the end: only days, times and joining words from k to the line's end, or to the next name)
    var restOk = [];
    for (var r0 = toks.length; r0 >= 0; r0--) {
      var x0 = toks[r0];
      restOk[r0] = !x0 || x0.k === 'nl' || (x0.k === 'word' && x0.v in ix.nameWords && !isDayT(r0) && !isTimeT(r0)) || (groupT(r0) && restOk[r0 + 1]);
    }
    function secondGroup(n) {
      var pv = n - 1;
      while (pv >= 0 && isJoin(pv)) pv--;
      if (pv < 0 || toks[pv].k === 'nl') return false;
      // (only days, times and joining words so far: "raul mon 9-5" or "raul 9-5 mon"; cur.own0, cur.ownBad: kept as the
      // tokens come, so a long paste costs no more than once over)
      if (cur.own0 < 0 || cur.ownBad || !restOk[n]) return false;
      var firstDay = isDayT(cur.own0), firstTime = isTimeT(cur.own0);
      if (firstDay && isDayT(n) && isTimeT(pv)) { var e = dayRun(n); return e > 0 && isTimeT(e); }
      if (firstTime && isTimeT(n) && isDayT(pv)) { var e2 = timeRun(n); return e2 > 0 && isDayT(e2); }
      return false;
    }
    fresh();
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i];
      if (t.k === 'nl') {
        lineStart = true;
        // a line that only corrects the one above ("*thu", "*12-7", "sorry 12-7", "i mean thu"): part of that one
        var nx0 = toks[i + 1], nx1 = toks[i + 2];
        if (cur.toks.length && cur.people.length && nx0 && ((nx0.k === 'punct' && nx0.v === '*' && nx1 && nx1.from === nx0.to && nx1.k !== 'nl')
            || (nx0.k === 'word' && (nx0.v in FIX_W || (nx0.v === 'i' && nx1 && nx1.k === 'word' && (nx1.v === 'mean' || nx1.v === 'meant'))
                || (nx0.v === 'mejor' && nx1 && nx1.k === 'word' && nx1.v === 'dicho'))))) {
          var line = [], q = i + 1;
          while (q < toks.length && toks[q].k !== 'nl') line.push(toks[q++]);
          if (!line.some(function (x, n) { return x.k === 'word' && personAt(ix, line, n, true); })) { lineStart = false; continue; }
        }
        // step 6, sent in pieces: a line with only what the one before lacks ("manny", then "m-f", then "11-7"; "m-f 11-7",
        // then "manny"; "manny m-f 11-7", then "and sat"; "no 12-7" correcting it) is read with it, and the panel says so
        var q2 = i + 1;
        while (q2 < toks.length && toks[q2].k === 'nl') q2++;
        var nextLine = [], after = [];
        while (q2 < toks.length && toks[q2].k !== 'nl') nextLine.push(toks[q2++]);
        while (q2 < toks.length && toks[q2].k === 'nl') q2++;
        while (q2 < toks.length && toks[q2].k !== 'nl') after.push(toks[q2++]);
        var after2 = [];
        while (q2 < toks.length && toks[q2].k === 'nl') q2++;
        while (q2 < toks.length && toks[q2].k !== 'nl') after2.push(toks[q2++]);
        // (never across two senders of a pasted chat: "Robert: manny" / "Jordan: sat 5-10" are two messages)
        if (cur.toks.length && nextLine.length && !cur.alone && senderOf(cur.toks[0]) === senderOf(nextLine[0])) {
          var A = kinds(cur.toks.filter(function (x) { return !cur.people.some(function (pp) { return pp.toks.indexOf(x) >= 0; }); }), true);
          A.people = cur.people.length > 0; A.other = A.other || !!cur.verb || !!cur.later;
          var B = kinds(nextLine, false, A.day), w0 = nextLine[0];
          var and0 = (w0.k === 'word' && (w0.v === 'and' || w0.v === 'y' || w0.v === 'n')) || (w0.k === 'punct' && (w0.v === '&' || w0.v === '+'));
          var no0 = w0.k === 'word' && w0.v === 'no' && nextLine.length > 1;
          var Bn = no0 ? kinds(nextLine.slice(1), false, A.day) : B;
          var fills = !A.other && !B.other && (A.people || A.day || A.time) && (B.people || B.day || B.time) && !(A.people && A.day && A.time)
            && !(A.people && B.people) && !(A.day && B.day) && !(A.time && B.time);
          var adds = !A.other && A.people && A.day && A.time && and0 && !B.other && B.day && !B.people && !B.time;  // ("and sat")
          var fixes = !A.other && A.people && no0 && !Bn.other && !Bn.people && (Bn.day !== Bn.time);  // ("no 12-7", "no thu")
          // (the line below has someone the piece would also finish: "manny 11-7" / "tue" / "anita 4-8")
          var C = fills && after.length ? kinds(after, false, B.day) : null;
          var D = C && after2.length ? kinds(after2, false, C.day) : null;
          var own = !!D && !D.other && !D.people && (!B.day || D.day) && (!B.time || D.time);  // (the line below has its own piece)
          var both = !!C && A.people && !C.other && C.people && !B.people && !(B.day && C.day) && !(B.time && C.time) && !own;
          if (both) { fresh(); cur.alone = text.slice(nextLine[0].from, nextLine[nextLine.length - 1].to).trim(); cur.near = insts.length - 2; continue; }
          if (fills || adds || fixes) { cur.pieces = (cur.pieces || 1) + 1; lineStart = !A.people; continue; }
        }
        if (cur.toks.length) fresh();
        continue;
      }
      // a change's verb ("move", "swap", "give", "clear") starts an instruction of its own after days or times
      var vb = t.k === 'swaparrow' || (t.k === 'word' && (t.v in MOVE_W || t.v in SWAP_W || t.v in COVER_W || t.v in GIVE_W || t.v === 'clear' || (esOn && (t.v in ES_ERASE || t.v === 'vacia'))));
      if (vb && t.k === 'word' && !(t.v in COVER_W) && cur.toks.length && (cur.anyDay || cur.anyTime)) fresh();
      if (vb) cur.verb = true;
      // ("eve por sam", "jordan for anita": "for" right after one person names the one they cover)
      if (t.k === 'word' && (t.v === 'por' || t.v === 'for') && cur.people.length === 1 && cur.people[0].toks[cur.people[0].toks.length - 1] === toks[i - 1]
          && personAt(ix, toks, i + 1, true)) cur.verb = true;
      // (a change names a second person: "give anita fri to jordan", "swap sam and will": never a new instruction, and a
      // name that is also a word, "will", counts after "and", "to", "for", "with" or the verb itself)
      var pv2 = toks[i - 1], joinW = cur.verb && cur.people.length === 1 && pv2 && (pv2.k === 'swaparrow' || (pv2.k === 'punct' && pv2.v === '&')
        || (pv2.k === 'word' && (pv2.v in {and: 1, n: 1, with: 1, to: 1, 'for': 1, y: 1, x: 1, por: 1, a: 1} || pv2.v in COVER_W || pv2.v in SWAP_W))
        || cur.people[0].toks[cur.people[0].toks.length - 1] === pv2);  // ("trade sam will thu")
      // (after a sentence's "." a name starts an instruction: the previous-token-is-punctuation test below does it)
      var andP = !!pv2 && cur.people.length && !(cur.anyDay || cur.anyTime) && (andWord(pv2) || (pv2.k === 'punct' && pv2.v === ','))
        && cur.people[cur.people.length - 1].toks.slice(-1)[0] === toks[i - 2];  // ("sam y will mon 11-7": two people)
      var startsName = !!(lineStart || !cur.people.length || (toks[i - 1] && toks[i - 1].k === 'punct') || joinW || andP);
      // (a name that is also a word, after the current person's days or times: theirs, asked; "Not a name" says otherwise)
      var midNew = !startsName && cur.people.length && (cur.anyDay || cur.anyTime) && !joinW && t.k === 'word' && !yes('word|' + t.v);
      var p = personAt(ix, toks, i, startsName, midNew);
      // (not the person already named: "eve sat eve" is Eve on Saturday evening)
      if (p && p.mid && cur.people.some(function (pp) { return !!pp.p.cands && pp.p.cands.some(function (x) { return p.cands.indexOf(x) >= 0; }); })) p = null;
      // (a Spanish day word that is someone's name, "Dom", "Mar": that person where a name starts, "sam and dom mon",
      // or with their surname)
      var esDayName = p && p.cands && p.how === 'name' && t.v in ES_DAYS && !(t.v in EN_DAYS);  // (personAt finds one only there)
      // (a first name that is a day's word, "Thu", "Sat", "Mo", "Mon", typed with the surname: that person, never the day)
      // (or with an "@" stuck before it, "@mo": the only way to write someone saved as just "Mo", and what the question's
      // tap writes for them)
      var fullName = p && p.cands && p.how === 'name' && (p.used >= 2 || mention(toks, i));
      if (p && (!(t.v in DAY_WORDS) || esDayName || fullName) && !(p.cands && p.how !== 'name' && dayAt(toks, i, true))) {
        if (cur.people.length && (cur.anyDay || cur.anyTime) && !joinW) fresh();
        if (toks[i - 1] && toks[i - 1].k === 'sep' && toks[i - 1].to === t.from) cur.later = true;  // ("-sam": take Sam off: a later step)
        if (p.mid) cur.midName = {tok: t, prev: insts[insts.length - 2]};
        cur.people.push({p: p, tok: t, toks: toks.slice(i, i + p.used)});
        for (var u = 0; u < p.used; u++) cur.toks.push(toks[i + u]);
        i += p.used - 1; lineStart = false; continue;
      }
      lineStart = false;
      // (stranger test 3, F-083: a second day-and-time group for the same people, "raul mon 9-5 tue 10-6" or "raul 9-5 mon
      // 10-6 tue", is its own part: Tuesday 10-6, never Monday's hours for Tuesday)
      if (cur.people.length && cur.anyDay && cur.anyTime && !cur.verb && !cur.later && secondGroup(i)) {
        var was = cur; fresh(); cur.people = was.people.slice(); cur.from = was; cur.anyDay = cur.anyTime = false;
      }
      cur.toks.push(t);
      if (cur.own0 < 0) cur.own0 = i;
      if (!groupT(i)) cur.ownBad = true;
      // (a day's word that is also someone's name here, alone where a name starts, "thu fri 11-7" with a Thu Nguyen: read
      // as the day, and asked: her, or Thursday?)
      var stuckSep = function (a, b) { return !!a && !!b && a.k === 'sep' && a.to === b.from && b.k === 'word' || !!a && !!b && b.k === 'sep' && a.to === b.from && a.k === 'word'; };
      if (p && p.cands && p.how === 'name' && p.used === 1 && t.v in EN_DAYS && !stuckSep(toks[i - 1], t) && !stuckSep(t, toks[i + 1])) t.dayName = p;  // ("mon-fri": only days)
      // (with the initial that tells two of them apart, "sat r fri 11-7" with Sat Ram and Sat Bhatia: Sat Ram, or Saturday
      // and Thursday? Asked the same way; her tap writes the whole name over both words)
      if (p && p.cands && p.how === 'initial' && t.v in EN_DAYS && toks[i + 1]) { t.dayName = p; t.dayNameTo = toks[i + 1].to; }
      // (a role's word that is also someone's surname, where a second person would be named: "hoang, cook wed-sat" or
      // "cook and hoang" with a Deborah Cook here: her, or the role? Asked. "hoang cook wed-sat" is the role, as ever)
      if (!p && t.k === 'word' && ix.roleWords[t.v]) {
        var joinT = function (x) { return andWord(x) || (!!x && x.k === 'punct' && x.v === ','); };
        var lastP = cur.people.length ? cur.people[cur.people.length - 1].toks.slice(-1)[0] : null;
        // (first on its line, "cook & hoang": "sam cook, anita host" and "sam fri 11-7 cook, anita sat" are roles)
        var nextP = null;
        var side = joinT(toks[i - 1]) && lastP && lastP === toks[i - 2] ? 'after'
          : !cur.people.length && !cur.anyDay && !cur.anyTime && joinT(toks[i + 1]) && (nextP = (personAt(ix, toks, i + 2, true) || {}).cands) ? 'before' : null;
        // (not about someone already named on the line: "deborah, cook wed-sat" is Deborah Cook as a cook; nor, before the
        // joining word, about the one person named after it: "cook and deborah")
        var sur = side ? ix.people.filter(function (x) { return x.lastParts.indexOf(t.v) >= 0 && !cur.people.some(function (pp) { return !!pp.p.cands && pp.p.cands.indexOf(x) >= 0; })
          && !(side === 'before' && nextP.length === 1 && nextP[0] === x); }) : [];
        if (sur.length) t.roleName = {cands: sur, side: side, join: side === 'after' ? toks[i - 1] : toks[i + 1], next: toks[i + 2]};
      }
      if (t.k === 'word' && (t.v in DAY_WORDS || packedDays(t.v) || (/s$/.test(t.v) && t.v.slice(0, -1) in DAY_WORDS) || esDaysAt(toks, i, text))) cur.anyDay = true;
      if (t.k === 'num' || (t.k === 'word' && ix.words[t.v])) cur.anyTime = true;
    }
    insts = insts.filter(function (x) { return x.toks.length || x.people.length; });

    insts.forEach(function (I, n) {
      I.n = n; curN = n;
      // (a piece that could finish the line above or start the line below: asked as such, its words waiting; it holds
      // only the two lines it could belong to, which wait for days or times of their own)
      if (I.alone) {
        I.toks.forEach(function (t) { mark(t, 'unknown', 'which line is it for?'); });
        ask('pieces', 'Which line is “' + I.alone + '” for: the one above it, or the one below?').inst.push(I.near, n + 1);
        return;
      }
      readInstruction(I);
    });
    // a name that is also a word, read as that person after someone else's days or times ("raul mon 9-5 will tue"): asked,
    // quoting the word; both parts wait (as the word, Raúl would have Tuesday too). One tap writes the whole name (then it's
    // theirs, unasked), the other says it isn't a name here (read as before: a word, or days)
    insts.forEach(function (I) {
      if (!I.midName) return;
      var mt = I.midName.tok, cands = I.people[0].p.cands || [];
      curN = I.n;
      ask('name_word', '“' + text.slice(mt.from, mt.to) + '”: ' + cands.map(function (x) { return x.p.name; }).join(', ') + ', or not a name?',
          cands.map(function (x) { return x.p.name; }).concat(['Not a name']),
          cands.map(function (x) { return put(mt, (x.lastParts.length ? '' : '@') + x.p.name); }).concat([{yes: 'word|' + mt.v}])).inst.push(I.midName.prev.n);
      var held = {}; held[I.n] = held[I.midName.prev.n] = 1;
      // (and the other groups of either part, "will tue 9-5 wed 10-6", "jordan mon 9-5 tue 10-6 sam off wed": as the word,
      // what follows would be the part before's)
      for (var grew = true; grew;) {
        grew = false;
        insts.forEach(function (J, k) { if (!held[k] && J.from && held[J.from.n]) { held[k] = 1; grew = true; } });
        insts.forEach(function (J, k) { if (J.from && held[k] && !held[J.from.n]) { held[J.from.n] = 1; grew = true; } });
      }
      var hold = function (sh) { if (held[sh.inst]) sh.ready = false; };
      res.shifts.forEach(hold); res.actions.forEach(hold);
    });
    // take-backs ("nvm", "scratch that"): the instruction they end, or (alone on a line) the one before, leaves the preview
    insts.forEach(function (I, n) {
      if (!I.undo) return;
      // ("nvm sam": the latest line about Sam; a take-back with days or times of its own: its own line)
      var named = I.people.length && !I.ownMore;
      var target = I.ownMore ? I : insts.slice(0, n).reverse().filter(function (x) {
        return !x.dropped && !(x.undo && !x.ownMore) && (!named || x.people.some(function (pp) { return I.people.some(function (qq) { return qq.p.cands && pp.p.cands && qq.p.cands[0].p === pp.p.cands[0].p; }); }));
      })[0];
      if (!target) {  // (asked, with one tap taking the words out: "never mind" alone)
        curN = n; ask('undo', 'Nothing before that to take back', ['Ignore it'], [I.toks.map(function (x) { return {from: x.from, to: x.to, text: ''}; })]); return;
      }
      // (with the other groups of its person's part, "jordan mon 9-5 tue 10-6" then "nvm": both days, as before the split)
      var chain = [target], grew = true;
      while (grew) {
        grew = false;
        insts.forEach(function (J) { if (chain.indexOf(J) < 0 && ((J.from && chain.indexOf(J.from) >= 0) || chain.some(function (K) { return K.from === J; }))) { chain.push(J); grew = true; } });
      }
      chain.forEach(function (J) { J.dropped = true; });
      var inChain = function (k) { return chain.some(function (J) { return J.n === k; }); };
      var gone = res.shifts.filter(function (sh) { return inChain(sh.inst); }).map(function (sh) { return sh.person.split(' ')[0] + ' ' + sh.days.join(', ') + (sh.start ? ' ' + say(+sh.start.slice(0, 2) * 60 + +sh.start.slice(3)) : '') + (sh.end ? '–' + say(+sh.end.slice(0, 2) * 60 + +sh.end.slice(3)) : ''); })
        .concat(res.actions.filter(function (a) { return inChain(a.inst); }).map(function (a) { return (a.person ? a.person.split(' ')[0] + ' ' : '') + a.type + ' ' + a.days.join(', '); }));
      res.actions.push({type: 'undo', ready: true, inst: n, removed: gone.join('; ')});
      res.notes.push('Taken back: ' + (gone.join('; ') || 'that line'));
    });
    var dropped = function (k) { return insts[k] && insts[k].dropped; };
    res.shifts = res.shifts.filter(function (sh) { return !dropped(sh.inst); });
    res.actions = res.actions.filter(function (a) { return a.type === 'undo' || !dropped(a.inst); });
    // (a piece's question goes when either line it could belong to is taken back: its choice no longer stands)
    res.ask = res.ask.filter(function (q) { return !(q.kind === 'pieces' ? q.inst.some(dropped) : q.inst.every(dropped)); });
    // the lines each instruction was read from: lines read together are one for the panel ("units"), and said so (unless
    // taken back: "manny" / "m-f" / "11-7" / "nvm" is only "Taken back")
    var textLines = text.split('\n');
    res.units = [];
    insts.forEach(function (I) {
      var ls = I.toks.map(function (x) { return lineOf(x.from); }), a = Math.min.apply(null, ls), b = Math.max.apply(null, ls);
      if (ls.length && b > a) res.units.push([a, b]);
      if (I.pieces && !I.dropped) {
        var parts = textLines.slice(a, b + 1).map(function (l) { return l.trim(); }).filter(function (l, k) { return ls.indexOf(a + k) >= 0 && l; });
        res.notes.push('Read together: ' + parts.map(function (l) { return '“' + l + '”'; }).join(' + '));
      }
    });
    // The message as a whole: a later-step word anywhere (a correction, "nvm", an exception) can change what came before,
    // and the same person twice on the same days is a contradiction: nothing is ready until it's settled.
    var held = insts.some(function (I) { return I.later && !I.dropped; });
    var seenDays = {};
    res.shifts.forEach(function (sh) {
      var k = sh.personId;
      if (seenDays[k] && sh.days.some(function (d) { return seenDays[k].indexOf(d) >= 0; })) {
        held = true; ask('contradiction', sh.person.split(' ')[0] + ' twice on the same day: replace, or add a second shift?', ['Replace', 'Add both']);
      }
      seenDays[k] = (seenDays[k] || []).concat(sh.days);
    });
    if (held) res.shifts.concat(res.actions).forEach(function (sh) { if (sh.type !== 'undo') sh.ready = false; });
    // the same person both working and off (or removed) on a day: asked
    res.actions.forEach(function (a) {
      if (a.type === 'undo') return;
      if (a.type === 'clear') {  // (a day cleared and a shift added or moved onto it: which?)
        var into = res.shifts.some(function (sh) { return sh.days.some(function (d) { return a.days.indexOf(d) >= 0; }); })
          || res.actions.some(function (b) { return b.type === 'move' && a.days.indexOf(b.to.day) >= 0; });
        if (into) {
          ask('contradiction', 'Clear ' + a.days.join(', ') + ' and add a shift there too? Type them one at a time.'); a.ready = false;
          res.shifts.forEach(function (sh) { if (sh.days.some(function (d) { return a.days.indexOf(d) >= 0; })) sh.ready = false; });
          res.actions.forEach(function (b) { if (b.type === 'move' && a.days.indexOf(b.to.day) >= 0) b.ready = false; });
        }
        return;
      }
      var ids = [a.personId, a.toId, a.otherId].filter(function (x) { return x != null; }), tDay = a.to && a.to.day ? a.days.concat([a.to.day]) : a.days;
      var hit = res.shifts.filter(function (sh) { return ids.indexOf(sh.personId) >= 0 && sh.days.some(function (d) { return tDay.indexOf(d) >= 0; }); })[0];
      if (hit) {
        if (hit.personId !== a.personId) { ask('contradiction', hit.person.split(' ')[0] + ': a new shift and a change on the same day. Type them one at a time.'); a.ready = false; hit.ready = false; return; }
        ask('contradiction', a.person.split(' ')[0] + (a.type === 'off' || a.type === 'remove' ? ' both working and ' + (a.type === 'off' ? 'off' : 'removed') + ' on the same day: which?'
                                                       : ': a new shift and a change on the same day. Type them one at a time.'));
        a.ready = false; res.shifts.forEach(function (sh) { if (sh.personId === a.personId) sh.ready = false; });
      }
    });

    function readInstruction(I) {
      var tk = I.toks.filter(function (t) { return I.people.every(function (pp) { return pp.toks.indexOf(t) < 0; }); });
      tk = tk.filter(function (t) { if (t.apw) mark(t, 'ok'); return !t.apw; });  // ("de la tarde", "y media": read with their time)
      var days = null, dayAmbig = null, times = null, timeAmbig = null, plural = false, standing = false, j, later = false, unknown = [], teach = [];
      // ("thu fri 11-7" with a Thu Nguyen here: Thu Nguyen, or Thursday? One tap writes her whole name ("@Mo" for someone
      // saved with no surname), the other the day's whole word; the line waits either way)
      var dayNamed = false, roleNamed = false;
      var dayNameAsk = function (t, d) {
        var cands = t.dayName.cands, dayW = [DAY_FULL[d], DAYS[d].toLowerCase()].filter(function (w) { return w !== t.v && !(w in named); })[0] || DAY_FULL[d];
        var cap = function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }, day = cap(DAY_FULL[d]), dayPut = put(t, dayW);
        // (the initial it covered, "sat r": a day's letter of one reading is that day too, "Saturday and Thursday", and the
        // tap writes both; "t", "s" or a letter that is no day keeps its own question after the tap)
        var iniW = t.dayNameTo ? text.slice(t.to, t.dayNameTo).trim().toLowerCase() : '';
        // (the same day's letter, "thu r", is that day once; a day's word that is someone's name here is written short)
        if ((LETTER_DAYS[iniW] || []).length === 1) {
          var d2 = LETTER_DAYS[iniW][0], dayW2 = [DAY_FULL[d2], DAYS[d2].toLowerCase()].filter(function (w) { return !(w in named); })[0] || DAY_FULL[d2];
          if (d2 !== d) day += ' and ' + cap(DAY_FULL[d2]);
          dayPut = [{from: t.from, to: t.dayNameTo, text: dayW + (d2 !== d ? ' ' + dayW2 : '')}];
        }
        return {t: t, q: cands.map(function (x) { return x.p.name; }).join(', ') + ', or ' + day + '?',
                opts: cands.map(function (x) { return [x.p.name, [{from: t.from, to: t.dayNameTo || t.to, text: (x.lastParts.length ? '' : '@') + x.p.name}]]; }).concat([[day, dayPut]])};  // (no surname to write: "@Mo")
      };
      // roles: "the server", "at the bar", "bartender"
      var roleTok = function (t) { return t.k === 'word' && !!ix.roleWords[t.v] && !(t.v in DAY_WORDS) && !(t.v in LETTER_DAYS) && !(t.v in RANGE_WORDS) && !packedEn(t.v); };
      var roleAsk = function (t, cands, asRole) {  // ("cook": Deborah Cook, or the role? Her tap writes her whole name)
        return {t: t, q: '“' + t.v + '”: ' + cands.map(function (x) { return x.p.name; }).join(', ') + ', or the role?',
                opts: cands.map(function (x) { return [x.p.name, put(t, x.p.name)]; }).concat([['The role', asRole]])};
      };
      // (never a day's letter, a packed day string or a range word: a role whose short code is "F" or "S" doesn't make
      // "m-f" or "s" a role)
      tk.forEach(function (t, ti) {
        // ("hoang, cook wed-sat" with a Deborah Cook here: her, or the role? One tap writes her whole name, the other takes
        // the "," or "and" out, "hoang cook wed-sat"; the line waits either way, as for a day's word that is a name)
        if (t.roleName && !dayAmbig) {
          var rn = t.roleName, word = text.slice(t.from, t.to);
          var asRole = rn.side === 'after' ? [{from: rn.join.from, to: t.to, text: (/\s/.test(text[rn.join.from - 1] || ' ') ? '' : ' ') + word}]
                                           : [{from: t.from, to: rn.next.from, text: word + ' '}];
          dayAmbig = roleAsk(t, rn.cands, asRole);
        }
        // (alone on its line with only days and times, "cook wed-sat 9-5" with a Deborah Cook: asked the same way (Robert,
        // Nov 5 2026), never read as her unasked; "the cook" is the role, which a line with no one is not yet: what the
        // role's tap writes. Not on lines about something else: "open shift cook fri", "clear cook wed")
        var isRole = roleTok(t), pv = tk[ti - 1];
        if (isRole && !t.roleName && !dayAmbig && !I.people.length && (I.anyDay || I.anyTime) && !(pv && pv.k === 'word' && pv.v in ARTICLE)) {
          var sur1 = ix.people.filter(function (x) { return x.lastParts.indexOf(t.v) >= 0; });
          if (sur1.length && tk.every(function (x, k) {  // (only days and times besides: "open shift" is an open shift)
            return x === t || x.k !== 'word' || !!dayAt(tk, k, true) || !!packedDays(x.v) || !!esDaysAt(tk, k, text) || x.v in RANGE_WORDS
              || x.v in ARTICLE || andWord(x) || x.v in {de: 1, del: 1, al: 1, hasta: 1, cada: 1, e: 1} || (GLUE[x.v] && x.v !== 'shift' && x.v !== 'shifts') || !!ix.words[x.v]; })) {
            var rw = text.slice(t.from, t.to), art = !esOn ? 'the' : /a$/i.test(rw) ? 'la' : 'el';
            roleNamed = true;
            dayAmbig = roleAsk(t, sur1, put(t, art + ' ' + rw));
          }
        }
        if (isRole) { I.role = ix.roleWords[t.v]; t.role = true; }
      });
      I.roleOf = null; var roleClash = false;  // (each person's role: settleRoles, below)
      var roleFor = function (pn) { return I.roleOf ? I.roleOf[pn] : I.role; };
      // the business's shift words: a code (or a word that is also a day's letter or name) only after a day of its own
      // ("mon M", "m c"); the same letter twice ("M M") is asked
      var glossToks = [], codeAmbig = null, codeOff = null;
      for (j = 0; j < tk.length; j++) {
        var g = tk[j];
        if (g.k !== 'word' || g.role) continue;
        var two = tk[j + 1] && tk[j + 1].k === 'word' && ix.words[g.v + ' ' + tk[j + 1].v], en = two || ix.words[g.v];
        if (!en) continue;
        if (g.v in DAY_WORDS || g.v in LETTER_DAYS) {
          var before = tk.slice(0, j).filter(function (x) { return x.k === 'word' && !x.gloss && (x.v in DAY_WORDS || x.v in LETTER_DAYS || packedDays(x.v)); });
          if (!before.length) continue;
          if (before.some(function (x) { return x.v === g.v; })) { codeAmbig = codeAmbig || {t: g, first: before.filter(function (x) { return x.v === g.v; })[0], en: en}; continue; }
        }
        if (en.code && g.v in LATER_SET) { codeOff = codeOff || {t: g, en: en}; continue; }  // ("o": the O shift, or off?)
        g.gloss = en; glossToks.push(g);
        if (two) { tk[j + 1].gloss = en; tk[j + 1].glossTail = true; j++; }
      }
      // step 4b: a correction ("11-7 no 12-7", "i mean 12-7", "wed thu fri sorry thu fri sat", "*thu", "12-7*", "wait 12"):
      // what comes after it replaces the same kind of thing before it (times, or days). Only one, and only where what it
      // replaces is plain; anything else is held or asked (never a guess).
      var corr = readCorrection();
      if (corr && corr.later) later = true;
      if (corr && corr.ask) { timeAmbig = corr.ask; times = {}; corr = null; }
      // "fri 5-10 not fri, sat", "wed 11-7 no thursday not wednesday": one day instead of the only day typed
      var dayFix = null;
      for (j = 1; j < tk.length && !corr; j++) {
        var f0 = tk[j], fx = function (k) { var d = tk[k] && tk[k].k === 'word' && dayAt(tk, k, true); return d && d.r.length === 1 ? d.r[0] : null; };
        if (f0.k !== 'word' || (f0.v !== 'not' && f0.v !== 'no')) continue;
        var pre = tk.slice(0, j).map(function (x, k) { return fx(k); }).filter(function (x) { return x != null; });
        if (pre.length !== 1 || tk.slice(0, j).some(function (x) { return x.k === 'word' && packedDays(x.v); })) continue;
        var art = function (k) { return tk[k] && tk[k].k === 'word' && tk[k].v in {el: 1, la: 1, the: 1} ? k + 1 : k; };  // ("no el jueves")
        var k1 = art(j + 1), X = fx(k1), k2 = art(tk[k1 + 1] && tk[k1 + 1].k === 'punct' && tk[k1 + 1].v === ',' ? k1 + 2 : k1 + 1), Y = fx(k2);
        if (f0.v === 'not' && X === pre[0] && Y != null && Y !== X) dayFix = {drop: X, add: Y, toks: tk.slice(j, k2 + 1), t: tk[k2]};
        var k3 = art(k1 + 2);  // "no thursday not wednesday", "no el jueves no el martes"
        if (f0.v === 'no' && X != null && X !== pre[0] && tk[k1 + 1] && (tk[k1 + 1].v === 'not' || tk[k1 + 1].v === 'no') && fx(k3) === pre[0]) dayFix = {drop: pre[0], add: X, toks: tk.slice(j, k3 + 1), t: tk[k1]};
        if (dayFix) {
          if (tk.slice(tk.indexOf(dayFix.toks[dayFix.toks.length - 1]) + 1).some(function (x) { return x.k === 'word' && dayAt(tk, tk.indexOf(x), true); })) { dayFix = null; continue; }
          dayFix.toks.forEach(function (x) { x.fix = true; mark(x, x === dayFix.t ? 'assumed' : 'ok', x === dayFix.t ? DAYS[dayFix.add] + ' instead of ' + DAYS[dayFix.drop] : ''); });
          tk.slice(0, j).forEach(function (x, k) { if (fx(k) === dayFix.drop) { x.old = true; mark(x, 'ignored', 'replaced by ' + DAYS[dayFix.add]); } });
          break;
        }
      }
      tk = tk.filter(function (x) { return !x.fix && !x.old; });
      // step 4: off, remove, exceptions, take-backs (only these clear forms; anything less clear stays a later step)
      var act = null, exceptAt = -1, actTok = null;
      for (j = 0; j < tk.length; j++) {
        var a = tk[j], n1 = tk[j + 1], v = a.k === 'word' && !a.role && !a.gloss ? a.v : null;
        if (!v) continue;
        var restEmpty = function (k) { return !tk.slice(k).some(function (x) { return x.k === 'word' || x.k === 'num'; }); };
        if (v in UNDO_W) { a.undo = true; I.undo = true; continue; }
        if ((v === 'scratch' || v === 'cancel' || v === 'del' || v === 'delete' || v === 'cancela' || v === 'borra') && n1 && n1.k === 'word' && (n1.v === 'that' || n1.v === 'eso')) { a.undo = n1.undo = true; I.undo = true; j++; continue; }
        if ((v === 'era' && n1 && n1.v === 'broma') || (v === 'mejor' && n1 && n1.v === 'no' && restEmpty(j + 2))) { a.undo = n1.undo = true; I.undo = true; j++; continue; }  // "era broma", "mejor no"
        if (v === 'no' && n1 && n1.v === 'mejor' && tk[j + 2] && tk[j + 2].v === 'no' && restEmpty(j + 3)) { a.undo = n1.undo = tk[j + 2].undo = true; I.undo = true; j += 2; continue; }
        if (v === 'no' && n1 && n1.k === 'word' && n1.v in NO_COME && I.people.length) {  // "sam no viene el martes"
          a.act = n1.act = true; act = act && act !== 'off' ? (act === 'remove' ? 'remove' : 'conflict') : 'off'; actTok = actTok || a; j++; continue;
        }
        if (v === 'falta' && I.people.length && I.people[0].tok.from < a.from) { a.act = true; act = act && act !== 'off' ? 'conflict' : 'off'; actTok = actTok || a; continue; }
        if ((v === 'actually' || v === 'no') && n1 && n1.k === 'word' && (n1.v === 'no' || n1.v === 'wait') && restEmpty(j + 2)) { a.undo = n1.undo = true; I.undo = true; j++; continue; }
        var nextDay = n1 && n1.k === 'word' && dayAt(tk, j + 1, true);
        if (v in EXCEPT_W || (v === 'but' && n1 && n1.k === 'word' && (n1.v === 'not' || nextDay)) || ((v === 'no' || v === 'not') && j > 0 && nextDay)) {
          a.except = true;
          if (v === 'but' && n1.v === 'not') { n1.except = true; j++; }
          if (exceptAt < 0) exceptAt = j;
          continue;
        }
        if (v === 'take' && tk.slice(j + 1).some(function (x) { return x.k === 'word' && x.v === 'off'; })) {
          a.act = true; tk.slice(j + 1).filter(function (x) { return x.k === 'word' && x.v === 'off'; })[0].act = true; act = 'remove'; actTok = actTok || a; continue;
        }
        // ("del" deletes only first: Spanish "del sábado" is "of"; "borra el sábado" with no one named clears the day)
        var esDel = v === 'del' && n1 && n1.k === 'word' && ((n1.v in ES_DAYS && !(n1.v in EN_DAYS)) || (dayAt(tk, j + 1, true) && tk[j + 2] && tk[j + 2].k === 'word' && tk[j + 2].v in {al: 1, a: 1}));
        if (v in REMOVE_W && !esDel && !(v in ES_ERASE && !I.people.length)) { a.act = true; act = act && act !== 'remove' ? 'conflict' : 'remove'; actTok = actTok || a; continue; }
        if (a.act) continue;
        var byDay = (tk[j - 1] && tk[j - 1].k === 'word' && dayAt(tk, j - 1, true)) || nextDay;
        if (v in OFF_W || (v in OFF_TYPO && byDay && I.people.length && !ix.words[v])) {  // (a business's code "O" is never off)
          a.act = true; a.typo = !(v in OFF_W); act = act && act !== 'off' ? (act === 'remove' ? 'remove' : 'conflict') : 'off'; actTok = actTok || a; continue;
        }
      }
      // step 4b: changes to shifts already in the schedule: a verb (or an arrow) says which. Only these clear forms; any
      // other mix is held (never a guess).
      var chg = null, cue = {};
      for (j = 0; j < tk.length; j++) {
        var c = tk[j], cv = c.k === 'word' && !c.role && !c.gloss && !c.act && !c.except && !c.undo ? c.v : null, kind = null;
        if (c.k === 'swaparrow') kind = 'swap';
        else if (c.k === 'arrow') { cue.arrow = cue.arrow || c; continue; }
        else if (!cv) continue;
        else if (cv in MOVE_W) kind = 'move';
        else if (cv in SWAP_W && !(tk[j + 1] && tk[j + 1].k === 'word' && tk[j + 1].v === 'that')) kind = 'swap';  // ("switch that to tue": later)
        else if (cv in COVER_W) kind = 'cover';
        else if (cv in GIVE_W) kind = 'give';
        else if ((cv === 'clear' || cv in ES_ERASE || cv === 'vacia') && !I.people.length && !tk.slice(0, j).some(function (x) { return x.k === 'word' || x.k === 'num'; })) kind = 'clear';
        else if (cv === 'mejor' && tk[j + 1] && (tk[j + 1].k === 'num' || (tk[j + 1].k === 'word' && tk[j + 1].v === 'a'))) { cue.instead = cue.instead || c; continue; }  // "mejor a las 6"
        else if ((cv === 'for' || cv === 'por') && I.people.length === 2 && I.people[0].tok.to <= c.from && c.to <= I.people[1].tok.from) kind = 'cover';  // "jordan for anita fri"
        else if (cv === 'instead') { cue.instead = cue.instead || c; continue; }
        else if (cv === 'extend' || cv === 'extended') { cue.extend = cue.extend || c; continue; }
        else continue;
        if (chg && chg !== kind) { chg = 'conflict'; break; }
        chg = kind; c.chg = true; cue.verb = cue.verb || c;
      }
      if (chg === 'move' && cue.verb.v in {cambia: 1, cambiar: 1} && I.people.length === 2) chg = 'swap';  // ("cambia sam x will jue")
      if (chg === 'conflict' || (chg && (act || exceptAt >= 0))) { later = true; chg = null; }
      // "move jordan sat to sun", "jordan sat>sun", "move priya sat 11-3 to sun 5-10": the day it's on, the day it goes
      // to; times between them say which shift, times after them its new times
      var mv = null;
      if (chg === 'move' || (!chg && cue.arrow && !act)) {
        for (j = 0; j < tk.length && !mv; j++) {
          var m0 = tk[j];
          if (!(m0.k === 'arrow' || (chg === 'move' && m0.k === 'word' && m0.v in {to: 1, into: 1, a: 1, al: 1}))) continue;
          var bk = j - 1, fw = j + 1;
          while (bk >= 0 && (tk[bk].k === 'num' || tk[bk].k === 'sep' || (tk[bk].k === 'word' && ((tk[bk].v in GLUE && GLUE[tk[bk].v]) || tk[bk].v in RANGE_WORDS)))) bk--;
          while (fw < tk.length && tk[fw].k === 'word' && tk[fw].v in {on: 1, the: 1, el: 1}) fw++;
          var dA = bk >= 0 && tk[bk].k === 'word' && dayAt(tk, bk, true), dB = tk[fw] && tk[fw].k === 'word' && dayAt(tk, fw, true);
          if (dA && dB && dA.r.length === 1 && dB.r.length === 1 && !dA.plural && !dB.plural) mv = {fromT: tk[bk], toT: tk[fw], at: m0, from: dA.r[0], to: dB.r[0], verb: chg === 'move'};
        }
        if (mv) {
          mv.fromT.mv = mv.toT.mv = true; mv.at.chg = mv.verb; mv.at.arrowMv = !mv.verb;
          mv.sel = tk.slice(tk.indexOf(mv.fromT) + 1, tk.indexOf(mv.at)).filter(function (x) { return x.k === 'num' || x.k === 'sep' || (x.k === 'word' && x.v in RANGE_WORDS); });
          mv.sel.forEach(function (x) { x.sel = true; });
          chg = 'move';
        } else if (chg === 'move') {  // "cambia a jordan al domingo", "move jordan to sun": no day it's on (their one shift this week, or asked)
          for (j = 0; j < tk.length && !mv; j++) {
            var m1 = tk[j], fw1 = j + 1;
            if (!(m1.k === 'word' && m1.v in {to: 1, a: 1, al: 1})) continue;
            if (m1.v === 'a' && I.people.some(function (pp) { return pp.tok.from >= m1.to && !I.toks.some(function (x) { return x.from >= m1.to && x.from < pp.tok.from; }); })) continue;
            while (fw1 < tk.length && tk[fw1].k === 'word' && tk[fw1].v in {on: 1, the: 1, el: 1}) fw1++;
            var dC = tk[fw1] && tk[fw1].k === 'word' && dayAt(tk, fw1, true);
            if (dC && dC.r.length === 1 && !dC.plural && !tk.slice(0, j).some(function (x, n) { return x.k === 'word' && dayAt(tk, n, true); })) {
              mv = {fromT: null, toT: tk[fw1], at: m1, from: null, to: dC.r[0], verb: true,
                    sel: tk.slice(0, j).filter(function (x) { return x.k === 'num' || x.k === 'sep' || (x.k === 'word' && x.v in RANGE_WORDS); })};
              mv.sel.forEach(function (x) { x.sel = true; });
              mv.toT.mv = m1.chg = true;
            }
          }
        }
      }
      if (chg === 'clear') tk.forEach(function (x) { if (x.k === 'word' && x.v in CLEAR_FILL) { x.chg = true; if (x.v === 'week') cue.week = true; } });
      // the two people of a swap or a cover: who gives the shift (from) and who takes it (to)
      var fromIx = null, toIx = null;
      if ((chg === 'cover' || chg === 'give' || chg === 'swap') && I.people.length === 2) {
        var vAt = cue.verb.from, before = I.people.map(function (pp) { return pp.tok.from < vAt; });
        var between = tk.filter(function (x) { return x.from > I.people[0].tok.to && x.to < I.people[1].tok.from; });
        if (chg === 'cover' && before[0] && !before[1]) { toIx = 0; fromIx = 1; }
        if (chg === 'give' && !before[0] && !before[1]) {
          var toW = between.filter(function (x) { return x.k === 'word' && x.v === 'to'; })[0];
          if (toW) { toW.chg = true; fromIx = 0; toIx = 1; }
        }
        if (chg === 'swap') between.forEach(function (x) { if (x.k === 'word' && x.v in {n: 1, and: 1, 'with': 1, y: 1, x: 1}) x.chg = true; });
        // ("cambia el turno de sam a will": give Sam's to Will, or swap? Only "y"/"x"/"con" between them is a swap)
        if (chg === 'swap' && cue.verb.v in {cambia: 1, cambiar: 1} && !between.some(function (x) { return x.k === 'word' && x.v in {y: 1, x: 1, con: 1, and: 1, n: 1, 'with': 1}; })) cue.cambiaAsk = true;
      }
      // days
      var dayList = [], k, plurals = [];
      var pushDay = function (x) { x.ex = exceptAt >= 0 && j > exceptAt; dayList.push(x); };  // (after an exception word: days left out)
      for (j = 0; j < tk.length; j++) {
        var t = tk[j];
        if (t.k !== 'word' || t.role || t.gloss || t.undo || t.except || t.act || t.mv || t.chg) continue;
        var d = dayAt(tk, j, true), pk = !d && packedDays(t.v);
        // ("sam sat sun 12-6" with no Sam on the team yet: a first word that only packs into days with a one-letter piece
        // and a vowel, before days said another way ("sat sun", "fin de semana"), is a name to ask about ("Who is sam?"),
        // not Saturday and Monday)
        if (pk && j === 0 && !I.people.length && pk.single && /[aeiouy]/.test(t.v)
            && tk.some(function (x, n) { return n > 0 && x.k === 'word' && (dayAt(tk, n, false) || packedDays(x.v) || esDaysAt(tk, n, text)); })) pk = null;
        if (pk) {
          t.day = true;
          if (pk.es) {  // "lmxjv", "lmmjv"; "lmv": martes or miércoles? asked
            var asT = pk.map(function (r) { return r[0]; }), asW = pk.map(function (r) { return r[r.length - 1]; });
            var esName = function (l) { return l.map(function (n) { return ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'][n]; }).join(' '); };
            var enName = function (l) { return l.map(function (n) { return DAYS[n]; }).join(', '); };
            if (pk.esAmb) dayAmbig = dayAmbig || {t: t, q: '“' + t.v + '”: which days?', opts: [[enName(asT), put(t, esName(asT))], [enName(asW), put(t, esName(asW))]]};
            pushDay({list: asT}); continue;
          }
          if (pk.length === 2 && (t.v === 'mf' || t.v === 'monfri')) { pushDay({range: [0, 4]}); continue; }
          if (pk.length === 2) {
            var dA = DAYS[pk[0][0]].toLowerCase(), dB = DAYS[pk[1][0]].toLowerCase(), one = pk[0].length === 1 && pk[1].length === 1;
            dayAmbig = dayAmbig || {t: t, q: 'Both days, or every day from one to the other?', opts: one ? [['Both days', put(t, dA + ' ' + dB)], [DAYS[pk[0][0]] + ' to ' + DAYS[pk[1][0]], put(t, dA + '-' + dB)]] : null};
            pushDay({list: pk.map(function (r) { return r[0]; })}); continue; }
          var amb = pk.filter(function (r) { return r.length > 1; });
          // "mtwthf": a t between m and w is Tuesday; an s on its own in a pack: ask
          pushDay({list: pk.map(function (r, n) { return r.length === 1 ? r[0] : r[0] === 1 ? (n > 0 && pk[n - 1][0] === 0 ? 1 : n + 1 < pk.length && pk[n + 1][0] === 2 ? 1 : (amb.ask = true, 1)) : (amb.ask = true, r[0]); })});
          if (amb.ask) dayAmbig = dayAmbig || {t: t, q: '“' + t.v + '”: which days?'};
          continue;
        }
        var e1_ = tk[j + 1], e2_ = tk[j + 2], ew = function (x, v) { return !!x && x.k === 'word' && (v === undefined || (typeof v === 'string' ? x.v === v : x.v in v)); };
        var esd = esDaysAt(tk, j, text);
        // (letters and "X" only where the word isn't a day already; "X" for one person, with no other day on the line)
        if (esd && (esd.kind === 'x' || (esd.kind === 'letters' && !esOn)) && d) esd = null;
        if (esd && esd.kind === 'x' && (I.people.length >= 2 || tk.some(function (y, n) { return y !== t && y.k === 'word' && (dayAt(tk, n, true) || packedDays(y.v)); }))) esd = null;
        if (esd) {
          tk.slice(j, j + esd.used).forEach(function (x) { x.day = true; });
          if (esd.kind === 'x') t.esX = true;
          if (esd.back) later = true;  // ("V-L": into next week)
          if (esd.plural) { plural = true; plurals.push(t.v === 'fines' || esd.used === 1 ? t : tk[j + 2]); if (t.v === 'fin') tk[j + 2].esFin = t; if (tk[j - 1] && ew(tk[j - 1], {los: 1, las: 1})) plurals[plurals.length - 1].esLos = tk[j - 1]; }
          pushDay(esd.range ? {range: esd.range} : {list: esd.list}); j += esd.used - 1; continue;
        }
        if (ew(t, {todas: 1, todos: 1}) && ew(e1_, {las: 1, los: 1}) && ew(e2_, {semanas: 1})) { t.chg = e1_.chg = e2_.chg = true; standing = true; j += 2; continue; }
        if (!d) continue;
        if (d.letter && !(t.v === 'm' || t.v === 'w' || t.v === 'f' || t.v === 'th' || t.v === 'r' || t.v === 't' || t.v === 's')) continue;
        t.day = true;
        if (t.dayName && d.r.length === 1) { dayNamed = true; dayAmbig = dayAmbig || dayNameAsk(t, d.r[0]); }
        // (a lone "M" in a Spanish message: lunes, or martes as in "L M X J V"? "m-f" is Monday to Friday)
        if (d.letter && t.v === 'm' && esOn && !(tk[j + 1] && tk[j + 1].k === 'sep') && !(tk[j - 1] && tk[j - 1].k === 'sep')) dayAmbig = dayAmbig || {t: t, q: '“M”: Monday (lunes), or Tuesday (martes)?', opts: [['Monday', put(t, 'lunes')], ['Tuesday', put(t, 'martes')]]};
        if (d.plural) { plural = true; plurals.push(t); }
        if (tk[j - 1] && tk[j - 1].k === 'word' && (tk[j - 1].v === 'los' || tk[j - 1].v === 'las') && !d.plural) { plural = true; plurals.push(t); t.esLos = tk[j - 1]; }  // "los viernes"
        else if (d.plural && tk[j - 1] && tk[j - 1].k === 'word' && (tk[j - 1].v === 'los' || tk[j - 1].v === 'las')) t.esLos = tk[j - 1];
        if (t.v === 'mar' && e1_ && e1_.k === 'num' && !e1_.mm && !e1_.ap && +e1_.v <= 31 && ((e2_ && e2_.k === 'num') || (!e2_ && tk.slice(0, j).some(function (x) { return x.k === 'num'; })))) later = true;
        if (t.v === 'mar') t.esMar = true;
        if (t.v === 'mar' && !esOn && I.people.length) dayAmbig = dayAmbig || {t: t, q: '“mar”: Tuesday (martes), or March?', opts: [['Tuesday', put(t, 'martes')]]};
        if (t.v === 'mar' && !I.people.length) dayAmbig = dayAmbig || {t: t, q: '“mar”: Tuesday (martes), or someone’s name?'};
        if (t.stuck) dayAmbig = dayAmbig || {t: t, q: '“' + tk[j - 1].v + t.v + '”: a day, or a typo?'};  // ("11-7m": Monday, or 7pm?)
        var pv0 = tk[j - 1], pv1 = tk[j - 2];
        if (pv0 && pv0.k === 'sep' && pv0.to === t.from && (!pv1 || !pv1.day)) {  // "m-f 11-7 -wed": an exception after days; else a later step
          if (dayList.length && exceptAt < 0) { pv0.except = true; exceptAt = tk.indexOf(pv0); } else later = true;
        }
        if (pv0 && pv0.k === 'word' && pv0.v === 'the' && pv1 && pv1.day) dayAmbig = dayAmbig || {t: pv0, q: '“the”: Tuesday, or just a word?'};
        // a range: day - day, day thru day, day to day, day 2 day
        var nx = tk[j + 1], nx2 = tk[j + 2];
        if (nx && (nx.k === 'sep' || (nx.k === 'word' && nx.v in RANGE_WORDS) || (nx.k === 'num' && nx.v === '2' && !nx.mm)) && nx2) {
          var d2 = dayAt(tk, j + 2, true);
          if (d2) {
            nx.day = true; tk[j + 2].day = true;
            if (d2.plural) { plural = true; plurals.push(tk[j + 2]); }
            var a0 = d.r.length > 1 ? null : d.r[0], b0 = d2.r.length > 1 ? null : d2.r[0];
            if (a0 == null && b0 != null) a0 = d.r.filter(function (x) { return x !== b0; })[0];  // ("t-f" is Tue-Fri)
            if (b0 == null && a0 != null) b0 = d2.r.filter(function (x) { return x > a0; })[0];
            if (a0 == null || b0 == null) dayAmbig = dayAmbig || {t: t, q: 'Which days?'};
            else if ((d.r.length > 1 || d2.r.length > 1) && d.r.concat(d2.r).some(function (x) { return [1, 3, 5, 6].indexOf(x) >= 0; }) && (d.r.length > 1 && d.r.filter(function (x) { return x !== b0; }).length > 1 || d2.r.length > 1 && d2.r.filter(function (x) { return x > a0; }).length > 1)) dayAmbig = dayAmbig || {t: t, q: 'Which days?'};
            if (a0 != null && b0 != null && b0 < a0) later = true;  // ("fri-mon": into next week, a later step)
            pushDay({range: [a0 == null ? 0 : a0, b0 == null ? 0 : b0]});
            j += 2; continue;
          }
        }
        if (d.r.length > 1) {
          // a lone t or s: settled by its neighbours in a list ("m t w"), else asked
          var prev = dayList.length && dayList[dayList.length - 1].list ? dayList[dayList.length - 1].list.slice(-1)[0] : null;
          var nextD = tk[j + 1] && dayAt(tk, j + 1, true);
          var pick = null;
          if (d.r[0] === 1 && (prev === 0 || (nextD && nextD.r.length === 1 && nextD.r[0] === 2))) pick = 1;
          // (only "m t w" settles it: "w t f" and "f s" are asked, Thursday or Saturday first)
          if (pick == null) {
            dayAmbig = dayAmbig || {t: t, q: '“' + t.v + '”: ' + (d.r[0] === 1 ? 'Tuesday or Thursday?' : 'Saturday or Sunday?'),
                                    opts: d.r[0] === 1 ? [['Tuesday', put(t, 'tue')], ['Thursday', put(t, 'thu')]] : [['Saturday', put(t, 'sat')], ['Sunday', put(t, 'sun')]]};
            pick = d.r[0];
          }
          pushDay({list: [pick]}); continue;
        }
        if (t.v === 'w' && !(tk[j - 1] && tk[j - 1].day) && !(tk[j + 1] && dayAt(tk, j + 1, true))) dayAmbig = dayAmbig || {t: t, q: '“w”: Wednesday, or “works”?', opts: [['Wednesday', put(t, 'wed')], ['“works”', put(t, 'works')]]};
        pushDay({list: [d.r[0]]});
      }
      var exDays = [];
      if (dayList.length) {
        var set = [];
        dayList.forEach(function (x) {
          (x.range ? span(x.range[0], x.range[1]) : x.list).forEach(function (n) {
            if (x.ex) { if (exDays.indexOf(n) < 0) exDays.push(n); } else if (set.indexOf(n) < 0) set.push(n);
          });
        });
        days = set.length ? set.sort(function (a, b) { return a - b; }) : null;
      }
      if (exceptAt >= 0) {  // "m-f except wed": those days come out; an exception that isn't one of them is asked
        var outside = exDays.filter(function (n) { return !days || days.indexOf(n) < 0; });
        if (!exDays.length) later = true;
        else if (!days || outside.length) dayAmbig = dayAmbig || {t: tk[exceptAt], q: (outside.length ? DAYS[outside[0]] + ' isn’t one of those days. ' : '') + 'Which days?'};
        else { days = days.filter(function (n) { return exDays.indexOf(n) < 0; }); if (!days.length) { days = null; dayAmbig = dayAmbig || {t: tk[exceptAt], q: 'Which days?'}; } }
      }
      if (dayFix) days = (days || []).filter(function (n) { return n !== dayFix.add; }).concat([dayFix.add]).sort(function (a, b) { return a - b; });
      if (corr && corr.askDays) dayAmbig = dayAmbig || corr.askDays;
      // a change of times on someone's shift: "instead" ("6 instead", "5-10 instead"), a new start ("start 6", "come in
      // at 4", "6-") or a new end ("til 11", "end at 9", "cut to 9", "extend ... to midnight"), on a day they work
      // (the one person meant: of two with that name, the one set up for the role typed, or the only one working those days)
      var c0s = I.people.length === 1 && I.people[0].p.cands ? meant(I.people[0].p.cands, days).cands : [];
      var pid0 = c0s.length === 1 ? c0s[0].p.id : null;
      var cueT = {};
      // ("instead of 5-11": what it was, to say which shift; never read as the new times)
      if (cue.instead && !chg && !act) { var io = tk[tk.indexOf(cue.instead) + 1]; if (io && io.k === 'word' && io.v === 'of') { io.chg = true; tk.slice(tk.indexOf(io) + 1).forEach(function (x) { if (x.k === 'num' || x.k === 'sep' || (x.k === 'word' && x.v in RANGE_WORDS)) x.sel = true; }); } }
      if (!chg && !act && exceptAt < 0 && I.people.length === 1 && days && !glossToks.length && !tk.some(function (x) { return x.k === 'word' && !x.day && x.v in STANDING; })) {  // ("every day": a day)
        for (j = 0; j < tk.length; j++) {
          var e0 = tk[j];
          if (e0.k !== 'word' || e0.role || e0.gloss) continue;
          var nxt = j + 1;
          while (nxt < j + 3 && tk[nxt] && tk[nxt].k === 'word' && tk[nxt].v in {at: 1, to: 1, a: 1, las: 1, la: 1}) nxt++;  // ("start at 6", "a las 6")
          var tg = tk[nxt];
          if (!tg || !(tg.k === 'num' || (tg.k === 'word' && (tg.v === 'midnight' || tg.v === 'noon')))) continue;
          var cueW = tk.slice(j, nxt), pv3 = tk[j - 1];
          if (!cueT.start && (e0.v in START_W || (e0.v === 'in' && pv3 && pv3.k === 'word' && pv3.v === 'come'))) {
            cueT.start = tg; cueT.words = (cueT.words || []).concat(cueW, e0.v === 'in' ? [pv3] : []);
          } else if (!cueT.end && ((e0.v in END_W && (esOn || !(e0.v in ES_ONLY))) || (e0.v === 'to' && cue.extend)) && !(pv3 && pv3.k === 'num' && pv3 !== cueT.start)) {
            cueT.end = tg; cueT.words = (cueT.words || []).concat(cueW);
          }
        }
        // "6 instead", "6-": one time on its own is the new start
        var nums = tk.filter(function (x) { return (x.k === 'num' && !x.sel) || x === cueT.end || x === cueT.start; });
        if (!cueT.start && !cueT.end && nums.length === 1 && !(tk[tk.indexOf(nums[0]) + 1] && tk[tk.indexOf(nums[0]) + 1].k === 'word' && tk[tk.indexOf(nums[0]) + 1].v in RANGE_WORDS)) {
          var aft = tk[tk.indexOf(nums[0]) + 1], aft2 = tk[tk.indexOf(nums[0]) + 2];
          // ("6-" with nothing after it; never "4-close", a shift word's end)
          var bare = aft && aft.k === 'sep' && aft.from === nums[0].to && !(aft2 && (aft2.k === 'num' || aft2.gloss || (aft2.k === 'word' && aft2.v in TEACH)));
          if (!glossToks.length && (cue.instead || bare)) { cueT.start = nums[0]; cueT.trail = aft && aft.k === 'sep' ? aft : null; }
        }
        var some = days.filter(function (n) { return pid0 != null && theirs(pid0, n).length; });
        if (cue.instead || ((cueT.start || cueT.end || cue.extend) && some.length)) {
          chg = 'time';
          if (pid0 == null) later = true;
          if (cue.instead) cue.instead.chg = true;
          if (cue.extend) cue.extend.chg = true;
          (cueT.words || []).forEach(function (x) { if (x !== cueT.start && x !== cueT.end) x.chg = true; });
          if (cueT.trail) cueT.trail.chg = true;
          [cueT.start, cueT.end].forEach(function (x) { if (x) x.cueT = true; });
        } else if (cueT.end && !cueT.start) {  // "anita wed til 9" with no shift that day: from when?
          cueT.end.time = true; (cueT.words || []).forEach(function (x) { x.time = true; });
          timeAmbig = {t: cueT.end, q: 'From when?'}; times = {};
        } else cueT = {};
      }
      // times: the first time range (or start) in the instruction
      var wds = mv ? [mv.to] : days || [];
      var hm2 = function (v) { return +v.slice(0, 2) * 60 + +v.slice(3, 5); };
      var closeOf = function (wd) { var h = ctx.hours && ctx.hours[wd]; if (!h) return null; var o = hm2(h[0]), c = hm2(h[1]); return c <= o ? c + 1440 : c; };
      // a shift word's end on each day ("close": that day's closing time), after the start s: {wd: minutes}, or null
      // when a day's closing time isn't known
      var endsBy = function (en, s) {
        var out = {}, okAll = true;
        (wds.length ? wds : [0]).forEach(function (wd) {
          var e = en.end === 'close' ? closeOf(wd) : hm2(en.end);
          if (e == null) { okAll = false; return; }
          while (e <= s) e += 1440;
          out[wd] = e;
        });
        return okAll ? out : null;
      };
      var said = function (en) {
        var end = en.end === 'close' ? 'closing time' : en.end ? say(hm2(en.end)) : '';
        return '“' + en.word + '” = ' + (en.start && end ? say(hm2(en.start)) + '–' + end : en.start ? 'from ' + say(hm2(en.start)) : 'until ' + end) + ' (your shift words)';
      };
      var heads = glossToks.filter(function (x) { return !x.glossTail; }), g0 = heads[0], G = g0 && g0.gloss;
      if (heads.length > 1) {  // "mon O tue C wed M": a shift word for each day? one line each makes it plain (one tap)
        var dayHeads = tk.filter(function (x) { return x.day && x.k === 'word'; }), pairs = dayHeads.length === heads.length && heads.every(function (h, n) { return tk.indexOf(dayHeads[n]) < tk.indexOf(h) && (!dayHeads[n + 1] || tk.indexOf(h) < tk.indexOf(dayHeads[n + 1])); });
        var nm = I.people.length === 1 && I.people[0].toks.length ? I.people[0].toks.map(function (x) { return x.v; }).join(' ') : null;
        timeAmbig = {t: heads[1], q: 'A different shift word for each day?',
                     opts: pairs && nm ? [['Yes, one line each', dayHeads.slice(1).map(function (d) { return {from: d.from, to: d.from, text: '\n' + nm + ' '}; })]] : null};
        times = {}; heads.forEach(function (x) { x.time = true; }); G = null;
      }
      var numsTyped = tk.some(function (x) { return x.k === 'num' && !x.day; });
      var gi = g0 ? tk.indexOf(g0) + (tk[tk.indexOf(g0) + 1] && tk[tk.indexOf(g0) + 1].glossTail ? 2 : 1) : -1, gs = tk[gi], gn = tk[gi + 1];
      var toEnd = !!(G && gs && (gs.k === 'sep' || (gs.k === 'word' && gs.v in RANGE_WORDS)) && gn);
      if (G && G.start && (G.end || !numsTyped || toEnd)) {
        g0.time = true; glossToks.forEach(function (x) { x.time = true; });
        if (G.end && numsTyped) { timeAmbig = {t: g0, q: 'Which times: “' + G.word + '” or the ones typed?'}; times = {}; }
        else if (G.end) {
          var by = endsBy(G, hm2(G.start));
          if (!by) { timeAmbig = {t: g0, q: 'When do you close those days? (Set your business hours on Shift times.)'}; times = {}; }
          else times = {s: hm2(G.start), e: by[(wds.length ? wds : [0])[0]], byDay: by, assumed: said(G)};
        } else if (toEnd && gn.gloss && gn.gloss.end && !gn.gloss.start) {  // "open to close"
          var by2 = endsBy(gn.gloss, hm2(G.start));
          gs.time = gn.time = true;
          if (!by2) { timeAmbig = {t: g0, q: 'When do you close those days? (Set your business hours on Shift times.)'}; times = {}; }
          else times = {s: hm2(G.start), e: by2[(wds.length ? wds : [0])[0]], byDay: by2, assumed: said(G) + '; ' + said(gn.gloss)};
        } else if (toEnd && gn.k === 'num' && atom(gn)) {  // "open-3": the end is the first reading after the start, within 12 hours
          var s0 = hm2(G.start), ea = atom(gn), cands = (ea.ap || ea.h24 || ea.h > 12 ? [ea.ap === 'p' ? ea.h % 12 + 12 : ea.ap === 'a' ? ea.h % 12 : ea.h] : [ea.h % 12, ea.h % 12 + 12])
            .map(function (h) { var e = h * 60 + ea.m; while (e <= s0) e += 1440; return e; }).filter(function (e) { return e - s0 <= 720; });
          gs.time = gn.time = true;
          if (cands.length !== 1) { timeAmbig = {t: g0, q: 'Until when?'}; times = {}; }
          else times = {s: s0, e: cands[0], assumed: said(G), assumedAp: !(ea.ap || ea.h24)};
        } else if (!toEnd) {  // "open" alone: the business's own length, else Until when?
          times = {s: hm2(G.start), e: null, needEnd: true, assumed: said(G)};  // (asked, with the usual ends: not the default length)
        }
      }
      if (corr && corr.keepEnd && !times && !timeAmbig) {  // "11-7 wait 12": the new start (or end), the other one kept
        var K = corr.keepEnd, pa = atom(K.p), a0 = atom(K.a0), b0 = atom(K.b0), said0 = function (x) { return text.slice(x.from, x.to); };
        var rA = pa && a0 && b0 ? readTimes(ctx, wds, pa, b0) : [], rB = pa && a0 && b0 ? readTimes(ctx, wds, a0, pa) : [];
        var okA = rA.length && rA[0].e - rA[0].s >= 120, okB = rB.length && rB[0].e - rB[0].s >= 120;  // (a shift under 2 hours: not what was meant)
        K.p.time = true;
        var sepK = K.toks.filter(function (x) { return x.k !== 'num'; });
        if (okA !== okB) {
          var asStart = !!okA, gone = asStart ? K.a0 : K.b0, kept = asStart ? K.b0 : K.a0;
          times = asStart ? pickTimes(rA, K.p, pa, b0) : pickTimes(rB, K.p, a0, pa);
          var why0 = '“' + said0(K.p) + '” is the new ' + (asStart ? 'start' : 'end') + '; the ' + (asStart ? 'end' : 'start') + ' stays ' + said0(kept);
          if (times && times.s != null && !times.pending) times.assumed = why0;
          mark(gone, 'ignored', 'replaced by the correction'); sepK.forEach(function (x) { mark(x, 'ignored'); }); mark(kept, 'assumed', why0);
          corr.mk.forEach(function (x) { mark(x, 'assumed', why0); });
        } else {
          K.toks.concat(corr.mk).forEach(function (x) { mark(x, 'ok'); });
          timeAmbig = !okA ? {t: K.p, q: 'What times?'}
            : {t: K.p, q: 'Start at ' + said0(K.p) + ', or end at ' + said0(K.p) + '?',
               opts: [['Start at ' + said0(K.p) + ' (' + plain(pa) + '–' + plain(b0) + ')', put(K.p, plain(pa) + '-' + plain(b0))],
                      ['End at ' + said0(K.p) + ' (' + plain(a0) + '–' + plain(pa) + ')', put(K.p, plain(a0) + '-' + plain(pa))]]};
          times = {};
        }
      }
      for (j = 0; j < tk.length && !times && !timeAmbig; j++) {
        var t1 = tk[j];
        if (t1.k !== 'num' || t1.day || t1.sel || t1.cueT) continue;
        var a1 = atom(t1), sepT = tk[j + 1], t2 = tk[j + 2];
        // "4 45": a spaced quarter is the minutes
        if (a1 && !t1.mm && !t1.ap && sepT && sepT.k === 'num' && /^(15|30|45)$/.test(sepT.v) && !sepT.mm && sepT.from - t1.to <= 1 && t1.v.length <= 2) {
          a1 = {h: +t1.v, m: +sepT.v, ap: sepT.ap}; sepT.used = true; sepT = tk[j + 2]; t2 = tk[j + 3]; j++;
        }
        // ("11a 7p": two times, each with am or pm, side by side are a range)
        if (sepT && sepT.k === 'num' && t1.ap && sepT.ap && (!t2 || t2.k !== 'num')) { t2 = sepT; sepT = {k: 'sep', v: '', from: t1.to, to: t1.to, virtual: true}; }
        var isSep = sepT && (sepT.k === 'sep' || (sepT.k === 'word' && sepT.v in RANGE_WORDS) || (sepT.k === 'num' && sepT.v === '2' && t2 && t2.k === 'num'));
        if (isSep && t2 && t2.k === 'num') {
          var a2t = atom(t2), next = tk[tk.indexOf(t2) + 1];
          if (a2t && !t2.mm && !t2.ap && next && next.k === 'num' && /^(15|30|45)$/.test(next.v) && next.from - t2.to <= 1) { a2t = {h: +t2.v, m: +next.v, ap: next.ap}; next.used = true; }
          if (!a1) { var rr = runReadings(t1.v, t1.ap).filter(function (x) { return !x.b; }); if (rr.length === 1) a1 = rr[0].a; }
          if (!a2t) { var r2 = runReadings(t2.v, t2.ap).filter(function (x) { return !x.b; }); if (r2.length === 1) a2t = r2[0].a; }
          t1.time = sepT.time = t2.time = true;
          if (!a1 || !a2t) { timeAmbig = {t: t1, q: 'What times?'}; times = {}; break; }
          // ("5-10pm" is 5pm; "6-9am", "de 6 a 9 de la mañana" 6am: a start before a morning end is morning too)
          if (!a1.ap && a2t.ap && !a1.h24) a1 = {h: a1.h, m: a1.m, ap: a2t.ap === 'p' && a1.h <= a2t.h % 12 && a1.h !== 12 ? 'p' : a2t.ap === 'a' && a1.h % 12 < a2t.h % 12 && a1.h !== 12 ? 'a' : null, h24: a1.h24, inf: true};
          if (a1.h % 12 === a2t.h % 12 && a1.m === a2t.m) { timeAmbig = {t: t1, q: say(mins(a1) % 720 + 0) + ' to ' + say(mins(a2t) % 720 + 720) + ', or 24 hours?'}; times = {}; break; }
          var rd = readTimes(ctx, wds, a1, a2t);
          times = pickTimes(rd, t1, a1, a2t);
          break;
        }
        if (isSep && (!t2 || t2.k !== 'num')) {  // "11-": a start only
          if (sepT.k === 'sep') sepT.time = true;
          if (a1 && t2 && t2.gloss && t2.gloss.end && !t2.gloss.start) {  // "4-close", "4 til close": the start, and the word's end
            t1.time = sepT.time = t2.time = true;
            var e0 = endsBy(t2.gloss, 0), w0 = (wds.length ? wds : [0])[0];
            if (!e0) { timeAmbig = {t: t2, q: 'When do you close those days? (Set your business hours on Shift times.)'}; times = {}; break; }
            var eh = e0[w0] % 1440;
            times = pickTimes(readTimes(ctx, wds, a1, {h: Math.floor(eh / 60), m: eh % 60, h24: true}), t1, a1, {h24: true});
            if (times && times.s != null && !times.pending) {
              times.byDay = endsBy(t2.gloss, times.s); times.e = times.byDay[w0]; times.assumed = said(t2.gloss); times.assumedAp = !(a1.ap || a1.h24);
            }
            break;
          }
        }
        if (a1 && !(t1.v.length > 2 && !t1.mm && !atom(t1))) {
          t1.time = true;
          if (a1.h === 12 && !a1.ap && !a1.m) { timeAmbig = {t: t1, q: '“12”: noon or midnight? And until when?', opts: [['Noon', put(t1, '12p')], ['Midnight', put(t1, '12a')]]}; times = {}; break; }
          times = pickTimes(readTimes(ctx, wds, a1, null), t1, a1, null, (tk[j + 1] && tk[j + 1].k === 'punct' && tk[j + 1].v === '?') || (tk[j + 2] && tk[j + 2].k === 'punct' && tk[j + 2].v === '?'));
          break;
        }
        var runs = runReadings(t1.v, t1.ap);
        t1.time = true;
        if (!runs.length) { timeAmbig = {t: t1, q: '“' + t1.v + '”: what times?'}; times = {}; break; }
        if (runs.length > 1) {
          timeAmbig = {t: t1, q: '“' + t1.v + '”: ' + runs.map(function (x) { return x.other ? 'something else' : x.b ? say(mins(x.a)) + '–' + say(mins(x.b)) : 'start ' + say(mins(x.a)); }).join(' or ') + '?',
                       opts: runs.filter(function (x) { return !x.other; }).map(function (x) {  // (the digits split; AM/PM is then read as usual)
                         var txt = x.b ? plain(x.a) + '-' + plain(x.b) : plain(x.a);
                         return [x.b ? txt : 'Starts ' + txt, put(t1, txt + (t1.ap && !x.b ? t1.ap : ''))];
                       })};
          times = {}; break;
        }
        times = pickTimes(readTimes(ctx, wds, runs[0].a, runs[0].b), t1, runs[0].a, runs[0].b);
        if (times) times.assumed = '“' + t1.v + '” read as ' + (runs[0].b ? 'a range' : 'a time');
        break;
      }
      // A change to shifts already in the schedule (move, swap, cover/give, new times, clear): an action, ready only when
      // everything in it is plain; anything else is asked, said, or held.
      function changes() {
        if (teach.length && !later) ask('teach', 'What times is “' + teach[0].v + '” at your business? Add it to your shift words on Shift times, then type it again.');
        if (unknown.length && !later && !whois) ask('unknown', 'What does “' + unknown.map(function (t) { return t.v; }).join(' ') + '” mean here?', ['Ignore it'],
                                                    [unknown.map(function (t) { return {from: t.from, to: t.to, text: ''}; })]);
        var nm = function (p) { return p.name.split(' ')[0]; };
        var mm = function (x) { var s = hm2(x.start), e = x.end ? hm2(x.end) : null; if (e != null && e <= s) e += 1440; return {s: s, e: e}; };
        var spanOf = function (x) { var m = mm(x); return say(m.s) + (m.e != null ? '–' + say(m.e) : ''); };
        var out = function (a) {
          a.inst = I.n;
          a.ready = !later && !unknown.length && !teach.length && !dayAmbig && !timeAmbig && !todayAsk && !scopeOpen
            && (chg === 'clear' || (who.length > 0 && who.every(Boolean))) && !(times && (times.pending || (times.s != null && times.e == null)));
          res.actions.push(a);
        };
        // the times typed to say which shift ("move priya sat 11-3 to sun", "instead of 5-11")
        var selMatch = function (list, sel, n) {
          var ns = sel.filter(function (x) { return x.k === 'num'; });
          if (!ns.length) return list;
          var a = atom(ns[0]), b = ns[1] ? atom(ns[1]) : null;
          if (!a || (ns[1] && !b)) return [];
          var rd = readTimes(ctx, [n], a, b);
          return list.filter(function (x) { return rd.some(function (r) { return fmtM(r.s) === x.start && (r.e == null || fmtM(r.e) === x.end); }); });
        };
        // the person's one shift that day (or a question, and null)
        var pick = function (p, n, verb, sel, fix) {
          var list = theirs(p.id, n);
          if (sel && sel.length) {
            var m = selMatch(list, sel, n);
            if (!m.length && list.length) { ask('nothing', nm(p) + '’s ' + DAYS[n] + (list.length > 1 ? ' shifts are ' : ' shift is ') + list.map(spanOf).join(' and ') + '.'); return null; }
            list = m;
          }
          if (!list.length) { ask('nothing', nm(p) + ' has no ' + DAYS[n] + ' shift to ' + verb + '.'); return null; }
          if (list.length > 1) {
            ask('which', nm(p) + ' has ' + list.length + ' shifts on ' + DAYS[n] + ': which one?', list.map(spanOf),
                list.map(function (x) { return fix ? fix(x) : null; }));
            return null;
          }
          return list[0];
        };
        var typed = times && times.s != null;
        if (chg === 'clear') {
          var bad = tk.some(function (x) { return !(x.chg || x.day || x.k === 'punct' || (x.k === 'word' && x.v in GLUE && GLUE[x.v])); });
          if (bad || typed || I.role) { ask('clear', 'To clear, type only days (“clear sun”) or “clear the week”.'); return; }
          var cd = days || (cue.week ? [0, 1, 2, 3, 4, 5, 6] : null);
          if (!cd) { ask('clear', 'Clear which day?'); return; }
          out({type: 'clear', person: null, personId: null, days: cd.map(function (n) { return DAYS[n]; })});
          return;
        }
        if (chg === 'move') {
          if (mv && !mv.verb) mark(mv.at, 'assumed', '“' + text.slice(mv.at.from, mv.at.to) + '” read as a move');
          if (!mv) { ask('move', 'Move it from which day to which? (“sat to sun”)'); return; }
          if (I.people.length !== 1) { ask('move', I.people.length ? 'Move one person’s shift at a time.' : 'Whose shift?'); return; }
          var p = who[0];
          if (!p) return;
          if (mv.from == null) {
            var wk = [0, 1, 2, 3, 4, 5, 6].filter(function (n) { return theirs(p.id, n).length; });
            if (wk.length !== 1 || theirs(p.id, wk[0]).length !== 1) { ask('move', wk.length ? 'Move ' + nm(p) + '’s shift from which day?' : nm(p) + ' has no shift this week to move.'); return; }
            mv.from = wk[0]; mark(mv.at, 'assumed', nm(p) + '’s only shift this week, ' + DAYS[wk[0]]);
            if (wi >= 0 && mv.from === wi && !yes('today|' + nowDay)) { ask('which_day', 'Today, or next ' + DAYS[wi] + '?', ['Today', 'Next week'], [{yes: 'today|' + nowDay}, null]); return; }
          }
          if (mv.from === mv.to) { ask('move', 'That’s the same day.'); return; }
          if (days) { ask('move', 'Move to one day at a time.'); return; }
          // (an arrow with no "move" may be a range, "mon->fri 11-7": with times after it, or no shift that day, asked)
          if (!mv.verb && (typed || !theirs(p.id, mv.from).length)) { ask('move', 'Move ' + nm(p) + '’s ' + DAYS[mv.from] + ' shift to ' + DAYS[mv.to] + ', or work ' + DAYS[mv.from] + ' through ' + DAYS[mv.to] + '?'); return; }
          var x = pick(p, mv.from, 'move', mv.sel, mv.sel.length ? null : function (y) { return [{from: mv.fromT.to, to: mv.fromT.to, text: ' ' + spanOf(y).replace('–', '-')}]; });
          if (!x) return;
          var to = {day: DAYS[mv.to], start: x.start, end: x.end};  // (to.times: new times typed; else the shift keeps its own)
          if (typed && (times.assumedEnd || times.e == null)) { if (times.assumedEnd) ask('until', 'Until when?'); return; }  // (never a length it wasn't)
          if (typed && !times.pending) { to.start = fmtM(times.s); to.end = fmtM(times.e); to.times = true; }
          out({type: 'move', person: p.name, personId: p.id, days: [DAYS[mv.from]], shift: x, to: to});
          return;
        }
        if (chg === 'swap') {
          if (I.people.length !== 2) { ask('swap', 'Swap whose shifts? Name both people.'); return; }
          if (cue.cambiaAsk) { ask('swap', 'Swap their shifts, or give one to the other? (“intercambia sam y will jue”)'); return; }
          if (!who[0] || !who[1]) return;
          if (who[0].id === who[1].id) { ask('swap', 'That’s the same person twice.'); return; }
          if (!days || days.length !== 1) { ask('swap', days ? 'Swap one day at a time.' : 'Swap which day?'); return; }
          if (typed) { ask('swap', 'A swap keeps both shifts as they are: change the times after.'); return; }
          var n = days[0], xa = pick(who[0], n, 'swap'), xb = xa && pick(who[1], n, 'swap');
          if (!xa || !xb) return;
          var A = mm(xa), B = mm(xb), Ae = A.e == null ? A.s + 1 : A.e, Be = B.e == null ? B.s + 1 : B.e;
          if (A.s < Be && B.s < Ae) {
            if (xa.start === xb.start && xa.end === xb.end && xa.role === xb.role) { res.notes.push(nm(who[0]) + ' and ' + nm(who[1]) + ' work the same ' + DAYS[n] + ' shift: no change'); return; }
            ask('swap', nm(who[0]) + '’s and ' + nm(who[1]) + '’s ' + DAYS[n] + ' shifts overlap, so they can’t be swapped by typing yet. Change them in the schedule.');
            return;
          }
          out({type: 'swap', person: who[0].name, personId: who[0].id, other: who[1].name, otherId: who[1].id, days: [DAYS[n]], shift: xa, otherShift: xb});
          return;
        }
        if (chg === 'cover' || chg === 'give') {
          if (I.people.length !== 2 || fromIx == null) { ask('cover', chg === 'give' ? 'Give whose shift to whom? (“give anita fri to jordan”)' : 'Who covers whom? (“jordan covers anita fri”)'); return; }
          var fr = who[fromIx], tw = who[toIx];
          if (!fr || !tw) return;
          if (fr.id === tw.id) { ask('cover', 'That’s the same person twice.'); return; }
          if (!days) { ask('cover', 'Which day?'); return; }
          if (typed) { ask('cover', 'Covering part of a shift isn’t something I can do yet: change it in the schedule.'); return; }
          var got = [];
          for (var q = 0; q < days.length; q++) { var y = pick(fr, days[q], 'cover'); if (!y) return; got.push(y); }
          out({type: 'reassign', person: fr.name, personId: fr.id, to: tw.name, toId: tw.id, days: days.map(function (n) { return DAYS[n]; }), shifts: got});
          return;
        }
        if (chg === 'time') {
          var pt = who[0], cueTok = cueT.start || cueT.end;
          var rows = pt ? newTimes(pt) : null;
          if (cueTok) [cueT.start, cueT.end].forEach(function (t) {
            if (!t) return;
            var w = rows && rows.length && !cueT.both ? '“' + text.slice(t.from, t.to) + '” is the new ' + (t === cueT.start ? 'start; the end stays ' + say(mm(rows[0].x).e) : 'end; the start stays ' + say(mm(rows[0].x).s))
              + (rows[0].why ? '; ' + rows[0].why : '') : '';
            mark(t, w ? 'assumed' : 'ok', w);
          });
          if (!rows) return;
          var same = rows.filter(function (r) { return fmtM(r.s) === r.x.start && fmtM(r.e) === r.x.end; });
          if (same.length) res.notes.push(nm(pt) + '’s ' + same.map(function (r) { return r.x.day; }).join(', ') + ' is already ' + say(same[0].s) + '–' + say(same[0].e) + ': no change');
          rows = rows.filter(function (r) { return same.indexOf(r) < 0; });
          if (!rows.length) return;
          out({type: 'change_time', person: pt.name, personId: pt.id, days: rows.map(function (r) { return r.x.day; }),
               shifts: rows.map(function (r) { return Object.assign({}, r.x, {to: {start: fmtM(r.s), end: fmtM(r.e)}}); })});
        }
        // the new times on each of the person's shifts those days: [{x, s, e, why}] or null (asked)
        function newTimes(pt) {
          var sel = tk.filter(function (x) { return x.sel; }), rows = [];
          var atomOf = function (t) {
            if (t.k === 'word') return t.v === 'midnight' ? {h: 0, m: 0, h24: true} : {h: 12, m: 0, ap: 'p'};
            var a = atom(t);
            if (a) return a;
            var rr = runReadings(t.v, t.ap).filter(function (y) { return !y.b; });
            return rr.length === 1 ? rr[0].a : null;
          };
          var H = function (m) { m = ((m % 1440) + 1440) % 1440; return {h: Math.floor(m / 60), m: m % 60, h24: true}; };
          cueT.both = !!(cueT.start && cueT.end);
          for (var q = 0; q < days.length; q++) {
            var n = days[q], x = pick(pt, n, 'change', sel);
            if (!x) return null;
            var X = mm(x), r;
            if (cueT.start || cueT.end) {
              var sa = cueT.start ? atomOf(cueT.start) : null, ea = cueT.end ? atomOf(cueT.end) : null;
              if ((cueT.start && !sa) || (cueT.end && !ea)) { ask('times', 'What time?'); return null; }
              if (!ea && X.e == null) { ask('times', nm(pt) + '’s ' + DAYS[n] + ' shift has no end time: type both times.'); return null; }
              var A = sa || H(X.s), B = ea || H(X.e), was = timeAmbig;
              r = pickTimes(readTimes(ctx, [n], A, B), cueT.start || cueT.end, A, B);
              if (timeAmbig !== was || !r || r.s == null || r.e == null || r.pending) {
                var ta = timeAmbig !== was ? timeAmbig : null, yesOnly = ta && ta.opts && ta.opts.every(function (o) { return o[1] && o[1].yes; });
                ask('times', (ta && ta.q) || 'What times?', yesOnly ? ta.opts.map(function (o) { return o[0]; }) : [], yesOnly ? ta.opts.map(function (o) { return o[1]; }) : []);
                return null;
              }
              if (r.e - r.s < 120 && !cueT.both) { ask('times', nm(pt) + '’s ' + DAYS[n] + ' would be ' + say(r.s) + '–' + say(r.e) + ', under 2 hours. Type both times to be sure.'); return null; }
              rows.push({x: x, s: r.s, e: r.e, why: r.assumedAp && (sa && !(sa.ap || sa.h24) || ea && !(ea.ap || ea.h24)) ? say(r.s) + '–' + say(r.e) + ', from your ' + hoursWord([n]) : ''});
            } else if (typed && times.e != null && !times.pending) rows.push({x: x, s: times.s, e: times.e});
            else { if (!typed) ask('times', 'What times?'); return null; }
          }
          return rows;
        }
      }
      // A correction in the instruction: {old: tokens it replaces, keepEnd?: {a0, b0, p} (a lone new time after a range:
      // the new start or the new end, settled in the times), askDays?} or {later: true} or null. Flags and marks the words.
      // Of the people a name could be: the one set up for the role typed, else (when onDays is given: a change to someone's
      // shift) the only one working those days ({cands, only: why, when it was the days})
      function meant(cands, onDays, pn) {
        var rl = pn == null ? I.role : roleFor(pn);
        if (cands.length > 1 && rl) {
          var byRole = cands.filter(function (x) { return x.p.roles.indexOf(rl.key) >= 0; });
          if (byRole.length === 1) cands = byRole;
        }
        if (cands.length > 1 && onDays) {
          var working = cands.filter(function (x) { return onDays.every(function (n) { return theirs(x.p.id, n).length; }); });
          if (working.length === 1) return {cands: working, only: 'the only ' + working[0].p.name.split(' ')[0] + ' working ' + onDays.map(function (n) { return DAYS[n]; }).join(', ')};
        }
        return {cands: cands, only: null};
      }
      function readCorrection() {
        var isNum = function (k) { return !!tk[k] && tk[k].k === 'num'; };
        var isDay = function (k) { var x = tk[k]; return !!x && x.k === 'word' && !x.role && !x.gloss && !!(dayAt(tk, k, true) || packedDays(x.v)); };
        var rng = function (x) { return !!x && (x.k === 'sep' || (x.k === 'word' && x.v in RANGE_WORDS)); };
        var mk = null, pre = null, post = null, k;
        for (k = 0; k < tk.length && !mk; k++) {
          var c0 = tk[k], c1 = tk[k + 1];
          if (c0.k === 'punct' && c0.v === '*') {
            if (c1 && c1.from === c0.to && (isNum(k + 1) || isDay(k + 1))) { mk = [c0]; pre = tk.slice(0, k); post = tk.slice(k + 1); }
            else if (k > 0 && tk[k - 1].to === c0.from && (isNum(k - 1) || isDay(k - 1))) {  // "12-7*": the value just before it
              var s = k - 1, num = isNum(s);
              if (rng(tk[s - 1]) && (num ? isNum(s - 2) : isDay(s - 2))) s -= 2;
              if (tk.slice(k + 1).some(function (x) { return x.k === 'word' || x.k === 'num'; })) return {later: true};
              mk = [c0]; pre = tk.slice(0, s); post = tk.slice(s, k);
            }
          } else if (c0.k === 'word' && !c0.role && !c0.gloss) {
            if (c0.v in FIX_W) mk = [c0];
            else if (c0.v === 'i' && c1 && c1.k === 'word' && (c1.v === 'mean' || c1.v === 'meant')) mk = [c0, c1];
            else if (c0.v === 'mean' || c0.v === 'meant' || c0.v === 'imean') mk = [c0];
            else if (c0.v === 'should' && c1 && c1.k === 'word' && c1.v === 'be') mk = [c0, c1];
            else if (c0.v === 'mejor' && c1 && c1.k === 'word' && c1.v === 'dicho') mk = [c0, c1];  // ("mejor dicho")
            else if (c0.v === 'mejor' && k > 0 && c1 && (c1.k === 'num' || (c1.k === 'word' && c1.v === 'a'))) mk = [c0];  // ("11-7 mejor 12-8")
            else if (c0.v === 'no' && k > 0 && c1 && c1.k === 'punct' && c1.v === ',' && (isNum(k + 2) || isDay(k + 2) || (tk[k + 2] && tk[k + 2].k === 'word' && tk[k + 2].v in {el: 1, la: 1} && isDay(k + 3)))) mk = [c0, c1];  // ("no, el jueves")
            else if (c0.v === 'no' && k > 0 && isNum(k + 1)) mk = [c0];
            if (mk) {
              var at = k;
              // ("no wait", "oh sorry", "that should be": the words just before it go with it)
              while (at > 0 && tk[at - 1].k === 'word' && tk[at - 1].v in {no: 1, oh: 1, ok: 1, okay: 1, that: 1, um: 1, uh: 1, sorry: 1, actually: 1, wait: 1}) mk.unshift(tk[--at]);
              pre = tk.slice(0, at); post = tk.slice(k + (mk[mk.length - 1] === c1 ? 2 : 1));
              if (c1 && c1.k === 'punct' && mk[mk.length - 1] === c1) c1.fix = true;
            }
          }
        }
        if (!mk) return null;
        var postNum = post.filter(function (x) { return x.k === 'num'; }), postDay = post.filter(function (x) { return isDay(tk.indexOf(x)); });
        if (!postNum.length && !postDay.length) return null;  // ("no wait" or "wait" at the end: a take-back, or asked)
        // ("sorry, manny mon 11-7": said before anything it could correct, it's only a word)
        if (!pre.some(function (x) { return x.k === 'num' || isDay(tk.indexOf(x)); }) && !I.people.some(function (pp) { return pp.tok.from < mk[0].from; })) {
          mk.forEach(function (x) { x.fix = true; mark(x, 'ignored'); });
          return null;
        }
        if (I.people.some(function (pp) { return pp.tok.from > mk[0].from; })) return {later: true};  // ("no not manny marcus")
        var filler = [];
        var odd = post.filter(function (x) {
          var kk = tk.indexOf(x);
          if (x.k === 'num' || isDay(kk) || x.role || (x.k === 'punct' && ',.!'.indexOf(x.v) >= 0)) return false;
          if (rng(x) && ((isNum(kk - 1) && isNum(kk + 1)) || (isDay(kk - 1) && isDay(kk + 1)) || (x.k === 'sep' && isNum(kk - 1)))) return false;
          if (x.k === 'word' && (x.v in FIX_FILL || (x.v in GLUE && GLUE[x.v]))) { filler.push(x); return false; }
          return true;
        });
        if (odd.length || pre.some(function (x) { return x.gloss; })) return {later: true};
        var timeT = [], dayT = [], groups = 0, many = 0;
        pre.forEach(function (x) {
          var kk = tk.indexOf(x);
          if (x.k === 'num') { timeT.push(x); if (!(rng(tk[kk - 1]) && isNum(kk - 2)) && !(isNum(kk - 1) && /^(15|30|45)$/.test(x.v))) groups++; }
          else if (rng(x) && isNum(kk - 1) && isNum(kk + 1)) timeT.push(x);
          else if (isDay(kk)) { dayT.push(x); many += packedDays(x.v) || (dayAt(tk, kk, true) || {r: []}).r.length > 1 ? 2 : 1; }
          else if (rng(x) && isDay(kk - 1) && isDay(kk + 1)) { dayT.push(x); many += 2; }
        });
        if (groups > 1 && postNum.length) return {later: true};  // ("mon 11-7 and tue 11-7 no tue 12-8": which one?)
        var out = {old: [], mk: mk};
        if (postNum.length && timeT.length) {
          var preNums = timeT.filter(function (x) { return x.k === 'num'; });
          var lone = postNum.length === 1 && !post.some(function (x) { return rng(x) && x.k !== 'word'; }) && !post.some(function (x) { return x.k === 'word' && x.v in RANGE_WORDS; });
          // ("m-f 11-7 no 12" in a week that has the 12th: a new start, or not on the 12th? asked)
          var pn = postNum[0], dom = lone && !pn.mm && !pn.ap && pn.v.length <= 2 && (ctx.week || []).some(function (d) { return d && +String(d).slice(8, 10) === +pn.v; });
          if (dom && mk[mk.length - 1].v === 'no') {
            var nth = +pn.v % 10 === 1 && +pn.v !== 11 ? 'st' : +pn.v % 10 === 2 && +pn.v !== 12 ? 'nd' : +pn.v % 10 === 3 && +pn.v !== 13 ? 'rd' : 'th';
            pre.concat(post).concat(mk).forEach(function (x) { if (x.k === 'num' || x.k === 'sep' || x === mk[mk.length - 1]) x.time = true; });
            return {ask: {t: pn, q: '“no ' + pn.v + '”: start at ' + pn.v + ' instead, or not on the ' + pn.v + nth + '?', opts: [['Start at ' + pn.v, put(mk[mk.length - 1], 'i mean')]]}};
          }
          if (lone && preNums.length === 2 && timeT.some(rng)) {
            out.keepEnd = {a0: preNums[0], b0: preNums[1], p: postNum[0], toks: timeT.slice()};  // (marked once it's placed)
            out.old = timeT.slice();
          } else out.old = timeT.slice();
        }
        if (postDay.length && dayT.length) {
          if (postDay.length === 1 && many > 1) out.askDays = {t: postDay[0], q: '“' + (mk[0].v === '*' ? '*' : '') + postDay[0].v + '” replaces which days?'};
          out.old = out.old.concat(dayT);
        }
        // ("will jue mejor a las 6": nothing typed before it to correct, so "instead" on the schedule's shift)
        if (!out.old.length && !out.keepEnd && mk.length === 1 && mk[0].v === 'mejor') return null;
        // ("mon no 12-7": a "no" with nothing before it to correct may be "not 12-7": held)
        if (!out.old.length && !out.keepEnd && mk.some(function (x) { return x.v === 'no'; })) return {later: true};
        var said = function (list) { var a = Math.min.apply(null, list.map(function (x) { return x.from; })), b = Math.max.apply(null, list.map(function (x) { return x.to; })); return text.slice(a, b); };
        var newer = post.filter(function (x) { return filler.indexOf(x) < 0 && !(x.k === 'punct'); });
        out.old.forEach(function (x) { x.old = true; if (!out.keepEnd || out.keepEnd.toks.indexOf(x) < 0) mark(x, 'ignored', 'replaced by the correction'); });
        filler.forEach(function (x) { x.fix = true; mark(x, 'ignored'); });
        mk.forEach(function (x) {
          x.fix = true;
          if (out.keepEnd) return;  // (said once the new time is placed: the start, or the end)
          mark(x, out.old.length ? 'assumed' : 'ignored', out.old.length ? '“' + said(newer) + '” replaces “' + said(out.old) + '”' : '');
        });
        return out;
      }
      function pickTimes(rd, tok, a, b, endAsked) {
        if (!rd.length) { timeAmbig = {t: tok, q: 'Those times can’t make a shift. What times?'}; return {}; }
        var best = rd[0], close = rd.filter(function (x) { return ctx.allDay || !ctx.hours || Math.abs(x.score - best.score) < 0.15; });
        // AM/PM (or 24-hour) typed for every time given: what the manager typed comes first (plan, "AM/PM resolution
        // order"); outside the usual hours is said, not asked (a soft check, as in the Builder)
        var typed = rd.length === 1 && ((a.ap && !a.inf) || a.h24) && (!b || b.ap || b.h24);
        var nightKey = best.e != null ? 'night|' + fmtM(best.s) + '|' + fmtM(best.e) : '';
        // (an overnight reading said yes to is added: typed so, or the only reading there is, "11 a medianoche")
        var saidYes = !!nightKey && yes(nightKey) && (typed || rd.length === 1);
        var night = best.e != null && best.e >= 1440 && !ctx.allDay && !saidYes;
        if (typed && !night && ctx.hours && !ctx.allDay && best.score < 0.5) res.notes.push(say(best.s) + (best.e != null ? '–' + say(best.e) : '') + ' is outside your ' + hoursWord(wds));
        // asked: two readings close together (or a 24/7 business, or no hours to tell by), a reading mostly outside the
        // business's hours (unless am/pm was typed: then it's said), and any overnight shift at a business that isn't open
        // all night, even typed so (the golden set: confirm, never silent)
        if (!saidYes && (close.length > 1 || (!typed && ctx.hours && !ctx.allDay && best.score < 0.5) || night)) {
          if (close.length < 2) close = rd.slice(0, 2);
          var lab = function (x) { return say(x.s) + (x.e != null ? '–' + say(x.e) : ''); };
          timeAmbig = {t: tok, q: close.map(lab).join(' or ') + '?', spanTimes: true,
                       opts: night && (typed || rd.length === 1) ? [['Yes, ' + lab(best) + ' overnight', {yes: nightKey}]]
                         : close.map(function (x) { return [lab(x), x.e != null ? say(x.s) + '-' + say(x.e) : say(x.s)]; })};
          return {s: best.s, e: best.e, pending: true};
        }
        if (best.e == null) {  // a start only: the business's own length, else asked
          if (endAsked || !ctx.defaultLen) return {s: best.s, e: null, needEnd: true};
          var e = best.s + Math.round(ctx.defaultLen * 60), late = (wds.length ? wds : [0]).some(function (wd) {
            // (an assumed end past midnight, or after that day's close: asked, never assumed)
            var h = ctx.hours && ctx.hours[wd], o, c;
            if (h) { o = +h[0].slice(0, 2) * 60 + +h[0].slice(3); c = +h[1].slice(0, 2) * 60 + +h[1].slice(3); if (c <= o) c += 1440; }
            return !ctx.allDay && (e >= 1440 || (!!h && e > c));
          });
          if (late) return {s: best.s, e: null, needEnd: true};
          return {s: best.s, e: e, assumedEnd: true, assumedAp: !(a.ap || a.h24)};
        }
        return {s: best.s, e: best.e, assumedAp: !(a.ap || a.h24) || !(b.ap || b.h24)};
      }
      // the rest: standing words, later-step words, unknown words, ignored glue
      var wkW = function (n, v) { return !!tk[n] && tk[n].k === 'word' && tk[n].v in v; }, THIS = {this: 1, esta: 1}, WEEK = {week: 1, semana: 1, weekend: 1, wknd: 1, wkend: 1};  // ("this weekend": this week's)
      tk.forEach(function (t, n) {
        if (t.cueT || t.arrowMv) return;  // (a change's new start or end, a move's arrow: marked with the change)
        if ((wkW(n, THIS) && wkW(n + 1, WEEK)) || (wkW(n, {just: 1, only: 1, solo: 1}) && wkW(n + 1, THIS) && wkW(n + 2, WEEK))) { mark(t, 'ok'); return; }
        if (t.day || t.time || t.used || t.role || t.gloss) return;
        if (t.chg || t.mv || t.sel) { mark(t, 'ok'); return; }
        if (t.undo || t.except || t.act) { mark(t, t.typo ? 'assumed' : 'ok', t.typo ? '“' + t.v + '” read as off' : ''); return; }
        if (t.k === 'word' && t.v in TEACH) { teach.push(t); mark(t, 'unknown', 'not one of your shift words yet'); return; }
        if (t.k === 'word') {
          if (t.v in STANDING) standing = true;
          if (t.v in LATER_SET && !(t.v in GLUE && GLUE[t.v])) { later = true; mark(t, 'unknown', 'not understood yet'); return; }
          if (t.v in GLUE) { mark(t, 'ignored'); return; }
          unknown.push(t); mark(t, 'unknown', 'not understood'); return;
        }
        if (t.k === 'num') { unknown.push(t); mark(t, 'unknown', 'not understood'); return; }
        if (t.k === 'punct' && (t.v === '*' || t.v === '?')) { later = true; mark(t, 'unknown', 'not understood yet'); return; }
        if (t.k === 'arrow' || t.k === 'swaparrow') { later = true; mark(t, 'unknown', 'not understood yet'); return; }
        if (t.k === 'other' && /❌|\u{1F6AB}|✖/u.test(t.v)) { later = true; mark(t, 'unknown', 'not understood yet'); return; }
        if (t.k === 'punct' && t.v === '@' && I.people.some(function (pp) { return pp.tok.from === t.to; })) { mark(t, 'ok'); return; }  // ("@mo": part of the name)
        mark(t, 'ignored');
      });
      // a time read one way of two is said, on the numbers themselves: never a silent guess (the standard)
      if (!times && !timeAmbig && G && G.end && !G.start) { timeAmbig = {t: g0, q: '“' + g0.v + '”: from when?'}; times = {}; g0.time = true; }  // ("anita closes fri")
      if (!times && !timeAmbig && g0) { g0.time = true; }
      if (codeOff) timeAmbig = timeAmbig || {t: codeOff.t, q: '“' + codeOff.t.v + '”: the “' + codeOff.en.word + '” shift, or off?'};
      if (codeAmbig) timeAmbig = timeAmbig || {t: codeAmbig.t, q: '“' + codeAmbig.first.v + ' ' + codeAmbig.t.v + '”: ' + DAYS[(dayAt(tk, tk.indexOf(codeAmbig.first), true) || {r: [0]}).r[0]] + ', “' + codeAmbig.en.word + '” shift?',
                                               opts: [[DAYS[(dayAt(tk, tk.indexOf(codeAmbig.first), true) || {r: [0]}).r[0]] + ', “' + codeAmbig.en.word + '”', put(codeAmbig.first, DAYS[(dayAt(tk, tk.indexOf(codeAmbig.first), true) || {r: [0]}).r[0]].toLowerCase())]]};
      var tWhy = [];
      if (times && times.s != null && !times.pending) {
        if (times.assumed) tWhy.push(times.assumed);
        if (times.assumedAp) tWhy.push(say(times.s) + (times.e != null ? '–' + say(times.e) : '') + ', from your ' + hoursWord(days || []));
        if (times.assumedEnd && times.e != null) tWhy.push('until ' + say(times.e) + ', your ' + ctx.defaultLen + '-hour shift length');
      }
      tk.forEach(function (t) {
        if (t.time && (t.k === 'num' || t.gloss) && tWhy.length) mark(t, 'assumed', tWhy.join('; '));
        else if (t.esX) mark(t, 'assumed', '“x” read as Wednesday (miércoles)');
        else if (t.esMar) mark(t, 'assumed', '“mar” read as Tuesday (martes)');
        else if (t.day || t.time || t.role) mark(t, 'ok');
      });
      // (a plain shift line with two people or more and two roles or more, "sam cook, guadalupe host fri 11-7", "cook sam,
      // host guadalupe", "sam and jose cook, guadalupe host": each person's role is the one typed right next to them, or,
      // joined by "and", "&", "+", the one typed after (or before) their group. Anything less clear, "sam, jose cook,
      // guadalupe host", "sam cook host, ana", is asked: never a guess. One role for everyone, "sam and jose cook", one
      // person, and change lines (swap, give, off) read roles as they always have)
      (function settleRoles() {
        if (chg || act || I.people.length < 2) return;
        var at0 = function (pp) { return pp.toks[0].from; }, at1 = function (pp) { return pp.toks[pp.toks.length - 1].to; };
        // (anyone named between two places; and the line's own words there, "@" left out)
        var personBetween = function (a, b) { return I.people.some(function (pp) { return at0(pp) >= a && at1(pp) <= b; }); };
        var wordsBetween = function (a, b) { return tk.filter(function (x) { return x.from >= a && x.to <= b && !(x.k === 'punct' && x.v === '@'); }); };
        // the roles typed, a phrase each: role words side by side with no one between ("line cook": the role called that,
        // else its words' one role)
        var phrases = [];
        tk.forEach(function (t, k) {
          if (!t.role) return;
          var last = phrases[phrases.length - 1];
          if (last && tk[k - 1] && tk[k - 1].role && last.to === tk[k - 1].to && !personBetween(last.to, t.from)) { last.words.push(t.v); last.to = t.to; last.toks.push(t); }
          else phrases.push({from: t.from, to: t.to, words: [t.v], toks: [t]});
        });
        phrases.forEach(function (ph) {
          var each = ph.words.map(function (w) { return ix.roleWords[w]; });
          ph.r = ix.roleWords[ph.words.join(' ')] || (each.every(function (r) { return r === each[0]; }) ? each[0] : null);
        });
        if (phrases.every(function (ph) { return ph.r && ph.r === phrases[0].r; })) {  // (one role for everyone: "sam and jose line cook")
          if (phrases.length && phrases[0].r !== I.role) I.roleOf = I.people.map(function () { return phrases[0].r; });
          return;
        }
        // (next to: nothing between but "the", "a", "as", "at", "de", "como", "el", "la"..., or "(", ")", ":"; no one)
        var gap = function (a, b) { return !personBetween(a, b) && wordsBetween(a, b).every(function (x) {
          return (x.k === 'word' && (x.v in ARTICLE || x.v in {as: 1, at: 1, de: 1, como: 1})) || (x.k === 'punct' && '():'.indexOf(x.v) >= 0); }); };
        var byP = {}, side = {}, clash = phrases.some(function (ph) { return !ph.r; });
        phrases.forEach(function (ph) {
          var pn = -1, sd = null;
          I.people.forEach(function (pp, n) { if (pn < 0 && at1(pp) <= ph.from && gap(at1(pp), ph.from)) { pn = n; sd = 'after'; } });
          if (pn < 0) I.people.forEach(function (pp, n) { if (pn < 0 && at0(pp) >= ph.to && gap(ph.to, at0(pp))) { pn = n; sd = 'before'; } });
          if (pn < 0 || pn in byP) clash = true; else { byP[pn] = ph.r; side[pn] = sd; }
        });
        var joined = function (a, b) {
          var x = at1(I.people[a]), y = at0(I.people[b]), mid = wordsBetween(x, y);
          return !personBetween(x, y) && mid.length === 1 && andWord(mid[0]);
        };
        var roles = I.people.map(function (pp, pn) {
          if (byP[pn]) return byP[pn];
          var k;
          for (k = pn; k + 1 < I.people.length && joined(k, k + 1); k++) if (byP[k + 1]) return side[k + 1] === 'after' ? byP[k + 1] : null;
          for (k = pn; k > 0 && joined(k - 1, k); k--) if (byP[k - 1]) return side[k - 1] === 'before' ? byP[k - 1] : null;
          return null;
        });
        if (clash || roles.indexOf(null) >= 0) {  // (no role shown for anyone, and the role words not marked understood, until it's clear)
          roleClash = true; I.roleOf = I.people.map(function () { return null; });
          ask('roles', 'Which role is whose? Type each role right after the person: “sam cook, ana host”.');
          phrases.forEach(function (ph) { ph.toks.forEach(function (t) {
            res.marks.forEach(function (m) { if (m.from === t.from && m.to === t.to) { m.state = 'unknown'; m.why = 'which role is whose?'; } }); }); });
        } else I.roleOf = roles;
      })();
      // people
      var who = [];
      // a change names someone's shift: of two people with that name, the one with a shift that day is meant
      var onDays = chg === 'move' ? (mv && mv.from != null ? [mv.from] : null) : days;
      var narrow = chg === 'swap' ? [0, 1] : chg === 'move' || chg === 'time' ? [0] : fromIx != null ? [fromIx] : [];
      I.people.forEach(function (pp, pn) {
        var p = pp.p;
        if (p.removed) {
          ask('removed', (p.removed.name.split(' ')[0]) + ' is no longer on your team. Open shift instead?', ['Open shift', 'Skip']);
          mark(pp.tok, 'assumed', 'no longer on the team'); who.push(null); return;
        }
        var mt = meant(p.cands, narrow.indexOf(pn) >= 0 ? onDays : null, pn), cands = mt.cands, only = mt.only;
        if (cands.length > 1) {
          // (someone saved with no surname is "Sam", not "Sam S.", and is written "@Sam": the one whose whole name it is)
          var at = text[pp.toks[0].from - 1] === '@' ? '' : '@';
          // (two who would be called the same, "Sam O." and Sam Ortiz: their whole names)
          // (by the word typed when it's one of their given names: "elena" asks "Elena R. or Elena R.", not "Ma. R.")
          var typedW = pp.toks[0].v;
          var called = cands.map(function (x) {
            var f = x.p.name.split(' '), g = f.slice(0, -1).filter(function (w) { return fold(w).replace(/\./g, '') === typedW; })[0] || f[0];
            return f.length > 1 ? g + ' ' + f[f.length - 1][0] + '.' : x.p.name;
          });
          called = called.map(function (c0, k) { return called.indexOf(c0) !== called.lastIndexOf(c0) ? cands[k].p.name : c0; });
          ask('who', called.join(' or ') + '?', cands.map(function (x) { return x.p.name; }),
              cands.map(function (x) {  // their first name and last initial, or the whole name when that's shared too
                var f = x.p.name.split(' '), ini = f.length > 1 ? f[0] + ' ' + f[f.length - 1][0] : at + x.p.name;
                // (or when it would name another of them too: "Elena R" is Elena Rosales and Ma. Elena Rangel)
                var twin = f.length > 1 && cands.some(function (y) {
                  var g = fold(y.p.name).split(' ');
                  return y !== x && g.indexOf(fold(f[0])) >= 0 && g.some(function (part) { return part[0] === fold(f[f.length - 1])[0]; });
                });
                // (and only when it reads back as them: "Sol M" with one Sol is Sol on Monday, "Jean-Luc M" the same)
                var tt = tokens(fold((at ? '' : '@') + ini)), i0 = tt[0] && tt[0].k === 'punct' && tt[0].v === '@' ? 1 : 0, back = tt[i0] ? personAt(ix, tt, i0, true) : null;
                var reads = !!back && !!back.cands && back.cands.length === 1 && back.cands[0] === x && i0 + back.used === tt.length;
                return over(pp.toks, twin || !reads ? x.p.name : ini);
              }), pp.toks);
          mark(pp.tok, 'assumed', 'two people match'); who.push(null); return;
        }
        var c = cands[0];
        if (only) { pp.toks.forEach(function (x) { mark(x, 'assumed', c.p.name + ', ' + only); }); who.push(c.p); return; }
        pp.toks.forEach(function (x) { mark(x, p.how === 'name' && !p.word ? 'ok' : 'assumed', p.how === 'fuzzy' ? '“' + x.v + '” read as ' + c.p.name : p.how === 'prefix' || p.how === 'nick' ? '“' + x.v + '” read as ' + c.p.name : p.word ? 'a name that is also a word' : ''); });
        var said1 = '“' + pp.tok.v + '” read as ' + c.p.name;  // (once, when their part has two groups: "will tue 9-5 wed 10-6")
        if ((p.word || p.how === 'fuzzy' || p.how === 'prefix' || p.how === 'nick') && res.notes.indexOf(said1) < 0) res.notes.push(said1);
        who.push(c.p);
      });
      // a word where a name goes that is no one's ("manny" for Manuel): "Who is “manny”?", the people it could be (same
      // first two letters) one tap away; the panel then offers to remember the nickname (only if the manager says so)
      var whois = null;
      if (!I.people.length && unknown.length && unknown[0] === tk[0] && /^[a-z]{3,}$/.test(unknown[0].v)) {
        var wv = unknown[0].v, near = ix.people.filter(function (x) { return x.first && x.first.slice(0, 2) === wv.slice(0, 2); }).slice(0, 3);
        var short = function (x) {
          var f = x.p.name.split(' '), same = ix.people.filter(function (y) { return y.first === x.first; }).length > 1;
          return !same ? f[0] : f.length > 1 ? f[0] + ' ' + f[f.length - 1] : x.p.name;
        };
        whois = unknown[0];
        ask('whois', 'Who is “' + wv + '”?', near.map(function (x) { return x.p.name; }).concat(['Ignore it']),
            near.map(function (x) { return {edits: put(whois, short(x)), alias: {word: wv, id: x.p.id, name: x.p.name}}; })
              .concat([[{from: whois.from, to: whois.to, text: ''}]]));
      }
      if (!I.people.length && (days || times) && chg !== 'clear' && !dayNamed && !roleNamed) { later = true; }  // (open shifts and "everyone": a later step)
      var timeToks = tk.filter(function (t) { return t.time; });
      var fixOf = function (amb) {  // the ambiguity's options as (labels, fixes); a string fix = the times' new words
        if (!amb.opts) return [[], []];
        // (a number with letters stuck to it, "the 10th", is a date or a word: its digits are never rewritten)
        var glued = tk.some(function (t) { return t.k === 'word' && t.stuck && timeToks.some(function (x) { return x.to === t.from; }); });
        if (glued && amb.opts.some(function (o) { return typeof o[1] === 'string' || Array.isArray(o[1]) && timeToks.some(function (x) { return o[1].some(function (ed) { return ed.from <= x.from && x.to <= ed.to; }); }); })) return [[], []];
        return [amb.opts.map(function (o) { return o[0]; }), amb.opts.map(function (o) { return typeof o[1] === 'string' ? (timeToks.length ? over(timeToks, o[1]) : null) : o[1]; })];
      };
      if (dayAmbig) { var fd = fixOf(dayAmbig); ask('days', dayAmbig.q, fd[0], fd[1], dayAmbig.t); }
      if (timeAmbig) { var ft = fixOf(timeAmbig); ask('times', timeAmbig.q, ft[0], ft[1], timeAmbig.spanTimes && timeToks.length ? timeToks : timeAmbig.t); }
      if (!days && I.people.length && !later && !I.undo && !chg) ask('days', who.length && who[0] ? who[0].name.split(' ')[0] + ': which days?' : 'Which days?');
      var needEnd = times && times.needEnd;
      if (!times && I.people.length && !later && !act && !I.undo && !chg) ask('times', 'What times?');
      if (needEnd) {  // the usual shift times' ends near this start (else 4, 6 and 8 hours), best first
        var seenEnd = {}, ends = [];  // (the most usual first, then the earlier)
        (wds.length ? wds : [0, 1, 2, 3, 4, 5, 6]).forEach(function (wd) {
          ((ctx.slots || {})[wd] || []).forEach(function (sl) {
            var a = +sl[0].slice(0, 2) * 60 + +sl[0].slice(3), b = +sl[1].slice(0, 2) * 60 + +sl[1].slice(3);
            if (b <= a) b += 1440;
            if (Math.abs(a - times.s) <= 60 && b - a <= 720) seenEnd[times.s + (b - a)] = (seenEnd[times.s + (b - a)] || 0) + 1;
          });
        });
        ends = Object.keys(seenEnd).map(Number).sort(function (x, y) { return seenEnd[y] - seenEnd[x] || x - y; });
        if (!ends.length) ends = [240, 360, 480].map(function (h) { return times.s + h; });
        ends = ends.slice(0, 3);
        ask('until', 'Until when?', ends.map(function (e) { return 'Until ' + say(e); }),
            ends.map(function (e) { return timeToks.length && !tk.some(function (t) { return t.k === 'word' && t.stuck && timeToks.some(function (x) { return x.to === t.from; }); }) ? over(timeToks, say(times.s) + '-' + say(e)) : null; }));
      }
      if (I.later) later = true;
      if (later && !whois) ask('later', 'Some of this isn’t something I can do yet. Change it in the schedule, or leave those words out.');
      // ("solo esta semana", "just this week": this week, whatever else said every week)
      var thisWk = tk.some(function (t, n) { return t.k === 'word' && (t.v === 'esta' || t.v === 'this') && !(tk[n - 1] && tk[n - 1].k === 'word' && tk[n - 1].v in {desde: 1, de: 1, from: 1, starting: 1, since: 1}) && tk[n + 1] && tk[n + 1].k === 'word' && (tk[n + 1].v === 'semana' || tk[n + 1].v === 'week' || EN_DAYS_W[tk[n + 1].v] === 'we'); });
      // ("every day": a day, not every week)
      var strongStd = tk.some(function (t) { return t.k === 'word' && !t.day && t.v in {siempre: 1, every: 1, cada: 1, always: 1, usually: 1, weekly: 1}; }) || tk.some(function (t) { return t.v === 'semanas' && t.chg; });
      var bothWk = thisWk && strongStd;  // ("esta semana y siempre": asked)
      if (bothWk) ask('every', 'Just this week, or every week?');
      var weekly = standing && !thisWk, scopeOpen = (plural && !standing && !thisWk) || bothWk;  // (scopeOpen: this week or every week isn't settled)
      if (standing && !thisWk) res.scope = 'standing';
      else if (plural && !thisWk) ask('every', 'Just this week, or every week?', ['Every week', 'Just this week'],  // (a plural alone: asked)
                           [[plurals[0].esLos ? {from: plurals[0].esLos.from, to: plurals[0].esLos.to, text: 'cada'}
                             : plurals[0].v === 'fines' ? {from: plurals[0].from, to: plurals[0].to, text: 'cada fin'}
                             : plurals[0].esFin ? {from: plurals[0].esFin.from, to: plurals[0].to, text: 'cada fin de semana'} : {from: plurals[0].from, to: plurals[0].from, text: 'every '}],
                            plurals.map(function (x) {  // ("los viernes" -> "el viernes", "los sábados" -> "el sabado")
                              var one = x.v in DAY_WORDS ? x.v : x.v === 'fines' ? 'fin' : x.v.replace(/'?s$/, '');
                              return x.esLos ? {from: x.esLos.from, to: x.to, text: 'el ' + one} : {from: x.from, to: x.to, text: one};
                            })]);
      // a day named that is today, in the week open: today, or next week's?
      var nowDay = (ctx.now || '').slice(0, 10), wi = (ctx.week || []).indexOf(nowDay);
      var tDays = mv ? [mv.from, mv.to] : days;  // (a move onto or off today's weekday: today, or next week's?)
      var todayAsk = wi >= 0 && tDays && tDays.indexOf(wi) >= 0 && !weekly && !yes('today|' + nowDay);
      if (todayAsk) ask('which_day', 'Today, or next ' + DAYS[wi] + '?', ['Today', 'Next week'], [{yes: 'today|' + nowDay}, null]);
      I.ready = !!(days && times && times.s != null && times.e != null && !times.pending && !dayAmbig && !timeAmbig && !later && !roleClash && !unknown.length && !teach.length
                   && !scopeOpen && !todayAsk);
      I.later = later;
      var ready = I.ready;
      I.ownMore = !!(days || (times && times.s != null) || act || chg);  // (a take-back with days, times or an action of its own takes back its own line)
      if (I.undo) return;  // (a taken-back line, or a take-back alone, adds nothing)
      if (act) {  // off / remove: actions on the people's shifts those days, never new shifts
        var typedTimes = times && times.s != null;
        if (act === 'conflict' || typedTimes) ask('contradiction', (who[0] ? who[0].name.split(' ')[0] + ' ' : '') + (act === 'conflict' ? 'removed, or off?' : 'off, or working ' + say(times.s) + (times.e != null ? '–' + say(times.e) : '') + '?'));
        var aReady = !!(days && !dayAmbig && !later && !unknown.length && !teach.length && !typedTimes && act !== 'conflict' && who.length && who.every(Boolean) && !todayAsk && !scopeOpen);
        if (teach.length && !later) ask('teach', 'What times is “' + teach[0].v + '” at your business? Add it to your shift words on Shift times, then type it again.');
        if (unknown.length && !later && !whois) ask('unknown', 'What does “' + unknown.map(function (t) { return t.v; }).join(' ') + '” mean here?', ['Ignore it'],
                                                    [unknown.map(function (t) { return {from: t.from, to: t.to, text: ''}; })]);
        who.forEach(function (p) {
          if (p) res.actions.push({type: act === 'conflict' ? 'off' : act, person: p.name, personId: p.id, days: (days || []).map(function (n) { return DAYS[n]; }), ready: aReady, inst: I.n});
        });
        return;
      }
      if (chg) { changes(); return; }
      var groups = [{days: days || [], e: times && times.e}];
      if (times && times.byDay && days && days.length) {
        var byE = {}, order = [];
        days.forEach(function (d) { var e = times.byDay[d]; if (!(e in byE)) { byE[e] = []; order.push(e); } byE[e].push(d); });
        groups = order.map(function (e) { return {days: byE[e], e: +e}; });
      }
      who.forEach(function (p, pn) { var rl = roleFor(pn); groups.forEach(function (gr) {
        if (!p) return;
        var sh = {person: p.name, personId: p.id, days: gr.days.map(function (n) { return DAYS[n]; }),
                  start: times && times.s != null ? fmtM(times.s) : null, end: gr.e != null ? fmtM(gr.e) : null, ready: ready && who.every(Boolean)};
        if (rl) sh.role = rl.label;
        // already in the schedule exactly: no change (not added twice)
        if ((ctx.existing || []).some(function (x) { return x.personId === p.id && sh.days.length === 1 && x.day === sh.days[0] && x.start === sh.start && x.end === sh.end
                                                             && (!rl || !x.role || x.role === rl.key); })) {  // (another role typed: a change, not "no change")
          sh.ready = false; sh.already = true; res.notes.push(p.name + ' already works ' + sh.days[0] + ' ' + say(times.s) + '–' + say(gr.e) + ': no change');
        } else if (sh.start && sh.end) {
          // (stranger test 3, F-003: typed hours that overlap a shift they have that day, and don't cover it, would join it
          // into one longer shift than typed, "6a–2p" + "11-7" = 6a–7p: asked, replace it or join them. "Replace it" writes "instead" at the
          // line's end (a change of that shift's times); "Join them" lets the Builder join them, as before)
          // (by real time across the week, so a shift the day before that runs past midnight counts too: "sam tue 5-1" next to
          // Sam's Mon 10p–6a. Minutes from the week's Monday)
          var sM = times.s, eM = gr.e > times.s ? gr.e : gr.e + 1440, span0 = function (x) {
            var d = DAYS.indexOf(x.day), a = d * 1440 + hm2(x.start), b = d * 1440 + hm2(x.end);
            return [a, b <= a ? b + 1440 : b];
          };
          var hit = [];  // [{x, a, b, S, E}]: their shift, and the typed one it joins (that day)
          sh.days.forEach(function (dn) {
            var S = DAYS.indexOf(dn) * 1440 + sM, E = DAYS.indexOf(dn) * 1440 + eM;
            (ctx.existing || []).forEach(function (x) {
              if (x.personId !== p.id || DAYS.indexOf(x.day) < 0 || !x.start || !x.end) return;
              var ab = span0(x), a = ab[0], b = ab[1];
              // (as the Builder joins: touching shifts stay two; one inside the typed hours just becomes them; and only where
              // the one shift would be longer than 12 hours: never a silent shift over 12 hours, as for typed times. A shorter
              // join is said with the reading, "Joins Sam's 10:30a–4p on Tue (now 10:30a–7p)": the golden set reads "sam tue
              // 11-7" over Sam's 10:30a–4p as a shift to add, unasked)
              if (a < E && S < b && (a < S || b > E) && Math.max(b, E) - Math.min(a, S) > 720) hit.push({x: x, a: a, b: b, S: S, E: E});
            });
          });
          var keepK = 'keep|' + p.id + '|' + sh.days.join(',') + '|' + sh.start + '-' + sh.end;
          if (hit.length && !yes(keepK)) {
            sh.ready = false;
            var lastT = I.toks[I.toks.length - 1], nxT = toks[toks.indexOf(lastT) + 1];
            // (the same role, or none typed: the Builder joins them, said so; another role: it keeps both, cut around the new one)
            var sameR = !rl || hit.every(function (h) { return !h.x.role || h.x.role === rl.key; });
            // ("Replace it" changes that day's shift: only where each typed day has one, on that day)
            var canRep = hit.length === sh.days.length && sh.days.every(function (dn) { return hit.filter(function (h) { return h.x.day === dn; }).length === 1; })
              && sameR && (!nxT || nxT.k === 'nl') && who.length === 1;
            ask('overlap', p.name.split(' ')[0] + ' already works ' + hit.map(function (h) { return h.x.day + ' ' + say(h.a) + '–' + say(h.b); }).join(', ')
                + (hit.length > 1 ? ': replace them with ' : ': replace it with ') + say(sM) + '–' + say(eM)
                + (!sameR ? ', or keep both?' : hit.length > 1 ? ', or join them into one long shift each?'
                   : ', or join them into one shift, ' + say(Math.min(hit[0].a, hit[0].S)) + '–' + say(Math.max(hit[0].b, hit[0].E)) + '?'),
                (canRep ? [hit.length > 1 ? 'Replace them' : 'Replace it'] : []).concat([sameR ? 'Join them' : 'Keep both']),
                (canRep ? [[{from: lastT.to, to: lastT.to, text: ' instead'}]] : []).concat([{yes: keepK}]));
          }
        }
        sh.inst = I.n;
        res.shifts.push(sh);
      }); });
      if (teach.length && !later) ask('teach', 'What times is “' + teach[0].v + '” at your business? Add it to your shift words on Shift times, then type it again.');
      if (unknown.length && !later && !whois) ask('unknown', 'What does “' + unknown.map(function (t) { return t.v; }).join(' ') + '” mean here?', ['Ignore it'],
                                        [unknown.map(function (t) { return {from: t.from, to: t.to, text: ''}; })]);
    }
    // dictation's two-reading words ("ate to for"): asked, with one tap writing the times (instead of "what does it mean?")
    // (and "the" where a day goes: Tuesday, autocorrected?). The line it's on waits.
    pz.asks.forEach(function (a) { sp.hints.push({from: a.from, to: a.to, sender: a.name}); });
    sp.hints.forEach(function (h) {
      var said = text.slice(h.from, h.to), on = insts.filter(function (I) { return I.toks.some(function (x) { return x.from < h.to && x.to > h.from; }); });
      curN = on.length ? on[0].n : -1;
      if (on.length && on[0].dropped) return;
      res.ask = res.ask.filter(function (q) { return !(q.kind === 'unknown' && Array.isArray(q.fixes[0]) && q.fixes[0].every(function (e) { return e.from >= h.from && e.to <= h.to; })); });
      // (its own question says the times: "What times?" / "Until when?" for that line would only repeat it)
      if (h.text && on.length) res.ask = res.ask.filter(function (q) { return !((q.kind === 'times' || q.kind === 'until') && q.inst.length === 1 && q.inst[0] === on[0].n); });
      if (h.sender) ask('pasted', '“' + h.sender + ':” here: who sent the message, or someone to schedule too?', ['Who sent it', 'Schedule them too'],
                        [[{from: h.from, to: h.to, text: ''}], [{from: h.from, to: h.to, text: h.sender + ' and '}]]);
      else if (h.the) ask('spoken', '“' + said + '” here: Tuesday?', ['Tuesday', 'Ignore it'], [[{from: h.from, to: h.to, text: 'tue'}], [{from: h.from, to: h.to, text: ''}]]);
      else { var ab = h.text.split('-'); ask('spoken', '“' + said + '”: ' + ab[0] + ' to ' + ab[1] + '?', ['Yes, ' + ab[0] + '–' + ab[1]], [[{from: h.from, to: h.to, text: h.text}]]); }
      res.shifts.concat(res.actions).forEach(function (x) { if (x.type !== 'undo' && on.some(function (I) { return I.n === x.inst; })) x.ready = false; });
      if (h.the) res.marks.push({from: h.from, to: h.to, state: 'assumed', why: 'Tuesday?'});
    });
    // a line of only words not understood ("eshacer", "nbm") may be about the line before (a take-back, a correction
    // typed wrong): that line waits too
    insts.forEach(function (I, n) {
      if (!n || I.people.length || I.anyDay || I.anyTime || I.dropped || !I.toks.length || I.toks.length > 3) return;
      var odd = I.toks.some(function (x) { return x.k === 'word' && !keyword(x.v) && !ix.words[x.v] && !ix.roleWords[x.v] && !(x.v in TEACH) && !(x.v in REPLY_W); });
      if (!odd) return;
      var prev = insts[n - 1];
      res.shifts.concat(res.actions).forEach(function (x) { if (x.inst === prev.n && x.type !== 'undo') x.ready = false; });
    });
    // what dictation, an emoji or a joined word was read as: said where it was typed
    toks.concat(raw).forEach(function (t) {
      if (!t.said || t.saidDone) return;
      t.saidDone = true;
      var hit = false;
      res.marks.forEach(function (m) { if (m.from >= t.from && m.to <= t.to && m.state !== 'unknown') { m.state = 'assumed'; m.why = m.why ? t.said + '; ' + m.why : t.said; hit = true; } });
      if (!hit) res.marks.push({from: t.from, to: t.to, state: 'assumed', why: t.said});
    });
    var rank = function (m) { return m.state === 'ok' ? 1 : 0; };
    res.marks.sort(function (a, b) { return a.from - b.from || rank(a) - rank(b); });
    return res;
  }

  // a word the parser reads as something other than a name (a day, glue, a later-step or shift word): never a nickname
  // (in either language, whatever the last message was: the server's RESERVED_WORDS are fixed too)
  function reserved(w) { w = fold(String(w || '')).trim(); return !w || keyword(w, true) || w in TEACH; }
  var NEVER_LIST = [DAY_WORDS, GLUE, RANGE_WORDS, OFF_W, REMOVE_W, EXCEPT_W, UNDO_W, W4B, ES_MISC, EN_DAYS_W]
    .reduce(function (all, o) { return all.concat(Object.keys(o)); }, []).filter(function (w, i, all) { return all.indexOf(w) === i; }).sort();
  var NEVER_SET = {};
  NEVER_LIST.forEach(function (w) { NEVER_SET[w] = 1; });
  var api = {parse: parse, reserved: reserved, _fold: fold, _tokens: tokens, _dayWords: Object.keys(DAY_WORDS),
             _known: function (w) { w = fold(String(w || '')).trim(); return reserved(w) || !!packedDays(w) || !!packedEs(w) || w in EN_N || w in ES_N || w in TENS; },
             // (step 7's mask, as phrases.packed_days: days run together with a vowel and a one-letter piece aren't kept,
             // "sam" (sa + m) could be someone not on the team; "tuth", "monfri", "mwf" are)
             _maskKnown: function (w) {
               w = fold(String(w || '')).trim();
               var en = w.length >= 2 && !(w in DAY_WORDS) && packedEn(w);  // (reserved() counts packed days as keywords: decided here first)
               if (en) return !(en.single && /[aeiouy]/.test(w));
               return reserved(w) || !!packedEs(w) || w in EN_N || w in ES_N || w in TENS;
             },
             _reservedList: [DAY_WORDS, LETTER_DAYS, GLUE, LATER_SET, RANGE_WORDS, TEACH, OFF_W, REMOVE_W, EXCEPT_W, UNDO_W, W4B, ES_MISC, EN_DAYS_W]
               .reduce(function (all, o) { return all.concat(Object.keys(o)); }, []).filter(function (w, i, all) { return all.indexOf(w) === i; }).sort(),
             // (words a business can't make a shift word: they'd stop meaning a day, off, remove, except or take back)
             _neverWords: NEVER_LIST};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.TypeBuild = api;
})(typeof window !== 'undefined' ? window : this);
