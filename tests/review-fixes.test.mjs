import test from 'node:test';import assert from 'node:assert/strict';
import {empty,session,combinedSession,item,see,answer,resurfaceWeight,resurfaceSelect,distinctClues} from '../engine.js';
const mk=(id,extra={})=>({question_id:id,source_group_id:'g-'+id,image:id+'.png',options:['a','b','c','d'],correct_index:0,stem:'Stem '+id,explanation:'Because.',collection:'R1',studySection:'physiology',study_skill:'morphology',...extra});
const rng=()=>{let x=7;return()=>(x=(x*16807)%2147483647)/2147483647;};
test('recent misses outweigh older misses and unseen questions',()=>{
 const p=empty();const now=Date.parse('2026-11-13T00:00:00Z');
 p.questions.a={times_seen:1,times_answered:1,last_result:'incorrect',last_date:'2026-11-12T00:00:00Z'};
 p.questions.b={times_seen:1,times_answered:1,last_result:'incorrect',last_date:'2026-08-01T00:00:00Z'};
 p.questions.c={times_seen:1,times_answered:1,correct_count:1,last_result:'correct',last_date:'2026-11-12T00:00:00Z'};
 const w=id=>resurfaceWeight(p,mk(id),now);
 assert(w('a')>w('b'));assert(w('b')>w('c'));assert.equal(w('c'),1);
 assert.equal(w('zzz'),1.5);
 p.questions.d={times_seen:3,times_answered:3,correct_count:3,incorrect_count:0,last_result:'correct',last_date:'2026-11-12T00:00:00Z'};
 assert(w('zzz')>w('c')&&w('c')>w('d'),'unseen > lightly known > mastered');
});
test('resurfaceSelect favors misses and session keeps the full pool list',()=>{
 const pool=Array.from({length:60},(_,i)=>mk('q'+i));const p=empty();const now=Date.now();
 for(let i=0;i<5;i++)p.questions['q'+i]={times_seen:1,times_answered:1,last_result:'incorrect',last_date:new Date(now).toISOString()};
 let hits=0;const r=rng();
 for(let t=0;t<200;t++)hits+=resurfaceSelect(pool,10,p,r,now).filter(q=>Number(q.question_id.slice(1))<5).length;
 assert(hits/200>1.6,'misses should appear about twice as often as the uniform 0.83, got '+hits/200);
 const s=session(pool,'learn','10',rng(),{progress:p,now});
 assert.equal(s.items.length,10);assert.equal(s.pool.length,60);
 assert.equal(session(pool,'learn','10',rng()).items.length,10);
});
test('combined sessions accept progress weighting and endless',()=>{
 const a=Array.from({length:30},(_,i)=>mk('a'+i)),b=Array.from({length:30},(_,i)=>mk('b'+i,{studySection:'pathology'}));
 const p=empty();p.questions.a3={last_result:'incorrect',last_date:new Date().toISOString()};
 const s=combinedSession([a,b],'learn','10',Math.random,{progress:p});
 assert.equal(s.items.length,10);assert.equal(s.endless,false);
 const e=combinedSession([a,b],'learn','endless');
 assert.equal(e.endless,true);assert.equal(e.items.length,60);assert.equal(e.pool.length,60);
 assert.equal(combinedSession([a,b],'learn','all').items.length,60);
});
test('duplicate clues are dropped but distinct clues stay',()=>{
 const q=mk('x',{explanation:'The red curve falls after menopause. It then levels off.',visual_clues:['The red curve falls after menopause.','Axis starts at zero.']});
 assert.deepEqual(distinctClues(q),['Axis starts at zero.']);
 assert.deepEqual(distinctClues(mk('y',{explanation:'Same thing.',visual_clues:['Same thing.']})),[]);
});
