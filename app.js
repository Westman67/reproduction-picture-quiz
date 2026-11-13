import {LEGACY_KEY,SUPPLEMENTARY_KEY,splitLegacyProgress,mergeSupplementaryProgress} from './progress-migration.js?v=keanne-followups1';
import {empty,filtered,session,item,ordered,see,answer,override,totals,canReveal,validateImport,reconcileFlags,defaultSettings,normalizeSettings,sessionSize,sortLectureIds,caseSession,combinedSession,STUDY_SKILLS,studySkillStats} from './engine.js?v=keanne-followups1';
import {STUDY_SECTIONS,CLINICAL_CASES,COMBINED,resolveBankConfig} from './bank-config.js?v=keanne-followups1';
const query=new URLSearchParams(window.location.search);
const CONFIG=resolveBankConfig(window.location.search);
const thirdPartyLink=CONFIG.id==='pathology'&&(query.get('bank')==='supplementary'||query.get('origin')==='third_party');
const sourceTypes=[['all','All sources'],['lecture','Lecture'],['third_party','3rd Party']];
const caseMode=CONFIG===CLINICAL_CASES;
const combinedMode=CONFIG===COMBINED;
const sectionLabels=Object.fromEntries(STUDY_SECTIONS.map(section=>[section.id,section.label]));
const combinedLengths=['10','20','40','all'];
let cases=[],retired=[];
const KEY=CONFIG.progressKey, PREF_KEY=CONFIG.preferencesKey, $=s=>document.querySelector(s), esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let bank,bankVersion,manifest,remediation=null,coverage={lectures:{}},p=empty(),screen='home',zoom=1,original=false,settings=defaultSettings();
let storageLocked=false;let byId={};const root=$('#app');let timer;
const navigation=[...STUDY_SECTIONS,{id:COMBINED.id,label:'Combined Practice',href:COMBINED.homeUrl}];
$('#bank-switch').innerHTML=navigation.map(option=>`<a href="${option.href}" ${option.id===CONFIG.id?'aria-current="page"':''}>${option.label}</a>`).join('');
if(caseMode)$('#home').textContent='Cases';
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(timer);timer=setTimeout(()=>$('#toast').style.display='none',4500);}
function save(){if(storageLocked)return;try{localStorage.setItem(KEY,JSON.stringify(p));}catch{toast('Progress could not be saved. Export it before leaving.');}}
function saveSettings(){try{localStorage.setItem(PREF_KEY,JSON.stringify({schema_version:1,...settings}));}catch{toast('Menu preferences could not be saved.');}}
function bind(id,fn){const el=$('#'+id);if(el)el.onclick=fn;}
function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),500);}
function option(value,text,current){return `<option value="${esc(value)}" ${value===current?'selected':''}>${esc(text)}</option>`;}
function skillPicker(id,pool){
    const choices=Object.entries(STUDY_SKILLS).map(([value,label])=>{
        const text=pool?`${label} (${pool.filter(q=>q.study_skill===value).length})`:label;
        return option(value,text,settings.skill);
    }).join('');
    return `<div><label for="${id}">Study skill</label><select id="${id}">
        ${option('all','All skills',settings.skill)}${choices}</select></div>`;
}
function skillReport(stats){
    const rows=Object.entries(STUDY_SKILLS).filter(([key])=>stats[key]).map(([key,label])=>{
        const {correct,answered}=stats[key];
        return `<tr><th scope="row">${label}</th><td>${correct}</td><td>${answered}</td></tr>`;
    }).join('');
    return `<section class="skill-report"><h3>Performance by study skill</h3>
        <table><thead><tr><th scope="col">Skill</th><th scope="col">Correct</th>
        <th scope="col">Answered</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}
function visualFeedback(q){
    if(!q.feedback_focus?.length)return '';
    const markers=q.feedback_focus.map(({x,y},i)=>
        `<span class="focus-pin" style="--x:${Number(x)}%;--y:${Number(y)}%" aria-hidden="true"><span>${i+1}</span></span>`).join('');
    return `<figure class="feedback-visual"><div class="feedback-field">
        <img src="${esc(q.image)}" alt="Quiz image with numbered features" loading="lazy">
        ${markers}</div><figcaption><ol>${q.feedback_focus.map(({label})=>`<li>${esc(label)}</li>`).join('')}</ol></figcaption></figure>`;
}
function resetZoom(){zoom=1;original=false;}
function coverageMarkup(){const lectures=sortLectureIds(manifest.sources.filter(s=>s.source_origin==='lecture').map(s=>s.lecture_id));return `<section class="coverage-section"><div class="row spread"><div><p class="eyebrow">Know what is covered</p><h2>Lecture coverage</h2></div><span class="fine">Coverage is not a mastery score</span></div><div class="grid">${lectures.map(id=>{const qs=bank.filter(q=>q.collection===id),info=coverage.lectures?.[id],sources=manifest.sources.filter(s=>s.lecture_id===id);return `<article class="card coverage-card"><div class="row spread"><h3>${esc(id)}</h3><span class="tag">${esc(info?.status||'Coverage not yet audited')}</span></div><p class="fine">${qs.length} ${qs.length===1?'question':'questions'} · ${new Set(qs.map(q=>q.source_group_id)).size} scored visual ${new Set(qs.map(q=>q.source_group_id)).size===1?'source':'sources'} · ${sources.filter(s=>s.status!=='USABLE').length} unscored captures</p><details><summary>Tested topics and remaining gaps</summary><h4>Tested in this bank</h4><ul>${(info?.tested_summary||[...new Set(qs.map(q=>q.tested_concept))]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul><h4>Still missing or incomplete</h4>${info?`<ul>${info.gaps.map(x=>`<li>${esc(x)}</li>`).join('')}</ul><p class="fine">${esc(info.next_capture)}</p>`:'<p class="fine">No lecture-wide coverage audit is recorded yet. Question count alone does not establish completeness.</p>'}<p class="fine">${esc(info?.basis||'Tested concepts are derived from the current scored question bank.')}</p></details></article>`;}).join('')}</div></section>`;}
function openCase(definition) {
    if(p.session&&!p.session.complete&&!confirm('Start a different case? This replaces the unfinished case.'))return;
    p.session=caseSession(definition,byId);
    save();
    resetZoom();
    quiz();
    window.scrollTo(0,0);
}

function caseHome() {
    screen='home';
    const current=cases.find(c=>c.case_id===p.session?.case_id);
    const matchingCases=settings.skill==='all'?cases:
        cases.filter(c=>c.question_ids.some(id=>byId[id].study_skill===settings.skill));
    root.innerHTML=`<section class="summary">
        <p class="eyebrow">Reproduction</p>
        <h1>Clinical Cases</h1>
        <p class="muted">Use the images to work through each case. Explanations appear after you finish the case.</p>
        ${current?`<p><button class="primary" id="resume">${p.session.complete?'Review':'Resume'} ${esc(current.title)}</button></p>`:''}
        <div class="card mt">${skillPicker('case-skill')}</div>
        ${matchingCases.length?'':'<p class="muted">No cases cover this study skill.</p>'}
        <div class="grid case-grid mt">
            ${matchingCases.map(c=>`<article class="card">
                <p class="eyebrow">${esc(c.lecture)}</p>
                <h2>${esc(c.title)}</h2>
                <p class="fine">${c.question_ids.length} visual questions</p>
                <button data-case="${esc(c.case_id)}">Start case<span class="sr-only">: ${esc(c.title)}</span></button>
            </article>`).join('')}
        </div>
    </section>`;
    bind('resume',()=>{
        resetZoom();
        if(p.session.complete)results();else quiz();
        window.scrollTo(0,0);
    });
    $('#case-skill').onchange=event=>{
        settings.skill=event.target.value;
        saveSettings();
        caseHome();
        $('#case-skill').focus({preventScroll:true});
    };
    for(const button of root.querySelectorAll('[data-case]')){
        button.onclick=()=>openCase(cases.find(c=>c.case_id===button.dataset.case));
    }
}

function combinedHome() {
    screen='home';
    const selected=new Set(settings.sections);
    const sourcePool=filtered(bank,p,{origin:settings.origin});
    const matchingCases=new Set(sourcePool.filter(q=>q.case_id&&q.study_skill===settings.skill).map(q=>q.case_id));
    const skillPool=settings.skill==='all'?sourcePool:
        sourcePool.filter(q=>q.case_id?matchingCases.has(q.case_id):q.study_skill===settings.skill);
    const total=skillPool.filter(q=>selected.has(q.studySection)).length;
    root.innerHTML=`<section class="summary combined-summary">
        <h1>Combined Practice</h1>
        <p class="muted">Choose one or more sections. A skill filter includes the entire case when any of its questions match. Case explanations appear after the session.</p>
        <div class="card practice-panel">
            <fieldset class="box-group">
                <legend>Study sections</legend>
                <div class="combined-sections">
                    ${STUDY_SECTIONS.map(section=>{
                        const count=skillPool.filter(q=>q.studySection===section.id).length;
                        return `<label class="select-box">
                            <input type="checkbox" name="study-section" value="${section.id}" ${selected.has(section.id)?'checked':''}>
                            <span class="box-face"><strong>${section.label}</strong><small>${count} questions</small></span>
                        </label>`;
                    }).join('')}
                </div>
                <div class="row mt">
                    <button id="select-sections" class="quiet" ${selected.size===STUDY_SECTIONS.length?'disabled':''}>Select all sections</button>
                    <button id="clear-sections" class="quiet" ${!selected.size?'disabled':''}>Clear selection</button>
                </div>
            </fieldset>
            <div class="form-grid">
                <div><label for="combined-origin">Source type</label>
                    <select id="combined-origin">${sourceTypes.map(([value,label])=>option(value,label,settings.origin)).join('')}</select></div>
                ${skillPicker('combined-skill')}
                <div><label for="combined-mode">Feedback mode</label>
                    <select id="combined-mode">${option('learn','Learn',settings.mode)}${option('exam','Exam',settings.mode)}</select></div>
                <div><label for="combined-length">Session length</label>
                    <select id="combined-length">${combinedLengths.map(length=>option(length,length==='all'?'All available':`Up to ${length} questions`,settings.length)).join('')}</select></div>
            </div>
            <p class="fine mt" id="combined-count" role="status">${total?`${total} questions available`:'No questions match the selected sections and source type.'}</p>
            <button id="start" class="primary full" ${!total?'disabled':''}>Start practice</button>
            ${p.session?`<button id="resume" class="full mt">${p.session.complete?'Review last session':'Resume saved session'}</button>`:''}
        </div>
    </section>`;

    for(const input of root.querySelectorAll('[name=study-section]')){
        input.onchange=()=>{
            if(input.checked)selected.add(input.value);else selected.delete(input.value);
            settings.sections=[...selected];
            saveSettings();
            combinedHome();
            root.querySelector(`[value="${input.value}"][name=study-section]`).focus({preventScroll:true});
        };
    }
    for(const [id,sections] of [['select-sections',STUDY_SECTIONS.map(s=>s.id)],['clear-sections',[]]]){
        bind(id,()=>{
            settings.sections=sections;
            saveSettings();
            combinedHome();
            root.querySelector('[name=study-section]').focus({preventScroll:true});
        });
    }
    $('#combined-origin').onchange=event=>{
        settings.origin=event.target.value;
        saveSettings();
        combinedHome();
        $('#combined-origin').focus({preventScroll:true});
    };
    $('#combined-skill').onchange=event=>{
        settings.skill=event.target.value;
        saveSettings();
        combinedHome();
        $('#combined-skill').focus({preventScroll:true});
    };
    $('#combined-mode').onchange=event=>{settings.mode=event.target.value;saveSettings();};
    $('#combined-length').onchange=event=>{settings.length=event.target.value;saveSettings();};
    bind('start',()=>{
        if(p.session&&!p.session.complete&&!confirm('Start a new session? Your scored progress is kept, but the unfinished session will be replaced.'))return;
        const pools=STUDY_SECTIONS.filter(section=>selected.has(section.id))
            .map(section=>skillPool.filter(q=>q.studySection===section.id));
        p.session=combinedSession(pools,settings.mode,settings.length);
        save();
        resetZoom();
        quiz();
        window.scrollTo(0,0);
    });
    bind('resume',()=>{
        resetZoom();
        if(p.session.complete)results();else quiz();
        window.scrollTo(0,0);
    });
}

function home(){if(caseMode)return caseHome();if(combinedMode)return combinedHome();screen='home';const pool=filtered(bank,p,settings),available=bank.length,seen=bank.filter(q=>p.groups[q.source_group_id]?.times_seen).length,missed=filtered(bank,p,{filter:'incorrect'}).length,lectures=sortLectureIds(bank.filter(q=>q.source_origin==='lecture').map(q=>q.collection)),count=sessionSize(pool.length,settings.length);
 root.innerHTML=`<section class="hero"><div class="intro"><p class="eyebrow">${esc(CONFIG.eyebrow)}</p><h1>Look closely.<br>Learn what matters.</h1><p class="muted">${esc(CONFIG.description)} Every question starts with the image.</p><div class="stats"><div class="card stat"><strong>${available}</strong><span>Verified questions</span></div><div class="card stat"><strong>${new Set(bank.map(q=>q.source_group_id)).size}</strong><span>Visual groups</span></div><div class="card stat"><strong>${missed}</strong><span>To revisit</span></div></div><span class="tag">${seen} / ${available} questions from seen sources</span><p class="fine mt">Reviewed images from the selected Reproduction collection. See coverage below for included topics and remaining gaps. Related questions share source history.</p></div><div class="card practice-panel"><p class="eyebrow">Make this session yours</p><h2>Choose your practice</h2><fieldset class="box-group"><legend>Mode</legend><div class="mode-boxes">${[['learn','Learn','Feedback after each answer'],['exam','Exam','Feedback at the end']].map(([value,title,description])=>`<label class="select-box"><input type="radio" name="mode" value="${value}" aria-label="${title}" ${settings.mode===value?'checked':''}><span class="box-face"><strong>${title}</strong><small>${description}</small></span></label>`).join('')}</div></fieldset><fieldset class="box-group"><legend>Session length</legend><div class="length-boxes">${[['10','10','10 questions'],['20','20','20 questions'],['40','40','40 questions'],['all','All available','All available'],['endless','Endless','Endless practice']].map(([value,title,label])=>`<label class="select-box ${value==='all'||value==='endless'?'wide':''}"><input type="radio" name="length" value="${value}" aria-label="${label}" ${settings.length===value?'checked':''}><span class="box-face"><strong>${title}</strong></span></label>`).join('')}</div></fieldset><fieldset class="box-group lecture-picker"><legend>Lectures</legend><div class="lecture-boxes">${lectures.map(id=>{const n=bank.filter(q=>q.collection===id).length;return `<label class="select-box"><input type="checkbox" name="lecture" value="${esc(id)}" aria-label="${esc(id)}" ${settings.collection==='all'||settings.collection.includes(id)?'checked':''}><span class="box-face"><strong>${esc(id)}</strong><small>${n} ${n===1?'question':'questions'}</small></span></label>`;}).join('')}</div><button id="all-lectures" class="quiet">Select all lectures</button></fieldset><div class="form-grid"><div><label for="origin">Source type</label><select id="origin">${sourceTypes.map(([v,t])=>option(v,`${t} (${filtered(bank,p,{...settings,origin:v,filter:'all'}).length})`,settings.origin)).join('')}</select></div><div><label for="category">Image category</label><select id="category">${option('all','All image types',settings.category)}${[...new Set(bank.map(q=>q.category))].map(x=>option(x,`${x} (${filtered(bank,p,{...settings,category:x,filter:'all'}).length})`,settings.category)).join('')}</select></div>${skillPicker('skill',filtered(bank,p,{...settings,skill:'all'}))}<div><label for="filter">Question selection</label><select id="filter">${[['all','Mixed practice'],['unseen','Unseen sources'],['incorrect','Previously incorrect'],['marked','Marked for review']].map(([v,t])=>option(v,`${t} (${filtered(bank,p,{...settings,filter:v}).length})`,settings.filter)).join('')}</select></div></div><p class="fine mt session-availability">${pool.length?`${pool.length} available · ${settings.length==='endless'?'Repeats the selected pool':`${count} in this session`}`:'No questions match. Select a lecture or change your filters.'}</p><button id="start" class="primary full" ${!pool.length?'disabled':''}>${settings.length==='endless'?`Start endless · ${count} questions`:`Start ${count} ${count===1?'question':'questions'}`}</button>${p.session&&!p.session.complete?'<button id="resume" class="full mt">Resume saved session</button>':''}${p.parkedSession?`<button id="resume-parked" class="full mt">${p.parkedSession.items.every(entry=>byId[entry.id].source_origin==='third_party')?'Resume saved 3rd Party session':'Resume other saved session'}</button>`:''}<p class="fine mt no-margin">Progress stays in this browser. No account or network connection is needed for local use.</p></div></section>${coverageMarkup()}`;
 for(const id of ['category','filter','origin','skill'])$('#'+id).onchange=e=>{settings[id]=e.target.value;saveSettings();home();$('#'+id).focus({preventScroll:true});};
 document.querySelectorAll('.select-box input[type=radio]').forEach(el=>el.onchange=()=>{const {name,value}=el;settings[name]=value;saveSettings();home();document.querySelector(`input[name="${name}"][value="${value}"]`).focus({preventScroll:true});});
 document.querySelectorAll('input[name=lecture]').forEach((el,index)=>el.onchange=()=>{const chosen=new Set(settings.collection==='all'?lectures:settings.collection);el.checked?chosen.add(el.value):chosen.delete(el.value);settings.collection=[...chosen];saveSettings();home();document.querySelectorAll('input[name=lecture]')[index].focus({preventScroll:true});});
 bind('all-lectures',()=>{settings.collection='all';saveSettings();home();$('#all-lectures').focus({preventScroll:true});});
 bind('start',()=>{if(p.session&&!p.session.complete&&!confirm('Start a new session? Your scored progress is kept, but the unfinished session will be replaced.'))return;p.session=session(pool,settings.mode,settings.length);save();resetZoom();quiz();window.scrollTo(0,0);});bind('resume',()=>{resetZoom();quiz();window.scrollTo(0,0);});
 bind('resume-parked',()=>{
    const active=p.session&&!p.session.complete?p.session:null;
    p.session=p.parkedSession;
    p.parkedSession=active;
    save();resetZoom();quiz();window.scrollTo(0,0);
 });
}
function tableMarkup(table,reveal){
    const hidden=new Set((table.hidden_cells||[]).map(([row,column])=>row+':'+column));
    return `<div class="visual question-table"><table>
        <caption>${esc(table.title)}</caption>
        <thead><tr>${table.columns.map(column=>`<th scope="col">${esc(column)}</th>`).join('')}</tr></thead>
        <tbody>${table.rows.map((row,i)=>`<tr>${row.map((cell,j)=>{
            const value=!reveal&&hidden.has(i+':'+j)
                ?'<span class="table-mask"><span class="sr-only">Answer hidden</span></span>'
                :esc(cell);
            return j===0?`<th scope="row">${value}</th>`:`<td>${value}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
}
function imageMarkup(q,reveal){return `<div class="visual${q.case_id&&q.joint_panels?' case-paired':''}"><div class="image-frame" id="frame"><img id="quiz-image" src="${esc(q.image)}" alt="Quiz source image" decoding="async" fetchpriority="high"></div><div class="image-toolbar"><div class="row"><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button><button id="fit">Fit image</button></div><span class="fine" id="zoom-label">100%</span></div><div class="image-toolbar">${reveal?'<button id="original">Show teaching original</button>':'<span class="fine">Quiz image only</span>'}<button id="fullscreen">Full image</button></div></div>`;}
function applyZoom(q){const frame=$('#frame'),img=$('#quiz-image');if(!frame||!img)return;frame.classList.toggle('zoomed',zoom>1);frame.style.setProperty('--zoom-width',`${frame.clientWidth*zoom}px`);img.src=original?q.original_image:zoom>1?q.zoom_image:q.image;$('#zoom-label').textContent=`${Math.round(zoom*100)}%`;if(zoom===1){frame.scrollTop=0;frame.scrollLeft=0;}if($('#original'))$('#original').textContent=original?'Show quiz image':'Show teaching original';}
function wireImage(q,reveal){bind('zoom-in',()=>{zoom=Math.min(4,zoom+.5);applyZoom(q);});bind('zoom-out',()=>{zoom=Math.max(1,zoom-.5);applyZoom(q);});bind('fit',()=>{zoom=1;applyZoom(q);});if(reveal){bind('original',()=>{original=!original;applyZoom(q);});}bind('fullscreen',()=>{const d=document.createElement('dialog');d.className='full-image-viewer';d.innerHTML=`<div class="row spread"><h3 class="no-margin">Full image</h3><button id="close-dialog">Close</button></div><div class="row full-image-tools"><button id="full-out" aria-label="Zoom full image out">−</button><button id="full-in" aria-label="Zoom full image in">+</button><button id="full-fit">Fit image</button><span class="fine" id="full-scale">100%</span></div><div class="image-frame full-image-frame" id="full-frame"><img src="${esc(reveal&&original?q.original_image:q.zoom_image)}" alt="${reveal&&original?'Teaching original':'Quiz source image'}"></div>`;document.body.append(d);d.showModal();let scale=1,drag=null;const frame=d.querySelector('#full-frame');const apply=()=>{frame.classList.toggle('zoomed',scale>1);frame.style.setProperty('--zoom-width',`${frame.clientWidth*scale}px`);d.querySelector('#full-scale').textContent=`${Math.round(scale*100)}%`;if(scale===1){frame.scrollTop=0;frame.scrollLeft=0;}};d.querySelector('#close-dialog').onclick=()=>d.close();d.querySelector('#full-in').onclick=()=>{scale=Math.min(4,scale+.5);apply();};d.querySelector('#full-out').onclick=()=>{scale=Math.max(1,scale-.5);apply();};d.querySelector('#full-fit').onclick=()=>{scale=1;apply();};frame.onpointerdown=e=>{if(scale===1)return;drag={x:e.clientX,y:e.clientY,left:frame.scrollLeft,top:frame.scrollTop};frame.setPointerCapture(e.pointerId);};frame.onpointermove=e=>{if(drag){frame.scrollLeft=drag.left-e.clientX+drag.x;frame.scrollTop=drag.top-e.clientY+drag.y;}};frame.onpointerup=()=>drag=null;frame.onpointercancel=()=>drag=null;d.onclose=()=>d.remove();});
 const frame=$('#frame');let drag=null;frame.onpointerdown=e=>{if(zoom===1)return;drag={x:e.clientX,y:e.clientY,left:frame.scrollLeft,top:frame.scrollTop};frame.setPointerCapture(e.pointerId);};frame.onpointermove=e=>{if(drag){frame.scrollLeft=drag.left-e.clientX+drag.x;frame.scrollTop=drag.top-e.clientY+drag.y;}};frame.onpointerup=()=>drag=null;frame.onpointercancel=()=>drag=null;applyZoom(q);}
function feedback(q,it){const result=!it.locked?'Unanswered':it.overridden?'Corrected with Keanne Button':it.correct?'Correct':'Not quite';return `<section class="feedback" id="feedback"><p class="result ${it.overridden?'override-text':it.locked&&!it.correct?'wrong-text':''}">${result}</p><p>${esc(q.explanation)}</p><h3>What to notice</h3><ul>${q.visual_clues.map(c=>`<li>${esc(c)}</li>`).join('')}</ul>${visualFeedback(q)}<h3>Every option explained</h3>${it.order.map(k=>`<div class="rationale"><strong>${k===q.correct_index?'✓ Correct answer · ':''}${k===it.draft?'Your choice · ':''}${esc(q.options[k])}</strong><p>${esc(q.choice_rationales[k])}</p></div>`).join('')}<p class="citation mt">${q.citations.map(c=>c.page==null?esc(c.document):`${esc(c.document)}, p. ${c.page}`).join('<br>')}</p>${q.visual_kind==='table'?'':`<details><summary>Image provenance</summary><p class="citation">${esc(q.original_filename)}<br>${esc(q.source_id)}<br>${esc(q.source_origin==='lecture'?'Lecture':'Third party')} · ${esc(q.collection)}</p></details>`}${it.locked&&!it.correct?'<button id="keanne">Keanne Button</button><p class="fine">Count this locked answer as correct without changing your selected option or adding an attempt.</p>':''}</section>`;}
const mobileLayout=window.matchMedia('(max-width:850px)');
function positionQuestion(){const heading=$('#question-heading');if(!heading)return;if(mobileLayout.matches)document.querySelector('.quiz-layout').prepend(heading);else document.querySelector('.question').prepend(heading);}
mobileLayout.addEventListener('change',positionQuestion);
function flagCaseImage(q) {
    const dialog=document.createElement('dialog');
    dialog.className='case-flag-dialog';
    dialog.innerHTML=`<form>
        <h2>Flag image</h2>
        <label for="flag-note">What needs attention in this image?</label>
        <textarea id="flag-note" name="note" required rows="4"></textarea>
        <div class="row"><button type="button" id="cancel-flag">Cancel</button><button class="primary">Save flag</button></div>
    </form>`;
    const form=dialog.querySelector('form');
    const note=form.elements.note;
    note.value=p.flags[q.question_id]?.note||'';
    form.onsubmit=event=>{
        event.preventDefault();
        if(!note.value.trim()){
            note.setCustomValidity('Enter an issue with the image.');
            note.reportValidity();
            return;
        }
        p.flags[q.question_id]={question_id:q.question_id,source_id:q.source_id,variant_id:q.variant_id,status:'open',note:note.value.trim(),date:new Date().toISOString()};
        save();
        dialog.close();
        quiz();
        $('#flag').focus();
        toast('Image flagged for review.');
    };
    note.oninput=()=>note.setCustomValidity('');
    dialog.querySelector('#cancel-flag').onclick=()=>dialog.close();
    dialog.addEventListener('close',()=>dialog.remove());
    document.body.append(dialog);
    dialog.showModal();
    note.focus();
}

function quiz(){screen='quiz';const s=p.session;if(!s?.items.length)return home();const it=s.items[s.index],q=byId[it.id];if(!q)return home();see(p,q,it);save();const caseQuestion=Boolean(q.case_id),tableQuestion=q.visual_kind==='table';
 const reveal=canReveal(s,it)&&(!caseQuestion||s.complete);
 const scenario=caseQuestion?q.scenario:q.case_context;
 const section=combinedMode?(caseQuestion?cases.find(c=>c.case_id===q.case_id)?.title:sectionLabels[q.studySection]):'';
 root.innerHTML=`<div class="quiz-meta"><span>${s.complete?'Session review':caseMode?'Clinical Cases':s.mode==='learn'?'Learn mode':'Exam mode'} · ${section?esc(section)+' · ':''}${esc(q.collection)}</span><span>${s.index+1} / ${s.items.length} ${s.endless?'· Endless':''}</span><progress max="${s.items.length}" value="${s.index+1}"></progress><button id="finish" class="quiet">${s.complete?'Back to results':caseMode?'Finish case':'Finish session'}</button></div><section class="quiz-layout">${tableQuestion?tableMarkup(q.context_table,reveal):imageMarkup(q,reveal)}<div class="card question"><div class="question-heading" id="question-heading"><p class="eyebrow">${esc(q.category)} · ${caseQuestion?'Visual Question':'Visual practical'}</p>${scenario?`<p class="case-scenario">${esc(scenario)}</p>`:''}<h2>${esc(caseQuestion?q.lead_in:q.stem)}</h2></div><div class="choices">${it.order.map((k,pos)=>`<button class="choice ${it.draft===k?'selected':''} ${reveal&&k===q.correct_index?'correct':''} ${reveal&&it.draft===k&&!it.correct?'wrong':''} ${reveal&&it.draft===k&&it.overridden?'overridden':''}" data-choice="${k}" ${it.locked||s.complete?'disabled':''}><span class="letter">${caseQuestion?'ABCDE'[pos]:pos+1}</span>${esc(q.options[k])}</button>`).join('')}</div><div class="controls"><button id="back" ${s.index===0?'disabled':''} aria-keyshortcuts="ArrowLeft">← Back</button><button id="submit" class="primary" ${it.draft===null||it.locked||s.complete?'disabled':''}>${it.locked?'Answer locked':'Submit answer'}</button><button id="next" aria-keyshortcuts="ArrowRight">${s.index===s.items.length-1&&!s.endless?'Finish':'Next'} →</button></div><div class="row mt"><button id="mark" class="quiet">${p.questions[q.question_id]?.marked?'★ Marked':'☆ Mark for review'}</button>${tableQuestion?'':`<button id="flag" class="quiet">${p.flags[q.question_id]?.status==='open'?'Image flagged':'Flag image'}</button>`}</div><p class="fine">1–${it.order.length} to choose · Enter to submit or advance · ← Back · → Next${tableQuestion?'':' · Z to zoom'}<br>You can skip and return without losing a draft.</p>${!reveal&&it.locked?`<p class="notice">Answer saved. Feedback appears after the ${caseMode?'case':combinedMode?'session':'exam'}.</p>`:''}${reveal?feedback(q,it):''}</div></section>`;
 document.querySelectorAll('[data-choice]').forEach(el=>el.onclick=()=>{it.draft=Number(el.dataset.choice);save();quiz();});
 bind('submit',()=>{if(answer(p,q,it)){save();quiz();}});bind('back',()=>move(-1));bind('next',()=>move(1));bind('finish',()=>{if(s.complete)results();else if(confirm(caseMode?'Finish this case? Unanswered questions will be reported separately.':'Finish this session? Unanswered questions will be reported separately.'))finish();});
 bind('mark',()=>{const st=p.questions[q.question_id];st.marked=!st.marked;save();quiz();});
 bind('flag',()=>{if(caseQuestion)return flagCaseImage(q);const note=prompt('What needs attention in this image?',p.flags[q.question_id]?.note||'');if(note===null)return;p.flags[q.question_id]={question_id:q.question_id,source_id:q.source_id,variant_id:q.variant_id,status:'open',note,date:new Date().toISOString()};save();quiz();toast('Image flagged for review.');});
 bind('keanne',()=>{if(override(p,q,it)){if(s.complete&&Number.isInteger(s.result_index))p.exams[s.result_index]={...p.exams[s.result_index],...totals(s)};save();quiz();}});positionQuestion();if(!tableQuestion)wireImage(q,reveal);
}
function move(delta){const s=p.session;if(s.index+delta<0)return;if(s.index+delta>=s.items.length){if(s.endless&&!s.complete){const prior=byId[s.items.at(-1).id].source_group_id;s.items.push(...ordered(bank.filter(q=>s.pool.includes(q.question_id)),Math.random,prior).map(q=>item(q)));}else{return s.complete?results():finish();}}s.index+=delta;resetZoom();save();quiz();window.scrollTo(0,0);}
function finish(){const s=p.session;if(!s.complete){s.complete=true;s.result_index=p.exams.length;p.exams.push({date:new Date().toISOString(),mode:s.mode,...(caseMode?{case_id:s.case_id}:{}),...totals(s)});save();}results();}
function scoreBreakdown(s,keyFor){const out={};s.items.forEach(it=>{const q=byId[it.id],key=keyFor(q);let b=out[key]??={correct:0,answered:0};if(it.locked){b.answered++;if(it.correct)b.correct++;}});return out;}
function results(){screen='results';const s=p.session,t=totals(s),categories=scoreBreakdown(s,q=>q.category),concepts=scoreBreakdown(s,q=>q.tested_concept),
skills=studySkillStats(s.items.map(it=>({...it,study_skill:byId[it.id].study_skill})),it=>({
    correct:Number(it.locked&&!!it.correct),answered:Number(it.locked),
})),focus=s.items.map((it,i)=>({it,i,q:byId[it.id]})).filter(({it,q})=>it.locked&&!it.correct||p.questions[q.question_id]?.marked);root.innerHTML=`<section class="summary"><p class="eyebrow">${caseMode?'Case complete':'Session complete'}</p><h1>${caseMode?esc(cases.find(c=>c.case_id===s.case_id)?.title):'A closer look,<br>a stronger memory.'}</h1><p class="muted">${t.total-t.unanswered?((t.correct/(t.total-t.unanswered))*100).toFixed(2):'0.00'}% of answered questions correct. Unanswered questions are not scored.</p><div class="stats"><div class="card stat"><strong>${t.correct}</strong><span>Correct</span></div><div class="card stat"><strong>${t.incorrect}</strong><span>Incorrect</span></div><div class="card stat"><strong>${t.unanswered}</strong><span>Unanswered</span></div></div><div class="card"><h2>${caseMode?'Review your case':'Review your session'}</h2>${skillReport(skills)}<h3>Performance by visual category</h3><p class="fine">${Object.entries(categories).map(([k,v])=>`${esc(k)} ${v.correct}/${v.answered} answered`).join(' · ')}</p><details><summary>Performance by tested concept · ${Object.keys(concepts).length} concepts</summary>${Object.entries(concepts).map(([k,v])=>`<p class="fine">${esc(k)} · ${v.correct}/${v.answered} answered</p>`).join('')}</details><div class="row mt">${caseMode?'':`<button id="retry" ${!t.incorrect?'disabled':''}>${combinedMode?'Retry missed questions and cases':'Retry missed questions'}</button>`}<button id="again" class="primary">${caseMode?'All cases':'New practice'}</button></div><h3 class="mt">Missed and marked questions</h3>${focus.length?focus.map(({it,i,q})=>`<p class="row spread"><span>${i+1}. ${esc(q.tested_concept)}${p.questions[q.question_id]?.marked?' ★':''}</span><button data-review="${i}" class="quiet">${it.overridden?'Corrected':it.correct?'Marked':'Incorrect'} · Review</button></p>`).join(''):'<p class="fine">No missed or marked questions in this session.</p>'}<details class="mt" ${caseMode?'open':''}><summary>Review every question</summary>${s.items.map((it,i)=>`<p class="row spread"><span>${i+1}. ${esc(byId[it.id].tested_concept)}${p.questions[it.id]?.marked?' ★':''}</span><button data-review="${i}" class="quiet">${!it.locked?'Unanswered':it.overridden?'Corrected':it.correct?'Correct':'Incorrect'} · Review</button></p>`).join('')}</details></div></section>`;
 document.querySelectorAll('[data-review]').forEach(el=>el.onclick=()=>{s.index=Number(el.dataset.review);resetZoom();quiz();});bind('again',home);bind('retry',()=>{
    const missed=s.items.filter(i=>i.locked&&!i.correct).map(i=>byId[i.id]);
    const ids=new Set(missed.map(q=>q.question_id));
    if(combinedMode){
        const missedCases=new Set(missed.filter(q=>q.case_id).map(q=>q.case_id));
        const pools=STUDY_SECTIONS.map(section=>bank.filter(q=>q.studySection===section.id&&
            (ids.has(q.question_id)||missedCases.has(q.case_id))));
        p.session=combinedSession(pools,'learn','all');
    }else{
        p.session=session(bank.filter(q=>ids.has(q.question_id)),'learn','all');
    }
    save();resetZoom();quiz();
 });}
function progress(){screen='progress';const stats=Object.values(p.questions),n=stats.reduce((a,s)=>a+s.times_answered,0),c=stats.reduce((a,s)=>a+s.correct_count,0);root.innerHTML=`<section class="summary"><p class="eyebrow">Your local record</p><h1>Keep your progress.</h1><p class="muted">${n} answered attempts · ${n?(100*c/n).toFixed(2):'0.00'}% correct. Browser data does not automatically sync between devices or site addresses.</p><div class="card"><div class="row"><button id="export">Export progress</button>${localStorage.getItem(LEGACY_KEY)?'<button id="legacy-export">Export previous combined progress</button>':''}<label class="file-label">Import progress<input id="import" type="file" accept=".json,application/json"></label><button id="reset">Reset progress</button></div><p class="fine mt">Export before changing browsers, moving to a hosted URL, or clearing browser storage. Import replaces this browser’s progress only after confirmation.</p>${skillReport(studySkillStats(bank,q=>{
    const row=p.questions[q.question_id];
    return row?{correct:row.correct_count,answered:row.times_answered}:null;
}))}<h3>Concept practice</h3>${Object.entries(p.concepts).map(([k,v])=>`<p class="fine">${esc(k)} · ${v.correct} correct / ${v.correct+v.incorrect} answered</p>`).join('')||'<p class="fine">Your first session will appear here.</p>'}</div></section>`;
 bind('legacy-export',()=>{try{download('reproduction-previous-combined-progress.json',JSON.parse(localStorage.getItem(LEGACY_KEY)));}catch{toast('Previous progress could not be read.');}});bind('export',()=>download(CONFIG.exportName,p));bind('reset',()=>{if(confirm('Reset all local progress, sessions, flags, and review decisions? Source images and questions will not change.')){storageLocked=false;p=empty();if(CONFIG.id==='pathology')p.supplementaryProgressImported=true;save();progress();}});$('#import').onchange=async e=>{try{let f=e.target.files[0];if(!f)return;if(f.size>5e6)throw Error('File is too large.');let incoming=validateImport(JSON.parse(await f.text()),bank,caseMode?cases:[],retired);if(confirm('Replace this browser’s progress with this export?')){storageLocked=false;p=incoming;reconcileFlags(p,remediation);save();progress();toast('Progress imported.');}}catch(e){toast(e.message);}};
}
function review(){screen='review';const flags=Object.values(p.flags),sourceQuestions=new Map(bank.map(q=>[q.source_id,q]));root.innerHTML=`<p class="eyebrow">Reviewer workspace · Answers visible</p><h1>Sources, not shortcuts.</h1><p class="muted">${manifest.sources.length} source files inventoried. ${new Set(bank.map(q=>q.source_group_id)).size} distinct visual source groups support scored tasks. ${manifest.sources.filter(s=>s.status!=='USABLE').length} remain teaching references or alternate annotated views.</p><div class="row"><button id="export-flags">Export flags & decisions</button><button id="open-flags">${flags.filter(f=>f.status==='open').length} open image flags</button></div><div class="card mt"><h3>Learner image flags</h3>${flags.length?flags.map(f=>`<div class="rationale"><p>${esc(byId[f.question_id]?.tested_concept||retired.find(q=>q.question_id===f.question_id)?.tested_concept||f.question_id)} · ${esc(f.status)}${retired.some(q=>q.question_id===f.question_id)?' · Reference only':''}</p><p>${esc(f.note)}</p><button data-flag="${esc(f.question_id)}">${f.status==='open'?'Mark resolved':'Reopen flag'}</button></div>`).join(''):'<p class="fine">No image flags yet. Use Flag image during a quiz to record a problem.</p>'}</div><div class="grid mt">${manifest.sources.map(s=>{const q=sourceQuestions.get(s.source_id),decision=p.decisions[s.source_id],variant=q?s.variants?.find(v=>v.variant_id===q.variant_id):null,proposed=decision?.proposed_answer||q?.options?.[q.correct_index]||s.tested_concept||'';return `<article class="card review-item"><span class="tag">${esc(s.status)}</span><h3 class="mt">${esc(s.tested_concept)}</h3><img class="review-img" src="${esc(s.display_asset||s.original_asset)}" alt="Teaching source for review" loading="lazy" decoding="async"><p>${esc(s.study_status_note||s.review_reason)}</p><p class="fine"><strong>Ground truth</strong><br>${esc(q?.ground_truth_confidence||'Not scored')} confidence · ${esc(q?.ground_truth_basis||s.ground_truth_basis||'No basis recorded')}</p><p class="fine"><strong>Accepted synonyms</strong><br>${q?.accepted_synonyms?.length?q.accepted_synonyms.map(esc).join(', '):'None recorded'}</p><p class="fine"><strong>Source group and transform</strong><br>${esc(s.source_group_id)} · ${esc(variant?.transform?.type||s.transform?.type||'No scored transform')} · ${esc(variant?.transform?.reason||s.transform?.reason||'')}</p><details><summary>Source and full image</summary><a href="${esc(s.original_asset||s.display_asset)}" target="_blank" rel="noopener">Open review image at full size</a><p>${esc(s.relative_path)}<br>${esc(s.source_citation.document)}${s.source_citation.page==null?' (page not verified)':`, p. ${s.source_citation.page}`}</p><p>${esc(s.source_id)}</p></details><label for="answer-${s.source_id}">Proposed correct answer</label><input id="answer-${s.source_id}" value="${esc(proposed)}"><label for="note-${s.source_id}" class="mt">Review note or correction rationale</label><textarea id="note-${s.source_id}">${esc(decision?.note||'')}</textarea><div class="pill-actions mt">${[['approve','approve transformation'],['retain','retain'],['crop','crop'],['exclude','exclude'],['needs_review','needs review']].map(([a,label])=>`<button data-decision="${esc(s.source_id)}" data-action="${a}" data-n="${s.source_id}">${label}</button>`).join('')}</div><p class="fine" id="decision-${s.source_id}">${esc(decision?.action||'No local decision')}</p></article>`;}).join('')}</div><p class="notice mt">Review decisions are saved locally and exportable. They do not silently alter the scored bank. Approved corrections need a rebuilt and validated bank before activation.</p>`;
 bind('export-flags',()=>download('reproduction-image-review.json',{schema_version:1,bank_version:bankVersion,flags:p.flags,decisions:p.decisions}));bind('open-flags',()=>document.querySelector('.card.mt').scrollIntoView());document.querySelectorAll('[data-flag]').forEach(el=>el.onclick=()=>{const f=p.flags[el.dataset.flag];f.status=f.status==='open'?'resolved':'open';f.date=new Date().toISOString();save();review();});document.querySelectorAll('[data-decision]').forEach(el=>el.onclick=()=>{p.decisions[el.dataset.decision]={action:el.dataset.action,proposed_answer:$('#answer-'+el.dataset.n).value.trim(),note:$('#note-'+el.dataset.n).value,date:new Date().toISOString()};save();$('#decision-'+el.dataset.n).textContent='Saved · '+el.dataset.action;toast('Review decision saved locally.');});
}
document.addEventListener('keydown', event => {
    const { key, target } = event;
    if (screen !== 'quiz' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
        target.isContentEditable || target.closest?.('input, textarea, select') || $('dialog[open]')) return;

    if (key === 'ArrowLeft' || key === 'ArrowRight') {
        event.preventDefault();
        $(key === 'ArrowLeft' ? '#back' : '#next')?.click();
        return;
    }

    if (/^[1-5]$/.test(key)) {
        document.querySelectorAll('[data-choice]')[Number(key) - 1]?.click();
    } else if (key === 'Enter') {
        if ((caseMode||combinedMode) && target.closest?.('button, a, summary')) return;
        event.preventDefault();
        const submit = $('#submit');
        if (submit && !submit.disabled) submit.click();
        else $('#next')?.click();
    } else if (key.toLowerCase() === 'z') {
        (zoom > 1 ? $('#fit') : $('#zoom-in'))?.click();
    }
});
const DATA_VERSION='keanne-followups1';

async function loadSection(section, includeExtras=false){
    const fetchData=name=>fetch(`${section.dataRoot}/${name}.json?v=${DATA_VERSION}`);
    const [questionBank,sourceManifest,coverageData,remediationData]=await Promise.all([
        fetchData('question-bank').then(response=>{
            if(!response.ok)throw Error('Question bank is missing.');
            return response.json();
        }),
        fetchData('source-manifest').then(response=>response.json()),
        includeExtras?fetchData('coverage').then(response=>response.ok?response.json():{lectures:{}}).catch(()=>({lectures:{}})):{lectures:{}},
        includeExtras?fetchData('flag-remediation').then(response=>response.ok?response.json():null).catch(()=>null):null,
    ]);
    return [questionBank,sourceManifest,coverageData,remediationData];
}

async function loadCombined(){
    const sections=await Promise.all(STUDY_SECTIONS.map(async section=>{
        const [questionBank,sourceManifest]=await loadSection(section);
        return {section,questionBank,sourceManifest};
    }));
    const questions=[];
    const caseDefinitions=[];
    const retiredQuestions=[];
    const sources=new Map();
    for(const {section,questionBank,sourceManifest} of sections){
        questions.push(...questionBank.questions.map(q=>({...q,studySection:section.id})));
        caseDefinitions.push(...(questionBank.cases||[]));
        retiredQuestions.push(...(questionBank.retired_questions||[]));
        for(const source of sourceManifest.sources){
            const previous=sources.get(source.source_id);
            if(!previous){
                sources.set(source.source_id,source);
                continue;
            }
            const variants=new Map((previous.variants||[]).map(variant=>[variant.variant_id,variant]));
            for(const variant of source.variants||[])variants.set(variant.variant_id,variant);
            sources.set(source.source_id,{...previous,...source,variants:[...variants.values()]});
        }
    }
    return [{questions,cases:caseDefinitions,retired_questions:retiredQuestions,bank_version:DATA_VERSION},{sources:[...sources.values()]},{lectures:{}},null];
}

function combinedSettings(saved){
    const ids=STUDY_SECTIONS.map(section=>section.id);
    const previous=Array.isArray(saved?.sections)?saved.sections:null;
    const selected=previous?.map(id=>id==='supplementary'?'pathology':id);
    return {
        sections:selected?ids.filter(id=>selected.includes(id)):ids,
        origin:sourceTypes.some(([value])=>value===saved?.origin)?saved.origin:
            previous?.length===1&&previous[0]==='supplementary'?'third_party':'all',
        skill:Object.hasOwn(STUDY_SKILLS,saved?.skill)?saved.skill:'all',
        mode:saved?.mode==='exam'?'exam':'learn',
        length:combinedLengths.includes(saved?.length)?saved.length:'10',
    };
}

try{
 const [b,m,c,rem]=combinedMode?await loadCombined():await loadSection(CONFIG,!caseMode);
 document.title=CONFIG.title;document.querySelector('.brand-sub').textContent=CONFIG.brand;document.querySelector('.brand').href=CONFIG.homeUrl;document.querySelector('#app-footer').textContent=CONFIG.footer;remediation=rem;bank=b.questions;cases=b.cases||[];retired=b.retired_questions||[];bankVersion=b.bank_version;manifest=m;coverage=c;if(combinedMode)settings=combinedSettings();try{const saved=JSON.parse(localStorage.getItem(PREF_KEY)||'null');if(saved?.schema_version===1)settings=combinedMode?combinedSettings(saved):normalizeSettings(saved,bank);}catch{toast('Saved menu preferences could not be loaded.');}if(thirdPartyLink)settings={...settings,origin:'third_party',collection:'all',category:'all',filter:'all',skill:'all'};
 byId=Object.fromEntries(bank.map(q=>[q.question_id,q]));
 try{
    const raw=localStorage.getItem(KEY);
    const oldSupplementary=CONFIG.id==='pathology'?localStorage.getItem(SUPPLEMENTARY_KEY):null;
    if(raw)p=validateImport(JSON.parse(raw),bank,caseMode?cases:[],retired);
    else if(!caseMode&&!combinedMode){
        const previous=localStorage.getItem(LEGACY_KEY);
        const legacyBank=oldSupplementary?bank.filter(q=>q.source_origin==='lecture'):bank;
        if(previous)p=splitLegacyProgress(JSON.parse(previous),legacyBank,manifest.sources);
    }
    if(oldSupplementary&&!p.supplementaryProgressImported){
        try{
            p=mergeSupplementaryProgress(p,JSON.parse(oldSupplementary),
                bank.filter(q=>q.source_origin==='third_party'),manifest.sources.filter(s=>s.source_origin==='third_party'));
        }catch{toast('Earlier 3rd Party progress could not be loaded.');}
    }
    reconcileFlags(p,remediation);save();
 }catch{storageLocked=true;toast('Saved data could not be loaded. Export or reset it before saving new progress.');}bind('home',()=>{home();window.scrollTo(0,0);});bind('review',()=>{review();window.scrollTo(0,0);});bind('progress',()=>{progress();window.scrollTo(0,0);});home();}catch(e){root.innerHTML=`<div class="notice warning"><h2>The quiz could not load</h2><p>${esc(e.message)}</p><p>Use Start Quiz.command or serve this folder locally. Do not open index.html directly with a file URL.</p></div>`;}
