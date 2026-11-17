import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = p => JSON.parse(fs.readFileSync(new URL('../' + p, import.meta.url)));
const stop = new Set('the a an of and or to in with is are for that this it as by on at from be which because than not no'.split(' '));
const tokens = s => new Set((s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !stop.has(w)));
const overlap = (a, b) => { const A = tokens(a), B = tokens(b); let n = 0; for (const w of A) if (B.has(w)) n++; return n / Math.max(1, new Set([...A, ...B]).size); };
const perms = n => n <= 1 ? [[0]] : perms(n - 1).flatMap(p => Array.from({length: n}, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
const banks = ['physiology', 'pathology', 'clinical-cases'];
const key = read('tests/fixtures/answer-key.json');

for (const bank of banks) {
    const questions = read(`data/${bank}/question-bank.json`).questions;

    test(`${bank}: rationales stay attached to their options`, () => {
        const bad = [];
        for (const q of questions) {
            const n = q.options.length;
            assert.equal(q.choice_rationales.length, n, q.question_id);
            const score = p => p.reduce((sum, j, k) => sum + overlap(q.options[k], q.choice_rationales[j]), 0);
            const identity = score([...Array(n).keys()]);
            const best = Math.max(...perms(n).map(score));
            if (best - identity > 0.6) bad.push(q.question_id);
        }
        assert.deepEqual(bad, [], 'Rationales look shifted relative to options. Reorder rationales and correct_index together with options.');
    });

    test(`${bank}: correct_index still points at the verified correct answer text`, () => {
        const wrong = [];
        for (const q of questions) {
            const expected = key[bank]?.[q.question_id];
            assert.ok(expected, `${q.question_id} missing from tests/fixtures/answer-key.json`);
            if (q.options[q.correct_index] !== expected) wrong.push(q.question_id);
        }
        assert.deepEqual(wrong, [], 'correct_index no longer matches the verified correct answer. If the correct answer text was edited on purpose, update tests/fixtures/answer-key.json.');
    });
}
