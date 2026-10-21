# MrSurvivor

A free Pokémon bullet heaven in the style of Survivor.io and Megabonk, played in the browser on
PC, tablet and phone. Pick a partner, survive the hordes, level up, evolve your moves and take on
legendaries, alone or in co-op with up to 4 players.

**Play at [play.mrshawn.dev](https://play.mrshawn.dev).** It's free: no ads, nothing to buy, no
donations.

MrSurvivor is a fan-made fork of [PokéSurvivor](https://github.com/JPTER78/pokesurvivor) by
JPTER78 (Jonathan Piera Torregrosa), who wrote the original game's code and music. It is not
affiliated with Nintendo, Creatures, GAME FREAK or The Pokémon Company; Pokémon and its characters
belong to their owners.

## How to play

Create an account or play as a guest, take the personality test to find your partner, and head
into the dungeon.

| Key | Action |
|---|---|
| `W` `A` `S` `D` / arrow keys | Move |
| `1` `2` `3` `4` | Pick the active move |
| `Q` / `E` | Cycle moves |
| `F` (`Y` on a controller) | Pull the markers for things off screen around your Pokémon |
| `Esc` / `P` | Pause |

Controllers work too (Settings → Controls). **On a phone or tablet** (landscape), put your finger
anywhere and drag to move, tap a move at the bottom to switch to it, and use the button at the top
right to pause. The touch buttons can be moved anywhere. The game can be installed as an app ("Add
to Home Screen").

The game is in **English**. Spanish, French, Italian, Brazilian Portuguese and Chinese (Simplified
and Traditional) are in Settings → Graphics → Language.

## The game

- **966 Pokémon** from all 9 generations, with sprites from *Pokémon Mystery Dungeon*
  (PMD SpriteCollab), original music and sound.
- Your Pokémon attacks on its own with its active move. Level-ups offer new moves, stat boosts
  and items (Leftovers, Choice Band...), and moves **evolve** at their top level. Level-up cards
  come in rarities, from Common (×1) to Legendary (×3).
- Rocks, chests and tall grass break; walls and trees block enemy shots; water slows you and lava
  burns (enemies too). The map has power altars, healing springs, locked chests and traps.
- **Rifts** open now and then: step in to fight a legendary in its own arena. Each legendary you
  beat gives a **bond**, which fuses up to 4 moves into one slot that casts them all at once.
- A **type chart** (a water move hurts a Charmander more) and **weather** (sun, rain, sand, snow,
  fog) that boosts some types and weakens others.
- Enemies have personalities: some heal, shield, call their pack or warn before an area attack.
- Each wild Pokémon has a 1 in 4096 chance to be **shiny**. An arrow points to it, and beating it
  makes it yours.
- At 30:00, **Arceus's Judgment** ends the run.
- **Mega Evolution**: past minute 5, a won rift can drop a Mega Stone, and holding it Mega Evolves
  a Pokémon that has a Mega.

Between runs:

- **Upgrades** for each Pokémon. With every upgrade bought, **prestige** it: its upgrades reset
  and its runs get +5% HP, damage, speed and damage cut per prestige level, up to 3; at 3 it
  starts every run holding a random item.
- The **gacha**, pulled on a pixel-art slot machine with **tickets** won by playing (×1 from some
  Pokémon, ×10 from bosses and legendaries). Each region has its own banner, and a Legendary is
  guaranteed by pull 220 (more likely from pull 180). The **Rainbow ×25 ticket** gives 25 pulls
  with at least one Legendary.
- **Radiant forms**: a third look after normal and shiny. The **Radiant Ritual** trades 10 of your
  shinies for one radiant.
- Daily and weekly **missions**, **achievements** with medals and titles, and a **profile** with
  your favourite Pokémon and records.
- **Co-op** for up to 4 friends (add them by nickname, invite them to your room) and
  **leaderboards** (solo or group, daily to all-time, by Pokémon). Co-op connects players
  directly, peer to peer, so a few strict networks can't join.

**Lab mode** (Settings → Experimental) tries out what's still in testing: the moves each Pokémon
learns in the games and one of its abilities, new kinds of moves, signature moves for 70 lines,
evolving during a run, candies, gems, a revive card, resuming a run after a reload, wild
legendaries roaming from 15:00, Mega and Primal rift legendaries, and the **Eternatus raid** at
30:00. Lab runs keep coins, tickets and shinies, but don't count for leaderboards, missions,
achievements or records. In co-op, the host's setting decides.

## Saves

With an account (name and password, or Google), your game is saved in the cloud and follows you to
any device. Unsaved progress is uploaded by itself, and when two devices played offline, their saves
merge: collections join (no Pokémon or shiny is ever lost) and upgrades and stats keep the higher
value. As a guest, progress stays in this browser and moves to your account when you sign up or
log in. A save from the original PokéSurvivor can be imported.

## Development

HTML, CSS and vanilla JavaScript on Canvas 2D, no framework. The fork keeps upstream's code and
adds its own on top, so upstream's updates merge without conflicts:

```
node fork/build.cjs          # build index.html, js/app.min.js and the site pages
node fork/sync.cjs           # pull upstream's updates, rebuild, commit
python -m http.server 8123   # play at http://127.0.0.1:8123/
```

[`fork/README.md`](fork/README.md) explains how the fork is built, what it changes and how each
part is tested; [`fork/LAB.md`](fork/LAB.md) tracks Lab mode. English is the project's language:
new text in the game and the docs is written in English only.

## License and credits

The code is under the [PolyForm Noncommercial License 1.0.0](LICENSE-NONCOMMERCIAL.md): you can use,
study, change and share it, but not for any commercial purpose. Versions of PokéSurvivor up to its
commit `b297089` were published under MIT ([LICENSE](LICENSE)).

Required Notice: Copyright 2026 JPTER78 (https://github.com/JPTER78/pokesurvivor)

- Pokémon sprites: [PMD SpriteCollab](https://github.com/PMDCollab/SpriteCollab), CC BY-NC 4.0, by
  the artists listed in [CREDITS.md](CREDITS.md), [CREDITS-MEGAS.md](CREDITS-MEGAS.md) (Mega
  Evolutions) and [CREDITS-LAB.md](CREDITS-LAB.md) (Lab mode's extra animations).
- Font: Pixelify Sans (SIL Open Font License, `assets/fonts/OFL.txt`).
- Pokémon data: [PokéAPI](https://pokeapi.co).
- Game code and original music: PokéSurvivor by JPTER78.

Pokémon is owned by Nintendo, Creatures Inc. and GAME FREAK. MrSurvivor is a non-profit fan
project.
