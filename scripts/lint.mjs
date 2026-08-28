#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TARGETS = ['public/logic.js', 'public/app.js', 'public/quiz-data.js'];

/** @param {string} file */
function lintFile(file) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const issues = [];
  if (/\bTODO\b/.test(src)) issues.push('contains TODO');
  if (/\bconsole\.log\(/.test(src)) issues.push('contains console.log');
  if (/\beval\(/.test(src)) issues.push('contains eval');
  if (/<script[^>]+src=.*http/i.test(src)) issues.push('external script src');
  return { file, issues };
}

let failed = false;
for (const file of TARGETS) {
  const result = lintFile(file);
  const line = `${result.file}:${result.issues.length ? ` ${result.issues.join(', ')}` : ' ok'}`;
  console.log(line);
  if (result.issues.length) failed = true;
}

process.exit(failed ? 1 : 0);
