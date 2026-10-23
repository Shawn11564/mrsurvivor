#!/usr/bin/env node
// The admin's Change Log (js/fork/change-log.js) and its data (js/fork/changes.json):
//
//   node fork/test-changes.cjs [base-url] [--no-page] [--add-art]
//
//   1. The data: days newest first, each line with a known kind (new, buff, nerf, change, fix, removed),
//      who (all, lab, admin), an area and a text; every commit it names is on main's history, on that day.
//   2. The history: every commit on main since the fork began (first parent, not the upstream merges) that
//      changes the game (dev.html, css/, js/ except generated files) or publishes the artist's art
//      ("Radiants: ..." / "Assets: ...") has its line: it touches js/fork/changes.json itself, or a line or
//      the skip list names it. A game commit without one fails here. --add-art writes the lines for the
//      artist's Asset Admin publishes (the artist never edits changes.json), from their commit subjects.
//   3. The window, in headless Edge (local server: node fork/serve.cjs; --no-page skips it), on dev.html and
//      the built index.html: only the admin opens it, from the admin menu; every line, by day; the kind, who,
//      area and search filters; upstream's notes for a day, and switched off; Esc closes; it fits a phone.
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const FILE = path.join(ROOT, 'js', 'fork', 'changes.json');
const FIRST = '113cecf';                      // the fork's first commit
const args = process.argv.slice(2);
const BASE = args.find(a => !a.startsWith('--')) || require('./pw.cjs').BASE;

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };
const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 28 });

const KINDS = ['new', 'buff', 'nerf', 'change', 'fix', 'removed'], WHO = ['all', 'lab', 'admin'];
const GAME = f => /^(dev\.html$|css\/|js\/)/.test(f)
  && !/^js\/(app\.min\.js|lang\/)/.test(f)
  && !/^js\/fork\/(changes\.json|asset-rev\.json|icon-overrides\.json|radiants\.json|radiant-list\.js)$/.test(f);
const ART = s => /^(Radiants|Assets): /.test(s);

/** changes.json written the way it's kept: one line per change. */
function serialize(j) {
  const val = v => (Array.isArray(v) ? '[' + v.map(x => JSON.stringify(x)).join(', ') + ']' : JSON.stringify(v));
  const line = o => '{ ' + Object.entries(o).map(([k, v]) => JSON.stringify(k) + ': ' + val(v)).join(', ') + ' }';
  const days = j.days.map(d => `    {\n      "d": ${JSON.stringify(d.d)},\n      "title": ${JSON.stringify(d.title || '')},\n      "items": [\n`
    + d.items.map(it => '        ' + line(it)).join(',\n') + '\n      ]\n    }').join(',\n');
  const skip = Object.entries(j.skip || {}).map(([k, v]) => `    ${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(',\n');
  return `{\n  "about": ${JSON.stringify(j.about)},\n  "days": [\n${days}\n  ],\n  "skip": {\n${skip}\n  }\n}\n`;
}

/** A line for an Asset Admin publish, from its subject. */
function artLine(c) {
  const rest = c.s.replace(/^(Radiants|Assets): /, '');
  const fresh = [...c.s.matchAll(/([^,;:(]+?) \(#\d+\) new/g)].map(m => m[1].trim());
  if (/^Radiants: /.test(c.s) && fresh.length && !/;/.test(rest) && fresh.length === (rest.match(/\(#\d+\)/g) || []).length)
    return { k: 'new', s: 'all', a: 'Radiants', t: `New radiant${fresh.length > 1 ? 's' : ''}: ${fresh.join(', ')}.`, c: c.h.slice(0, 7) };
  return { k: 'change', s: 'all', a: /^Radiants: /.test(c.s) ? 'Radiants' : 'Art', t: 'Art from the Asset Admin: ' + rest + '.', c: c.h.slice(0, 7) };
}

function dataAndHistory() {
  console.log('1. The data');
  let j;
  try { j = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { check(false, 'js/fork/changes.json reads as JSON', e.message); return null; }
  const ds = j.days.map(d => d.d);
  check(ds.every(d => /^\d{4}-\d\d-\d\d$/.test(d)) && ds.every((d, i) => !i || d < ds[i - 1]), 'days are dates, newest first, each once', ds);
  const bad = [];
  for (const d of j.days) for (const it of d.items) {
    const cs = Array.isArray(it.c) ? it.c : it.c ? [it.c] : [];
    if (!KINDS.includes(it.k) || !WHO.includes(it.s) || !it.a || typeof it.a !== 'string' || !it.t || typeof it.t !== 'string'
      || (it.n != null && typeof it.n !== 'string') || cs.some(c => !/^[0-9a-f]{7,40}$/.test(c))) bad.push(d.d + ': ' + JSON.stringify(it).slice(0, 120));
  }
  check(!bad.length, 'every line has a kind, who, area and text (and well-formed numbers and commits)', bad.slice(0, 5));

  // main's own history: the fork's commits and merges (first parent), with their day and files.
  const log = git('log', '--first-parent', '--date=format:%Y-%m-%d', '--format=@@%H|%P|%ad|%s', '--name-only', FIRST + '~1..HEAD');
  const commits = log.split('@@').filter(Boolean).map(b => {
    const [head, ...files] = b.trim().split('\n');
    const [h, p, d, ...s] = head.split('|');
    return { h, merge: p.trim().split(' ').length > 1, d, s: s.join('|'), files: files.filter(Boolean) };
  });
  const find = c => commits.find(x => x.h.startsWith(c));
  const wrongDay = [], unknown = [];
  for (const d of j.days) for (const it of d.items) {
    const cs = (Array.isArray(it.c) ? it.c : it.c ? [it.c] : []).map(find);
    if (cs.some(x => !x)) unknown.push(d.d + ': ' + it.c);
    else if (cs.length && !cs.some(x => x.d === d.d)) wrongDay.push(`${d.d}: ${it.c} is from ${cs[0].d}`);
  }
  for (const c of Object.keys(j.skip || {})) if (!find(c)) unknown.push('skip: ' + c);
  check(!unknown.length, "every commit named is on main's history", unknown);
  check(!wrongDay.length, 'every line sits on its commit\'s day', wrongDay);

  console.log('2. The history');
  const named = new Set();
  for (const d of j.days) for (const it of d.items) for (const c of Array.isArray(it.c) ? it.c : it.c ? [it.c] : []) named.add(c);
  for (const c of Object.keys(j.skip || {})) named.add(c);
  const has = c => [...named].some(n => c.h.startsWith(n)) || c.files.includes('js/fork/changes.json');
  const need = commits.filter(c => !c.merge && (c.files.some(GAME) || ART(c.s)));
  let missing = need.filter(c => !has(c));
  const art = missing.filter(c => ART(c.s));
  if (art.length && args.includes('--add-art')) {
    for (const c of art.reverse()) {
      let day = j.days.find(d => d.d === c.d);
      if (!day) { day = { d: c.d, title: '', items: [] }; j.days.push(day); j.days.sort((a, b) => (a.d < b.d ? 1 : -1)); }
      day.items.unshift(artLine(c));
    }
    fs.writeFileSync(FILE, serialize(j));
    console.log(`  wrote ${art.length} Asset Admin line(s) into js/fork/changes.json: check the wording`);
    missing = missing.filter(c => !ART(c.s));
  }
  check(!missing.length, `every one of the ${need.length} game commits since the fork began has its line in js/fork/changes.json`,
    missing.map(c => `${c.h.slice(0, 7)} ${c.d} ${c.s.slice(0, 90)}`));
  if (missing.some(c => ART(c.s))) console.log('  (the Asset Admin ones: node fork/test-changes.cjs --add-art writes them)');
  return j;
}

async function windowChecks(j) {
  const { chromium, pastStart } = require('./pw.cjs');
  const all = j.days.flatMap(d => d.items);
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    // The built page seals G, so there: the menu button, the file where the bundle looks for it, no errors.
    {
      console.log('3. The built index.html');
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto(BASE + '/index.html', { waitUntil: 'load' });
      await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
      await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 30000 });
      const r = await page.evaluate(async () => {
        const own = document.querySelector('script[src*="app.min.js"]');
        const res = await fetch(new URL('fork/changes.json', own.src).href + '?t=1', { cache: 'no-store' });
        return { btn: (document.getElementById('adm-changes') || {}).textContent, admin: getComputedStyle(document.getElementById('adm-btn')).display,
          ok: res.ok, days: res.ok ? (await res.json()).days.length : 0 };
      });
      check(r.btn === 'Change Log', 'the admin menu has the Change Log button', r.btn);
      check(r.admin === 'none', 'a guest gets no ADMIN button', r.admin);
      check(r.ok && r.days === j.days.length, 'js/fork/changes.json loads from where the bundle looks for it', r);
      check(!errs.length, 'no page errors', errs);
      await ctx.close();
    }
    {
      console.log('4. The window (dev.html)');
      const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, serviceWorkers: 'block', locale: 'en-US' });
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(String(e)));
      await page.goto(BASE + '/dev.html', { waitUntil: 'load' });
      await page.waitForFunction(() => window.G && G.DB && G.Admin && G.ChangeLog && document.getElementById('adm-btn'), null, { timeout: 60000 });
      await pastStart(page, '#btn-guest'); await page.click('#btn-guest');
      await page.waitForSelector('#scr-starters', { state: 'visible', timeout: 30000 });

      await page.evaluate(() => G.ChangeLog.open());
      await page.waitForTimeout(300);
      check(!(await page.evaluate(() => G.ChangeLog.isOpen())), 'a player who isn\'t the admin can\'t open it');

      // The admin: the owner's uid (no cloud needed, the window reads a file).
      await page.evaluate(() => { const fb = { uid: G.Admin.ADMINS[0] }; Object.defineProperty(G.DB, 'fb', { get: () => fb, configurable: true }); });
      await page.waitForSelector('#adm-btn', { state: 'visible', timeout: 5000 });
      await page.click('#adm-btn');
      await page.click('#adm-changes');
      await page.waitForSelector('#chl .chl-day', { timeout: 15000 });
      const view = () => page.evaluate(() => ({
        days: [...document.querySelectorAll('#chl .chl-day')].map(s => s.dataset.d),
        items: [...document.querySelectorAll('#chl .chl-it')].map(i => ({ k: i.dataset.k, tag: (i.querySelector('.chl-tag.lab, .chl-tag.admin') || {}).textContent || '', t: i.querySelector('.chl-t').textContent })),
        count: document.getElementById('chl-count').textContent,
        ups: [...document.querySelectorAll('#chl details.chl-up')].map(d => ({ d: d.dataset.d, n: d.querySelectorAll('li').length }))
      }));
      let v = await view();
      check(v.days.join() === j.days.map(d => d.d).join(), 'one section per day, newest first', v.days);
      check(v.items.length === all.length && v.count === `${all.length} changes over ${j.days.length} days`, `every line is there (${all.length})`, v.count);
      check(await page.evaluate(() => getComputedStyle(document.getElementById('adm')).display === 'none'), 'the admin menu closes behind it');
      const day1 = await page.evaluate(() => document.querySelector('#chl .chl-day .chl-dh').textContent);
      check(day1.includes(j.days[0].title), 'the newest day shows its title', day1.slice(0, 80));

      // Kind: Nerf only.
      await page.click('#chl-kinds [data-v="nerf"]');
      v = await view();
      const nerfs = all.filter(it => it.k === 'nerf').length;
      check(v.items.length === nerfs && v.items.every(i => i.k === 'nerf') && !v.ups.length, `Nerf shows the ${nerfs} nerfs and nothing else (upstream has none)`, { n: v.items.length, ups: v.ups });
      await page.click('#chl-kinds [data-v="nerf"]');
      await page.click('#chl-kinds [data-v="fix"]');
      const upKinds = await page.evaluate(() => [...document.querySelectorAll('#chl details.chl-up li i')].map(i => i.textContent));
      check(upKinds.length > 0 && upKinds.every(k => k === 'Fixed'), "Fixed: upstream's fixes only", upKinds);
      await page.click('#chl-kinds [data-v="fix"]');
      // Who: Lab.
      await page.click('#chl-who [data-v="lab"]');
      v = await view();
      const labs = all.filter(it => it.s === 'lab').length;
      check(v.items.length === labs && v.items.every(i => i.tag === 'LAB') && !v.ups.length, `Lab shows the ${labs} Lab lines, each tagged LAB`, v.items.length);
      await page.click('#chl-who [data-v="lab"]');
      // Area and search.
      await page.selectOption('#chl-area', 'Gacha');
      v = await view();
      check(v.items.length === all.filter(it => it.a === 'Gacha').length, 'the area list shows that area\'s lines', v.items.length);
      await page.selectOption('#chl-area', '');
      await page.fill('#chl-q', 'life orb');
      v = await view();
      check(v.items.length >= 1 && v.items.every(i => /life orb/i.test(i.t)), 'search finds Life Orb', v.items.map(i => i.t.slice(0, 50)));
      await page.fill('#chl-q', '');

      // Upstream's notes, under their day, folded; and switched off.
      v = await view();
      const want = await page.evaluate(first => G.CHANGELOG.filter(x => x.d >= first).map(x => ({ d: x.d, n: ['new', 'chg', 'fix'].reduce((a, k) => a + (x[k] || []).length, 0) })), j.days[j.days.length - 1].d);
      check(want.length > 0 && want.every(w => v.ups.some(u => u.d === w.d && u.n === w.n)), "upstream's notes from the fork's first day on, under their date", { want, got: v.ups });
      check(await page.evaluate(() => [...document.querySelectorAll('#chl details.chl-up')].every(d => !d.open)), 'folded until opened');
      await page.click('#chl-upt');
      v = await view();
      check(!v.ups.length && v.items.length === all.length, 'Upstream notes off: none, every own line still there');
      await page.click('#chl-upt');

      // A commit links to GitHub.
      const href = await page.evaluate(() => (document.querySelector('#chl a.chl-c') || {}).href);
      check(/^https:\/\/github\.com\/Shawn11564\/mrsurvivor\/commit\/[0-9a-f]{7}$/.test(href || ''), 'commits link to GitHub', href);

      // A phone: one column, nothing wider than the screen.
      await page.setViewportSize({ width: 390, height: 800 });
      await page.waitForTimeout(200);
      const fit = await page.evaluate(() => {
        const m = document.getElementById('chl-main');
        return { rail: getComputedStyle(document.getElementById('chl-rail')).display, over: m.scrollWidth - m.clientWidth };
      });
      check(fit.rail === 'none' && fit.over <= 0, 'a phone: no day rail, no sideways scroll', fit);
      await page.setViewportSize({ width: 1400, height: 900 });

      await page.keyboard.press('Escape');
      check(!(await page.evaluate(() => G.ChangeLog.isOpen())), 'Esc closes it');
      check(!errs.length, 'no page errors', errs);
      await ctx.close();
    }
  } finally { await browser.close(); }
}

(async () => {
  try {
    const j = dataAndHistory();
    if (j && !args.includes('--no-page')) await windowChecks(j);
  } catch (e) { console.error(e); failures++; }
  console.log(failures ? `\n${failures} check(s) FAILED` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
})();
