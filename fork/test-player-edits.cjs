#!/usr/bin/env node
// The Player Manager's save edits survive the game's merge (js/fork/player-edits.js), run on the
// real merge() of js/core/db.js in Node (no server, no browser):
//
//   node fork/test-player-edits.cjs
//
// The admin edits the CLOUD copy; the player still has an older copy in their browser, and the
// game merges the two (on load, on every upload, on a pull). Checks:
//   1. Coins and tickets given or taken by the admin stay, whichever way round the copies merge,
//      and merging again (or twice) doesn't count them twice.
//   2. A deleted Pokémon (or only its shiny / radiant) doesn't come back from the old copy; the
//      partner moves to another Pokémon; one given back or caught again later stays.
//   3. Resets: the old copy gets the reset before merging (Pokémon only; + coins and tickets;
//      full), and what the player gets after the reset stays.
//   4. Merging is still idempotent.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

let failures = 0;
const check = (ok, what, extra) => { console.log((ok ? '  PASS ' : '  FAIL ') + what + (extra !== undefined ? ' (' + JSON.stringify(extra) + ')' : '')); if (!ok) failures++; };

const store = new Map();
const ctx = { console, Date, Math, JSON, Promise, setTimeout, clearTimeout, TextEncoder,
  localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
  location: { protocol: 'file:', hostname: '' }, navigator: {}, document: {} };
ctx.window = ctx;
ctx.G = {};
vm.createContext(ctx);
for (const f of ['js/core/db.js', 'js/fork/player-edits.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f });
const G = ctx.G, PE = G.PlayerEdits, merge = (a, b) => G.DB.merge(a, b);
const clone = o => JSON.parse(JSON.stringify(o));

/** A save as the game keeps it: a ledger with this device's line. */
function save(t0) {
  return {
    v: 3, name: 'Ash', created: t0, updated: t0, coins: 10000, gems: 5,
    owned: { 25: { at: t0, from: 'starter' }, 4: { at: t0, from: 'gacha' }, 150: { at: t0, from: 'gacha' } },
    shiny: { 25: { at: t0, from: 'wild' } }, radiant: { 150: { at: t0, from: 'ritual' } },
    partner: 25, partnerShiny: true, starter: 25, personality: { trait: 'x' },
    upgrades: {}, pupg: { 25: { hp: 3 } }, dfav: { 25: t0 }, pused: { 25: 9, 4: 2 }, pstart: {},
    tickets: { t1: 30, t10: 2, t25: 1 }, pity: {}, legends: { 150: t0 }, arenas: {}, itemsFound: {}, evoMoves: {},
    ach: { a1: t0 }, missions: {}, profile: { favs: [{ dex: 25, shiny: true }, { dex: 4 }], title: 'Champ' },
    stats: { runs: 40, bestTime: 900, bestLevel: 30, totalKills: 5000, pulls: 80 },
    lab: { candy: { 25: 4 }, cpts: { 25: { hp: 2 } } },
    led: { base: { c: [500, 0], t1: [0, 0], t10: [0, 0], t25: [0, 0], gm: [0, 0] },
           dabc12345: { c: [12000, 2500], t1: [30, 0], t10: [2, 0], t25: [1, 0], gm: [5, 0] } }
  };
}
const T = Date.now() - 86400000;

console.log('1. Currencies');
{
  const local = save(T), cloud = clone(local);
  check(PE.addCur(cloud, 'c', 1000) === 1000 && cloud.coins === 11000, 'admin gives 1000 coins on the cloud copy');
  PE.addCur(cloud, 't10', 5);
  const m1 = merge(local, cloud), m2 = merge(cloud, local);
  check(m1.coins === 11000 && m2.coins === 11000, 'both merge orders keep the gift', [m1.coins, m2.coins]);
  check(m1.tickets.t10 === 7, 'the tickets too', m1.tickets.t10);
  const m3 = merge(m1, cloud), m4 = merge(merge(m1, local), m2);
  check(m3.coins === 11000 && m4.coins === 11000, 'merging again does not count it twice', [m3.coins, m4.coins]);
  // The player spends 300 on their device after the gift came in (their own line).
  const after = clone(m1); after.coins -= 300; after.led.dabc12345.c[1] += 300;
  check(merge(after, cloud).coins === 10700, 'their own spending after it still counts', merge(after, cloud).coins);
  const c2 = clone(cloud);
  check(PE.addCur(c2, 'c', -50000) === -11000 && c2.coins === 0, 'taking more than they have stops at 0');
  check(merge(local, c2).coins === 0, 'and the take survives the merge', merge(local, c2).coins);
}

console.log('2. Deleting Pokémon');
{
  const local = save(T), cloud = clone(local);
  PE.remove(cloud, 25, 'all');
  const m = merge(local, cloud);
  check(!m.owned[25] && !m.shiny[25], 'a deleted Pokémon (and its shiny) does not come back from the old copy');
  check(m.partner === 4 && m.partnerShiny === false, 'the partner moves to the most played one left', [m.partner, m.partnerShiny]);
  check(!m.profile.favs.some(f => f.dex === 25), 'it leaves the profile favourites');
  check(merge(m, local).owned[25] === undefined, 'nor after merging the old copy again');
  const c2 = clone(local); PE.remove(c2, 150, 'radiant');
  const m2 = merge(local, c2);
  check(m2.owned[150] && !m2.radiant[150], 'removing only the radiant keeps the Pokémon');
  const c3 = clone(local); PE.remove(c3, 25, 'shiny');
  const m3 = merge(local, c3);
  check(m3.owned[25] && !m3.shiny[25] && m3.partnerShiny === false, 'removing only the shiny keeps the Pokémon, plays it normal');
  // Given back later by the admin: the old copy's older entry doesn't win the union.
  const c4 = clone(cloud); PE.give(c4, 25, 'shiny', Date.now() + 1000);
  const m4 = merge(local, c4);
  check(m4.owned[25] && m4.shiny[25], 'given back later: it stays (the union no longer picks the deleted entry)');
  // Caught again by the player after the deletion.
  const back = clone(m); back.owned[25] = { at: Date.now() + 2000, from: 'wild' };
  check(!!merge(back, local).owned[25], 'caught again later: it stays');
}

console.log('3. Resets');
{
  const local = save(T);
  for (const kind of ['mons', 'monscur', 'full']) {
    const cloud = clone(local);
    PE.reset(cloud, kind, Date.now() - 1000);
    for (const [label, m] of [['old copy first', merge(local, cloud)], ['cloud first', merge(cloud, local)]]) {
      const owned = Object.keys(m.owned || {}).length;
      const ok = owned === 0 && Object.keys(m.shiny || {}).length === 0 && Object.keys(m.radiant || {}).length === 0 && m.partner == null && m.starter == null;
      check(ok, `${kind} (${label}): no Pokémon, no partner (the test runs again)`, { owned, partner: m.partner });
      if (kind === 'mons') check(m.coins === 10000 && m.tickets.t1 === 30 && m.stats.runs === 40 && !(m.lab.candy || {})[25] && !m.pupg[25] && m.profile.favs.length === 0,
        `mons (${label}): coins, tickets and stats stay; upgrades, candies, favourites go`, { coins: m.coins, t1: m.tickets.t1 });
      if (kind === 'monscur') check(m.coins === 500 && m.tickets.t1 === 0 && m.tickets.t10 === 0 && m.tickets.t25 === 0 && m.gems === 0 && m.stats.runs === 40,
        `monscur (${label}): coins back to 500, tickets and gems 0, stats stay`, { coins: m.coins, t: m.tickets, gems: m.gems });
      if (kind === 'full') check(m.coins === 500 && m.stats.runs === 0 && Object.keys(m.ach).length === 0 && Object.keys(m.legends).length === 0 && m.name === 'Ash' && m.profile.title === '',
        `full (${label}): a new save with the same name`, { coins: m.coins, runs: m.stats.runs, name: m.name });
    }
    // After the reset the player plays on (a new starter, coins earned on their device).
    const fresh = merge(cloud, local);
    fresh.owned[7] = { at: Date.now(), from: 'starter' }; fresh.partner = 7; fresh.starter = 7;
    fresh.coins += 40; fresh.led.dabc12345 = Object.assign({}, fresh.led.dabc12345 || {}, { c: [((fresh.led.dabc12345 || {}).c || [0, 0])[0] + 40, ((fresh.led.dabc12345 || {}).c || [0, 0])[1]] });
    const later = merge(fresh, local);
    check(later.owned[7] && later.partner === 7 && Object.keys(later.owned).length === 1, `${kind}: what they get after the reset stays when the old copy comes back`, Object.keys(later.owned));
    check(later.coins === fresh.coins, `${kind}: coins earned after it stay too`, [later.coins, fresh.coins]);
    check(JSON.stringify(merge(later, later)) === JSON.stringify(merge(merge(later, local), later)), `${kind}: merging is still idempotent`);
  }
  // Two resets in a row; the old copy missed both.
  const cloud = clone(local);
  PE.addCur(cloud, 'c', 777);
  PE.reset(cloud, 'mons', Date.now() - 5000);
  PE.give(cloud, 1, 'normal', Date.now() - 4000);
  PE.reset(cloud, 'monscur', Date.now() - 3000);
  const m = merge(local, cloud);
  check(Object.keys(m.owned).length === 0 && m.coins === 500 && Object.keys(m.admW).length === 2, 'two resets the old copy missed: both apply, in order');
}

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
