#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Downloads the Mega Evolution (and Primal) sprites from SpriteCollab for MrSurvivor's
Mega Stones (js/fork/mega.js).

    python fork/fetch-megas.py

Every Mega/Primal form that has at least the Idle, Walk and Attack sheets is used
(the same rule as upstream's tools/fetch_sprites.py). It reuses that tool's download
code unchanged, so the sheets are processed exactly like the normal sprites:
  assets/pokemon/m{dex}/        the Mega's sheets (key 'm6' for Mega Charizard)
  assets/pokemon/m{dex}/s/      its shiny, when SpriteCollab has one
  js/fork/mega-sprites.js       their geometry (into G.SPRITE_META) and which form each is
  CREDITS-MEGAS.md              the artists of every sheet (CC BY-NC 4.0)
Upstream's tools only read numeric folders, so these never get in their way.
Only one form per Pokemon (the first one with sprites: Charizard X, Mewtwo Y).
Re-run it to pick up Megas SpriteCollab adds later.
"""
import importlib.util
import io
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location('fetch_sprites', os.path.join(ROOT, 'tools', 'fetch_sprites.py'))
fs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fs)

OUT_META = os.path.join(ROOT, 'js', 'fork', 'mega-sprites.js')
OUT_CREDITS = os.path.join(ROOT, 'CREDITS-MEGAS.md')
SKIP = ('Altcolor', 'Baby', 'Alternate', 'Skytemple', 'Shadow')


def forms(tracker):
    """[(dex, form id, Pokemon name, form name, has shiny)] for every usable Mega/Primal."""
    out, seen = [], set()
    for tag, node in sorted(tracker.items()):
        if not tag.isdigit():
            continue
        for fid, f in sorted(node.get('subgroups', {}).items()):
            name = f.get('name', '')
            if not (name.startswith('Mega') or name == 'Primal') or any(s in name for s in SKIP):
                continue
            if not fs.REQUIRED <= set(f.get('sprite_files', {})) or int(tag) in seen:
                continue
            sh = f.get('subgroups', {}).get('0001', {})
            out.append((int(tag), fid, node.get('name', ''), name, {'Idle', 'Walk'} <= set(sh.get('sprite_files', {}))))
            seen.add(int(tag))
    return out


def one(job):
    dex, fid, _, _, want_shiny = job
    url = f'{fs.BASE}/{dex:04d}/{fid}'
    out_dir = os.path.join(fs.OUT_ASSETS, f'm{dex}')
    xml = fs.fetch(url + '/AnimData.xml')
    if not xml:
        return dex, None
    anims, shadow = fs.parse_animdata(xml.decode('utf-8', 'replace'))
    normal = fs.download_set(url, out_dir, anims)
    if not fs.REQUIRED <= set(normal):
        return dex, None
    meta = {'s': shadow, 'a': normal}
    if want_shiny:
        sxml = fs.fetch(url + '/0001/AnimData.xml')
        sanims = fs.parse_animdata(sxml.decode('utf-8', 'replace'))[0] if sxml else anims
        shiny = fs.download_set(url + '/0001', os.path.join(out_dir, 's'), sanims, normal)
        if {'Idle', 'Walk'} <= set(shiny):
            meta['sh'] = 1
            diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
            if diff:
                meta['sa'] = diff
            miss = [k for k in normal if k not in shiny]
            if miss:
                meta['sm'] = miss
    return dex, meta


def credits(jobs, metas):
    """CREDITS-MEGAS.md: who drew each sheet (credits.txt of the form and of its shiny)."""
    names = {}
    for line in (fs.fetch(f'{fs.RAW}/credit_names.txt') or b'').decode('utf-8', 'replace').splitlines()[1:]:
        p = line.split('\t')
        if len(p) >= 2:
            names[p[1].strip()] = (p[0].strip(), p[2].strip() if len(p) > 2 else '')
            names[p[0].strip()] = names[p[1].strip()]

    def who(job):
        dex, fid, pname, fname, _ = job
        txt = (fs.fetch(f'{fs.BASE}/{dex:04d}/{fid}/credits.txt') or b'').decode('utf-8', 'replace')
        if metas[dex].get('sh'):
            txt += '\n' + (fs.fetch(f'{fs.BASE}/{dex:04d}/{fid}/0001/credits.txt') or b'').decode('utf-8', 'replace')
        authors = []
        for line in txt.splitlines():
            p = line.split('\t')
            a = p[1].strip() if len(p) > 1 else ''
            if a and a not in authors:
                authors.append(a)
        return job, authors

    rows = []
    with ThreadPoolExecutor(max_workers=12) as ex:
        for (dex, fid, pname, fname, _), authors in ex.map(who, [j for j in jobs if j[0] in metas]):
            shown = []
            for a in authors:
                disp, contact = names.get(a, (a, ''))
                shown.append(f'{disp} ({contact})' if contact else disp)
            rows.append(f'| {dex} | {pname} {fname.replace("_", " ")} | {", ".join(shown) or "?"} |')
    lines = [
        '# Mega Evolution sprites',
        '',
        'MrSurvivor\'s Mega and Primal sprites (`assets/pokemon/m{dex}/`, used by the Mega Stones in',
        '`js/fork/mega.js`) come from [SpriteCollab](https://github.com/PMDCollab/SpriteCollab), under',
        '[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): non-commercial use, credited to',
        'their artists. Generated by `fork/fetch-megas.py`. All other sprites: `CREDITS.md`.',
        '',
        '| Dex | Form | Artists (normal and shiny) |',
        '|---|---|---|',
    ] + sorted(rows, key=lambda r: int(r.split('|')[1])) + ['']
    with io.open(OUT_CREDITS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))


def main():
    print('Reading SpriteCollab tracker.json...')
    tracker = json.loads(fs.fetch(fs.RAW + '/tracker.json').decode('utf-8'))
    jobs = forms(tracker)
    print(f'{len(jobs)} Mega/Primal forms with sprites ({sum(1 for j in jobs if j[4])} with shiny)')
    metas, failed = {}, []
    with ThreadPoolExecutor(max_workers=12) as ex:
        for dex, meta in ex.map(one, jobs):
            if meta:
                metas[dex] = meta
            else:
                failed.append(dex)
    form_of = {j[0]: j[3] for j in jobs if j[0] in metas}
    lines = [
        '/* ============ mega-sprites.js — GENERATED by fork/fetch-megas.py, don\'t edit ============',
        ' * SpriteCollab\'s Mega Evolution (and Primal Reversion) sprites, in',
        ' * assets/pokemon/m{dex}/. Same geometry as js/data/sprites-meta.js (key "m" + dex).',
        ' * G.MEGA_FORMS: dex -> SpriteCollab form (Mega, Mega_X, Mega_Y, Primal).',
        ' */',
        'G.MEGA_FORMS = ' + json.dumps({str(k): v for k, v in sorted(form_of.items())}, separators=(',', ':')) + ';',
        'Object.assign(G.SPRITE_META, {',
    ]
    for dex in sorted(metas):
        lines.append(f'  m{dex}: {json.dumps(metas[dex], separators=(",", ":"))},')
    lines += ['});', '']
    with io.open(OUT_META, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    credits(jobs, metas)
    size = sum(os.path.getsize(os.path.join(dp, fn)) for d in metas
               for dp, _, fns in os.walk(os.path.join(fs.OUT_ASSETS, f'm{d}')) for fn in fns)
    print(f'{len(metas)} Megas ({sum(1 for m in metas.values() if m.get("sh"))} with shiny), {size / 1e6:.1f} MB')
    if failed:
        print('Failed:', failed)
        sys.exit(1)


if __name__ == '__main__':
    main()
