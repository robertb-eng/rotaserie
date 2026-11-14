#!/usr/bin/env node
/* Local tests for the week demo's sums and warnings:   node _tests/week.test.js */
'use strict';
const path = require('path'), ROOT = path.dirname(__dirname);
const W = require(path.join(ROOT, 'demo', 'week.js')), ST = require(path.join(ROOT, 'demo', 'state.js'));
let failed = 0;
const ok = (name, cond, got) => { if (!cond) { failed++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got)); } };
const wk = ST.fresh();
ok('18 shifts, 107 hours to start', W.totalText('en', wk) === '18 shifts · 107 hours', W.totalText('en', wk));
ok('Maya starts at 18 hours', W.hoursOf(wk, 1) === 18 * 60);
ok('nothing to warn about at the start', wk.every((s) => W.problem(wk, s) === null));
// overtime: Diego (23 h) plus three six-hour shifts is 41
const more = [2, 3, 4].map((d) => ({p: 2, d, a: '11:00', b: '17:00', r: 'server'})), ot = wk.concat(more);
ok('past 40 hours is overtime', W.problem(ot, more[2]) === 'ot' && W.problemText('en', ot, more[2], 'ot').includes('Diego would reach 41 hours'), W.problemText('en', ot, more[2], 'ot'));
ok('exactly 40 hours is not', W.problem(wk.concat([{p: 2, d: 2, a: '11:00', b: '17:00', r: 'server'}, {p: 2, d: 3, a: '11:00', b: '22:00', r: 'server'}]), wk[3]) === null);
// time off: Sam, Sunday
const off = {p: 4, d: 6, a: '11:00', b: '17:00', r: 'busser'};
ok('a shift on approved time off warns', W.problem(wk.concat([off]), off) === 'toff');
// double booking: Maya already works Monday 11-5
const dbl = {p: 1, d: 0, a: '16:00', b: '22:00', r: 'server'};
ok('overlapping hours are a double booking', W.problem(wk.concat([dbl]), dbl) === 'dbl');
ok('back-to-back shifts are not', W.problem(wk.concat([{p: 1, d: 0, a: '17:00', b: '22:00', r: 'server'}]), wk[0]) === null);
// who can take Sam's Sunday shift: not Sam, nobody already on Sunday
const can = W.whoCanTake(wk.concat([off]), off);
ok('who can take it: only people free that day', can.join() === '1,3,5', can);
for (const lang of ['en', 'es']) {
  ok(lang + ': the grid draws every person', (W.gridHTML(lang, wk, {live: true}).match(/<tr/g) || []).length === 8);
  ok(lang + ': the phone shows the next shift', /ph-in/.test(W.phoneHTML(lang, wk, 1)) && !/NaN|undefined/.test(W.phoneHTML(lang, wk, 1)));
  ok(lang + ': a person with no shifts still gets a phone', /ph-in none/.test(W.phoneHTML(lang, [], 1)));
}
ok('names are never HTML', !/<script/.test(W.gridHTML('en', wk, {})));
console.log(failed ? `${failed} failed` : 'week tests passed');
process.exit(failed ? 1 : 0);
