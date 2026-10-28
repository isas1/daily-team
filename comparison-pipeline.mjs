#!/usr/bin/env node
// Local daily.sh companion. Read the exact day/output selected for run.mjs.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { today } from './run.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const value = (flag, fallback) => { const i = args.lastIndexOf(flag); return i >= 0 ? args[i + 1] : fallback; };
const date = value('--date', today()), days = resolve(value('--out', join(HERE, 'days')));
const record = join(days, date, 'day.json');
if (process.env.COMPARE_MODELS !== '0' && !args.includes('--dry-run') && existsSync(record)) {
  const day = JSON.parse(readFileSync(record, 'utf8'));
  if (day.provider === 'claude' && day.component && day.artifacts.some((a) => a.row)) {
    try {
      execFileSync(process.execPath, [join(HERE, 'compare.mjs'), '--date', date, '--days', days], { stdio: 'inherit' });
      execFileSync(process.execPath, [join(HERE, 'render-comparison.mjs'), '--date', date, '--days', days], { stdio: 'inherit' });
    } catch (e) { process.exitCode = e.status || 1; }
  }
}
