import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {empty, validateImport} from '../engine.js';

const base = path.resolve(import.meta.dirname, '..');
const banks = ['physiology', 'pathology', 'clinical-cases'];
const read = id => JSON.parse(fs.readFileSync(path.join(base, 'data', id, 'question-bank.json'), 'utf8'));

test('every bank has valid image files, option counts and correct-answer rationales', () => {
    for (const id of banks) {
        for (const q of read(id).questions) {
            const label = `${id}/${q.question_id}`;
            const count = q.format_version === 'clinical-visual-v1' ? 5 : 4;
            if (q.visual_kind !== 'table') {
                for (const key of ['image', 'original_image', 'zoom_image']) {
                    const data = fs.readFileSync(path.join(base, q[key]));
                    assert(data.length > 100, `${label} ${key} too small`);
                    if (q[key].endsWith('webp')) assert.equal(data.subarray(8, 12).toString(), 'WEBP', `${label} ${key}`);
                    else assert.equal(data.subarray(1, 4).toString(), 'PNG', `${label} ${key}`);
                }
            }
            assert.equal(q.options.length, count, label);
            assert(q.options.every(o => typeof o === 'string' && o.trim()), `${label} blank option`);
            assert.equal(new Set(q.options.map(o => o.trim().toLowerCase())).size, count, `${label} duplicate options`);
            assert.equal(q.choice_rationales.length, count, label);
            if (!q.case_id) assert.equal(q.choice_rationales[q.correct_index], q.explanation, label);
        }
    }
});

test('combined loading merges retired items so saved progress still validates', () => {
    const questions = [], retired = [];
    for (const id of banks) {
        const bank = read(id);
        questions.push(...bank.questions);
        retired.push(...(bank.retired_questions || []));
    }
    assert(retired.length > 0);
    const activeIds = new Set(questions.map(q => q.question_id));
    assert(retired.every(q => !activeIds.has(q.question_id)), 'retired ids overlap active ids');
    const p = empty();
    p.questions[retired[0].question_id] = {times_seen: 1, times_answered: 1, correct_count: 1, incorrect_count: 0, last_result: 'correct', marked: false};
    assert.throws(() => validateImport(structuredClone(p), questions, [], []));
    assert.doesNotThrow(() => validateImport(structuredClone(p), questions, [], retired));
});
