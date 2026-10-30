import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SWIPE_ENTER_MS,
  SWIPE_EXIT_MS,
  SWIPE_RETURN_MS,
  dragTransform,
  enterTransform,
  exitTransform,
  restTransform,
  transformCss,
} from '../motion.js';

const WIDTH = 360;

test('restTransform: карточка на месте и полностью видима', () => {
  assert.deepEqual(restTransform(), { x: 0, rotate: 0, scale: 1, opacity: 1 });
});

test('restTransform: возвращает копию, а не общий объект', () => {
  const first = restTransform();
  first.x = 100;
  assert.equal(restTransform().x, 0);
});

test('dragTransform: без движения карточка не сдвигается', () => {
  const motion = dragTransform(0, WIDTH);
  assert.deepEqual(motion, { x: 0, rotate: 0, scale: 1, opacity: 1 });
});

test('dragTransform: карточка идёт за пальцем в его сторону и наклоняется', () => {
  const left = dragTransform(-120, WIDTH);
  assert.ok(left.x < 0);
  assert.ok(left.rotate < 0);
  assert.ok(left.opacity < 1 && left.opacity > 0.6);

  const right = dragTransform(120, WIDTH);
  assert.ok(right.x > 0);
  assert.ok(right.rotate > 0);
  assert.equal(right.x, -left.x);
});

test('dragTransform: смещение не выходит за ширину карточки', () => {
  const far = dragTransform(-5000, WIDTH);
  assert.ok(Math.abs(far.x) <= WIDTH);
  assert.ok(far.opacity >= 0.6);
  assert.equal(dragTransform(5000, WIDTH).x, -far.x);
});

test('dragTransform: заблокированное направление сопротивляется', () => {
  const free = dragTransform(150, WIDTH);
  const blocked = dragTransform(150, WIDTH, { blocked: true });
  assert.ok(blocked.x > 0);
  assert.ok(blocked.x < free.x, 'назад с первой карточки карточка идёт короче');
  assert.ok(Math.abs(blocked.rotate) < Math.abs(free.rotate));
});

test('dragTransform: нечисловые входы не ломают геометрию', () => {
  const motion = dragTransform(Number.NaN, 0);
  assert.deepEqual(motion, { x: 0, rotate: 0, scale: 1, opacity: 1 });
});

test('exitTransform: вперёд — за левый край, назад — за правый', () => {
  const next = exitTransform('next', WIDTH);
  const previous = exitTransform('previous', WIDTH);
  assert.ok(next.x <= -WIDTH);
  assert.ok(previous.x >= WIDTH);
  assert.equal(next.opacity, 0);
  assert.equal(previous.opacity, 0);
  assert.ok(next.rotate < 0 && previous.rotate > 0);
});

test('enterTransform: новая карточка приходит с противоположной стороны', () => {
  const next = enterTransform('next', WIDTH);
  const previous = enterTransform('previous', WIDTH);
  assert.ok(next.x > 0, 'при движении вперёд карточка влетает справа');
  assert.ok(previous.x < 0, 'при возврате назад карточка влетает слева');
  assert.equal(next.opacity, 0);
  assert.ok(Math.abs(next.x) < WIDTH, 'стартовая точка ближе к центру, чем край');
});

test('transformCss: собирает translate3d, rotate и scale с округлением', () => {
  assert.equal(
    transformCss({ x: 12.3456, rotate: -2.5, scale: 0.98765 }),
    'translate3d(12px, 0, 0) rotate(-2.5deg) scale(0.988)',
  );
  assert.equal(transformCss(), 'translate3d(0px, 0, 0) rotate(0deg) scale(1)');
});

test('длительности анимации положительны и убывают от влёта к возврату', () => {
  assert.ok(SWIPE_EXIT_MS > 0);
  assert.ok(SWIPE_ENTER_MS > SWIPE_EXIT_MS);
  assert.ok(SWIPE_RETURN_MS > 0 && SWIPE_RETURN_MS < SWIPE_ENTER_MS);
});
