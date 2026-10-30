/**
 * Геометрия анимации перелистывания карточки свайпом.
 *
 * Модуль не обращается к DOM: на вход приходят смещение жеста, ширина карточки
 * и направление, на выход — параметры transform. Благодаря этому движение
 * проверяется в Node (tests/motion.test.js), а app.js только применяет стили.
 */

/** Длительность ухода текущей карточки за край, мс. */
export const SWIPE_EXIT_MS = 190;

/** Длительность влёта новой карточки, мс. */
export const SWIPE_ENTER_MS = 260;

/** Длительность пружинного возврата, мс. */
export const SWIPE_RETURN_MS = 170;

/** Доля движения карточки от движения пальца. */
const FOLLOW_RATIO = 0.9;

/** Доля движения для заблокированного направления (назад с первой карточки). */
const BLOCKED_RATIO = 0.25;

/** Предельный наклон карточки, градусы. */
const MAX_ROTATE = 5;

/** Состояние покоя: карточка на месте, полностью видима. */
const REST = { x: 0, rotate: 0, scale: 1, opacity: 1 };

/** Знак направления: вперёд — влево (минус), назад — вправо (плюс). */
function axisSign(direction) {
  return direction === 'previous' ? 1 : -1;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

/** Ширина карточки: не число, ноль и отрицательные значения дают запасные 320 px. */
function widthOf(width) {
  const value = Number(width);
  return Number.isFinite(value) && value > 0 ? value : 320;
}

/** Состояние покоя — копия, чтобы вызывающий код не мог испортить константу. */
export function restTransform() {
  return { ...REST };
}

/**
 * Движение карточки под пальцем.
 *
 * @param {number} dx смещение пальца по горизонтали, px
 * @param {number} width ширина карточки, px
 * @param {{blocked?: boolean}} options blocked — направление недоступно (назад с первой карточки)
 * @returns {{x: number, rotate: number, scale: number, opacity: number}}
 */
export function dragTransform(dx, width, { blocked = false } = {}) {
  const limit = widthOf(width);
  const ratio = blocked ? BLOCKED_RATIO : FOLLOW_RATIO;
  const x = clamp(Number(dx) || 0, -limit, limit) * ratio;
  const progress = Math.min(1, Math.abs(x) / limit);
  return {
    x,
    rotate: round((x / limit) * MAX_ROTATE),
    scale: round(1 - progress * 0.03),
    opacity: round(1 - progress * 0.25),
  };
}

/**
 * Куда улетает текущая карточка: при движении вперёд — за левый край,
 * при возврате назад — за правый.
 */
export function exitTransform(direction, width) {
  const limit = widthOf(width);
  const sign = axisSign(direction);
  return {
    x: round(sign * limit * 1.05),
    rotate: round(sign * MAX_ROTATE * 1.2),
    scale: 0.96,
    opacity: 0,
  };
}

/**
 * Откуда прилетает новая карточка: при движении вперёд — справа,
 * при возврате назад — слева.
 */
export function enterTransform(direction, width) {
  const limit = widthOf(width);
  const sign = -axisSign(direction);
  return {
    x: round(sign * limit * 0.6),
    rotate: round(sign * MAX_ROTATE * 0.8),
    scale: 0.97,
    opacity: 0,
  };
}

/** Значение для style.transform. */
export function transformCss({ x = 0, rotate = 0, scale = 1 } = {}) {
  return `translate3d(${Math.round(x)}px, 0, 0) rotate(${round(rotate)}deg) scale(${round(scale)})`;
}
