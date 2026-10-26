#!/usr/bin/env node
// No "Lab" wording in what players read. Every Lab system has been part of every run since 2026-10-25
// (fork/LAB.md, "Promotion"), so a text that says something is "Lab"-only, or tags it "LAB", is wrong.
//
//   node fork/test-no-lab-text.cjs
//
// It reads every string and template the game's scripts hold (js/, less the generated dictionaries and
// data) and dev.html, and flags any that reads as words and says Lab / LAB. Code names stay (G.Lab,
// 'lab-badge', save.lab): only texts with a space, a colon or a dot in them are looked at.
// ALLOW: the texts that may say it, and why.
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');
const acorn = require(require.resolve('acorn', { paths: require('./pw.cjs').NODE_DIRS }));

const ALLOW = [
  // The leaderboard's archive of the runs played while Lab was a separate mode (and its moderation view).
  [/js\/ui\/ranking-ui\.js$/, /Lab archive|Archived Lab runs|^Lab $/],
  [/js\/ui\/mod-ui\.js$/, /^Lab archive · $/],
  // The admin's change log: past days' entries keep the tag they had then.
  [/js\/fork\/change-log\.js$/, /./],
  // Console messages for developers.
  [/./, /^\[Lab\]/]
];
const SKIP = /js\/lang\/|js\/data\/|app\.min\.js|lab-data\.js|lab-anims\.js|mega-sprites|radiant-list/;
const SAYS = /\bLab\b|\bLAB\b|\bnormal runs?\b/;

let failures = 0;
const hits = [];
function scan(rel, src) {
  let toks;
  try { toks = [...acorn.tokenizer(src, { ecmaVersion: 'latest' })]; } catch (e) { console.log('  FAIL cannot read ' + rel + ': ' + e.message); failures++; return; }
  for (const t of toks) {
    if (t.type.label !== 'string' && t.type.label !== 'template') continue;
    const s = String(t.value || '');
    if (!SAYS.test(s) || !/[\s:.]/.test(s)) continue;
    // HTML or code: only the text between the tags counts.
    const text = s.replace(/<[^>]*>/g, ' ');
    if (!SAYS.test(text)) continue;
    if (ALLOW.some(([f, re]) => f.test(rel) && re.test(s))) continue;
    const line = src.slice(0, t.start).split('\n').length;
    hits.push(`${rel}:${line}  ${s.replace(/\s+/g, ' ').trim().slice(0, 140)}`);
  }
}
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) { walk(rel); continue; }
    if (rel.endsWith('.js') && !SKIP.test(rel)) scan(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  }
})('js');

// dev.html's own text (not its script tags' paths).
const html = fs.readFileSync(path.join(ROOT, 'dev.html'), 'utf8').replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]*>/g, ' ');
html.split('\n').forEach((l, i) => { if (SAYS.test(l)) hits.push(`dev.html:${i + 1}  ${l.trim().slice(0, 140)}`); });

console.log('Texts that say Lab');
for (const h of hits) console.log('    ' + h);
if (hits.length) { console.log(`  FAIL ${hits.length} text(s) still say Lab`); failures++; }
else console.log('  PASS none');
console.log(failures ? `\n${failures} check(s) failed` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
