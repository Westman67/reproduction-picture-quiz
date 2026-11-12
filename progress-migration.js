import {empty,validateImport} from './engine.js?v=20261112questionaudit1';
export const LEGACY_KEY='reproduction-picture-quiz-v1';
export const SUPPLEMENTARY_KEY='reproduction-supplementary-picture-quiz-v1';

export function mergeSupplementaryProgress(progress, previous, thirdParty, sources) {
    if (progress.supplementaryProgressImported) return progress;
    validateImport(previous,thirdParty);
    const merged=structuredClone(progress);
    const migrated=splitLegacyProgress({
        ...previous,
        questions:Object.fromEntries(Object.entries(previous.questions).filter(([id])=>!merged.questions[id])),
    },thirdParty,sources);
    Object.assign(merged.questions,migrated.questions);
    for (const field of ['groups','concepts']) {
        for (const [id,counts] of Object.entries(migrated[field])) {
            const aggregate=merged[field][id]??={};
            for (const [name,count] of Object.entries(counts)) {
                aggregate[name]=(aggregate[name]??0)+count;
            }
        }
    }
    for (const field of ['flags','decisions']) merged[field]={...migrated[field],...merged[field]};
    merged.exams.push(...structuredClone(previous.exams));
    if (previous.session && !previous.session.complete) {
        if (merged.session && !merged.session.complete) merged.parkedSession=structuredClone(previous.session);
        else merged.session=structuredClone(previous.session);
    }
    merged.supplementaryProgressImported=true;
    return merged;
}
export function splitLegacyProgress(legacy,bank,sources){
 if(!legacy||legacy.schema_version!==1)throw Error('Unsupported previous progress format.');
 const p=empty(),ids=new Set(bank.map(q=>q.question_id)),sourceIds=new Set(sources.map(s=>s.source_id));
 for(const [id,s] of Object.entries(legacy.questions||{}))if(ids.has(id))p.questions[id]=structuredClone(s);
 for(const q of bank){const s=p.questions[q.question_id];if(!s)continue;const g=p.groups[q.source_group_id]??={times_seen:0,times_answered:0,correct_count:0,incorrect_count:0};g.times_seen+=s.times_seen;g.times_answered+=s.times_answered;g.correct_count+=s.correct_count;g.incorrect_count+=s.incorrect_count;const c=p.concepts[q.tested_concept]??={correct:0,incorrect:0};c.correct+=s.correct_count;c.incorrect+=s.incorrect_count;}
 for(const [id,f] of Object.entries(legacy.flags||{}))if(ids.has(id))p.flags[id]=structuredClone(f);
 for(const [id,d] of Object.entries(legacy.decisions||{}))if(sourceIds.has(id))p.decisions[id]=structuredClone(d);
 p.migrated_from=LEGACY_KEY;
 return validateImport(p,bank);
}
