// Main-game promotion: real guest start, legacy setting off, both source and release pages.
const assert = require('node:assert/strict');
const { chromium, pastStart, pickStarter, BASE } = require('./pw.cjs');
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--mute-audio'] });
  try {
    for (const file of process.argv.includes('--release') ? ['index.html'] : ['dev.html']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      if (file === 'dev.html') await page.route('**/js/core/firebase-config.js*', r => r.fulfill({
        contentType: 'application/javascript', body: 'G.FIREBASE_CONFIG = null;'
      }));
      await page.addInitScript(() => {
        localStorage.setItem('ps.savenote.1', '1');
        localStorage.setItem('ps.ranknote.1', '1');
        localStorage.setItem('ps.lang', 'en');
        localStorage.setItem('ps.settings', JSON.stringify({ lab: false, underdogLadder: false }));
      });
      await page.goto(BASE + '/' + file, { waitUntil: 'load' });
      await pastStart(page, '#btn-guest');
      await page.locator('#btn-guest').click();
      if (file === 'index.html') {
        // Test the actual sealed/obfuscated release through its UI. G stays private.
        await pickStarter(page);
        assert.equal(await page.evaluate(() => typeof window.G), 'undefined');
        assert.equal(await page.locator('#lab-q').count(), 0);
        assert.equal(await page.locator('#set-tabs [data-t=lab]').count(), 0);
        await page.locator('#scr-menu [data-go=upgrades]').click();
        await page.locator('#candy-panel').waitFor({ state: 'visible' });
        await page.locator('#gems-panel').waitFor({ state: 'visible' });
        await page.locator('#scr-upgrades [data-back]').first().click();
        await page.locator('#scr-menu [data-go=play]').click();
        await page.locator('#lab-hud').waitFor({ state: 'visible' });
        assert.match(await page.locator('#lab-hud').textContent(), /^Ability:/);
        await page.keyboard.press('Escape');
        await page.locator('#pause-sum .lab-pool').waitFor({ state: 'visible' });
        assert.ok(!/Lab mode/.test(await page.locator('#pause-sum').textContent()));
        assert.deepEqual(errors, []);
        console.log('PASS promotion: sealed release UI, menus and gameplay');
        await page.close();
        continue;
      }
      await page.waitForFunction(() => G.DB.save);
      await page.evaluate(() => {
        const s = G.DB.save;
        s.owned[813] = { at: Date.now(), from: 'starter' };
        s.partner = s.starter = 813;
        G.Settings.set('lab', false);
        G.Settings.set('underdogLadder', false);
        G.DB.commit(); G.Flow.goMenu();
      });
      await page.locator('#scr-menu [data-go=play]').click();
      await page.waitForFunction(() => G.Game.state === 'playing');
      const result = await page.evaluate(() => ({
        active: G.Lab.active,
        signature: G.Moves.poolFor(G.Game.player.mon).includes('pyro-ball'),
        hud: document.getElementById('lab-hud')?.textContent,
        toggle: !!document.getElementById('lab-q'),
        experimental: !!document.querySelector('#set-tabs [data-t=lab]'),
        modules: ['LabGrowth','LabBranches','LabSets','LabSynergy','LabRecipes','LabSupport',
          'LabRelics','LabSites','Necrozma','LabEndgame','Gems','Resume'].filter(k => !G[k])
      }));
      assert.equal(result.active, true, 'ordinary run gets all promoted gameplay with old Lab setting off');
      assert.equal(result.signature, true, 'species signature is in the ordinary move pool');
      assert.equal(result.toggle, false, 'obsolete opt-in removed');
      assert.equal(result.experimental, false, 'obsolete Experimental tab removed');
      assert.ok(!/LAB/.test(result.hud), 'ability HUD no longer calls an ordinary run Lab');
      assert.deepEqual(result.modules, [], 'all gameplay systems loaded');
      const progress = await page.evaluate(() => {
        const pl = G.Game.player, s = G.DB.save;
        s.stats.runs = 49;
        const before = s.stats.runs;
        const snapshot = G.Resume.snap();
        G.Game.quit();
        return { runs: s.stats.runs - before, resume: snapshot && snapshot.dex === pl.mon.dex,
          achievement: !!s.ach.runs50,
          over: document.getElementById('over-stats').textContent,
          menuPool: G.Moves.poolFor(G.DEX_BY[813]).includes('pyro-ball') };
      });
      assert.equal(progress.resume, true, 'ordinary solo run can be resumed');
      assert.equal(progress.runs, 1, 'real endRun keeps standard run stats');
      assert.equal(progress.achievement, true, 'real endRun awards the run milestone achievement');
      assert.equal(progress.menuPool, true, 'signature pool remains available in menus');
      assert.ok(!/Lab run|experimental/.test(progress.over), 'summary has normal progression');
      assert.deepEqual(errors, [], 'no browser errors');
      console.log('PASS promotion: ' + file);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
