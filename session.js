/**
 * Состояние сессии обучения: текущая карточка, раскрытие каждой карточки,
 * переходы вперёд и назад. Модуль не обращается к DOM, поэтому его поведение
 * проверяется в Node (см. tests/session.test.js).
 *
 * Состояние неизменяемое: функции возвращают новую сессию, исходная не меняется.
 */

/** Минимальная длина свайпа в пикселях, ниже — это тап. */
export const SWIPE_MIN_DISTANCE = 48;

/** Максимальная длительность свайпа в миллисекундах. */
export const SWIPE_MAX_DURATION_MS = 700;

/**
 * Создаёт сессию по списку слов.
 *
 * @param {{words: Array<{en: string, ru: string}>, mode: object, label: string}} params
 */
export function createSession({ words, mode, label }) {
  const list = Array.isArray(words) ? words : [];
  return {
    words: list.map((word) => ({ en: word.en, ru: word.ru })),
    mode: { ...(mode || {}) },
    label: typeof label === 'string' ? label : '',
    index: 0,
    revealed: list.map(() => false),
  };
}

/** Текущее слово сессии. */
export function currentWord(session) {
  if (!session || !session.words.length) return null;
  return session.words[session.index] || null;
}

/** Раскрыта ли текущая карточка. */
export function isRevealed(session) {
  if (!session || !Array.isArray(session.revealed)) return false;
  return Boolean(session.revealed[session.index]);
}

/** Есть ли предыдущая карточка. */
export function canGoBack(session) {
  return Boolean(session) && session.index > 0;
}

/** Есть ли следующая карточка (на последней «дальше» завершает сессию). */
export function canGoForward(session) {
  return Boolean(session) && session.index + 1 < session.words.length;
}

/**
 * Раскрывает текущую карточку. Повторный вызов ничего не меняет.
 * Раскрытие запоминается для этой карточки, чтобы возврат назад показывал её
 * в том же состоянии, в котором её оставили.
 */
export function revealCurrent(session) {
  if (!session || isRevealed(session)) return session;
  const revealed = session.revealed.slice();
  revealed[session.index] = true;
  return { ...session, revealed };
}

/**
 * Переход к следующей карточке.
 * @returns {{session: object, finished: boolean}} finished=true, если карточки закончились
 */
export function goToNext(session) {
  if (!session) return { session, finished: false };
  if (!canGoForward(session)) return { session, finished: true };
  return { session: { ...session, index: session.index + 1 }, finished: false };
}

/** Переход к предыдущей карточке. На первой карточке состояние не меняется. */
export function goToPrevious(session) {
  if (!canGoBack(session)) return session;
  return { ...session, index: session.index - 1 };
}

/**
 * Обрабатывает нажатие на карточку: скрытая раскрывается, раскрытая листает
 * вперёд, последняя раскрытая завершает сессию.
 *
 * @returns {{session: object, action: 'none' | 'reveal' | 'next' | 'finish'}}
 */
export function tapCard(session) {
  if (!session) return { session, action: 'none' };
  if (!isRevealed(session)) return { session: revealCurrent(session), action: 'reveal' };
  if (!canGoForward(session)) return { session, action: 'finish' };
  return { session: { ...session, index: session.index + 1 }, action: 'next' };
}

/**
 * Определяет жест по координатам касания: свайп влево — вперёд, свайп вправо —
 * назад. Всё остальное считается тапом и возвращает null.
 *
 * @param {{x: number, y: number, time: number}} start
 * @param {{x: number, y: number, time: number}} end
 * @returns {'next' | 'previous' | null}
 */
export function swipeDirection(start, end) {
  if (!start || !end) return null;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const duration = end.time - start.time;

  if (duration > SWIPE_MAX_DURATION_MS) return null;
  if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return null;
  if (Math.abs(dx) <= Math.abs(dy) * 1.4) return null;

  return dx < 0 ? 'next' : 'previous';
}
