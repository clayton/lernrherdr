import test from 'node:test';
import assert from 'node:assert/strict';
import {
  accuracy,
  rankForXp,
  unlockedItems,
  xpForChars,
  updateCard,
  formatDue,
  commandMatches,
  parseAnswerChord,
  keyEventMatchesStep,
  dueItems,
  nextKeepInterval,
} from '../public/logic.js';

test('rankForXp maps xp to Herdr lifecycle names', () => {
  assert.equal(rankForXp(0).name, 'idle');
  assert.equal(rankForXp(11).name, 'idle');
  assert.equal(rankForXp(12).name, 'working');
  assert.equal(rankForXp(60).name, 'done');
  assert.equal(rankForXp(100).name, 'released');
});

test('unlockedItems adds harder drills by rank', () => {
  const items = [
    { id: 'e', difficulty: 'easy' },
    { id: 'm', difficulty: 'medium' },
    { id: 'h', difficulty: 'hard' },
  ];
  assert.deepEqual(unlockedItems(items, 0).map((item) => item.id), ['e']);
  assert.deepEqual(unlockedItems(items, 12).map((item) => item.id), ['e', 'm']);
  assert.deepEqual(unlockedItems(items, 60).map((item) => item.id), ['e', 'm', 'h']);
});

test('xpForChars awards at least one xp', () => {
  assert.equal(xpForChars(0), 1);
  assert.equal(xpForChars(16), 2);
});

test('updateCard spaced repetition intervals', () => {
  const now = Date.parse('2026-08-28T12:00:00Z');
  const again = updateCard(undefined, 'again', now);
  assert.equal(again.interval, 1);
  assert.equal(again.due, now + 86_400_000);

  const firstKeep = updateCard({ id: 'x', interval: 0, due: now }, 'keep', now);
  assert.equal(firstKeep.interval, 1);
  const secondKeep = updateCard(firstKeep, 'keep', now);
  assert.equal(secondKeep.interval, 4);
  const thirdKeep = updateCard(secondKeep, 'keep', now);
  assert.equal(thirdKeep.interval, 10);
  assert.equal(nextKeepInterval(thirdKeep), 10);
});

test('formatDue prints human due strings', () => {
  const now = Date.parse('2026-08-28T12:00:00Z');
  assert.equal(formatDue(now, now), 'due today');
  assert.equal(formatDue(now + 86_400_000, now), 'due tomorrow');
  assert.equal(formatDue(now + 4 * 86_400_000, now), 'due in 4 days');
});

test('commandMatches normalizes whitespace', () => {
  assert.equal(commandMatches('  herdr agent list  ', 'herdr agent list'), true);
  assert.equal(commandMatches('herdr agent list', 'herdr workspace create'), false);
});

test('parseAnswerChord expands prefix chords', () => {
  const steps = parseAnswerChord('prefix+h');
  assert.equal(steps.length, 2);
  assert.equal(steps[0].ctrl, true);
  assert.equal(steps[0].key, 'b');
  assert.equal(steps[1].key, 'h');
});

test('keyEventMatchesStep handles digits, minus, and shifted question mark', () => {
  const digitSteps = parseAnswerChord('prefix+1..9');
  assert.equal(digitSteps.length, 2);
  assert.equal(
    keyEventMatchesStep(digitSteps[1], {
      key: '3',
      code: 'Digit3',
      ctrlKey: false,
      shiftKey: false,
      altKey: false,
      metaKey: false,
    }),
    true,
  );
  const minusSteps = parseAnswerChord('prefix+minus');
  assert.equal(keyEventMatchesStep(minusSteps[1], { key: '-', code: 'Minus', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false }), true);
  const helpSteps = parseAnswerChord('prefix+?');
  assert.equal(keyEventMatchesStep(helpSteps[1], { key: '?', code: 'Slash', ctrlKey: false, shiftKey: true, altKey: false, metaKey: false }), true);
});

test('dueItems returns cards at or past due date', () => {
  const now = 1000;
  const items = [
    { id: 'a', prompt: 'p', answer: 'x', kind: 'binding', difficulty: 'easy' },
    { id: 'b', prompt: 'p', answer: 'y', kind: 'binding', difficulty: 'easy' },
  ];
  const cards = { a: { id: 'a', interval: 1, due: 500 }, b: { id: 'b', interval: 4, due: 2000 } };
  const due = dueItems(items, cards, now);
  assert.deepEqual(due.map((i) => i.id), ['a']);
});

test('accuracy stays bounded', () => {
  assert.equal(accuracy(300, 320), 94);
  assert.equal(accuracy(10, 5), 100);
  assert.equal(accuracy(0, 0), 0);
});
