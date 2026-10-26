#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Imports the Pokémon that upstream's tools/fetch_pokedex.py and tools/fetch_sprites.py leave out:

    python fork/fetch-extra-dex.py            (then node fork/fetch-lab.cjs, then node fork/build.cjs)

1. SPECIES: species whose SpriteCollab base folder has no Idle/Walk/Attack but one of their form folders
   does (Miraidon's sheets are its Low-Power Mode), and species upstream fetched before their sheets were done
   (Rolycoly). They keep their real dex number.
2. FORMS: regional forms (Alola, Galar, Hisui, Paldea) and other forms the games treat as a Pokémon of their own
   (PokeAPI gives them their own `pokemon` row) that differ from the default in types, base stats or abilities,
   and that aren't battle-only, Mega, Gigantamax or totem forms. Cosmetic forms (Unown letters, Vivillon
   patterns, flower colours, Alcremie) are left out because they have no data of their own.
   Each form gets a MrSurvivor number from 1501 up (FORMS below). These numbers are saved in players' saves:
   never renumber or reuse one, only append. 1501-1999 stays clear of future real dex numbers and under the
   leaderboard's limit of 2000 (js/net/ranking.js).

Writes:
  assets/pokemon/{dex}/         the sheets, processed exactly like upstream's (tools/fetch_sprites.py)
  assets/pokemon/{dex}/s/       the shiny sheets, when SpriteCollab has them
  js/fork/extra-dex-data.js     G.FORK_DEX (the game's stats, like js/data/pokedex.js), their sprite geometry,
                                ability slots and evolutions; js/fork/extra-dex.js adds them to the game
  CREDITS-EXTRA.md              the artists of every sheet (CC BY-NC 4.0)
Learnsets, abilities for the run and evolution levels come from fork/fetch-lab.cjs, which reads the same file.

Sources: PokeAPI's CSV dump and SpriteCollab's tracker.json, cached in tools/cache/ (not committed).
Rerun it after SpriteCollab finishes more sheets: add the new rows to SPECIES or FORMS.
"""
import csv
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

OUT_DATA = os.path.join(ROOT, 'js', 'fork', 'extra-dex-data.js')
OUT_CREDITS = os.path.join(ROOT, 'CREDITS-EXTRA.md')
CACHE = os.path.join(ROOT, 'tools', 'cache')
SPRITE_CACHE = os.path.join(CACHE, 'extra-dex')
CSV_URL = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
# Each CSV: the folder under tools/cache/ it is kept in (fork/fetch-lab.cjs keeps some of them already).
CSVS = {
    'pokemon': 'lab', 'pokemon_species': 'lab', 'pokemon_abilities': 'lab', 'version_groups': 'lab', 'abilities': 'lab',
    'pokemon_forms': 'forms', 'pokemon_form_names': 'forms', 'pokemon_stats': 'forms', 'pokemon_types': 'forms',
    'pokemon_species_names': 'forms', 'types': 'forms',
}

# Species: dex -> SpriteCollab folder under sprite/{dex:04d}/ ('' = the base folder) and its shiny folder.
SPECIES = {
    837: ('', '0000/0001'),            # Rolycoly: finished after upstream's fetch
    870: ('0002', '0002/0001'),        # Falinks: the Brass (the troop's leader)
    999: ('0001', '0001/0001'),        # Gimmighoul: Roaming Form (its Chest Form has no sheets)
    1003: ('0001', '0001/0001'),       # Ting-Lu: its sheets are filed under "Temp"
    1008: ('0001', '0001/0001'),       # Miraidon: Low-Power Mode
}

# Forms: (MrSurvivor number, PokeAPI pokemon identifier, SpriteCollab folder, its shiny folder or None = folder/0001).
# APPEND ONLY: these numbers live in players' saves.
FEMALE = ('0000/0000/0002', '0000/0001/0002')
FORMS = [
    # Alola
    (1501, 'rattata-alola', '0001', None), (1502, 'raticate-alola', '0001', None), (1503, 'raichu-alola', '0001', None),
    (1504, 'sandshrew-alola', '0001', None), (1505, 'sandslash-alola', '0001', None), (1506, 'vulpix-alola', '0001', None),
    (1507, 'ninetales-alola', '0001', None), (1508, 'diglett-alola', '0001', None), (1509, 'dugtrio-alola', '0001', None),
    (1510, 'meowth-alola', '0001', None), (1511, 'persian-alola', '0001', None), (1512, 'geodude-alola', '0001', None),
    (1513, 'graveler-alola', '0001', None), (1514, 'golem-alola', '0001', None), (1515, 'grimer-alola', '0001', None),
    (1516, 'muk-alola', '0001', None), (1517, 'exeggutor-alola', '0001', None), (1518, 'marowak-alola', '0001', None),
    # Galar
    (1519, 'meowth-galar', '0002', None), (1520, 'ponyta-galar', '0001', None), (1521, 'rapidash-galar', '0001', None),
    (1522, 'slowpoke-galar', '0001', None), (1523, 'slowbro-galar', '0001', None), (1524, 'farfetchd-galar', '0001', None),
    (1525, 'weezing-galar', '0001', None), (1526, 'mr-mime-galar', '0001', None), (1527, 'articuno-galar', '0001', None),
    (1528, 'zapdos-galar', '0001', None), (1529, 'moltres-galar', '0001', None), (1530, 'slowking-galar', '0001', None),
    (1531, 'corsola-galar', '0001', None), (1532, 'zigzagoon-galar', '0001', None), (1533, 'linoone-galar', '0001', None),
    (1534, 'darumaka-galar', '0001', None), (1535, 'darmanitan-galar-standard', '0002', None), (1536, 'yamask-galar', '0001', None),
    # Hisui
    (1537, 'growlithe-hisui', '0001', None), (1538, 'arcanine-hisui', '0001', None), (1539, 'voltorb-hisui', '0001', None),
    (1540, 'electrode-hisui', '0001', None), (1541, 'typhlosion-hisui', '0001', None), (1542, 'qwilfish-hisui', '0001', None),
    (1543, 'sneasel-hisui', '0001', None), (1544, 'samurott-hisui', '0001', None), (1545, 'lilligant-hisui', '0001', None),
    (1546, 'zorua-hisui', '0001', None), (1547, 'zoroark-hisui', '0001', None), (1548, 'braviary-hisui', '0001', None),
    (1549, 'sliggoo-hisui', '0001', None), (1550, 'goodra-hisui', '0001', None), (1551, 'avalugg-hisui', '0001', None),
    (1552, 'decidueye-hisui', '0001', None),
    # Paldea
    (1553, 'tauros-paldea-combat-breed', '0001', None), (1554, 'tauros-paldea-blaze-breed', '0002', None),
    (1555, 'tauros-paldea-aqua-breed', '0003', None), (1556, 'wooper-paldea', '0002', None),
    # Other forms of their own
    (1557, 'deoxys-attack', '0001', None), (1558, 'deoxys-defense', '0002', None), (1559, 'deoxys-speed', '0003', None),
    (1560, 'wormadam-sandy', '0001', None), (1561, 'wormadam-trash', '0002', None),
    (1562, 'rotom-heat', '0001', None), (1563, 'rotom-wash', '0002', None), (1564, 'rotom-frost', '0003', None),
    (1565, 'rotom-fan', '0004', None), (1566, 'rotom-mow', '0005', None),
    (1567, 'giratina-origin', '0001', None), (1568, 'dialga-origin', '0001', None), (1569, 'palkia-origin', '0001', None),
    (1570, 'shaymin-sky', '0001', None),
    (1571, 'basculin-blue-striped', '0001', None), (1572, 'basculin-white-striped', '0002', None),
    (1573, 'landorus-therian', '0001', None), (1574, 'kyurem-black', '0001', None), (1575, 'kyurem-white', '0002', None),
    (1576, 'meowstic-female', *FEMALE), (1577, 'floette-eternal', '0005', None),
    (1578, 'pumpkaboo-small', '0001', None), (1579, 'pumpkaboo-large', '0002', None), (1580, 'pumpkaboo-super', '0003', None),
    (1581, 'gourgeist-super', '0003', None), (1582, 'zygarde-10', '0001', None), (1583, 'hoopa-unbound', '0001', None),
    (1584, 'oricorio-pom-pom', '0001', None), (1585, 'oricorio-pau', '0002', None), (1586, 'oricorio-sensu', '0003', None),
    (1587, 'lycanroc-midnight', '0001', None), (1588, 'lycanroc-dusk', '0002', None), (1589, 'toxtricity-low-key', '0001', None),
    (1590, 'indeedee-female', *FEMALE), (1591, 'urshifu-rapid-strike', '0001', None), (1592, 'ursaluna-bloodmoon', '0001', None),
    (1593, 'basculegion-female', *FEMALE), (1594, 'enamorus-therian', '0001', None),
    (1595, 'ogerpon-wellspring-mask', '0001', None), (1596, 'ogerpon-hearthflame-mask', '0002', None),
    (1597, 'ogerpon-cornerstone-mask', '0003', None),
]

# Evolutions the species-level data gets wrong once forms exist (a dex number or a form identifier on each side).
# EVO_ADD: what evolves into what (the level is the evolved species' level in the games, fork/fetch-lab.cjs).
EVO_ADD = [
    ('rattata-alola', 'raticate-alola'), (25, 'raichu-alola'), ('sandshrew-alola', 'sandslash-alola'),
    ('vulpix-alola', 'ninetales-alola'), ('diglett-alola', 'dugtrio-alola'), ('meowth-alola', 'persian-alola'),
    ('geodude-alola', 'graveler-alola'), ('graveler-alola', 'golem-alola'), ('grimer-alola', 'muk-alola'),
    (102, 'exeggutor-alola'), (104, 'marowak-alola'),
    ('meowth-galar', 863), ('ponyta-galar', 'rapidash-galar'), ('slowpoke-galar', 'slowbro-galar'),
    ('slowpoke-galar', 'slowking-galar'), (109, 'weezing-galar'), (439, 'mr-mime-galar'), ('corsola-galar', 864),
    ('zigzagoon-galar', 'linoone-galar'), ('linoone-galar', 862), ('darumaka-galar', 'darmanitan-galar-standard'),
    ('yamask-galar', 867),
    ('growlithe-hisui', 'arcanine-hisui'), ('voltorb-hisui', 'electrode-hisui'), (156, 'typhlosion-hisui'),
    ('qwilfish-hisui', 904), ('sneasel-hisui', 903), (502, 'samurott-hisui'), (548, 'lilligant-hisui'),
    ('zorua-hisui', 'zoroark-hisui'), (627, 'braviary-hisui'), (704, 'sliggoo-hisui'), ('sliggoo-hisui', 'goodra-hisui'),
    (712, 'avalugg-hisui'), (723, 'decidueye-hisui'),
    ('wooper-paldea', 980),
    (412, 'wormadam-sandy'), (412, 'wormadam-trash'), (677, 'meowstic-female'),
    ('pumpkaboo-small', 711), ('pumpkaboo-large', 711), ('pumpkaboo-super', 'gourgeist-super'),
    (744, 'lycanroc-midnight'), (744, 'lycanroc-dusk'), (848, 'toxtricity-low-key'), (891, 'urshifu-rapid-strike'),
    ('basculin-white-striped', 902), ('basculin-white-striped', 'basculegion-female'),
]
# EVO_CUT: evolutions that only the regional form (or the White-Striped Basculin) has in the games.
EVO_CUT = [(52, 863), (222, 864), (264, 862), (562, 867), (211, 904), (215, 903), (194, 980), (550, 902)]

# PokeAPI's English names, shortened where they read oddly.
NAME_FIX = {'pumpkaboo-small': 'Small Pumpkaboo', 'pumpkaboo-large': 'Large Pumpkaboo', 'pumpkaboo-super': 'Super Size Pumpkaboo',
            'gourgeist-super': 'Super Size Gourgeist', 'oricorio-pom-pom': 'Pom-Pom Oricorio', 'zygarde-10': 'Zygarde 10%',
            'darmanitan-galar-standard': 'Galarian Darmanitan'}
GEN_END = [151, 251, 386, 493, 649, 721, 809, 905, 1025]
EN = '9'


def csv_rows(name):
    path = os.path.join(CACHE, CSVS[name], name, name + '.csv')
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        print('downloading', CSV_URL + name + '.csv')
        data = fs.fetch(CSV_URL + name + '.csv')
        if not data:
            sys.exit(f'could not download {name}.csv')
        with open(path, 'wb') as f:
            f.write(data)
    with io.open(path, encoding='utf-8', newline='') as f:
        return list(csv.DictReader(f))


def tracker():
    path = os.path.join(CACHE, 'lab', 'tracker', 'tracker.json')
    if not os.path.exists(path):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, 'wb') as f:
            f.write(fs.fetch(fs.RAW + '/tracker.json'))
    with io.open(path, encoding='utf-8') as f:
        return json.load(f)


def node_at(t, dex, folder):
    """The tracker's entry for sprite/{dex}/{folder} (None if there isn't one)."""
    n = t.get(f'{dex:04d}')
    for part in [p for p in folder.split('/') if p]:
        n = (n or {}).get('subgroups', {}).get(part)
    return n


def complete(n):
    return bool(n) and fs.REQUIRED <= set(n.get('sprite_files', {}))


def rarity(bst, legendary):
    """Same as tools/fetch_pokedex.py: 5 = legendaries and pseudo-legendaries, 1 = the most common."""
    if legendary or bst >= 580:
        return 5
    return 4 if bst >= 495 else 3 if bst >= 410 else 2 if bst >= 320 else 1


def sprites(job):
    """Downloads one entry's sheets (and its shiny). -> (dex, meta or None)."""
    dex, species, folder, shiny_folder = job
    cache_file = os.path.join(SPRITE_CACHE, f'{dex}.json')
    out_dir = os.path.join(fs.OUT_ASSETS, str(dex))
    if os.path.exists(cache_file):
        with io.open(cache_file, encoding='utf-8') as f:
            meta = json.load(f)
        if all(os.path.exists(os.path.join(out_dir, a + '.png')) for a in meta['a']):
            return dex, meta
    url = f'{fs.BASE}/{species:04d}' + (f'/{folder}' if folder else '')
    xml = fs.fetch(url + '/AnimData.xml')
    if not xml:
        return dex, None
    anims, shadow = fs.parse_animdata(xml.decode('utf-8', 'replace'))
    normal = fs.download_set(url, out_dir, anims)
    if not fs.REQUIRED <= set(normal):
        return dex, None
    meta = {'s': shadow, 'a': normal}
    surl = f'{fs.BASE}/{species:04d}/{shiny_folder}'
    sxml = fs.fetch(surl + '/AnimData.xml')
    if sxml is not None:
        sanims = fs.parse_animdata(sxml.decode('utf-8', 'replace'))[0]
        shiny = fs.download_set(surl, os.path.join(out_dir, 's'), sanims, normal)
        if {'Idle', 'Walk'} <= set(shiny):
            meta['sh'] = 1
            diff = {k: v for k, v in shiny.items() if normal.get(k) != v}
            if diff:
                meta['sa'] = diff
            miss = [k for k in normal if k not in shiny]
            if miss:
                meta['sm'] = miss
    os.makedirs(SPRITE_CACHE, exist_ok=True)
    with io.open(cache_file, 'w', encoding='utf-8') as f:
        json.dump(meta, f, separators=(',', ':'))
    return dex, meta


def credits(jobs, names_of, metas):
    """CREDITS-EXTRA.md: who drew each sheet (credits.txt of the folder and of its shiny)."""
    names = {}
    for line in (fs.fetch(f'{fs.RAW}/credit_names.txt') or b'').decode('utf-8', 'replace').splitlines()[1:]:
        p = line.split('\t')
        if len(p) >= 2:
            names[p[1].strip()] = (p[0].strip(), p[2].strip() if len(p) > 2 else '')
            names[p[0].strip()] = names[p[1].strip()]

    def who(job):
        dex, species, folder, shiny_folder = job
        base = f'{fs.BASE}/{species:04d}'
        txt = (fs.fetch(base + (f'/{folder}' if folder else '') + '/credits.txt') or b'').decode('utf-8', 'replace')
        if metas[dex].get('sh'):
            txt += '\n' + (fs.fetch(f'{base}/{shiny_folder}/credits.txt') or b'').decode('utf-8', 'replace')
        authors = []
        for line in txt.splitlines():
            p = line.split('\t')
            a = p[1].strip() if len(p) > 1 else ''
            if a and a not in authors:
                authors.append(a)
        return dex, authors

    rows = []
    with ThreadPoolExecutor(max_workers=12) as ex:
        for dex, authors in ex.map(who, [j for j in jobs if j[0] in metas]):
            shown = []
            for a in authors:
                disp, contact = names.get(a, (a, ''))
                shown.append(f'{disp} ({contact})' if contact else disp)
            rows.append((dex, f'| {dex} | {names_of[dex]} | {", ".join(shown) or "?"} |'))
    lines = [
        '# Extra species and forms',
        '',
        'The sprites of the species and forms MrSurvivor adds to upstream\'s Pokédex (`assets/pokemon/{dex}/`,',
        '`js/fork/extra-dex.js`; forms are numbered from 1501) come from',
        '[SpriteCollab](https://github.com/PMDCollab/SpriteCollab), under',
        '[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/): non-commercial use, credited to',
        'their artists. Generated by `fork/fetch-extra-dex.py`. All other sprites: `CREDITS.md`.',
        '',
        '| No. | Pokémon | Artists (normal and shiny) |',
        '|---|---|---|',
    ] + [r for _, r in sorted(rows)] + ['']
    with io.open(OUT_CREDITS, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))


def main():
    pokemon = {r['identifier']: r for r in csv_rows('pokemon')}
    by_pid = {r['id']: r for r in pokemon.values()}
    species = {r['id']: r for r in csv_rows('pokemon_species')}
    forms = {r['pokemon_id']: r for r in csv_rows('pokemon_forms')}
    form_names = {r['pokemon_form_id']: r for r in csv_rows('pokemon_form_names') if r['local_language_id'] == EN}
    species_names = {r['pokemon_species_id']: r['name'] for r in csv_rows('pokemon_species_names') if r['local_language_id'] == EN}
    gen_of_vg = {r['id']: int(r['generation_id']) for r in csv_rows('version_groups')}
    type_name = {r['id']: r['identifier'] for r in csv_rows('types')}
    stats, types, abil = {}, {}, {}
    for r in csv_rows('pokemon_stats'):
        stats.setdefault(r['pokemon_id'], {})[r['stat_id']] = int(r['base_stat'])
    for r in csv_rows('pokemon_types'):
        types.setdefault(r['pokemon_id'], []).append((int(r['slot']), type_name[r['type_id']]))
    t = tracker()
    abil_ident = {r['id']: r['identifier'] for r in csv_rows('abilities')}
    for r in csv_rows('pokemon_abilities'):
        abil.setdefault(r['pokemon_id'], {})[int(r['slot'])] = abil_ident[r['ability_id']]

    def entry(dex, pid, name, base):
        """A G.DEX row, derived like tools/fetch_pokedex.py does."""
        p = by_pid[pid]
        sp = species[p['species_id']]
        s = stats[pid]
        hp_, atk, df, spa, sd, spe = s['1'], s['2'], s['3'], s['4'], s['5'], s['6']
        bst = hp_ + atk + df + spa + sd + spe
        leg = sp['is_legendary'] == '1' or sp['is_mythical'] == '1'
        if base:
            gen = gen_of_vg[forms[pid]['introduced_in_version_group_id']]
        else:
            gen = next(g for g, end in enumerate(GEN_END, 1) if dex <= end)
        e = {
            'dex': dex, 'name': name, 'types': [ty for _, ty in sorted(types[pid])],
            'hp': round(70 + hp_ * 0.45), 'spd': round(78 + spe * 0.42),
            'atk': round(0.70 + max(atk, spa) / 100 * 0.55, 2),
            'pa': round(0.70 + atk / 100 * 0.55, 2), 'sa': round(0.70 + spa / 100 * 0.55, 2), 'df': df, 'sd': sd,
            'rarity': rarity(bst, leg), 'bst': bst, 'starter': False, 'gen': gen,
        }
        if leg:
            e['leg'] = True
        if base:
            e['base'] = base
        e['pid'] = int(pid)
        a = abil.get(pid, {})
        slots = [a.get(1, 0), a.get(2, 0), a.get(3, 0)]
        return e, slots

    jobs, rows, slots, names_of, skipped = [], [], {}, {}, []
    for dex, (folder, shiny_folder) in sorted(SPECIES.items()):
        if not complete(node_at(t, dex, folder)):
            skipped.append(f'{dex}: SpriteCollab folder {folder or "(base)"} has no Idle/Walk/Attack')
            continue
        name = species_names[str(dex)]
        e, sl = entry(dex, str(dex), name, 0)
        rows.append(e); slots[dex] = sl; names_of[dex] = name
        jobs.append((dex, dex, folder, shiny_folder))

    ident_of = {}
    for dex, ident, folder, shiny_folder in FORMS:
        p = pokemon[ident]
        pid, base = p['id'], int(p['species_id'])
        f = forms[pid]
        if f['is_battle_only'] == '1' or f['is_mega'] == '1' or p['is_default'] == '1':
            sys.exit(f'{ident}: not a form of its own (battle-only, Mega or default)')
        if not complete(node_at(t, base, folder)):
            skipped.append(f'{dex} {ident}: SpriteCollab folder {folder} has no Idle/Walk/Attack')
            continue
        default = pokemon[[k for k, v in pokemon.items() if v['species_id'] == p['species_id'] and v['is_default'] == '1'][0]]['id']
        if stats[pid] == stats[default] and types[pid] == types[default] and abil.get(pid) == abil.get(default):
            sys.exit(f'{ident}: same types, stats and abilities as its default form (cosmetic, leave it out)')
        fn = form_names.get(f['id'], {})
        name = NAME_FIX.get(ident) or fn.get('pokemon_name') or f'{fn.get("form_name", ident)} {species_names[str(base)]}'
        e, sl = entry(dex, pid, name, base)
        rows.append(e); slots[dex] = sl; names_of[dex] = name; ident_of[ident] = dex
        jobs.append((dex, base, folder, shiny_folder or f'{folder}/0001'))

    def ref(x):
        return x if isinstance(x, int) else ident_of.get(x)
    have = {e['dex'] for e in rows}
    evo_add = [[ref(a), ref(b)] for a, b in EVO_ADD if ref(a) and ref(b)]
    evo_cut = [list(c) for c in EVO_CUT]

    print(f'{len(jobs)} to import ({len(SPECIES)} species and {len(FORMS)} forms listed)')
    metas, failed = {}, []
    with ThreadPoolExecutor(max_workers=12) as ex:
        for dex, meta in ex.map(sprites, jobs):
            if meta:
                metas[dex] = meta
            else:
                failed.append(dex)
    rows = [e for e in rows if e['dex'] in metas]
    names_of = {d: n for d, n in names_of.items() if d in metas}

    def js(v):
        return json.dumps(v, ensure_ascii=False, separators=(',', ':'))
    lines = [
        '/* ============ extra-dex-data.js — GENERATED by fork/fetch-extra-dex.py, don\'t edit ============',
        ' * The species and forms MrSurvivor adds to upstream\'s Pokédex (js/fork/extra-dex.js adds them to the game).',
        ' *   G.FORK_DEX        rows like js/data/pokedex.js\'s, plus pid (PokeAPI\'s pokemon id) and, for a form,',
        ' *                     base (its species\' dex number). Forms are numbered from 1501 (saved in saves: never renumber).',
        ' *   G.FORK_DEX_ABIL   ability slots, like G.DEX_ABIL: [1, 2 or 0, hidden or 0]',
        ' *   G.FORK_DEX_EVO    { add: [[from, to]], cut: [[from, to]] }: evolutions fork/fetch-lab.cjs fixes for forms',
        ' *   G.FORK_DEX_SC     the SpriteCollab folder each one is drawn from (sprite/{folder}/)',
        ' *   G.FORK_DEX_SPRITES  their sheets\' geometry, like js/data/sprites-meta.js',
        ' */',
        'G.FORK_DEX = [',
    ] + [f'  {js(e)},' for e in rows] + [
        '];',
        'G.FORK_DEX_ABIL = {',
    ] + [f'  {d}:{js(slots[d])},' for d in sorted(metas)] + [
        '};',
        f'G.FORK_DEX_EVO = {js({"add": [x for x in evo_add if x[0] in have or x[1] in have], "cut": evo_cut})};',
        'G.FORK_DEX_SC = ' + js({str(d): f'{sp:04d}' + (f'/{fo}' if fo else '') for d, sp, fo, _ in jobs if d in metas}) + ';',
        'G.FORK_DEX_SPRITES = {',
    ] + [f'  {d}:{js(metas[d])},' for d in sorted(metas)] + ['};', '']
    with io.open(OUT_DATA, 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines))
    credits(jobs, names_of, metas)
    size = sum(os.path.getsize(os.path.join(dp, fn)) for d in metas
               for dp, _, fns in os.walk(os.path.join(fs.OUT_ASSETS, str(d))) for fn in fns)
    print(f'wrote {os.path.relpath(OUT_DATA, ROOT)}: {len(rows)} Pokémon '
          f'({sum(1 for m in metas.values() if m.get("sh"))} with shiny), {size / 1e6:.1f} MB of sheets')
    for s in skipped:
        print('  skipped', s)
    if failed:
        print('Failed:', failed)
        sys.exit(1)


if __name__ == '__main__':
    main()
