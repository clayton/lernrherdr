import {
  RANKS,
  accuracy,
  commandMatches,
  dueItems,
  formatDue,
  keyEventMatchesStep,
  parseAnswerChord,
  rankForXp,
  unlockedItems,
  updateCard,
  xpForChars,
} from './logic.js';
import { QUIZ_ITEMS } from './quiz-data.js';

const STORAGE_KEY = 'herdr-quiz';
const HASH_PREFIX = 's=';

/** @typedef {{ id: string, xp: number, cards: Record<string, import('./logic.js').CardState>, bestScore: number, theme: 'paper' | 'dusk', mode: 'learn' | 'race', currentId?: string }} SaveState */

/** @returns {SaveState} */
function defaultState() {
  return {
    id: crypto.randomUUID(),
    xp: 0,
    cards: {},
    bestScore: 0,
    theme: 'paper',
    mode: 'learn',
  };
}

/** @param {unknown} value @returns {SaveState} */
function sanitizeState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const base = defaultState();
  return {
    id: typeof source.id === 'string' ? source.id.slice(0, 64) : base.id,
    xp: Number.isFinite(source.xp) ? Math.max(0, Math.floor(source.xp)) : 0,
    cards: source.cards && typeof source.cards === 'object' ? source.cards : {},
    bestScore: Number.isFinite(source.bestScore) ? Math.max(0, Math.floor(source.bestScore)) : 0,
    theme: source.theme === 'dusk' ? 'dusk' : 'paper',
    mode: source.mode === 'race' ? 'race' : 'learn',
    currentId: QUIZ_ITEMS.some((item) => item.id === source.currentId) ? source.currentId : undefined,
  };
}

function readHashState() {
  const encoded = location.hash.match(/^#s=([A-Za-z0-9_-]+)$/)?.[1];
  if (!encoded) return null;
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

/** @param {SaveState} value */
function encodeState(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @returns {SaveState} */
function loadState() {
  try {
    return sanitizeState(readHashState() ?? JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'));
  } catch {
    return defaultState();
  }
}

/** @param {SaveState} value */
function saveState(value) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  history.replaceState(null, '', `#${HASH_PREFIX}${encodeState(value)}`);
}

/** @type {SaveState} */
let state = loadState();
/** @type {import('./logic.js').QuizItem | null} */
let currentItem = null;
/** @type {KeyboardEvent[]} */
let bindingEvents = [];
let raceTimer = 0;
let raceEndsAt = 0;
let raceIndex = 0;
let raceLastLength = 0;
let raceStats = { cleared: 0, correctUnits: 0, totalUnits: 0 };
/** @type {import('./logic.js').QuizItem[]} */
let raceQueue = [];

const els = {
  rankLine: document.getElementById('rank-line'),
  xpFill: document.getElementById('xp-fill'),
  modeLearn: document.getElementById('mode-learn'),
  modeRace: document.getElementById('mode-race'),
  themeBtn: document.getElementById('theme-btn'),
  copyLink: document.getElementById('copy-link'),
  stage: document.querySelector('.stage'),
  stageLabel: document.getElementById('stage-label'),
  prompt: document.getElementById('prompt'),
  hint: document.getElementById('hint'),
  commandWrap: document.getElementById('command-wrap'),
  commandInput: document.getElementById('command-input'),
  typedLine: document.getElementById('typed-line'),
  bindingCapture: document.getElementById('binding-capture'),
  status: document.getElementById('status'),
  raceClock: document.getElementById('race-clock'),
  btnAgain: document.getElementById('btn-again'),
  btnKeep: document.getElementById('btn-keep'),
  btnSkip: document.getElementById('btn-skip'),
  btnStartRace: document.getElementById('btn-start-race'),
  learnFooter: document.getElementById('learn-footer'),
  raceFooter: document.getElementById('race-footer'),
  live: document.getElementById('live'),
};

function applyTheme() {
  document.documentElement.dataset.theme = state.theme;
  els.themeBtn.textContent = state.theme === 'dusk' ? 'Paper' : 'Dusk';
}

function renderMeta() {
  const rank = rankForXp(state.xp);
  els.rankLine.textContent = `rank ${rank.level} · ${rank.name} · ${state.xp}xp`;
  const previous = RANKS[rank.level - 1].xp;
  const next = RANKS[rank.level]?.xp ?? previous;
  const percent = next === previous ? 100 : ((state.xp - previous) / (next - previous)) * 100;
  els.xpFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
}

function pickLearnItem() {
  const unlocked = unlockedItems(QUIZ_ITEMS, state.xp);
  if (state.currentId) {
    const saved = unlocked.find((item) => item.id === state.currentId);
    if (saved) return saved;
  }
  const due = dueItems(unlocked, state.cards);
  const pool = due.length ? due : unlocked;
  return [...pool].sort((a, b) => (state.cards[a.id]?.due ?? 0) - (state.cards[b.id]?.due ?? 0))[0];
}

/** @param {'learn' | 'race'} mode */
function setMode(mode) {
  state.mode = mode;
  els.modeLearn.setAttribute('aria-pressed', String(mode === 'learn'));
  els.modeRace.setAttribute('aria-pressed', String(mode === 'race'));
  els.learnFooter.classList.toggle('hidden', mode !== 'learn');
  els.raceFooter.classList.toggle('hidden', mode !== 'race');
  saveState(state);
  if (mode === 'learn') startLearn();
  else startRaceIdle();
}

function startLearn() {
  clearRace();
  currentItem = pickLearnItem();
  state.currentId = currentItem.id;
  saveState(state);
  bindingEvents = [];
  els.stageLabel.textContent = 'Do this.';
  els.prompt.textContent = currentItem.prompt;
  els.hint.textContent = currentItem.kind === 'binding'
    ? 'Press the stock Herdr chord. Prefix is Ctrl+B.'
    : 'Type the exact Herdr CLI line.';
  els.btnAgain.classList.remove('hidden');
  els.btnKeep.classList.add('hidden');
  els.btnSkip.classList.remove('hidden');
  els.status.textContent = state.cards[currentItem.id] ? formatDue(state.cards[currentItem.id].due) : '';
  showInputForCurrent();
}

function showInputForCurrent() {
  const binding = currentItem.kind === 'binding';
  els.commandWrap.classList.toggle('hidden', binding);
  els.bindingCapture.classList.toggle('hidden', !binding);
  els.commandInput.value = '';
  els.typedLine.innerHTML = '<span class="caret" aria-hidden="true"></span>';
  if (binding) {
    renderBindingCapture();
    els.stage.focus();
  } else {
    els.commandInput.disabled = false;
    els.commandInput.focus();
  }
}

function bindingLabels(answer) {
  return parseAnswerChord(answer).map((step) => {
    if (step.ctrl) return 'Ctrl+B';
    if (step.digitRange) return '1-9';
    if (step.key === '?') return '?';
    const key = step.key.length === 1 ? step.key.toUpperCase() : step.key;
    return `${step.shift ? 'Shift+' : ''}${key}`;
  });
}

function answerText(item) {
  return item.kind === 'binding' ? bindingLabels(item.answer).join(', then ') : item.answer;
}

function renderBindingCapture() {
  const steps = parseAnswerChord(currentItem.answer);
  const labels = bindingLabels(currentItem.answer);
  els.bindingCapture.innerHTML = labels.map((label, index) => {
    const done = index < bindingEvents.length;
    const bad = done && !keyEventMatchesStep(steps[index], bindingEvents[index]);
    const className = bad ? 'bad' : done ? 'key-step' : 'key-step pending';
    return `<span class="${className}">${label}</span>${index < labels.length - 1 ? ' · ' : ''}`;
  }).join('');
}

function onBindingKey(event) {
  if (!currentItem || currentItem.kind !== 'binding') return;
  if (state.mode === 'race' && !raceTimer) return;
  if (event.target instanceof Element && event.target.closest('button, input, a')) return;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
  const steps = parseAnswerChord(currentItem.answer);
  if (bindingEvents.length >= steps.length) return;
  event.preventDefault();
  const step = steps[bindingEvents.length];
  const matches = keyEventMatchesStep(step, event);
  if (state.mode === 'race') raceStats.totalUnits += 1;
  if (!matches) {
    bindingEvents = [];
    renderBindingCapture();
    els.live.textContent = 'Wrong key. Start the chord again.';
    return;
  }
  bindingEvents.push(event);
  if (state.mode === 'race') raceStats.correctUnits += 1;
  renderBindingCapture();
  if (bindingEvents.length < steps.length) return;
  if (state.mode === 'race') {
    clearRaceItem(answerText(currentItem).length);
  } else {
    els.btnKeep.classList.remove('hidden');
    els.live.textContent = 'Chord matched. Keep it or mark it Again.';
  }
}

function renderCommandTyped() {
  const expected = answerText(currentItem);
  const typed = els.commandInput.value;
  let html = '';
  for (let index = 0; index < typed.length; index += 1) {
    html += `<span class="${expected[index] === typed[index] ? 'ok' : 'bad'}">${escapeHtml(typed[index])}</span>`;
  }
  els.typedLine.innerHTML = `${html}<span class="caret" aria-hidden="true"></span>`;
  if (state.mode === 'learn' && commandMatches(typed, expected)) {
    els.btnKeep.classList.remove('hidden');
    els.live.textContent = 'Command matched. Keep it or mark it Again.';
  }
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** @param {'again' | 'keep'} grade */
function gradeLearn(grade) {
  if (!currentItem) return;
  const oldLevel = rankForXp(state.xp).level;
  if (grade === 'keep') state.xp += xpForChars(answerText(currentItem).length);
  state.cards[currentItem.id] = updateCard(
    { id: currentItem.id, ...state.cards[currentItem.id] },
    grade,
  );
  state.currentId = undefined;
  const newLevel = rankForXp(state.xp).level;
  els.live.textContent = newLevel > oldLevel
    ? `Rank ${newLevel} unlocked. New drills added.`
    : grade === 'keep' ? 'Kept. Due tomorrow.' : 'Marked Again. Due tomorrow.';
  saveState(state);
  renderMeta();
  startLearn();
}

function skipLearn() {
  if (!currentItem) return;
  const unlocked = unlockedItems(QUIZ_ITEMS, state.xp);
  const index = unlocked.findIndex((item) => item.id === currentItem.id);
  state.currentId = unlocked[(index + 1) % unlocked.length].id;
  saveState(state);
  startLearn();
}

function startRaceIdle() {
  clearRace();
  currentItem = null;
  els.stageLabel.textContent = 'Race';
  els.prompt.textContent = '60 seconds. Clear as many as you can.';
  els.hint.textContent = `Best is ${state.bestScore}. Only unlocked drills are in the queue.`;
  els.commandWrap.classList.remove('hidden');
  els.bindingCapture.classList.add('hidden');
  els.commandInput.value = '';
  els.commandInput.disabled = true;
  els.typedLine.innerHTML = '';
  els.status.textContent = '';
  els.raceClock.textContent = '';
  els.btnStartRace.classList.remove('hidden');
}

function startRaceRun() {
  raceQueue = shuffle([...unlockedItems(QUIZ_ITEMS, state.xp)]);
  raceStats = { cleared: 0, correctUnits: 0, totalUnits: 0 };
  raceIndex = 0;
  raceEndsAt = Date.now() + 60_000;
  els.btnStartRace.classList.add('hidden');
  raceTimer = window.setInterval(tickRace, 250);
  showRaceItem();
  tickRace();
}

function showRaceItem() {
  currentItem = raceQueue[raceIndex % raceQueue.length];
  raceIndex += 1;
  state.currentId = currentItem.id;
  bindingEvents = [];
  raceLastLength = 0;
  els.prompt.textContent = currentItem.prompt;
  els.hint.textContent = currentItem.kind === 'binding'
    ? 'Execute the chord. Do not type its name.'
    : 'Type the command.';
  showInputForCurrent();
  saveState(state);
}

function tickRace() {
  const left = Math.max(0, raceEndsAt - Date.now());
  const seconds = Math.ceil(left / 1000);
  els.raceClock.textContent = `${seconds}s · ${raceStats.cleared} cleared`;
  els.raceClock.setAttribute('aria-label', `${seconds} seconds left, ${raceStats.cleared} cleared`);
  if (left <= 0) finishRace();
}

function onRaceInput() {
  if (state.mode !== 'race' || !currentItem || !raceTimer || currentItem.kind !== 'command') return;
  renderCommandTyped();
  const typed = els.commandInput.value;
  raceStats.totalUnits += Math.max(0, typed.length - raceLastLength);
  raceLastLength = typed.length;
  if (commandMatches(typed, currentItem.answer)) clearRaceItem(currentItem.answer.length);
}

function clearRaceItem(units) {
  raceStats.cleared += 1;
  if (currentItem.kind === 'command') raceStats.correctUnits += units;
  state.xp += xpForChars(units);
  renderMeta();
  showRaceItem();
}

function finishRace() {
  clearRace();
  const clean = accuracy(raceStats.correctUnits, raceStats.totalUnits);
  state.bestScore = Math.max(state.bestScore, raceStats.cleared);
  saveState(state);
  renderMeta();
  els.commandInput.disabled = true;
  els.commandWrap.classList.remove('hidden');
  els.bindingCapture.classList.add('hidden');
  els.prompt.textContent = `${raceStats.cleared} cleared · ${clean}% clean.`;
  els.hint.textContent = `Best is ${state.bestScore}.`;
  els.live.textContent = `${raceStats.cleared} cleared, ${clean}% clean. Best is ${state.bestScore}.`;
  els.btnStartRace.classList.remove('hidden');
  els.btnStartRace.textContent = 'Race again';
}

function clearRace() {
  if (raceTimer) window.clearInterval(raceTimer);
  raceTimer = 0;
}

function shuffle(items) {
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

async function copyRecoveryLink() {
  saveState(state);
  await navigator.clipboard.writeText(location.href);
  els.copyLink.textContent = 'Copied';
  els.live.textContent = 'Recovery link copied.';
  window.setTimeout(() => { els.copyLink.textContent = 'Copy save link'; }, 1200);
}

function init() {
  if (!localStorage.getItem(STORAGE_KEY) && !readHashState()) {
    state.theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dusk' : 'paper';
  }
  applyTheme();
  renderMeta();
  els.modeLearn.addEventListener('click', () => setMode('learn'));
  els.modeRace.addEventListener('click', () => setMode('race'));
  els.themeBtn.addEventListener('click', () => {
    state.theme = state.theme === 'dusk' ? 'paper' : 'dusk';
    applyTheme();
    saveState(state);
  });
  els.copyLink.addEventListener('click', () => { copyRecoveryLink().catch(() => { els.live.textContent = 'Copy failed. Bookmark this page instead.'; }); });
  els.btnAgain.addEventListener('click', () => gradeLearn('again'));
  els.btnKeep.addEventListener('click', () => gradeLearn('keep'));
  els.btnSkip.addEventListener('click', skipLearn);
  els.btnStartRace.addEventListener('click', startRaceRun);
  els.commandInput.addEventListener('input', () => {
    if (state.mode === 'learn') renderCommandTyped();
    else onRaceInput();
  });
  window.addEventListener('keydown', onBindingKey);
  setMode(state.mode);
}

init();
