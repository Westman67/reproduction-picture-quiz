#!/usr/bin/env python3
"""Pick 3rd party pictures for answer options (second pass, includes First Aid tables and mnemonics).
Usage: pick_third_party.py <3rd Party folder> <app folder> <out json> <out csv>   (changes nothing in data/)"""
import csv, collections, hashlib, json, math, os, re, sys
TP, APP, OJ, OC = [os.path.expanduser(a) for a in sys.argv[1:5]]
SKIP_DIRS = {'_Review Before Deleting','Claude outputs','Off Topic','Lecture Specific'}
STOP = set('a an the of and or in on with to for from by at is are as vs versus'.split())
GENERIC = set('gross histology diagram photo photograph clinical em radiograph echo table ct algorithm caption full slide rls overview panel panels box illustration chart schematic example figure ultrasound x ray cytology comparison thinprep pap smear anatomy mnemonic pearl notes fact sheet'.split())
TEXTY = {'table','pearl','notes','algorithm','caption','fact sheet'}
def toks(s):
    out=[]
    for w in re.findall(r"[a-z0-9]+", s.lower().replace('’','')):
        if w in STOP: continue
        if len(w)>3 and w.endswith('s') and not w.endswith(('ss','us','is')): w=w[:-1]
        out.append(w)
    return out
def parse(f):
    stem=os.path.splitext(f)[0]; stem=re.sub(r'^Slide \d+ - ','',stem)
    m=re.search(r' - ([A-Za-z\- ]+?)(?: \(\d+\))?$',stem)
    if m: return stem[:m.start()], m.group(1).strip()
    m2=re.search(r'^(.*?)(?: \(\d+\))?$',stem); t=m2.group(1)
    if re.search(r'mnemonic|\(.*\)$',t) and False: pass
    return t,'?'
have=set(os.path.splitext(f)[0] for f in os.listdir(f'{APP}/assets/originals'))
inv=[]; seen={}
folder_rank={'Pathoma':0,'Boards and Beyond Slides':1,'.':2,'First Aid':3,'Originals':4}
for root,dirs,files in os.walk(TP):
    dirs[:]=sorted(d for d in dirs if d not in SKIP_DIRS)
    rel=os.path.relpath(root,TP)
    for f in sorted(files):
        if not f.lower().endswith(('.png','.jpg','.jpeg')): continue
        title,typ=parse(f)
        p=os.path.join(root,f); h=hashlib.sha256(open(p,'rb').read()).hexdigest()
        if h in have or h in seen: continue
        base=re.sub(r' with caption','',title)
        base_nopar=re.sub(r'\([^)]*\)','',base)
        core=[t for t in toks(base_nopar) if t not in GENERIC]
        if not core: continue
        seen[h]=1
        inv.append(dict(rel=rel,file=f,path=p,sha=h,title=base,type=typ,core=core,caption=' with caption' in title,texty=typ.lower() in TEXTY or typ=='?',rank=folder_rank.get(rel,5)))
df=collections.Counter(t for i in inv for t in set(i['core'])); N=len(inv)
idf=lambda t: math.log((N+1)/(df.get(t,0)+1))+0.5
def short(typ):
    t=typ.lower()
    return {'histology':'Histology','gross':'Gross','clinical photo':'Clinical photo','clinical photograph':'Clinical photo','ultrasound':'Ultrasound','x ray':'X-ray','radiograph':'Radiograph','ct':'CT','diagram':'Diagram','table':'Table','pearl':'Mnemonic/pearl','notes':'Notes','algorithm':'Algorithm'}.get(t,typ if typ!='?' else 'Image')
picks=[]; use=collections.Counter()
for bank in ['physiology','pathology','clinical-cases']:
    d=json.load(open(f'{APP}/data/{bank}/question-bank.json'))
    for q in d['questions']:
        if q.get('visual_kind')=='table': continue
        owntitle=re.sub(r' - [A-Za-z ]+\.\w+$','',os.path.basename(q.get('original_filename','')))
        own=set(t for t in toks(owntitle) if t not in GENERIC)
        for k,opt in enumerate(q['options']):
            ex=(q.get('choice_images') or [None]*len(q['options']))[k] or []
            if len(ex)>=2: continue
            extypes=set(re.findall(r'\(([^)]*)\)\s*$',e['caption'])[0].lower() for e in ex if re.search(r'\(([^)]*)\)\s*$',e['caption']))
            otl=toks(opt); ot=set(otl); content=ot-GENERIC
            c=[]
            for i in inv:
                cs=set(i['core'])
                if not cs<=ot: continue
                if cs==own: continue
                if len(cs)==1 and (len(otl)>8 or len(cs)/max(1,len(content))<0.5): continue
                if len(cs)==1 and df[i['core'][0]]>10: continue
                sc=sum(idf(t) for t in cs)
                if sc<4.5: continue
                if ex and not i['texty'] and short(i['type']).lower() in extypes: continue
                cov=len(cs)/max(1,len(content))
                c.append((cov,sc,not i['texty'],-i['rank'],not i['caption'],i))
            c.sort(key=lambda x:x[:5],reverse=True)
            room=2-len(ex); chosen=[]; titles=set()
            for cov,sc,ph,_,_,i in c:
                if len(chosen)>=(1 if ex else 2) or len(chosen)>=room: break
                if i['title'].lower() in titles or use[i['sha']]>=6: continue
                titles.add(i['title'].lower()); chosen.append((i,cov,sc)); use[i['sha']]+=1
            for i,cov,sc in chosen:
                picks.append(dict(bank=bank,question_id=q['question_id'],collection=q.get('collection'),option_index=k,role='CORRECT' if k==q['correct_index'] else 'distractor',option_text=opt,existing=len(ex),folder=i['rel'],file=i['file'],type=short(i['type']),cov=round(cov,2),score=round(sc,2),sha=i['sha']))
json.dump(picks,open(OJ,'w'),indent=1)
with open(OC,'w',newline='') as h:
    w=csv.DictWriter(h,fieldnames=list(picks[0].keys())); w.writeheader(); w.writerows(picks)
print('inventory',N,'picks',len(picks),'options',len({(p['question_id'],p['option_index']) for p in picks}),'questions',len({p['question_id'] for p in picks}),file=sys.stderr)
print(collections.Counter(p['type'] for p in picks),file=sys.stderr)
