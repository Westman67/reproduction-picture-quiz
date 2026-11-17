import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const base = path.resolve(import.meta.dirname, '..');
const banks = ['physiology', 'pathology', 'clinical-cases'];

test('choice pictures align with options and point to real PNG or WebP files', () => {
    let linked = 0;
    for (const id of banks) {
        const {questions} = JSON.parse(fs.readFileSync(path.join(base, 'data', id, 'question-bank.json'), 'utf8'));
        for (const q of questions) {
            if (!q.choice_images) continue;
            const label = `${id}/${q.question_id}`;
            assert.equal(q.choice_images.length, q.options.length, label);
            for (const pics of q.choice_images) {
                if (pics === null) continue;
                assert(Array.isArray(pics) && pics.length >= 1 && pics.length <= 2, label);
                for (const pic of pics) {
                    assert(/^assets\/(originals|display|zoom)\/[a-f0-9]+\.(png|webp)$/.test(pic.image), `${label} ${pic.image}`);
                    assert(pic.caption && pic.source, label);
                    const data = fs.readFileSync(path.join(base, pic.image));
                    assert(data.length > 100, label);
                    if (pic.image.endsWith('webp')) assert.equal(data.subarray(8, 12).toString(), 'WEBP', label);
                    else assert.equal(data.subarray(1, 4).toString(), 'PNG', label);
                    linked++;
                }
            }
        }
    }
    assert(linked > 0);
});
