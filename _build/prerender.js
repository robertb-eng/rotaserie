#!/usr/bin/env node
/* Writes _src/generated/ttb.<lang>.json: the Type to Build examples on the home page, read by the app's real parser
   (vendor/typebuild.js) and drawn by demo/read.js, so the page shows true results before any script runs.
   Run after changing an example, demo/read.js, demo/state.js or the vendored parser:
       node _build/prerender.js            then python3 _build/build.py
       node _build/prerender.js --check    exit 1 if the committed files are out of date */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.dirname(__dirname), SRC = path.join(ROOT, '_src');
const R = require(path.join(ROOT, 'demo', 'read.js')), ST = require(path.join(ROOT, 'demo', 'state.js'));

// the vendored parser must be the recorded copy
const ver = fs.readFileSync(path.join(ROOT, 'vendor', 'typebuild.version'), 'utf8');
const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'vendor', 'typebuild.js'))).digest('hex');
if (!ver.includes('sha256: ' + sha)) { console.error('prerender: vendor/typebuild.js does not match vendor/typebuild.version'); process.exit(1); }

const site = JSON.parse(fs.readFileSync(path.join(SRC, 'site.json'), 'utf8'));
let stale = [];
for (const lang of site.langs || ['en']) {
  const S = JSON.parse(fs.readFileSync(path.join(SRC, `strings.${lang}.json`), 'utf8')), H = S.home;
  const week = ST.fresh(), hero = R.read(H.hero.example, week);
  const one = (text) => { const r = R.read(text); return {text, html: R.previewHTML(lang, r), n: r.n, asks: !!(r.res && r.res.ask.length)}; };
  const out = {
    hero: {text: hero.text, rows: hero.text.split('\n').length + 1, preview: R.previewHTML(lang, hero), grid: R.gridHTML(lang, week, hero.ops),
           add: R.addLabel(lang, hero.n), n: hero.n, totals: R.totalsText(lang, week, hero.ops), live: R.liveText(lang, hero), week: R.words[lang].week},
    key: ST.roles.map((r) => `<span><i class="s${r.tone}"></i>${r[lang]}</span>`).join('') + `<span><i class="typed"></i>${R.words[lang].typed}</span>`,
    chips: H.hero.chips.map((text) => ({text})),
    points: H.type.points.map((p) => ({title: p.title, body: p.body, examples: p.examples.map(one)}))
  };
  // every line the page shows must read cleanly: shifts or a question, and (Spanish) nothing left in English
  for (const c of H.hero.chips.concat(...H.type.points.map((p) => p.examples))) {
    const r = R.read(c);
    if (!r.n && !(r.res && r.res.ask.length)) { console.error(`prerender: ${lang}: “${c}” reads as nothing`); process.exit(1); }
    if (lang !== 'en') for (const q of r.res.ask) for (const s of [q.question].concat(q.options || [])) {
      if (!R.known(s)) { console.error(`prerender: ${lang}: no translation for “${s}” (from “${c}”)`); process.exit(1); }
    }
  }
  const file = path.join(SRC, 'generated', `ttb.${lang}.json`), text = JSON.stringify(out, null, 1) + '\n';
  if (process.argv.includes('--check')) { if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== text) stale.push(path.relative(ROOT, file)); }
  else { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file, text); console.log('wrote', path.relative(ROOT, file)); }
}
if (stale.length) { console.error('prerender: out of date (run node _build/prerender.js):', stale.join(', ')); process.exit(1); }
if (process.argv.includes('--check')) console.log('prerender: up to date');
