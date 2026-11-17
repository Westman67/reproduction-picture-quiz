#!/usr/bin/env python3
"""Apply reviewed 3rd party picks as supplementary choice_images (never replaces lecture pictures).
Usage: apply_third_party.py <3rd Party folder> <app folder> <picks json> [--apply]"""
import json, os, sys, io
from PIL import Image
TP, APP, PICKS = [os.path.expanduser(a) for a in sys.argv[1:4]]
APPLY = '--apply' in sys.argv
LABEL = {'Pathoma':'Pathoma','Boards and Beyond Slides':'Boards and Beyond','First Aid':'First Aid'}
picks = json.load(open(PICKS))
out_dir = f'{APP}/assets/display'
def to_webp(src, dest):
    im = Image.open(src)
    if im.mode not in ('RGB','RGBA'): im = im.convert('RGBA' if 'transparency' in im.info else 'RGB')
    if max(im.size) > 1600:
        s = 1600 / max(im.size); im = im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)
    for q in (88, 76, 64):
        im.save(dest, 'WEBP', quality=q, method=6)
        if os.path.getsize(dest) <= 1024*1024: return
    raise SystemExit(f'too large: {src}')
by_bank = {}
for p in picks: by_bank.setdefault(p['bank'], []).append(p)
added = 0
for bank, ps in by_bank.items():
    path = f'{APP}/data/{bank}/question-bank.json'
    d = json.load(open(path, encoding='utf-8'))
    qs = {q['question_id']: q for q in d['questions']}
    for p in ps:
        q = qs[p['question_id']]; k = p['option_index']
        assert q['options'][k] == p['option_text']
        ci = q.get('choice_images') or [None]*len(q['options'])
        cur = list(ci[k] or [])
        if len(cur) >= 2: continue
        rel = f"assets/display/{p['sha']}.webp"
        if any(e['image'] == rel for e in cur): continue
        title = os.path.splitext(p['file'])[0].replace(' with caption','')
        label = LABEL.get(p['folder'], '3rd party')
        cap = f"3rd party ({label}): {title}" if label != '3rd party' else f"3rd party: {title}"
        cur.append({'image': rel, 'caption': cap, 'source': f"3rd Party/{p['folder']}/{p['file']}".replace('3rd Party/./','3rd Party/')})
        ci[k] = cur; q['choice_images'] = ci; added += 1
        if APPLY:
            dest = f'{APP}/{rel}'
            if not os.path.exists(dest): to_webp(os.path.join(TP, p['folder'], p['file']), dest)
    if APPLY: open(path, 'w', encoding='utf-8').write(json.dumps(d, indent=2, ensure_ascii=False) + '\n')
print('added', added, 'applied' if APPLY else 'dry run')
