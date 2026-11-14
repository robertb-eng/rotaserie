/* The sample business every demo on this site shares: Harbor Street Bistro, the week of Mon Nov 16 to Sun Nov 22, 2026.
   All made up. Nothing here is read from or sent to anywhere. */
(function (root) {
  'use strict';
  var state = {
    business: 'Harbor Street Bistro',
    week: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'],
    dates: [16, 17, 18, 19, 20, 21, 22],
    now: '2026-11-14T10:00',
    // key, the colour set it uses (tokens.css --s0..), its name and the Spanish words the app would read for it
    roles: [
      {key: 'server', tone: 0, en: 'Server', es: 'Mesero', words: ['mesero', 'mesera']},
      {key: 'busser', tone: 1, en: 'Busser', es: 'Ayudante', words: ['ayudante', 'garrotero', 'garrotera']},
      {key: 'cook', tone: 2, en: 'Cook', es: 'Cocinero', words: ['cocinero', 'cocinera']}
    ],
    people: [
      {id: 1, name: 'Maya Torres', roles: ['server']},
      {id: 2, name: 'Diego Ruiz', roles: ['server']},
      {id: 3, name: 'Priya Nair', roles: ['busser']},
      {id: 4, name: 'Sam Okafor', roles: ['busser']},
      {id: 5, name: 'Lena Park', roles: ['cook']},
      {id: 6, name: 'Tom Becker', roles: ['cook']}
    ],
    // business hours, Monday first
    hours: {0: ['11:00', '22:00'], 1: ['11:00', '22:00'], 2: ['11:00', '22:00'], 3: ['11:00', '22:00'],
            4: ['11:00', '23:00'], 5: ['11:00', '23:00'], 6: ['10:00', '21:00']},
    // the week as it starts: [person, day (0 = Monday), start, end, role]
    start: [
      [1, 0, '11:00', '17:00', 'server'], [1, 1, '11:00', '17:00', 'server'], [1, 3, '11:00', '17:00', 'server'],
      [2, 0, '16:00', '22:00', 'server'], [2, 1, '16:00', '22:00', 'server'], [2, 5, '16:00', '22:00', 'server'], [2, 6, '16:00', '21:00', 'server'],
      [3, 1, '11:00', '17:00', 'busser'], [3, 3, '11:00', '17:00', 'busser'],
      [4, 2, '16:00', '22:00', 'busser'], [4, 3, '16:00', '22:00', 'busser'], [4, 4, '16:00', '22:00', 'busser'], [4, 5, '16:00', '22:00', 'busser'],
      [5, 4, '10:00', '16:00', 'cook'], [5, 5, '10:00', '16:00', 'cook'], [5, 6, '10:00', '16:00', 'cook'],
      [6, 5, '17:00', '23:00', 'cook'], [6, 6, '15:00', '21:00', 'cook']
    ]
  };
  // approved time off, and open shifts someone could pick up
  state.off = [{p: 4, d: 6}];
  state.open = [{d: 2, a: '11:00', b: '17:00', r: 'cook'}, {d: 5, a: '11:00', b: '17:00', r: 'server'}, {d: 6, a: '16:00', b: '21:00', r: 'busser'}];
  state.fresh = function () { return state.start.map(function (s) { return {p: s[0], d: s[1], a: s[2], b: s[3], r: s[4]}; }); };
  // the week as it stands on this page: every demo reads it and tells the others when it changes it
  state.shifts = state.fresh();
  state.last = null;  // (the person a shift was last typed for: the Employee view opens on their phone)
  var subs = [];
  state.on = function (f) { subs.push(f); };
  state.set = function (week, from) { state.shifts = week; subs.forEach(function (f) { f(from); }); };
  if (typeof module !== 'undefined' && module.exports) module.exports = state;
  root.RotaDemoState = state;
})(typeof window !== 'undefined' ? window : this);
