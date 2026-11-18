// Read prompt sections and writing rules without loading the generation runner.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
let cachedSections;
let cachedMatchers;

// prompt.md sections, keyed by heading.
function readSections() {
  if (cachedSections) return cachedSections;
  const out = {};
  for (const part of readFileSync(join(HERE, 'prompt.md'), 'utf8').split(/^## /m).slice(1)) {
    const nl = part.indexOf('\n');
    out[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
  }
  return cachedSections = out;
}

export function sections() {
  return { ...readSections() };
}

export function bannedWords() {
  const line = readSections()['Writing rules'].split('\n').find((l) => l.startsWith('- Do not use these words:'));
  return line.replace(/^.*?:/, '').replace(/\.$/, '').split(',').map((w) => w.trim()).filter(Boolean);
}

export function findBanned(text) {
  cachedMatchers ??= bannedWords().map((word) => [word, new RegExp(`\\b${word}`, 'i')]);
  return cachedMatchers.filter(([, pattern]) => pattern.test(text)).map(([word]) => word);
}
