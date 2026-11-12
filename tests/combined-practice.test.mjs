import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { COMBINED, CLINICAL_CASES, STUDY_SECTIONS, resolveBankConfig } from '../bank-config.js';
import { combinedSession, empty, filtered, validateImport } from '../engine.js';

const banks = STUDY_SECTIONS.map(section =>
    JSON.parse(fs.readFileSync(new URL('../data/' + section.id + '/question-bank.json', import.meta.url)))
);
const caseDefinitions = new Map(banks.at(-1).cases.map(c => [c.case_id, c.question_ids]));

test('clinical cases has its own route and combined practice has separate progress', () => {
    assert.equal(resolveBankConfig('?bank=clinical-cases'), CLINICAL_CASES);
    assert.equal(resolveBankConfig('?bank=pathology&mode=cases'), CLINICAL_CASES);
    assert.equal(resolveBankConfig('?bank=combined'), COMBINED);
    const keys = STUDY_SECTIONS.map(s => resolveBankConfig(s.href).progressKey);
    assert.ok(!keys.includes(COMBINED.progressKey));
});

test('each combination uses its selected sections and preserves complete case sequences', () => {
    for (let mask = 1; mask < (1 << banks.length); mask++) {
        const pools = banks.filter((_, index) => mask & (1 << index)).map(bank => bank.questions);
        const all = pools.flat();
        const byId = new Map(all.map(q => [q.question_id, q]));
        for (const length of ['10', 'all']) {
            const session = combinedSession(pools, 'learn', length, () => 0.5);
            const ids = session.items.map(item => item.id);
            assert.equal(new Set(ids).size, ids.length);
            assert.ok(ids.every(id => byId.has(id)));
            assert.ok(pools.every(pool => pool.some(q => ids.includes(q.question_id))));
            if (length === 'all') assert.equal(ids.length, all.length);
            else assert.ok(ids.length <= Number(length));
            for (const [i, id] of ids.entries()) {
                const q = byId.get(id);
                if (!q.case_id) continue;
                const sequence = caseDefinitions.get(q.case_id);
                const start = i - sequence.indexOf(id);
                assert.deepEqual(ids.slice(start, start + sequence.length), sequence);
            }
            const progress = { ...empty(), session };
            assert.deepEqual(validateImport(JSON.parse(JSON.stringify(progress)), all), progress);
        }
    }
});

test('the lecture source filter includes every question in a case with a data table', () => {
    const clinical = banks.at(-1);
    const lecture = filtered(clinical.questions, empty(), {origin:'lecture'});
    const tables = clinical.questions.filter(q => q.visual_kind === 'table');
    assert.ok(tables.length > 0);
    for (const table of tables) {
        assert.deepEqual(lecture.filter(q => q.case_id === table.case_id).map(q => q.question_id),
            caseDefinitions.get(table.case_id));
    }
});
