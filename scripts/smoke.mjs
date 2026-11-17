import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import {once} from 'node:events';
import path from 'node:path';
import {chromium} from 'playwright';

async function getLocalURL(server) {
    const timer = AbortSignal.timeout(6000);
    const [buffer] = await once(server.stdout, 'data', {signal:timer});
    const url = buffer.toString().match(/http:\/\/127\.0\.0\.1:\d+\//)?.[0];
    assert(url, 'The quiz server must report its loopback URL');
    return url;
}

async function checkChoices(page) {
    await page.locator('#feedback .rationale').last().waitFor();
    const choices=await page.locator('#feedback .rationale .rationale-status').allTextContents();
    assert.equal(choices.filter(label=>label.startsWith('Correct')).length,1);
    assert.equal(choices.filter(label=>label.endsWith('Your choice')).length,1);
    assert.equal(choices.length,await page.locator('button.choice').count());
}

const root=path.resolve(import.meta.dirname,'..');
const server=process.env.QUIZ_URL?null:spawn('python3',['scripts/serve.py','--port','0'],{cwd:root,stdio:['ignore','pipe','inherit']});
let browser;
try {
    const base=process.env.QUIZ_URL||await getLocalURL(server);
    browser=await chromium.launch();
    for(const bank of ['physiology','pathology','clinical-cases','combined']){
        const page=await browser.newPage({serviceWorkers:'block',viewport:{width:bank==='physiology'?390:1280,height:840}});
        page.setDefaultTimeout(12000);
        const errors=[];
        const requested=[];
        page.on('request',request=>requested.push(new URL(request.url()).pathname));
        page.on('pageerror',error=>errors.push(error.message));
        await page.addInitScript(()=>{window.confirm=()=>true;});
        const caseMode=bank==='clinical-cases';
        const exam=caseMode||bank==='combined';
        await page.goto(new URL(`?bank=${bank}`,base).href);
        const start=caseMode?page.locator('[data-case="r10-vulvar-plaque"]'):page.locator('#start');
        await start.waitFor();
        assert(!requested.some(url=>url.endsWith('/source-manifest.json')||url.endsWith('/coverage.json')));
        if(bank==='physiology'){
            await page.locator('#resurface').uncheck();
            await page.reload();
            assert.equal(await page.locator('#resurface').isChecked(),false);
        }
        if(bank==='combined')await page.locator('#combined-mode').selectOption('exam');
        let fail=bank==='physiology';
        if(fail)await page.route('**/assets/**/*.webp',route=>{
            if(fail){fail=false;return route.abort();}
            return route.continue();
        });
        await start.click();
        assert.equal(await page.locator('#original,#feedback').count(),0);
        if(bank==='physiology'){
            await page.getByText('Image could not load.',{exact:true}).waitFor();
            await page.getByRole('button',{name:'Retry image'}).click();
            await page.waitForFunction(()=>document.querySelector('#quiz-image')?.naturalWidth>0);
            assert.equal(await page.locator('.controls').evaluate(node=>getComputedStyle(node).position),'sticky');
            await page.getByRole('button',{name:'Full image',exact:true}).click();
            await page.waitForFunction(()=>document.querySelector('#full-image')?.naturalWidth>0);
            await page.getByRole('button',{name:'Close',exact:true}).click();
        }
        await page.locator('button.choice').first().click();
        await page.locator('#submit').click();
        if(exam)assert.equal(await page.locator('#feedback').count(),0);
        else await checkChoices(page);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('ArrowLeft');
        assert.equal(await page.locator('#submit').innerText(),'Answer locked');
        await page.locator('#finish').click();
        const reviews=page.locator('details').filter({hasText:'Review every question'});
        if(!caseMode)await reviews.locator('summary').click();
        await reviews.locator('[data-review="0"]').click();
        await checkChoices(page);
        if(await page.locator('#original').count()){
            await page.locator('#original').click();
            await page.waitForFunction(()=>document.querySelector('#quiz-image')?.naturalWidth>0);
        }
        await page.locator('.view-nav #progress').click();
        await page.getByText('Session history',{exact:true}).waitFor();
        assert.equal(await page.locator('.history-row').count(),1);
        if(bank==='physiology'){
            await page.locator('.view-nav #home').click();
            await page.locator('#lecture-coverage summary').click();
            await page.locator('.coverage-card').first().waitFor();
        }
        await page.locator('.view-nav #review').click();
        await page.locator('.review-item').first().waitFor();
        assert(requested.some(url=>url.endsWith('/source-manifest.json')));
        assert(await page.locator('.review-item').count()<=48);
        const nextSources=page.locator('#source-next');
        if(await nextSources.count()&&await nextSources.isEnabled()){
            const first=await page.locator('.review-item').first().innerText();
            await page.locator('#source-next').click();
            await page.locator('.review-item').first().waitFor();
            assert.notEqual(await page.locator('.review-item').first().innerText(),first);
        }
        assert.deepEqual(errors,[]);
        if(process.env.QUIZ_SCREENSHOTS){
            await fs.mkdir(process.env.QUIZ_SCREENSHOTS,{recursive:true});
            await page.screenshot({path:path.join(process.env.QUIZ_SCREENSHOTS,bank+'.png')});
        }
        console.log(`OK ${bank}: answered, reviewed, history shown, manifest loaded on demand`);
        await page.close();
    }
    const maskPage=await browser.newPage({serviceWorkers:'block'});
    maskPage.setDefaultTimeout(10000);
    await maskPage.goto(new URL('?bank=physiology',base).href);
    await maskPage.locator('#start').waitFor();
    for(const lecture of ['R1','R2','R3','R5','R6','R7']){
        await maskPage.locator(`input[name=lecture][value=${lecture}]`).uncheck();
    }
    await maskPage.locator('#start').click();
    await maskPage.waitForFunction(()=>document.querySelector('#quiz-image')?.naturalWidth>0);
    const masked=await maskPage.locator('#quiz-image').getAttribute('src');
    await maskPage.locator('#zoom-in').click();
    assert.equal(await maskPage.locator('#quiz-image').getAttribute('src'),masked);
    await maskPage.locator('#fullscreen').click();
    assert.equal(await maskPage.locator('#full-image').getAttribute('src'),masked);
    await maskPage.locator('#close-dialog').click();
    await maskPage.locator('button.choice').first().click();
    await maskPage.locator('#submit').click();
    await maskPage.locator('#original').click();
    assert.notEqual(await maskPage.locator('#quiz-image').getAttribute('src'),masked);
    await maskPage.close();
    console.log('OK R4 chart: same masked image in fit, zoom and full view; teaching original revealed afterwards');

    const casePage=await browser.newPage({serviceWorkers:'block',viewport:{width:390,height:840}});
    casePage.setDefaultTimeout(10000);
    await casePage.addInitScript(()=>{window.confirm=()=>true;});
    await casePage.goto(new URL('?bank=clinical-cases',base).href);
    await casePage.locator('[data-case="r17-placental-specimens"]').click();
    let index=0;
    while(!await casePage.locator('.table-mask').count()&&index<8){
        await casePage.locator('#next').click();
        index++;
    }
    await casePage.locator('.table-mask').first().waitFor();
    assert.equal(await casePage.locator('#original,#fullscreen').count(),0);
    assert.equal(await casePage.locator('td').filter({hasText:/^(?:Diploid|Triploid)$/i}).count(),0);
    await casePage.locator('#finish').click();
    await casePage.locator(`details [data-review="${index}"]`).click();
    await casePage.locator('.question-table').waitFor();
    assert.equal(await casePage.locator('.table-mask').count(),0);
    assert((await casePage.locator('td').allTextContents()).some(value=>/diploid|triploid/i.test(value)));
    await casePage.close();
    console.log('OK case table: result cells masked until case review');
    if(server){
        const response=await fetch(new URL('scripts/serve.py',base));
        assert.equal(response.status,404);
        console.log('OK loopback server exposes the built site only');
    }
} finally {
    await browser?.close();
    server?.kill();
}
