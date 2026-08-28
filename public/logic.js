/** @typedef {{ id: string, prompt: string, answer: string, kind: 'binding' | 'command', difficulty: 'easy' | 'medium' | 'hard' }} QuizItem */
/** @typedef {{ id: string, interval: number, due: number }} CardState */

export const RANKS = [
  { xp: 0, name: 'idle' },
  { xp: 12, name: 'working' },
  { xp: 30, name: 'blocked' },
  { xp: 60, name: 'done' },
  { xp: 100, name: 'released' },
];

export const KEEP_INTERVALS = [1, 4, 10];

/** @param {number} xp */
export function rankForXp(xp) {
  let level = 1;
  let name = RANKS[0].name;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (xp >= RANKS[i].xp) {
      level = i + 1;
      name = RANKS[i].name;
    }
  }
  return { level, name, xp };
}

/** @param {QuizItem[]} items @param {number} xp */
export function unlockedItems(items, xp) {
  const level = rankForXp(xp).level;
  const minimum = { easy: 1, medium: 2, hard: 4 };
  return items.filter((item) => level >= minimum[item.difficulty]);
}

/** @param {number} correctChars */
export function xpForChars(correctChars) {
  return Math.max(1, Math.floor(correctChars / 8));
}

/** @param {CardState | undefined} card */
export function nextKeepInterval(card) {
  const idx = card ? KEEP_INTERVALS.indexOf(card.interval) : -1;
  if (idx === -1) return KEEP_INTERVALS[0];
  return KEEP_INTERVALS[Math.min(idx + 1, KEEP_INTERVALS.length - 1)];
}

/** @param {number} days @param {number} [now] */
export function dueFromDays(days, now = Date.now()) {
  return now + days * 86_400_000;
}

/** @param {CardState | undefined} card @param {'again' | 'keep'} grade @param {number} [now] */
export function updateCard(card, grade, now = Date.now()) {
  const base = card ?? { id: '', interval: 0, due: now };
  if (grade === 'again') return { ...base, interval: 1, due: dueFromDays(1, now) };
  const interval = nextKeepInterval(base);
  return { ...base, interval, due: dueFromDays(interval, now) };
}

/** @param {number} due @param {number} [now] */
export function formatDue(due, now = Date.now()) {
  const days = Math.max(0, Math.ceil((due - now) / 86_400_000));
  if (days === 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

/** @param {string} text */
export function normalizeCommand(text) {
  return text.trim().replace(/\s+/g, ' ');
}

/** @param {string} typed @param {string} expected */
export function commandMatches(typed, expected) {
  return normalizeCommand(typed) === normalizeCommand(expected);
}

/**
 * @param {string} chord
 * @returns {Array<{ ctrl?: boolean, shift?: boolean, key: string, digitRange?: boolean }>}
 */
export function parseAnswerChord(chord) {
  const trimmed = chord.trim().toLowerCase();
  if (trimmed === 'prefix') return [{ ctrl: true, key: 'b' }];
  if (trimmed.startsWith('prefix+')) {
    return [{ ctrl: true, key: 'b' }, parseSingleChord(trimmed.slice(7))];
  }
  return [parseSingleChord(trimmed)];
}

/** @param {string} part */
function parseSingleChord(part) {
  const tokens = part.split('+');
  const raw = tokens.at(-1) ?? '';
  const key = raw === 'minus' ? '-' : raw === 'tab' ? 'Tab' : raw === '1..9' ? 'Digit' : raw;
  return {
    key,
    ctrl: tokens.includes('ctrl') || undefined,
    shift: (tokens.includes('shift') || raw === '?') || undefined,
    digitRange: raw === '1..9' || undefined,
  };
}

/** @param {{ ctrl?: boolean, shift?: boolean, key: string, digitRange?: boolean }} step @param {KeyboardEvent} event */
export function keyEventMatchesStep(step, event) {
  if (!step) return false;
  if (!!step.ctrl !== (event.ctrlKey || event.metaKey)) return false;
  if (!!step.shift !== event.shiftKey) return false;
  if (step.digitRange) return /^Digit[1-9]$/.test(event.code);
  if (step.key === '-') return event.key === '-' || event.code === 'Minus';
  if (step.key === 'Tab') return event.key === 'Tab';
  return event.key.toLowerCase() === step.key.toLowerCase();
}

/** @param {QuizItem[]} items @param {Record<string, CardState>} cards @param {number} [now] */
export function dueItems(items, cards, now = Date.now()) {
  return items.filter((item) => !cards[item.id] || cards[item.id].due <= now);
}

/** @param {number} correct @param {number} total */
export function accuracy(correct, total) {
  return total > 0 ? Math.min(100, Math.round((correct / total) * 100)) : 0;
}

/** @param {unknown} value */
export function encodePortableState(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {unknown} value @param {(hash: string) => void} writeHash @param {(json: string) => void} writeStorage */
export function persistPortableSave(value, writeHash, writeStorage) {
  writeHash(encodePortableState(value));
  try {
    writeStorage(JSON.stringify(value));
  } catch {
    // ponytail: hash wins when localStorage is blocked or full
  }
}
