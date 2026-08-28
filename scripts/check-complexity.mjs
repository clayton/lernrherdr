#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const TARGETS = ['public/logic.js', 'public/app.js', 'public/quiz-data.js'];
const MAX_FN = 12;
const BRANCH_RE = /\b(if|else\s+if|for|while|case|catch|\?\s*[^.?]|\&\&|\|\|)\b/g;

/** @param {string} body */
function score(body) {
  let complexity = 1;
  for (const _ of body.matchAll(BRANCH_RE)) complexity += 1;
  return complexity;
}

/** @param {string} src */
function functions(src) {
  /** @type {Array<{ name: string, complexity: number }>} */
  const found = [];
  const patterns = [
    /(?:^|\n)(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{/g,
    /(?:^|\n)(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/g,
    /(?:^|\n)(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?function\s*\([^)]*\)\s*\{/g,
  ];

  for (const re of patterns) {
    for (const match of src.matchAll(re)) {
      const name = match[1];
      const start = match.index + match[0].lastIndexOf('{');
      let depth = 0;
      let end = start;
      for (; end < src.length; end += 1) {
        const ch = src[end];
        if (ch === '{') depth += 1;
        else if (ch === '}') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      found.push({ name, complexity: score(src.slice(start + 1, end)) });
    }
  }
  return found;
}

let failed = false;
for (const file of TARGETS) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const fns = functions(src);
  if (!fns.length) {
    const complexity = score(src);
    console.log(`${file}: file complexity=${complexity}`);
    if (complexity > MAX_FN) failed = true;
    continue;
  }
  for (const fn of fns) {
    const flag = fn.complexity > MAX_FN ? ' FAIL' : '';
    console.log(`${file}#${fn.name}: ${fn.complexity}${flag}`);
    if (fn.complexity > MAX_FN) failed = true;
  }
}

process.exit(failed ? 1 : 0);
