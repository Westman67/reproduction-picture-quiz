import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards against the "longest answer is usually correct" bias.
for (const bank of ['pathology', 'physiology', 'clinical-cases']) {
  test(`option length bias: ${bank}`, () => {
    const d = JSON.parse(readFileSync(`data/${bank}/question-bank.json`, 'utf8'));
    const qs = (Array.isArray(d) ? d : d.questions).filter(q => q.source_origin !== 'third_party');
    let longest = 0;
    const flagged = [];
    for (const q of qs) {
      const L = q.options.map(o => o.length);
      const c = L[q.correct_index];
      const maxOther = Math.max(...L.filter((_, i) => i !== q.correct_index));
      if (c > maxOther) longest++;
      if (c >= 1.2 * maxOther && c - maxOther >= 10) flagged.push(q.question_id);
    }
    assert.ok(longest / qs.length <= 0.45, `correct option is longest in ${Math.round(100 * longest / qs.length)}% of ${bank} questions (max 45%)`);
    assert.ok(flagged.length / qs.length <= 0.03, `${flagged.length} questions have a correct option 20% longer than every distractor: ${flagged.slice(0, 5).join(', ')}`);
  });
}
