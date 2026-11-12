import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { resolveBankConfig } from '../bank-config.js';
import { answer, canReveal, caseSession, empty, validateImport } from '../engine.js';

const read = path => JSON.parse(fs.readFileSync(new URL(path, import.meta.url)));
const { questions, cases } = read('../data/clinical-cases/question-bank.json');
const { sources } = read('../data/clinical-cases/source-manifest.json');
const byId = Object.fromEntries(questions.map(q => [q.question_id, q]));

test('every case item resolves to a cited image variant and belongs to exactly one case', () => {
    const membership = cases.flatMap(c => c.question_ids);
    assert.equal(new Set(membership).size, questions.length);
    assert.deepEqual(membership, questions.map(q => q.question_id));
    for (const c of cases) {
        assert.ok(c.question_ids.length >= 2);
        for (const id of c.question_ids) {
            const q = byId[id];
            assert.equal(q.case_id, c.case_id);
            assert.equal(q.collection, c.lecture);
            const source = sources.find(s => s.source_id === q.source_id);
            assert.equal(q.source_group_id, source.source_group_id);
            assert.equal(q.asset_id, source.asset_id);
            const variant = source.variants.find(v => v.variant_id === q.variant_id);
            assert.equal(q.image, variant.asset);
            assert.equal(q.zoom_image, variant.zoom_asset || source.original_asset);
            assert.deepEqual(q.citations[0], source.source_citation);
            for (const file of [q.image, q.zoom_image, q.original_image]) {
                assert.ok(fs.statSync(new URL('../' + file, import.meta.url)).size > 100);
            }
        }
    }
});

test('case order and five options survive save, with feedback delayed until completion', () => {
    const practice = resolveBankConfig('?bank=pathology');
    const clinical = resolveBankConfig('?bank=pathology&mode=cases');
    assert.notEqual(practice.progressKey, clinical.progressKey);

    const progress = empty();
    const selected = cases[0];
    const session = progress.session = caseSession(selected, byId);
    assert.deepEqual(session.items.map(i => i.id), selected.question_ids);
    for (const item of session.items) {
        assert.deepEqual([...item.order].sort(), [0, 1, 2, 3, 4]);
        item.draft = byId[item.id].correct_index;
        assert.ok(answer(progress, byId[item.id], item));
        assert.equal(canReveal(session, item), false);
    }
    const saved = JSON.parse(JSON.stringify(progress));
    assert.deepEqual(validateImport(saved, questions, cases), progress);
    session.complete = true;
    assert.ok(session.items.every(item => canReveal(session, item)));
    saved.session.items.reverse();
    assert.throws(() => validateImport(saved, questions, cases), /Invalid saved case order/);
});

test('saved attempts from before case expansion keep their original questions', () => {
    const expanded = cases.find(c => c.case_id === 'r18-breast-specimens');
    assert.equal(expanded.question_ids.length, 3);
    const original = { ...expanded, question_ids: expanded.question_ids.slice(0, 2) };
    const progress = empty();
    const saved = progress.session = caseSession(original, byId);
    saved.items[0].draft = byId[saved.items[0].id].correct_index;
    assert.ok(answer(progress, byId[saved.items[0].id], saved.items[0]));
    saved.index = 1;
    const recovered = validateImport(JSON.parse(JSON.stringify(progress)), questions, cases);
    assert.deepEqual(recovered, progress);
    assert.equal(caseSession(expanded, byId).items.length, 3);
    recovered.session.items.pop();
    recovered.session.index = 0;
    assert.throws(() => validateImport(recovered, questions, cases), /Invalid saved case order/);
});
