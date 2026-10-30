import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWIPE_MAX_DURATION_MS,
  SWIPE_MIN_DISTANCE,
  canGoBack,
  canGoForward,
  createSession,
  currentWord,
  goToNext,
  goToPrevious,
  isRevealed,
  revealCurrent,
  swipeDirection,
  tapCard,
} from '../session.js';

const words = [
  { en: 'apple', ru: 'яблоко' },
  { en: 'dog', ru: 'собака' },
  { en: 'house', ru: 'дом' },
];

const makeSession = () => createSession({ words, mode: { type: 'stack', number: 1 }, label: 'Стопка 1' });

test('createSession: копия слов, первая карточка, ничего не раскрыто', () => {
  const session = makeSession();
  assert.equal(session.index, 0);
  assert.equal(session.label, 'Стопка 1');
  assert.deepEqual(session.revealed, [false, false, false]);
  assert.deepEqual(currentWord(session), words[0]);
  assert.notEqual(session.words[0], words[0], 'слова копируются, а не переиспользуются');
});

test('createSession: пустой список не ломает сессию', () => {
  const session = createSession({ words: [], mode: { type: 'random' }, label: '' });
  assert.equal(currentWord(session), null);
  assert.equal(canGoForward(session), false);
  assert.equal(canGoBack(session), false);
});

test('revealCurrent: раскрывает только текущую карточку и идемпотентен', () => {
  const first = revealCurrent(makeSession());
  assert.equal(isRevealed(first), true);
  assert.deepEqual(first.revealed, [true, false, false]);

  const twice = revealCurrent(first);
  assert.equal(twice, first, 'повторное раскрытие возвращает то же состояние');
});

test('revealCurrent: не мутирует исходную сессию', () => {
  const session = makeSession();
  revealCurrent(session);
  assert.equal(isRevealed(session), false);
  assert.deepEqual(session.revealed, [false, false, false]);
});

test('goToNext: листает вперёд и сообщает о завершении на последней карточке', () => {
  const second = goToNext(makeSession());
  assert.equal(second.finished, false);
  assert.equal(second.session.index, 1);
  assert.deepEqual(currentWord(second.session), words[1]);

  const third = goToNext(second.session);
  assert.equal(third.session.index, 2);

  const end = goToNext(third.session);
  assert.equal(end.finished, true);
  assert.equal(end.session.index, 2, 'на последней карточке индекс не меняется');
});

test('goToPrevious: возвращает назад и не уходит за первую карточку', () => {
  const third = goToNext(goToNext(makeSession()).session).session;
  const second = goToPrevious(third);
  assert.equal(second.index, 1);
  assert.equal(goToPrevious(second).index, 0);

  const first = goToPrevious(second);
  assert.equal(goToPrevious(first).index, 0);
  assert.equal(canGoBack(first), false);
});

test('goToPrevious: раскрытие карточки сохраняется при возврате', () => {
  const revealedFirst = revealCurrent(makeSession());
  const moved = goToNext(revealedFirst).session;
  assert.equal(isRevealed(moved), false, 'новая карточка начинается скрытой');

  const back = goToPrevious(moved);
  assert.equal(isRevealed(back), true, 'возврат показывает карточку раскрытой');
  assert.deepEqual(back.revealed, [true, false, false]);
});

test('tapCard: тап чередует «показать перевод» и «следующая карточка»', () => {
  const first = tapCard(makeSession());
  assert.equal(first.action, 'reveal');
  assert.equal(isRevealed(first.session), true);
  assert.equal(first.session.index, 0);

  const second = tapCard(first.session);
  assert.equal(second.action, 'next');
  assert.equal(second.session.index, 1);
  assert.equal(isRevealed(second.session), false);

  const third = tapCard(second.session);
  assert.equal(third.action, 'reveal');
  assert.equal(third.session.index, 1);

  const fourth = tapCard(third.session);
  assert.equal(fourth.action, 'next');
  assert.equal(fourth.session.index, 2);
});

test('tapCard: на раскрытой последней карточке завершает сессию', () => {
  const last = goToNext(goToNext(makeSession()).session).session;
  const revealed = tapCard(last);
  assert.equal(revealed.action, 'reveal');
  assert.equal(revealed.session.index, 2);

  const finish = tapCard(revealed.session);
  assert.equal(finish.action, 'finish');
  assert.equal(finish.session.index, 2, 'индекс не меняется при завершении');
});

test('tapCard: пустая сессия не меняется', () => {
  const result = tapCard(null);
  assert.equal(result.action, 'none');
  assert.equal(result.session, null);
});

test('canGoBack / canGoForward: границы сессии', () => {
  const session = makeSession();
  assert.equal(canGoBack(session), false);
  assert.equal(canGoForward(session), true);

  const last = goToNext(goToNext(session).session).session;
  assert.equal(canGoBack(last), true);
  assert.equal(canGoForward(last), false);
});

test('swipeDirection: влево — вперёд, вправо — назад', () => {
  const base = { x: 200, y: 300, time: 1000 };
  assert.equal(swipeDirection(base, { x: 100, y: 305, time: 1150 }), 'next');
  assert.equal(swipeDirection(base, { x: 300, y: 305, time: 1150 }), 'previous');
});

test('swipeDirection: короткое движение и вертикальный жест — это тап', () => {
  const base = { x: 200, y: 300, time: 1000 };
  assert.equal(swipeDirection(base, { x: 200 - SWIPE_MIN_DISTANCE + 1, y: 300, time: 1100 }), null);
  assert.equal(swipeDirection(base, { x: 200, y: 150, time: 1100 }), null);
  assert.equal(swipeDirection(base, { x: 120, y: 80, time: 1100 }), null, 'диагональ не листает');
});

test('swipeDirection: медленный жест не считается свайпом', () => {
  const base = { x: 200, y: 300, time: 1000 };
  assert.equal(swipeDirection(base, { x: 100, y: 300, time: 1000 + SWIPE_MAX_DURATION_MS + 1 }), null);
});
