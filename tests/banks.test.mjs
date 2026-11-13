import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {resolveBankConfig,BANKS} from '../bank-config.js';import {splitLegacyProgress,mergeSupplementaryProgress} from '../progress-migration.js';import {empty,session,see,answer,filtered,validateImport} from '../engine.js';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));const whole=read('data/question-bank.json').questions;
test('bank split partitions every question and preserves question records',()=>{const ids=[];for(const id of Object.keys(BANKS)){const b=read(`data/${id}/question-bank.json`).questions,m=read(`data/${id}/source-manifest.json`).sources;for(const q of b){assert.deepEqual(q,whole.find(x=>x.question_id===q.question_id));assert(m.some(s=>s.source_id===q.source_id));ids.push(q.question_id);if(id==='physiology')assert(/^R[1-7]$/.test(q.collection));else assert(q.source_origin==='third_party'||Number(q.collection.slice(1))>=8);}for(const s of m){if(id==='physiology')assert(/^R[1-7]$/.test(s.lecture_id));else assert(s.source_origin==='third_party'||Number(s.lecture_id.slice(1))>=8);}}assert.equal(ids.length,whole.length);assert.equal(new Set(ids).size,whole.length);});
test('bank URLs and persistence are isolated',()=>{assert.equal(resolveBankConfig('').id,'physiology');assert.equal(resolveBankConfig('?bank=pathology').id,'pathology');assert.equal(resolveBankConfig('?bank=unknown').id,'physiology');assert.equal(resolveBankConfig('?bank=supplementary').id,'pathology');for(const k of ['progressKey','preferencesKey','dataRoot'])assert.equal(new Set(Object.values(BANKS).map(b=>b[k])).size,Object.keys(BANKS).length);});
test('legacy history is copied into matching bank without changing original',()=>{const legacy=empty();for(const q of whole){const it=session([q]).items[0];see(legacy,q,it);it.draft=q.correct_index;answer(legacy,q,it);legacy.questions[q.question_id].marked=true;}legacy.exams=[{mode:'exam',total:40}];const snapshot=JSON.stringify(legacy);for(const id of Object.keys(BANKS)){const b=read(`data/${id}/question-bank.json`).questions,m=read(`data/${id}/source-manifest.json`).sources,p=splitLegacyProgress(legacy,b,m);assert.equal(Object.keys(p.questions).length,b.length);assert(Object.values(p.questions).every(s=>s.marked&&s.correct_count===1));assert.equal(p.exams.length,0);assert.equal(p.session,null);}assert.equal(JSON.stringify(legacy),snapshot);});

test('3rd Party questions use the Pathology source filter and earlier progress imports once',()=>{
    const bank=read('data/pathology/question-bank.json').questions;
    const sources=read('data/pathology/source-manifest.json').sources;
    const thirdParty=bank.filter(q=>q.source_origin==='third_party');
    assert.equal(thirdParty.length,19);
    assert.deepEqual(filtered(bank,empty(),{origin:'third_party',collection:['R10']}),thirdParty);

    const original=empty();
    original.session=session([bank.find(q=>q.source_origin==='lecture')]);
    const previous=empty();
    previous.session=session(thirdParty.slice(0,2));
    const entry=previous.session.items[0];
    const question=thirdParty.find(q=>q.question_id===entry.id);
    see(previous,question,entry);
    entry.draft=question.correct_index;
    assert.ok(answer(previous,question,entry));
    previous.questions[question.question_id].marked=true;
    previous.exams.push({mode:'exam',total:2});
    const merged=mergeSupplementaryProgress(original,previous,thirdParty,sources);
    assert.deepEqual(merged.session,original.session);
    assert.deepEqual(merged.parkedSession,previous.session);
    assert.deepEqual(merged.questions[question.question_id],previous.questions[question.question_id]);
    assert.equal(merged.groups[question.source_group_id].times_seen,1);
    assert.equal(merged.exams.length,1);
    assert.equal(mergeSupplementaryProgress(merged,previous,thirdParty,sources),merged);
    assert.deepEqual(validateImport(JSON.parse(JSON.stringify(merged)),bank),merged);
});
