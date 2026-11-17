import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Guards against the "longest answer is usually correct" bias.
// The earlier rebalance was measured against a shifted correct_index, so the true figures were higher than
// it reported. These ceilings are the honest current baseline and must only move down as distractors are
// lengthened. Target is 0.45 longest and 0.03 flagged for every bank.
const ceiling = {'pathology': {longest: 0.57, flagged: 0.11}, 'physiology': {longest: 0.45, flagged: 0.03}, 'clinical-cases': {longest: 0.67, flagged: 0.13}};
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
    assert.ok(longest / qs.length <= ceiling[bank].longest, `correct option is longest in ${Math.round(100 * longest / qs.length)}% of ${bank} questions (max ${Math.round(100 * ceiling[bank].longest)}%)`);
    assert.ok(flagged.length / qs.length <= ceiling[bank].flagged, `${flagged.length} questions have a correct option 20% longer than every distractor: ${flagged.slice(0, 5).join(', ')}`);
  });
}
