/* ============ rift-rewards.js — beating a rift legendary, the same for everyone (MrSurvivor fork) ============
 * TODO 44: a player who's down when the legendary falls gets up right then (30% HP, rift.js's usual
 *   revive). js/systems/rift.js only revived them back on the map, 5 s later, so in co-op it looked
 *   as if they'd missed the win.
 * TODO 45: the legendary's held item used to fall as one pickup, and pickups go to the nearest player
 *   (js/entities/pickup.js), so in co-op whoever stood closest got it. Now it doesn't drop: every player
 *   gets their own roll, an item other than the one they hold, offered back on the map once no other
 *   screen is open (like the Mega Stone, js/fork/mega.js). Solo it's the same item, just never lost on
 *   the floor. Coins, tickets and XP were already shared by the team.
 * Hooks: G.Pickups.drop (an 'item' dropped in the arena: not dropped), G.Rift.update (the win, on every
 * machine: the host's 'aw' makes it on the guests). Test: fork/test-rift-rewards.cjs.
 */
G.RiftRewards = (() => {
  let won = false, pending = null;

  const drop = G.Pickups.drop;
  G.Pickups.drop = function (kind) {
    if (kind === 'item' && G.Rift.inArena) return;
    return drop.apply(this, arguments);
  };

  const update = G.Rift.update;
  G.Rift.update = function (dt, pl) {
    const r = update.apply(this, arguments);
    const a = G.Rift.arena, now = !!a && a.phase === 'won';
    if (now && !won && pl) {
      if (pl.dead) {
        pl.revive(0.3);
        G.FX.dmgText(pl.x, pl.y - pl.bodyH - 26, 'Back on your feet!', '#5fe08a', true);
        G.FX.ring(pl.x, pl.y, 8, 90, '#5fe08a', 0.7, 5);
      }
      pending = G.Items.roll(pl.item);
    }
    won = now;
    return r;
  };

  // Offered back on the map, with no other screen in front (bond, cards, the Mega Stone...).
  setInterval(() => {
    if (!pending || !G.Game) return;
    const pl = G.Game.player;
    if (!pl || G.Game.state === 'ui' || G.Game.state === 'over') { pending = null; won = false; return; }
    if (G.Game.state !== 'playing' || G.Rift.inArena || pl.dead) return;
    if (['scr-bond', 'scr-item', 'scr-levelup', 'scr-pause'].some(G.UI.isOpen)) return;
    const id = pending;
    pending = null;
    G.Game.offerItem(id === pl.item ? G.Items.roll(pl.item) : id);
  }, 250);

  return { get pending() { return pending; } };
})();
