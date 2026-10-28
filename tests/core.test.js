import test from 'node:test';
import assert from 'node:assert/strict';

import {
  STACK_SIZE,
  RANDOM_SESSION_SIZE,
  buildSession,
  buildStacks,
  mergeWords,
  modeLabel,
  parseWordsJson,
  shuffle,
  wordKey,
} from '../core.js';

const word = (en, ru) => ({ en, ru });

test('parseWordsJson: корректный файл', () => {
  const result = parseWordsJson('[{"en":"apple","ru":"яблоко"},{"en":"dog","ru":"собака"}]');
  assert.equal(result.ok, true);
  assert.deepEqual(result.words, [word('apple', 'яблоко'), word('dog', 'собака')]);
  assert.equal(result.stats.records, 2);
  assert.equal(result.stats.invalid, 0);
});

test('parseWordsJson: лишние поля игнорируются, значения обрезаются', () => {
  const result = parseWordsJson('[{"en":"  apple ","ru":" яблоко ","level":1}]');
  assert.equal(result.ok, true);
  assert.deepEqual(result.words, [word('apple', 'яблоко')]);
});

test('parseWordsJson: BOM в начале файла не мешает', () => {
  const result = parseWordsJson('\uFEFF[{"en":"cat","ru":"кот"}]');
  assert.equal(result.ok, true);
  assert.equal(result.words.length, 1);
});

test('parseWordsJson: битый JSON отклоняется целиком', () => {
  const result = parseWordsJson('[{"en":"apple","ru":"яблоко"');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'invalid-json');
  assert.ok(result.error.length > 10);
});

test('parseWordsJson: не массив отклоняется', () => {
  const result = parseWordsJson('{"en":"apple","ru":"яблоко"}');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'not-array');
});

test('parseWordsJson: пустой массив отклоняется', () => {
  const result = parseWordsJson('[]');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-records');
});

test('parseWordsJson: пустой файл отклоняется', () => {
  assert.equal(parseWordsJson('').reason, 'empty-file');
  assert.equal(parseWordsJson('   \n ').reason, 'empty-file');
});

test('parseWordsJson: пустые и неполные записи пропускаются', () => {
  const result = parseWordsJson(
    JSON.stringify([
      { en: 'apple', ru: 'яблоко' },
      { en: '', ru: 'собака' },
      { en: 'cat', ru: '   ' },
      { en: 'dog' },
      { ru: 'дом' },
      { en: 42, ru: 'число' },
      null,
      'строка',
      { en: 'house', ru: 'дом' },
    ]),
  );
  assert.equal(result.ok, true);
  assert.deepEqual(result.words, [word('apple', 'яблоко'), word('house', 'дом')]);
  assert.equal(result.stats.invalid, 7);
});

test('parseWordsJson: если корректных слов нет — понятная ошибка', () => {
  const result = parseWordsJson('[{"en":"","ru":""},{"en":"   ","ru":"x"}]');
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'no-valid-words');
  assert.equal(result.stats.invalid, 2);
});

test('parseWordsJson: дубликаты внутри файла считаются один раз', () => {
  const result = parseWordsJson(
    JSON.stringify([
      { en: 'apple', ru: 'яблоко' },
      { en: 'Apple', ru: 'яблоко' },
      { en: 'apple', ru: 'яблоко' },
    ]),
  );
  assert.equal(result.ok, true);
  assert.equal(result.words.length, 1);
  assert.equal(result.stats.duplicatesInFile, 2);
});

test('mergeWords: добавляет новые и пропускает дубликаты', () => {
  const existing = [word('apple', 'яблоко'), word('dog', 'собака')];
  const merged = mergeWords(existing, [
    word('APPLE', ' Яблоко'),
    word('house', 'дом'),
    word('dog', 'собака'),
  ]);
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 2);
  assert.equal(merged.words.length, 3);
  assert.deepEqual(merged.words[2], word('house', 'дом'));
});

test('mergeWords: исходный массив не меняется', () => {
  const existing = [word('apple', 'яблоко')];
  mergeWords(existing, [word('dog', 'собака')]);
  assert.equal(existing.length, 1);
});

test('mergeWords: пара en+ru сравнивается целиком', () => {
  const merged = mergeWords([word('bank', 'банк')], [word('bank', 'берег')]);
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 0);
});

test('wordKey: регистр и лишние пробелы не влияют', () => {
  assert.equal(wordKey(word(' Apple ', 'ЯБЛОКО')), wordKey(word('apple', 'яблоко')));
});

test('buildStacks: пустая база даёт пустой список', () => {
  assert.deepEqual(buildStacks([]), []);
});

test('buildStacks: границы 200 / 201 / 450 слов', () => {
  const make = (n) => Array.from({ length: n }, (_, i) => word(`w${i}`, `с${i}`));

  assert.deepEqual(
    buildStacks(make(200)).map((s) => s.count),
    [200],
  );
  assert.deepEqual(
    buildStacks(make(201)).map((s) => s.count),
    [200, 1],
  );
  assert.deepEqual(
    buildStacks(make(450)).map((s) => s.count),
    [200, 200, 50],
  );
  assert.deepEqual(
    buildStacks(make(450)).map((s) => s.number),
    [1, 2, 3],
  );
});

test('buildSession: стопка берётся по номеру и сохраняет порядок', () => {
  const words = Array.from({ length: 450 }, (_, i) => word(`w${i}`, `с${i}`));
  const stack2 = buildSession({ type: 'stack', number: 2 }, words);
  assert.equal(stack2.length, STACK_SIZE);
  assert.equal(stack2[0].en, 'w200');
  assert.equal(stack2[199].en, 'w399');

  const stack3 = buildSession({ type: 'stack', number: 3 }, words);
  assert.equal(stack3.length, 50);
  assert.equal(stack3[0].en, 'w400');
});

test('buildSession: несуществующая стопка даёт пустой список', () => {
  const words = [word('apple', 'яблоко')];
  assert.deepEqual(buildSession({ type: 'stack', number: 5 }, words), []);
});

test('buildSession: случайная сессия не длиннее 200 и без повторов', () => {
  const words = Array.from({ length: 1000 }, (_, i) => word(`w${i}`, `с${i}`));
  const session = buildSession({ type: 'random' }, words);
  assert.equal(session.length, RANDOM_SESSION_SIZE);
  assert.equal(new Set(session.map((w) => w.en)).size, RANDOM_SESSION_SIZE);
});

test('buildSession: случайная сессия берёт всю базу, если слов меньше 200', () => {
  const words = Array.from({ length: 87 }, (_, i) => word(`w${i}`, `с${i}`));
  const session = buildSession({ type: 'random' }, words);
  assert.equal(session.length, 87);
  assert.equal(new Set(session.map((w) => w.en)).size, 87);
});

test('buildSession: случайная сессия на пустой базе пуста', () => {
  assert.deepEqual(buildSession({ type: 'random' }, []), []);
  assert.deepEqual(buildSession({ type: 'stack', number: 1 }, []), []);
});

test('buildSession: копии слов, а не ссылки на базу', () => {
  const words = [word('apple', 'яблоко')];
  const session = buildSession({ type: 'stack', number: 1 }, words);
  session[0].en = 'изменено';
  assert.equal(words[0].en, 'apple');
});

test('shuffle: не меняет исходный массив и детерминирован при заданном rng', () => {
  const source = [1, 2, 3, 4, 5, 6, 7, 8];
  const shuffled = shuffle(source, () => 0.42);
  assert.deepEqual(source, [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.notDeepEqual(shuffled, source);
  assert.deepEqual(shuffled.slice().sort((a, b) => a - b), source);
});

test('modeLabel: подписи режимов', () => {
  assert.equal(modeLabel({ type: 'stack', number: 3 }), 'Стопка 3');
  assert.equal(modeLabel({ type: 'random' }), 'Случайный режим');
});
