/**
 * Word Cards — интерфейс приложения.
 * Вся логика хранения локальная: localStorage + service worker для офлайна.
 */
import {
  REVEAL_DELAY_MS,
  RANDOM_SESSION_SIZE,
  buildSession,
  buildStacks,
  mergeWords,
  modeLabel,
  parseWordsJson,
} from './core.js';
import {
  canGoBack,
  createSession,
  goToNext,
  goToPrevious,
  isRevealed,
  revealCurrent,
  swipeDirection,
  tapCard,
} from './session.js';
import { SEED_WORDS } from './seed-words.js';

const STORAGE_KEY = 'word-cards.words.v1';
const DIRECTIONS = {
  'en-ru': { front: 'en', back: 'ru' },
  'ru-en': { front: 'ru', back: 'en' },
};

const state = {
  words: [],
  direction: 'en-ru',
  mode: { type: 'stack', number: 1 },
  session: null,
  timer: null,
  timerToken: 0,
  screen: 'home',
  storageOk: true,
  speakingTimer: null,
  suppressTap: false,
};

const $ = (id) => document.getElementById(id);

const dom = {
  screens: {
    home: $('screen-home'),
    card: $('screen-card'),
    finish: $('screen-finish'),
    import: $('screen-import'),
  },
  homeTotal: $('home-total'),
  homeEmpty: $('home-empty'),
  homeNotice: $('home-notice'),
  homeNoticeText: $('home-notice-text'),
  storageWarning: $('storage-warning'),
  homeControls: $('home-controls'),
  directionButtons: Array.from(document.querySelectorAll('[data-direction]')),
  deckList: $('deck-list'),
  btnStart: $('btn-start'),
  btnImport: $('btn-import'),
  card: $('card'),
  cardFrontBox: $('card-front-box'),
  cardFront: $('card-front'),
  cardBack: $('card-back'),
  cardProgress: $('card-progress'),
  cardLabel: $('card-label'),
  btnNext: $('btn-next'),
  btnPrev: $('btn-prev'),
  btnSpeak: $('btn-speak'),
  btnExit: $('btn-exit'),
  finishTitle: $('finish-title'),
  finishCount: $('finish-count'),
  btnAgain: $('btn-again'),
  btnFinishHome: $('btn-home'),
  importResult: $('import-result'),
  fileInput: $('file-input'),
  btnDownloadSample: $('btn-download-sample'),
  btnImportBack: $('btn-import-back'),
  btnClear: $('btn-clear'),
  clearDialog: $('clear-dialog'),
  clearDialogText: $('clear-dialog-text'),
  btnClearCancel: $('btn-clear-cancel'),
  btnClearConfirm: $('btn-clear-confirm'),
};

/* ---------- Хранилище ---------- */

function loadWords() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed
      .filter((item) => item && typeof item.en === 'string' && typeof item.ru === 'string')
      .map((item) => ({ en: item.en.trim(), ru: item.ru.trim() }))
      .filter((item) => item.en && item.ru);
  } catch {
    return null;
  }
}

function saveWords(words) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(words));
    return true;
  } catch {
    return false;
  }
}

/* ---------- Утилиты ---------- */

function plural(count, forms) {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (last > 1 && last < 5) return forms[1];
  if (last === 1) return forms[0];
  return forms[2];
}

function wordForms(count) {
  return `${count} ${plural(count, ['слово', 'слова', 'слов'])}`;
}

function sameMode(a, b) {
  if (!a || !b) return false;
  if (a.type !== b.type) return false;
  return a.type === 'random' || a.number === b.number;
}

/* ---------- Экраны ---------- */

function showScreen(name) {
  state.screen = name;
  for (const [key, node] of Object.entries(dom.screens)) {
    node.hidden = key !== name;
  }
  if (name !== 'card') stopRevealTimer();
  if (name === 'home') pushedInner = false;
  window.scrollTo(0, 0);
}

let pushedInner = false;

function navigate(name) {
  if (name !== 'home' && state.screen === 'home' && !pushedInner) {
    try {
      history.pushState({ screen: name }, '');
      pushedInner = true;
    } catch {
      pushedInner = false;
    }
  }
  showScreen(name);
}

function goHome() {
  if (state.screen === 'home') return;
  if (pushedInner) {
    history.back();
    return;
  }
  showScreen('home');
  renderHome();
}

window.addEventListener('popstate', () => {
  pushedInner = false;
  showScreen('home');
  renderHome();
});

/* ---------- Стартовый экран ---------- */

function renderHome() {
  const total = state.words.length;
  const empty = total === 0;

  dom.homeTotal.textContent = empty ? '' : `В базе: ${wordForms(total)}`;
  dom.homeEmpty.hidden = !empty;
  dom.homeControls.hidden = empty;
  dom.btnStart.hidden = empty;
  dom.btnStart.disabled = empty;
  dom.btnClear.hidden = empty;
  dom.storageWarning.hidden = state.storageOk;

  for (const button of dom.directionButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.direction === state.direction));
  }

  const stacks = buildStacks(state.words);
  if (state.mode.type === 'stack' && state.mode.number > stacks.length) {
    state.mode = stacks.length ? { type: 'stack', number: 1 } : { type: 'random' };
  }

  dom.deckList.replaceChildren();
  if (!empty) {
    for (const stack of stacks) {
      dom.deckList.append(
        createOption({
          title: `Стопка ${stack.number}`,
          sub: `слова с ${stack.start + 1} по ${stack.end}`,
          meta: wordForms(stack.count),
          mode: { type: 'stack', number: stack.number },
        }),
      );
    }
    dom.deckList.append(
      createOption({
        title: 'Случайный режим',
        sub: 'слова из всей базы',
        meta: wordForms(Math.min(RANDOM_SESSION_SIZE, total)),
        mode: { type: 'random' },
      }),
    );
  }

  syncSelection();
}

function createOption({ title, sub, meta, mode }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'option';
  button.dataset.mode = JSON.stringify(mode);
  button.setAttribute('aria-pressed', 'false');

  const dot = document.createElement('span');
  dot.className = 'dot';
  dot.setAttribute('aria-hidden', 'true');

  const text = document.createElement('span');
  text.className = 'option-text';
  const titleEl = document.createElement('span');
  titleEl.className = 'option-title';
  titleEl.textContent = title;
  const subEl = document.createElement('span');
  subEl.className = 'option-sub';
  subEl.textContent = sub;
  text.append(titleEl, subEl);

  const metaEl = document.createElement('span');
  metaEl.className = 'option-meta';
  metaEl.textContent = meta;

  button.append(dot, text, metaEl);
  button.addEventListener('click', () => {
    state.mode = mode;
    syncSelection();
  });

  return button;
}

function syncSelection() {
  for (const button of dom.deckList.querySelectorAll('.option')) {
    const mode = JSON.parse(button.dataset.mode);
    button.setAttribute('aria-pressed', String(sameMode(mode, state.mode)));
  }
}

function setDirection(direction) {
  if (!DIRECTIONS[direction]) return;
  state.direction = direction;
  for (const button of dom.directionButtons) {
    button.setAttribute('aria-pressed', String(button.dataset.direction === direction));
  }
}

function showHomeNotice(text) {
  dom.homeNoticeText.textContent = text;
  dom.homeNotice.hidden = !text;
}

/* ---------- Сессия и карточка ---------- */

function startSession(mode) {
  const words = buildSession(mode, state.words);
  if (words.length === 0) {
    showHomeNotice('В этой стопке нет слов. Импортируйте слова или выберите другой режим.');
    return;
  }

  showHomeNotice('');
  stopRevealTimer();
  state.mode = mode;
  state.session = createSession({ words, mode, label: modeLabel(mode) });
  navigate('card');
  renderCard();
}

function renderCard() {
  const session = state.session;
  if (!session) return;

  const word = session.words[session.index];
  const map = DIRECTIONS[state.direction];

  dom.cardFront.textContent = word[map.front];
  dom.cardBack.textContent = word[map.back];
  dom.cardLabel.textContent = session.label;
  dom.cardProgress.textContent = `${session.index + 1} / ${session.words.length}`;

  syncCardReveal();
  updateNavButtons();
  if (isRevealed(session)) {
    stopRevealTimer();
  } else {
    startRevealTimer();
  }
  fitCardText();
}

/** Приводит вид карточки в соответствие с её состоянием раскрытия. */
function syncCardReveal() {
  const revealed = isRevealed(state.session);
  dom.card.dataset.revealed = String(revealed);
  dom.card.setAttribute(
    'aria-label',
    revealed
      ? 'Карточка раскрыта. Нажмите, чтобы перейти к следующему слову'
      : 'Карточка. Нажмите, чтобы увидеть перевод',
  );
  updateSpeakButton();
  fitCardText();
}

/** Нажатие на карточку: скрытая раскрывается, раскрытая листает вперёд. */
function handleCardTap() {
  const session = state.session;
  if (!session) return;
  if (state.suppressTap) {
    state.suppressTap = false;
    return;
  }

  const result = tapCard(session);
  state.session = result.session;

  if (result.action === 'reveal') {
    stopRevealTimer();
    syncCardReveal();
    return;
  }
  if (result.action === 'next') {
    renderCard();
    return;
  }
  if (result.action === 'finish') {
    finishSession();
  }
}

function startRevealTimer() {
  stopRevealTimer();
  const token = state.timerToken;
  state.timer = window.setTimeout(() => {
    if (token !== state.timerToken) return;
    state.timer = null;
    state.session = revealCurrent(state.session);
    syncCardReveal();
  }, REVEAL_DELAY_MS);
}

function stopRevealTimer() {
  if (state.timer !== null) {
    window.clearTimeout(state.timer);
    state.timer = null;
  }
  state.timerToken += 1;
}

function goNext() {
  const session = state.session;
  if (!session) return;

  const result = goToNext(session);
  if (result.finished) {
    finishSession();
    return;
  }

  state.session = result.session;
  renderCard();
}

function goPrev() {
  const session = state.session;
  if (!session || !canGoBack(session)) return;
  state.session = goToPrevious(session);
  renderCard();
}

function updateNavButtons() {
  dom.btnPrev.disabled = !canGoBack(state.session);
}

function finishSession() {
  const session = state.session;
  stopRevealTimer();
  if (!session) return;

  dom.finishTitle.textContent =
    session.mode.type === 'random' ? 'Случайная сессия пройдена' : `Стопка ${session.mode.number} пройдена`;
  dom.finishCount.textContent = `Слов в сессии: ${session.words.length}`;
  navigate('finish');
}

/* ---------- Подгонка текста ---------- */

function fitText(node, box, startSize, minSize) {
  if (!node || !box) return;
  let size = startSize;
  node.style.fontSize = `${size}px`;
  let guard = 30;
  while (
    guard > 0 &&
    size > minSize &&
    (node.scrollHeight > box.clientHeight + 1 || node.scrollWidth > box.clientWidth + 1)
  ) {
    guard -= 1;
    size = Math.max(minSize, size - 2);
    node.style.fontSize = `${size}px`;
  }
}

function fitCardText() {
  if (!state.session) return;

  const width = Math.max(window.innerWidth, 320);
  const baseMax = Math.max(28, Math.min(64, Math.round(width * 0.155)));
  const frontLength = (dom.cardFront.textContent ?? '').length;
  const frontStart = frontLength <= 8 ? baseMax : frontLength <= 14 ? Math.round(baseMax * 0.78) : Math.round(baseMax * 0.6);
  fitText(dom.cardFront, dom.cardFrontBox, frontStart, 17);

  const backLength = (dom.cardBack.textContent ?? '').length;
  const backStart = backLength <= 12 ? 34 : backLength <= 24 ? 27 : 21;
  dom.cardBack.style.fontSize = `${Math.max(15, Math.min(backStart, Math.round(width * 0.085)))}px`;
}

/* ---------- Озвучивание ---------- */

const ttsSupported =
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof window.SpeechSynthesisUtterance === 'function';

let voices = [];

function refreshVoices() {
  if (!ttsSupported) return;
  try {
    voices = window.speechSynthesis.getVoices() || [];
  } catch {
    voices = [];
  }
}

if (ttsSupported) {
  refreshVoices();
  try {
    window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  } catch {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }
}

function pickEnglishVoice() {
  if (!voices.length) refreshVoices();
  const english = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ''));
  if (!english.length) return null;
  return (
    english.find((voice) => /^en[-_]US/i.test(voice.lang) && voice.localService) ||
    english.find((voice) => /^en[-_]US/i.test(voice.lang)) ||
    english.find((voice) => /^en[-_]GB/i.test(voice.lang)) ||
    english[0]
  );
}

function speakAvailable() {
  if (!ttsSupported) return false;
  if (state.direction === 'en-ru') return true;
  return isRevealed(state.session);
}

function updateSpeakButton() {
  const available = speakAvailable();
  dom.btnSpeak.classList.toggle('is-hidden', !available);
  dom.btnSpeak.disabled = !available;
  dom.btnSpeak.setAttribute('aria-hidden', String(!available));
  dom.btnSpeak.tabIndex = available ? 0 : -1;
}

function speakCurrentWord() {
  const session = state.session;
  if (!session || !ttsSupported) return;

  const text = session.words[session.index].en;
  try {
    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = pickEnglishVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = 'en-US';
    }
    utterance.rate = 0.95;

    const clearState = () => {
      dom.btnSpeak.classList.remove('is-speaking');
      if (state.speakingTimer !== null) {
        window.clearTimeout(state.speakingTimer);
        state.speakingTimer = null;
      }
    };
    utterance.onend = clearState;
    utterance.onerror = clearState;

    dom.btnSpeak.classList.add('is-speaking');
    if (state.speakingTimer !== null) window.clearTimeout(state.speakingTimer);
    state.speakingTimer = window.setTimeout(clearState, 5000);

    synth.speak(utterance);
  } catch {
    dom.btnSpeak.classList.remove('is-speaking');
  }
}

/* ---------- Импорт ---------- */

function openImport() {
  dom.importResult.hidden = true;
  dom.importResult.replaceChildren();
  dom.importResult.className = 'notice';
  dom.fileInput.value = '';
  navigate('import');
}

function setImportResult(kind, title, rows = null, note = '') {
  const box = dom.importResult;
  box.hidden = false;
  box.className = `notice notice-${kind}`;
  box.replaceChildren();

  const titleEl = document.createElement('p');
  titleEl.className = 'notice-title';
  titleEl.textContent = title;
  box.append(titleEl);

  if (rows && rows.length) {
    const list = document.createElement('ul');
    list.className = 'result-list';
    for (const [label, value] of rows) {
      const item = document.createElement('li');
      const labelEl = document.createElement('span');
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.textContent = String(value);
      item.append(labelEl, valueEl);
      list.append(item);
    }
    box.append(list);
  }

  if (note) {
    const noteEl = document.createElement('p');
    noteEl.className = 'result-note';
    noteEl.textContent = note;
    box.append(noteEl);
  }
}

async function handleFile(file) {
  setImportResult('info', 'Читаем файл…');

  let text;
  try {
    text = await file.text();
  } catch {
    setImportResult('error', 'Не удалось прочитать файл. Выберите его ещё раз.');
    return;
  }

  const parsed = parseWordsJson(text);
  if (!parsed.ok) {
    setImportResult('error', parsed.error);
    return;
  }

  const merged = mergeWords(state.words, parsed.words);
  state.words = merged.words;
  state.storageOk = saveWords(state.words);

  const duplicates = merged.duplicates + (parsed.stats.duplicatesInFile || 0);
  const rows = [
    ['Добавлено слов', merged.added],
    ['Пропущено дубликатов', duplicates],
    ['Пропущено некорректных записей', parsed.stats.invalid],
    ['Всего в базе', state.words.length],
  ];

  if (merged.added === 0) {
    setImportResult('info', 'Новых слов нет — все слова из файла уже есть в базе.', rows);
  } else {
    setImportResult(
      'success',
      'Импорт завершён',
      rows,
      state.storageOk ? '' : 'Не удалось сохранить базу на устройстве: изменения действуют только до перезапуска.',
    );
  }

  renderHome();
}

async function downloadSample() {
  try {
    const response = await fetch('words.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('network');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'words.json';
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
  } catch {
    setImportResult('error', 'Не удалось подготовить пример файла. Возьмите words.json из папки приложения.');
  }
}

/* ---------- Очистка базы ---------- */

function openClearDialog() {
  if (!state.words.length) return;
  dom.clearDialogText.textContent = `Будут удалены все слова из базы — ${wordForms(
    state.words.length,
  )}. Отменить это действие нельзя.`;
  if (typeof dom.clearDialog.showModal === 'function') {
    dom.clearDialog.showModal();
  } else {
    dom.clearDialog.setAttribute('open', '');
  }
}

function closeClearDialog() {
  if (typeof dom.clearDialog.close === 'function') {
    dom.clearDialog.close();
  } else {
    dom.clearDialog.removeAttribute('open');
  }
}

function clearBase() {
  stopRevealTimer();
  state.words = [];
  state.session = null;
  state.mode = { type: 'random' };
  state.storageOk = saveWords(state.words);
  showHomeNotice('');
  renderHome();
}

/* ---------- События ---------- */

for (const button of dom.directionButtons) {
  button.addEventListener('click', () => setDirection(button.dataset.direction));
}

dom.btnStart.addEventListener('click', () => startSession(state.mode));
dom.btnImport.addEventListener('click', openImport);
dom.btnImportBack.addEventListener('click', goHome);
dom.btnExit.addEventListener('click', goHome);
dom.btnClear.addEventListener('click', openClearDialog);
dom.btnClearCancel.addEventListener('click', closeClearDialog);
dom.btnClearConfirm.addEventListener('click', () => {
  closeClearDialog();
  clearBase();
});

dom.card.addEventListener('click', handleCardTap);
dom.card.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    handleCardTap();
  }
});
dom.card.addEventListener('transitionend', (event) => {
  if (event.propertyName === 'grid-template-rows') fitCardText();
});

/* Свайп по карточке: влево — следующее слово, вправо — предыдущее. */
let touchStart = null;

dom.card.addEventListener(
  'touchstart',
  (event) => {
    if (event.touches.length !== 1) {
      touchStart = null;
      return;
    }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  },
  { passive: true },
);

dom.card.addEventListener('touchcancel', () => {
  touchStart = null;
}, { passive: true });

dom.card.addEventListener(
  'touchend',
  (event) => {
    const start = touchStart;
    touchStart = null;
    if (!start) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const direction = swipeDirection(start, {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    });
    if (!direction) return;

    // Свайп не должен превращаться в тап по карточке.
    state.suppressTap = true;
    window.setTimeout(() => {
      state.suppressTap = false;
    }, 400);

    if (direction === 'next') goNext();
    else goPrev();
  },
  { passive: true },
);

dom.btnNext.addEventListener('click', goNext);
dom.btnPrev.addEventListener('click', goPrev);
dom.btnSpeak.addEventListener('click', speakCurrentWord);

dom.btnAgain.addEventListener('click', () => {
  if (!state.session) {
    goHome();
    return;
  }
  startSession(state.session.mode);
});
dom.btnFinishHome.addEventListener('click', goHome);

dom.fileInput.addEventListener('change', async () => {
  const file = dom.fileInput.files && dom.fileInput.files[0];
  if (!file) return;
  await handleFile(file);
  dom.fileInput.value = '';
});

dom.btnDownloadSample.addEventListener('click', downloadSample);

window.addEventListener('resize', () => {
  if (state.screen === 'card') fitCardText();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && state.screen === 'card') fitCardText();
});

/* ---------- Запуск ---------- */

function init() {
  const stored = loadWords();
  if (stored === null) {
    state.words = SEED_WORDS.map((word) => ({ en: word.en, ru: word.ru }));
    state.storageOk = saveWords(state.words);
  } else {
    state.words = stored;
    state.storageOk = true;
  }

  if (!state.words.length) state.mode = { type: 'random' };

  renderHome();
  showScreen('home');

  if ('fonts' in document && document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      if (state.screen === 'card') fitCardText();
    }).catch(() => {});
  }

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
}

init();
