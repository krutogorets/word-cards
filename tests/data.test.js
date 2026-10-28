import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SEED_WORDS } from '../seed-words.js';
import { parseWordsJson, wordKey } from '../core.js';

const sampleText = readFileSync(new URL('../words.json', import.meta.url), 'utf8');
const sample = JSON.parse(sampleText);

test('стартовая база: 100 слов без пустых значений', () => {
  assert.equal(SEED_WORDS.length, 100);
  for (const word of SEED_WORDS) {
    assert.equal(typeof word.en, 'string');
    assert.equal(typeof word.ru, 'string');
    assert.ok(word.en.trim().length > 0);
    assert.ok(word.ru.trim().length > 0);
  }
});

test('стартовая база: английские слова не повторяются', () => {
  const unique = new Set(SEED_WORDS.map((word) => word.en.toLowerCase()));
  assert.equal(unique.size, SEED_WORDS.length);
});

test('words.json: 200 слов и полностью проходит валидацию импорта', () => {
  assert.equal(sample.length, 200);

  const parsed = parseWordsJson(sampleText);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.stats.accepted, 200);
  assert.equal(parsed.stats.invalid, 0);
  assert.equal(parsed.stats.duplicatesInFile, 0);
});

test('words.json: английские слова не повторяются', () => {
  const unique = new Set(sample.map((word) => word.en.toLowerCase()));
  assert.equal(unique.size, sample.length);
});

test('пример импорта не пересекается со стартовой базой', () => {
  const seeded = new Set(SEED_WORDS.map(wordKey));
  const overlap = sample.filter((word) => seeded.has(wordKey(word)));
  assert.deepEqual(overlap, []);
});

test('вместе база и пример дают две стопки по 200 и 100 слов', () => {
  assert.equal(SEED_WORDS.length + sample.length, 300);
});
