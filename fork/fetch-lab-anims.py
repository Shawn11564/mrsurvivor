#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Downloads the extra PMD animations that Lab mode's signature moves use (fork/LAB.md, phase 5).

    python fork/fetch-lab-anims.py

Each signature move in js/fork/lab/lab-moves.js lists the animations it would like, in order
(`anim: ['Kick', 'Attack']`). For every species that can learn it, this reads the species'
AnimData.xml on SpriteCollab (more complete than the tracker fork/fetch-lab.cjs reads) and takes
the first one it has. The game already has Idle, Walk, Attack, Shoot, Charge, Hurt and Faint, so
only the others are downloaded, processed exactly like upstream's tools/fetch_sprites.py does:
  assets/pokemon/{dex}/lab/{Anim}.png       the sheet (and s/lab/ for the shiny)
  js/fork/lab/lab-anims.js                  their geometry (G.LAB_ANIMS; js/fork/lab/anims.js
                                            adds it to G.SPRITE_META as 'lab/{Anim}')
  CREDITS-LAB.md                            the artists of those species (CC BY-NC 4.0)
Upstream's tools only read the 7 standard sheets of each folder, so these never get in their way.
Re-run it after adding signature moves.
"""
import importlib.util
import json
import os
import subprocess
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('fetch_sprites', os.path.join(ROOT, 'tools', 'fetch_sprites.py'))
fs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fs)

OUT_META = os.path.join(ROOT, 'js', 'fork', 'lab', 'lab-anims.js')
OUT_CREDITS = os.path.join(ROOT, 'CREDITS-LAB.md')

# Which species want which animations: lab-moves.js + the evolution lines in lab-data.js,
# worked out by the same rules as G.Lab (sig.line / sig.final / sig.dex).
WANTED_JS = r"""
const vm = require('vm'), fs = require('fs'), path = require('path');
const G = { U: {}, I18n: { add() {} } }, ctx = vm.createContext({ G });
for (const f of ['js/data/sprites-meta.js', 'js/fork/lab/lab-data.js', 'js/fork/lab/lab-moves.js'])
  vm.runInContext(fs.readFileSync(path.join(process.argv[1], f), 'utf8'), ctx);
const D = G.LabData, byFam = {};
for (const d in D.fam) (byFam[D.fam[d]] = byFam[D.fam[d]] || []).push(+d);
const line = d => byFam[D.fam[d]] || [d];
const out = {};
for (const m of G.LabMoves) {
  if (!m.sig || !m.anim) continue;
  const who = m.sig.dex || (m.sig.line ? line(m.sig.line) : m.sig.final.flatMap(r => line(r).filter(d => !D.evo[d])));
  for (const d of who) if (G.SPRITE_META[d]) (out[d] = out[d] || []).push({ id: m.id, prefs: m.anim, shiny: !!G.SPRITE_META[d].sh });
}
console.log(JSON.stringify(out));
"""


def wanted():
    r = subprocess.run(['node', '-e', WANTED_JS, ROOT], capture_output=True, text=True, check=True)
    return {int(k): v for k, v in json.loads(r.stdout).items()}


def one(job):
    dex, moves = job
    url = f'{fs.BASE}/{dex:04d}'
    xml = fs.fetch(url + '/AnimData.xml')
    if not xml:
        return dex, None, {}
    anims, _ = fs.parse_animdata(xml.decode('utf-8', 'replace'))
    have = {k for k in anims}
    names, chosen = [], {}
    for m in moves:
        pick = next((p for p in m['prefs'] if p in have), None)
        chosen[m['id']] = pick
        if pick and pick not in fs.WANT and pick not in names:
            names.append(pick)
    if not names:
        return dex, None, chosen
    meta = {'a': {}}
    out_dir = os.path.join(fs.OUT_ASSETS, str(dex), 'lab')
    shiny = moves[0]['shiny']
    if shiny:
        sxml = fs.fetch(url + '/0001/AnimData.xml')
        sanims = fs.parse_animdata(sxml.decode('utf-8', 'replace'))[0] if sxml else {}
    for name in names:
        g = sheet(url, out_dir, anims, name)
        if not g:
            continue
        meta['a'][name] = g
        if shiny:
            sg = sheet(url + '/0001', os.path.join(fs.OUT_ASSETS, str(dex), 's', 'lab'), sanims, name, g)
            if not sg:
                meta.setdefault('sm', []).append(name)
            elif sg != g:
                meta.setdefault('sa', {})[name] = sg
    return dex, meta if meta['a'] else None, chosen


def sheet(url_base, out_dir, anims, name, ref=None):
    """One animation sheet, as fs.download_set does for the standard ones."""
    src, geom = fs.resolve(anims, name)
    if not geom:
        return None
    png = fs.fetch(f'{url_base}/{src}-Anim.png')
    if not png:
        return None
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, name + '.png')
    w, h = fs.save_optimized(png, path)
    cols, rows = w // geom['w'], h // geom['h']
    if rows < 1 or cols < 1:
        os.remove(path)
        return None
    if ref and ref['w'] == geom['w'] and ref['h'] == geom['h']:
        ax, ay = ref['ax'], ref['ay']
    else:
        sh = fs.fetch(f'{url_base}/{src}-Shadow.png')
        anchor = fs.ground_anchor(sh, geom['w'], geom['h']) if sh else None
        ax, ay = anchor if anchor else (geom['w'] / 2, geom['h'] * 0.78)
    return {'w': geom['w'], 'h': geom['h'], 'n': min(geom['n'], cols), 'r': rows, 'd': geom['d'][:cols], 'ax': ax, 'ay': ay}


def credits(dexes, names):
    """CREDITS-LAB.md: who drew each species' sprites (its credits.txt)."""
    people = {}
    for line in (fs.fetch(f'{fs.RAW}/credit_names.txt') or b'').decode('utf-8', 'replace').splitlines()[1:]:
        p = line.split('\t')
        if len(p) >= 2:
            people[p[1].strip()] = (p[0].strip(), p[2].strip() if len(p) > 2 else '')

    def who(dex):
        txt = (fs.fetch(f'{fs.BASE}/{dex:04d}/credits.txt') or b'').decode('utf-8', 'replace')
        authors = []
        for line in txt.splitlines():
            p = line.split('\t')
            a = p[1].strip() if len(p) > 1 else ''
            if a and a not in authors:
                authors.append(a)
        shown = [f'{people.get(a, (a, ""))[0]} ({people[a][1]})' if people.get(a, ('', ''))[1] else people.get(a, (a, ''))[0] for a in authors]
        return dex, shown

    with ThreadPoolExecutor(max_workers=12) as ex:
        rows = [f'| {d} | {", ".join(names[d])} | {", ".join(s) or "?"} |' for d, s in ex.map(who, sorted(dexes))]
    with open(OUT_CREDITS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join([
            '# Lab mode animations',
            '',
            'The extra animations Lab mode\'s signature moves use (`assets/pokemon/{dex}/lab/`, see',
            '`fork/LAB.md`) come from [SpriteCollab](https://github.com/PMDCollab/SpriteCollab), under',
            '[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): non-commercial use, credited to',
            'their artists. Generated by `fork/fetch-lab-anims.py`. All other sprites: `CREDITS.md`.',
            '',
            '| Dex | Animations | Artists of that Pokémon\'s sprites |',
            '|---|---|---|',
        ] + rows) + '\n')


def main():
    jobs = sorted(wanted().items())
    print(f'lab anims: {len(jobs)} species with signature moves')
    metas, picks = {}, {}
    with ThreadPoolExecutor(max_workers=8) as ex:
        for dex, meta, chosen in ex.map(one, jobs):
            picks[dex] = chosen
            if meta:
                metas[dex] = meta
    names = {d: sorted(m['a']) for d, m in metas.items()}
    body = json.dumps({str(d): metas[d] for d in sorted(metas)}, separators=(',', ':'))
    with open(OUT_META, 'w', encoding='utf-8', newline='\n') as f:
        f.write('/* ============ lab-anims.js — GENERADO por fork/fetch-lab-anims.py, no editar a mano ============\n'
                ' * Las animaciones extra de los movimientos de firma del modo Lab (fork/LAB.md, fase 5), por\n'
                ' * Pokémon, con la geometría de js/data/sprites-meta.js: a (normal), sa (shiny si difiere), sm\n'
                ' * (las que le faltan al shiny). js/fork/lab/anims.js las añade a G.SPRITE_META como "lab/{Anim}".\n'
                ' */\n'
                f'G.LAB_ANIMS = {body};\n')
    credits(metas.keys(), names)
    used = sum(len(v) for v in names.values())
    fallback = sum(1 for c in picks.values() for v in c.values() if v in fs.WANT)
    none = sum(1 for c in picks.values() for v in c.values() if not v)
    print(f'lab anims: {used} extra sheets for {len(metas)} species; {fallback} moves use a standard one, {none} have none of theirs')


if __name__ == '__main__':
    main()
