#!/usr/bin/env node
/* Local tests for Try Type to Build (nothing runs on GitHub):
       node _tests/ttb.test.js              run
       node _tests/ttb.test.js --update     rewrite _tests/ttb.expected.json after a deliberate change
       ROTASERIE_APP=<app checkout> node _tests/ttb.test.js    also: the vendored parser is that checkout's, byte for byte
   1. vendor/typebuild.js matches the hash in vendor/typebuild.version
   2. the lines below (English, Spanish, lazy typing, nonsense) read as recorded
   3. every example on the page reads to shifts or a question, in every language, with no English left in Spanish
   4. the drawing never returns nothing, and never lets typed text through as HTML */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.dirname(__dirname);
const R = require(path.join(ROOT, 'demo', 'read.js')), ST = require(path.join(ROOT, 'demo', 'state.js'));
let failed = 0;
const ok = (name, cond, got) => { if (!cond) { failed++; console.log('FAIL', name, got === undefined ? '' : JSON.stringify(got).slice(0, 300)); } };

// 1
const file = fs.readFileSync(path.join(ROOT, 'vendor', 'typebuild.js'));
const sha = crypto.createHash('sha256').update(file).digest('hex');
ok('vendored parser matches its recorded hash', fs.readFileSync(path.join(ROOT, 'vendor', 'typebuild.version'), 'utf8').includes('sha256: ' + sha), sha);
if (process.env.ROTASERIE_APP) {
  const app = fs.readFileSync(path.join(process.env.ROTASERIE_APP, 'static', 'typebuild.js'));
  ok('vendored parser is identical to the app checkout\'s', Buffer.compare(app, file) === 0);
}

// 2
const LINES = [
  'maya wed 5-11', 'lena m-th 10-4', 'priya wensday 445-8 pls', 'tom mon-fri from 11', 'diego miércoles a viernes 9 a 5 mesero',
  'sam fri sat 4p-10p', 'maya torres thursday 11am to 5pm', 'LENA FRI 10-4 COOK', 'tom sat sun 5-11 cook', 'diego lunes 4 a 10',
  'priya martes y jueves 11 a 5', 'sam sab 4-10 ayudante', 'lena viernes 10 a 4 cocinera', 'maya mie 5-11', 'tom vie 5p-11p',
  'maya & diego fri 5-10', 'lena th 9-5 cook, tom f 5-11', 'sam tues 430-9', 'priya weds 11-3', 'diego thurs 9a-1p',
  'maya wed 5-11\nlena m-th 10-4', 'maya wed 5-11\nmaya wed 5-11', 'sam fri', 'maya 5-11', 'zzz blah', 'zzz fri 5-9',
  'sam off tue', 'tom tomorrow 5-9', '2 servers sat 5-10', 'everyone sat 9-5', 'maya mon 1p-5p', 'hello', '   ', '<b>maya</b> wed 5-11',
];
const brief = (text) => {
  const r = R.read(text, ST.fresh());
  return {n: r.n, rows: r.rows.map((x) => `${x.name}|${x.days.join(',')}|${x.a}-${x.b}|${x.r}`), waiting: r.waiting.length, clash: r.clash.length,
          other: r.other, asks: r.res ? r.res.ask.map((q) => q.kind + ':' + (q.options || []).join(',')) : []};
};
const got = {}; LINES.forEach((l) => { got[l] = brief(l); });
const expFile = path.join(__dirname, 'ttb.expected.json');
if (process.argv.includes('--update')) { fs.writeFileSync(expFile, JSON.stringify(got, null, 1) + '\n'); console.log('wrote', path.relative(ROOT, expFile)); }
const exp = JSON.parse(fs.readFileSync(expFile, 'utf8'));
LINES.forEach((l) => ok('reads as recorded: ' + JSON.stringify(l), JSON.stringify(got[l]) === JSON.stringify(exp[l]), got[l]));
ok('the same words always give the same shifts', JSON.stringify(brief('lena m-th 10-4')) === JSON.stringify(brief('lena m-th 10-4')));

// 3 and 4
const site = JSON.parse(fs.readFileSync(path.join(ROOT, '_src', 'site.json'), 'utf8'));
for (const lang of site.langs || ['en']) {
  const H = JSON.parse(fs.readFileSync(path.join(ROOT, '_src', `strings.${lang}.json`), 'utf8')).home;
  const examples = H.hero.chips.concat(H.hero.example, ...H.type.points.map((p) => p.examples));
  for (const text of examples) {
    const r = R.read(text, ST.fresh());
    ok(`${lang}: example reads to shifts or a question: ${text}`, r.n > 0 || (r.res && r.res.ask.length > 0), brief(text));
    if (lang !== 'en' && r.res) for (const q of r.res.ask) for (const s of [q.question].concat(q.options || [])) ok(`${lang}: has a translation: ${s}`, R.known(s));
  }
  for (const text of LINES) {
    const r = R.read(text, ST.fresh()), html = R.previewHTML(lang, r);
    ok(`${lang}: never blank: ${JSON.stringify(text)}`, html.replace(/<[^>]+>/g, '').trim().length > 0);
    ok(`${lang}: typed text is never HTML: ${JSON.stringify(text)}`, !/<b>maya|<script/i.test(html));
  }
  ok(`${lang}: the week draws`, /<table class="wk">/.test(R.gridHTML(lang, ST.fresh(), R.read(H.hero.example, ST.fresh()).ops)));
}
// answers edit the text
const q = R.read('tom mon-fri from 11', ST.fresh()).res.ask[0];
ok('an answer edits the text', R.read(R.applyFix('tom mon-fri from 11', q.fixes[1]), ST.fresh()).n === 5);
ok('limits: 6 lines, 400 characters', R.clip('a\n'.repeat(20)).split('\n').length <= 6 && R.clip('x'.repeat(900)).length === 400);

console.log(failed ? `${failed} failed` : 'ttb tests passed');
process.exit(failed ? 1 : 0);
