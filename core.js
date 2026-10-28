/**
 * Чистая логика приложения: разбор файла слов, слияние, стопки, сессии.
 *
 * Модуль не обращается к DOM и не зависит от браузера, поэтому его
 * можно проверять в Node (см. tests/core.test.js).
 */

/** Максимальный размер стопки. */
export const STACK_SIZE = 200;

/** Сколько уникальных слов берётся в случайную сессию. */
export const RANDOM_SESSION_SIZE = 200;

/** Задержка автоматического показа перевода. */
export const REVEAL_DELAY_MS = 6000;

/** Приводит значение к строке без лишних пробелов. Нестроки дают пустую строку. */
export function cleanText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim();
}

/** Ключ слова для поиска дубликатов: пара en + ru без учёта регистра. */
export function wordKey(word) {
  const en = cleanText(word && word.en).toLowerCase();
  const ru = cleanText(word && word.ru).toLowerCase();
  return `${en}\u0000${ru}`;
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Разбирает текст файла words.json.
 *
 * @param {string} text
 * @returns {{ok: boolean, words?: Array<{en: string, ru: string}>, stats?: object,
 *            error?: string, reason?: string}}
 */
export function parseWordsJson(text) {
  if (typeof text !== 'string' || text.trim() === '') {
    return {
      ok: false,
      reason: 'empty-file',
      error: 'Файл пустой. Выберите файл words.json со словами.',
    };
  }

  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let data;
  try {
    data = JSON.parse(source);
  } catch {
    return {
      ok: false,
      reason: 'invalid-json',
      error: 'Файл не является корректным JSON. Проверьте содержимое файла и попробуйте снова.',
    };
  }

  if (!Array.isArray(data)) {
    return {
      ok: false,
      reason: 'not-array',
      error: 'Неверный формат: ожидается список слов вида [ { "en": "apple", "ru": "яблоко" } ].',
    };
  }

  if (data.length === 0) {
    return {
      ok: false,
      reason: 'no-records',
      error: 'Файл пустой: в нём нет ни одного слова.',
    };
  }

  const words = [];
  const seen = new Set();
  let invalid = 0;
  let duplicatesInFile = 0;

  for (const item of data) {
    if (!isPlainObject(item)) {
      invalid += 1;
      continue;
    }
    const en = cleanText(item.en);
    const ru = cleanText(item.ru);
    if (!en || !ru) {
      invalid += 1;
      continue;
    }
    const key = `${en.toLowerCase()}\u0000${ru.toLowerCase()}`;
    if (seen.has(key)) {
      duplicatesInFile += 1;
      continue;
    }
    seen.add(key);
    words.push({ en, ru });
  }

  if (words.length === 0) {
    return {
      ok: false,
      reason: 'no-valid-words',
      stats: { records: data.length, accepted: 0, invalid, duplicatesInFile },
      error:
        'В файле нет корректных слов. У каждой записи должны быть непустые поля "en" и "ru".',
    };
  }

  return {
    ok: true,
    words,
    stats: {
      records: data.length,
      accepted: words.length,
      invalid,
      duplicatesInFile,
    },
  };
}

/**
 * Добавляет слова к текущей базе, пропуская совпадающие пары en + ru.
 * Исходный массив не изменяется.
 *
 * @param {Array<{en: string, ru: string}>} existing
 * @param {Array<{en: string, ru: string}>} incoming
 * @returns {{words: Array<{en: string, ru: string}>, added: number, duplicates: number}}
 */
export function mergeWords(existing, incoming) {
  const base = Array.isArray(existing) ? existing : [];
  const list = Array.isArray(incoming) ? incoming : [];
  const result = base.map((word) => ({ en: word.en, ru: word.ru }));
  const seen = new Set(result.map(wordKey));

  let added = 0;
  let duplicates = 0;

  for (const word of list) {
    const key = wordKey(word);
    if (seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    result.push({ en: word.en, ru: word.ru });
    added += 1;
  }

  return { words: result, added, duplicates };
}

/**
 * Нарезает базу на стопки по 200 слов, сохраняя порядок добавления.
 *
 * @param {Array<{en: string, ru: string}>} words
 * @returns {Array<{number: number, start: number, end: number, count: number}>}
 */
export function buildStacks(words) {
  const total = Array.isArray(words) ? words.length : 0;
  const stacks = [];
  for (let start = 0; start < total; start += STACK_SIZE) {
    const end = Math.min(start + STACK_SIZE, total);
    stacks.push({ number: stacks.length + 1, start, end, count: end - start });
  }
  return stacks;
}

/** Перемешивание Фишера — Йетса. Возвращает новый массив. */
export function shuffle(items, rng = Math.random) {
  const result = Array.isArray(items) ? items.slice() : [];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = result[i];
    result[i] = result[j];
    result[j] = swap;
  }
  return result;
}

/**
 * Собирает список карточек для сессии.
 *
 * @param {{type: 'stack', number: number} | {type: 'random'}} mode
 * @param {Array<{en: string, ru: string}>} words
 * @param {() => number} rng
 * @returns {Array<{en: string, ru: string}>}
 */
export function buildSession(mode, words, rng = Math.random) {
  const source = Array.isArray(words) ? words : [];
  if (source.length === 0) return [];

  if (mode && mode.type === 'random') {
    const size = Math.min(RANDOM_SESSION_SIZE, source.length);
    return shuffle(source, rng)
      .slice(0, size)
      .map((word) => ({ en: word.en, ru: word.ru }));
  }

  const number = mode && Number.isInteger(mode.number) && mode.number > 0 ? mode.number : 1;
  const start = (number - 1) * STACK_SIZE;
  return source
    .slice(start, start + STACK_SIZE)
    .map((word) => ({ en: word.en, ru: word.ru }));
}

/** Подпись режима для интерфейса. */
export function modeLabel(mode) {
  if (mode && mode.type === 'random') return 'Случайный режим';
  const number = mode && Number.isInteger(mode.number) ? mode.number : 1;
  return `Стопка ${number}`;
}
