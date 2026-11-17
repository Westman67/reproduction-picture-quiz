#!/usr/bin/env python3
"""Propose 3rd party pictures for answer options. Report only; changes nothing in data/.
Usage: match_third_party.py <3rd Party folder> <app folder> <out csv>"""
import csv, collections, hashlib, json, math, os, re, sys
TP, APP, OUT = [os.path.expanduser(a) for a in sys.argv[1:4]]
SKIP_DIRS = {'_Review Before Deleting','Claude outputs','Off Topic','Lecture Specific'}
VISUAL = ('histology','gross','clinical photo','clinical photograph','clinical illustration','ultrasound','x ray','radiograph','ct','em','cytology','thinprep','hysterosalpingogram','urethrogram','diagram','comparison','clinical comparison')
STOP = set('a an the of and or in on with to for from by at is are as vs versus'.split())
GENERIC = set('gross histology diagram photo photograph clinical em radiograph echo table ct algorithm caption full slide rls overview panel panels box illustration chart schematic example figure ultrasound x ray cytology comparison thinprep pap smear anatomy'.split())
def toks(s):
    out=[]
    for w in re.findall(r"[a-z0-9]+", s.lower().replace('’','')):
        if w in STOP: continue
        if len(w)>3 and w.endswith('s') and not w.endswith(('ss','us','is')): w=w[:-1]
        out.append(w)
    return out
def parse(f):
    stem=os.path.splitext(f)[0]
    stem=re.sub(r'^Slide \d+ - ','',stem)
    m=re.search(r' - ([A-Za-z\- ]+?)(?: \(\d+\))?$',stem)
    if m: return stem[:m.start()], m.group(1).strip()
    m=re.search(r'^(.*?)(?: \(\d+\))?$',stem); return m.group(1),'?'
have=set(os.path.splitext(f)[0] for f in os.listdir(f'{APP}/assets/originals'))
inv=[]; seen={}
for root,dirs,files in os.walk(TP):
    dirs[:]=[d for d in dirs if d not in SKIP_DIRS]
    rel=os.path.relpath(root,TP)
    for f in sorted(files):
        if not f.lower().endswith(('.png','.jpg','.jpeg')): continue
        title,typ=parse(f)
        if typ.lower() not in VISUAL: continue
        p=os.path.join(root,f)
        h=hashlib.sha256(open(p,'rb').read()).hexdigest()
        if h in have or h in seen: continue
        seen[h]=1
        base=re.sub(r' with caption','',title)
        core=[t for t in toks(base) if t not in GENERIC]
        if not core: continue
        inv.append(dict(rel=rel,file=f,path=p,sha=h,title=base,type=typ,core=core,caption=' with caption' in title,size=os.path.getsize(p)))
df=collections.Counter(t for i in inv for t in set(i['core'])); N=len(inv)
idf=lambda t: math.log((N+1)/(df.get(t,0)+1))+0.5
print('inventory',N,file=sys.stderr)
rows=[]
for bank in ['physiology','pathology','clinical-cases']:
    d=json.load(open(f'{APP}/data/{bank}/question-bank.json'))
    for q in d['questions']:
        if q.get('visual_kind')=='table': continue
        own=toks(re.sub(r' - [A-Za-z ]+\.\w+$','',os.path.basename(q.get('original_filename',''))))
        for k,opt in enumerate(q['options']):
            n=len(q['choice_images'][k]) if q.get('choice_images') and q['choice_images'][k] else 0
            if n>=2: continue
            ot=set(toks(opt)); ts=ot|set(toks(q['choice_rationales'][k]))
            c=[]
            for i in inv:
                if len(i['core'])<2 and df[i['core'][0]]>12: continue
                if not all(t in ts for t in i['core']): continue
                if set(i['core'])==set(t for t in own if t not in GENERIC) : continue
                sc=sum(idf(t) for t in i['core'])
                if sc<4.5: continue
                c.append((all(t in ot for t in i['core']),sc,not i['caption'],i))
            c.sort(key=lambda x:(x[0],x[1],x[2]),reverse=True)
            seenT=set()
            for inopt,sc,_,i in c:
                if i['title'] in seenT: continue
                seenT.add(i['title'])
                if len(seenT)>3: break
                rows.append([bank,q['question_id'],q.get('collection'),k,'CORRECT' if k==q['correct_index'] else 'distractor',opt,n,i['rel'],i['file'],i['type'],round(sc,2),'option' if inopt else 'rationale',os.path.basename(q.get('original_filename',''))])
with open(OUT,'w',newline='') as h:
    w=csv.writer(h); w.writerow('bank question_id collection option_index role option_text existing_lecture_pics tp_folder tp_file tp_type score matched_in question_own_image'.split()); w.writerows(rows)
print(len(rows),'rows',len({(r[1],r[3]) for r in rows}),'options',len({r[1] for r in rows}),'questions',file=sys.stderr)
