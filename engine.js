export const VERSION=1;
export function sortLectureIds(ids){return [...new Set(ids)].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true,sensitivity:'base'}));}
export function defaultSettings(){return {category:'all',origin:'all',collection:'all',filter:'all',mode:'learn',length:'all'};}
export function normalizeSettings(raw,bank){const s=defaultSettings();if(!raw||typeof raw!=='object')return s;for(const [key,allowed] of Object.entries({origin:['all','lecture','third_party'],mode:['learn','exam'],length:['10','20','40','all','endless'],filter:['all','unseen','incorrect','marked'],category:['all',...new Set(bank.map(q=>q.category))]}))if(allowed.includes(raw[key]))s[key]=raw[key];const lectures=new Set(bank.map(q=>q.collection));if(Array.isArray(raw.collection)){const valid=[...new Set(raw.collection.filter(x=>lectures.has(x)))];s.collection=raw.collection.length&&!valid.length?'all':valid;}else if(lectures.has(raw.collection))s.collection=[raw.collection];return s;}
export function sessionSize(available,length){return ['all','endless'].includes(length)?available:Math.min(available,Number(length));}
export function empty(){return {schema_version:VERSION,questions:{},groups:{},concepts:{},flags:{},decisions:{},exams:[],session:null,applied_remediation_batches:[]};}
export function reconcileFlags(p,batch){
 if(!batch?.batch_id||!Array.isArray(batch.flagged_question_ids))return 0;
 p.applied_remediation_batches??=[];
 if(p.applied_remediation_batches.includes(batch.batch_id))return 0;
 let resolved=0;
 for(const id of batch.flagged_question_ids){
  const flag=p.flags[id];
  if(flag?.status==='open'&&(!flag.date||(Number.isFinite(Date.parse(flag.date))&&Date.parse(flag.date)<=Date.parse(batch.created_at)))){
   flag.status='resolved';flag.remediation_batch=batch.batch_id;flag.resolved_at=batch.created_at;resolved++;
  }
 }
 p.applied_remediation_batches.push(batch.batch_id);
 return resolved;
}
export function shuffle(a,rng=Math.random){a=[...a];for(let i=a.length-1;i>0;i--){let j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function filtered(bank,p,{category='all',origin='all',collection='all',filter='all'}={}){
 return bank.filter(q=>(origin==='all'||q.source_origin===origin)&&(category==='all'||q.category===category)&&(origin==='third_party'||collection==='all'||(Array.isArray(collection)?collection.includes(q.collection):q.collection===collection))).filter(q=>{
 const x=p.questions[q.question_id]||{};return filter==='all'||filter==='unseen'&&!p.groups[q.source_group_id]?.times_seen||filter==='incorrect'&&x.last_result==='incorrect'||filter==='marked'&&x.marked;});
}
export function ordered(pool,rng=Math.random,previous=null){const groups=new Map(),used=new Map(),out=[];for(const q of shuffle(pool,rng)){const id=q.source_group_id;if(!groups.has(id)){groups.set(id,[]);used.set(id,0);}groups.get(id).push(q);}while(groups.size){const eligible=[...groups.keys()].filter(id=>id!==previous),choices=eligible.length?eligible:[...groups.keys()],minimum=Math.min(...choices.map(id=>used.get(id))),tied=choices.filter(id=>used.get(id)===minimum),id=tied[Math.floor(rng()*tied.length)],q=groups.get(id).shift();out.push(q);used.set(id,used.get(id)+1);if(!groups.get(id).length)groups.delete(id);previous=id;}return out;}
export function item(q,rng=Math.random){return {id:q.question_id,attempt_id:globalThis.crypto?.randomUUID?.()||`${Date.now()}-${rng()}`,order:shuffle(q.options.map((_,index)=>index),rng),draft:null,locked:false,overridden:false,seen:false};}
export function session(pool,mode='learn',length='all',rng=Math.random){let qs=ordered(pool,rng);if(length!=='all'&&length!=='endless')qs=qs.slice(0,Number(length));return {mode,items:qs.map(q=>item(q,rng)),index:0,complete:false,endless:length==='endless',pool:pool.map(q=>q.question_id)};}
export function combinedSession(sectionPools, mode, length, rng = Math.random) {
    const queues = sectionPools.map(questions => {
        if (!questions[0]?.case_id) return ordered(questions, rng).map(question => [question]);
        const blocks = new Map();
        for (const question of questions) {
            if (!blocks.has(question.case_id)) blocks.set(question.case_id, []);
            blocks.get(question.case_id).push(question);
        }
        return shuffle([...blocks.values()], rng);
    });
    const limit = length === 'all' ? Infinity : Number(length);
    const questions = [];
    let advanced = true;
    while (advanced && questions.length < limit) {
        advanced = false;
        for (const queue of queues) {
            const index = queue.findIndex(block => block.length <= limit - questions.length);
            if (index === -1) continue;
            const [block] = queue.splice(index, 1);
            questions.push(...block);
            advanced = true;
        }
    }
    return {
        mode,
        items: questions.map(question => item(question, rng)),
        index: 0,
        complete: false,
        endless: false,
    };
}

export function caseSession(caseDefinition, byId) {
    return {
        case_id: caseDefinition.case_id,
        mode: 'exam',
        items: caseDefinition.question_ids.map(id => item(byId[id])),
        index: 0,
        complete: false,
        endless: false,
    };
}

function stat(p,q){return p.questions[q.question_id]??=( {times_seen:0,times_answered:0,correct_count:0,incorrect_count:0,last_result:null,marked:false});}
export function see(p,q,it){if(it.seen)return;it.seen=true;stat(p,q).times_seen++;let g=p.groups[q.source_group_id]??={times_seen:0};g.times_seen++;}
export function answer(p,q,it){if(it.locked||it.draft===null)return false;it.locked=true;it.correct=it.draft===q.correct_index;const s=stat(p,q);s.times_answered++;s[it.correct?'correct_count':'incorrect_count']++;s.last_result=it.correct?'correct':'incorrect';s.last_attempt=it.attempt_id;s.last_date=new Date().toISOString();let c=p.concepts[q.tested_concept]??={correct:0,incorrect:0};c[it.correct?'correct':'incorrect']++;const g=p.groups[q.source_group_id]??={times_seen:0};g.times_answered=(g.times_answered||0)+1;const field=it.correct?'correct_count':'incorrect_count';g[field]=(g[field]||0)+1;g.last_result=s.last_result;g.last_attempt=it.attempt_id;return true;}
export function override(p,q,it){if(!it.locked||it.correct)return false;it.correct=true;it.overridden=true;const s=stat(p,q);s.incorrect_count--;s.correct_count++;if(s.last_attempt===it.attempt_id)s.last_result='correct';const c=p.concepts[q.tested_concept];c.incorrect--;c.correct++;const g=p.groups[q.source_group_id];if(g?.times_answered){g.incorrect_count--;g.correct_count=(g.correct_count||0)+1;if(g.last_attempt===it.attempt_id)g.last_result='correct';}return true;}
export function totals(s){let answered=s.items.filter(i=>i.locked);let correct=answered.filter(i=>i.correct).length;return {correct,incorrect:answered.length-correct,unanswered:s.items.length-answered.length,total:s.items.length};}
export function canReveal(s,it){return s.mode==='learn'&&it.locked||s.complete;}
export function validateImport(p,bank,cases=[]){
 if(!p||p.schema_version!==VERSION)throw Error('Unsupported progress format.');
 for(const key of ['questions','groups','concepts','flags','decisions'])if(!p[key]||typeof p[key]!=='object'||Array.isArray(p[key]))throw Error('Invalid progress data.');
 const byId=new Map(bank.map(q=>[q.question_id,q]));
 for(const [id,s] of Object.entries(p.questions)){if(!byId.has(id))throw Error('This export contains a different question bank.');for(const k of ['times_seen','times_answered','correct_count','incorrect_count'])if(!Number.isInteger(s[k])||s[k]<0)throw Error('Invalid progress counts.');if(s.correct_count+s.incorrect_count!==s.times_answered)throw Error('Inconsistent progress counts.');if(![null,'correct','incorrect'].includes(s.last_result))throw Error('Invalid result.');}
 for(const g of Object.values(p.groups))if(!Number.isInteger(g.times_seen)||g.times_seen<0)throw Error('Invalid group progress.');
 for(const c of Object.values(p.concepts))if(!Number.isInteger(c.correct)||!Number.isInteger(c.incorrect)||c.correct<0||c.incorrect<0)throw Error('Invalid concept progress.');
 if(!Array.isArray(p.exams))throw Error('Invalid exam history.');
 if(p.applied_remediation_batches!==undefined&&(!Array.isArray(p.applied_remediation_batches)||p.applied_remediation_batches.some(x=>typeof x!=='string')))throw Error('Invalid remediation history.');
 for(const s of [p.session,p.parkedSession]){if(!s)continue;if(!['learn','exam'].includes(s.mode)||!Array.isArray(s.items)||s.items.length>10000||!Number.isInteger(s.index)||s.index<0||s.index>=s.items.length)throw Error('Invalid saved session.');
 if(cases.length){
    const selected=cases.find(c=>c.case_id===s.case_id);
    if(!selected||s.mode!=='exam'||s.endless)throw Error('Invalid saved case order.');
    const allowedLengths = [selected.question_ids.length, ...(selected.previous_question_counts ?? [])];
    if(!allowedLengths.includes(s.items.length) ||
        s.items.some((entry,index)=>entry.id!==selected.question_ids[index]))throw Error('Invalid saved case order.');
 }
 for(const i of s.items){
    const q=byId.get(i.id);
    if(!q||!Array.isArray(i.order)||i.order.length!==q.options.length||
        new Set(i.order).size!==i.order.length||i.order.some(k=>!Number.isInteger(k)||k<0||k>=q.options.length)||
        (i.draft!==null&&!i.order.includes(i.draft))||typeof i.locked!=='boolean'||
        (i.locked&&i.draft===null))throw Error('Invalid session item.');
 }
 }
 return p;
}
