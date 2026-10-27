#!/usr/bin/env node
// A separate, resumable team commission. Never regenerates the day or its artifacts.
import { createHash } from 'node:crypto';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCsp, completeChecked, dayTitle, extractHtml, prepareProvider, sections, today } from './run.mjs';
import { renderPng } from './card.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const coverHash = (day) => createHash('sha256').update(JSON.stringify(day)).digest('hex');

export function hasCover(day, daysDir) {
  const dir = join(daysDir, day.date);
  try {
    const record = JSON.parse(readFileSync(join(dir, 'cover.json'), 'utf8'));
    const png = readFileSync(join(dir, 'cover.png'));
    return record.status === 'ok' && record.sourceHash === coverHash(day)
      && png.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      && png.length > 8000 && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630;
  } catch { return false; }
}

export function coverMessages(day) {
  return [
    { role: 'system', content: sections()['Writing rules'] },
    { role: 'user', content: `<team>\n${day.team}\n</team>\n<task>\n${day.brief || day.task}\n</task>\n<plan>\n${day.plan}\n</plan>\n\n${sections()['Design the cover']}\n\nExact title: ${dayTitle(day)}\nExact date: ${day.date}` },
  ];
}

export function coverProblems(text) {
  const html = extractHtml(text);
  if (!html) return ['no HTML code block'];
  const faults = [];
  if (Buffer.byteLength(html) > 100 * 1024) faults.push('cover exceeds 100 KB');
  if (!/<title>[^<]+<\/title>/i.test(html)) faults.push('missing title');
  if (!/1200px/.test(html) || !/630px/.test(html)) faults.push('canvas must be 1200px by 630px');
  if (/<(?:script|iframe|object|embed|link|foreignObject)\b|\bon\w+\s*=|@import\b|(?:https?:|file:)\/\/|(?:href|src)\s*=\s*["'](?!data:|#)/i.test(html)) faults.push('cover must be static and offline');
  if (/<meta\b[^>]*http-equiv\s*=\s*["']?refresh\b/i.test(html)) faults.push('cover must not navigate');
  if (/url\(\s*["']?(?!data:|#)[^\s)]/i.test(html)) faults.push('use only inline imagery');
  if (!/^## Cover direction\s*\n/im.test(text)) faults.push('missing Cover direction with member contributions');
  return faults;
}

function embedFonts(html) {
  const fonts = [['Cover Headline', 'MozillaHeadline-Variable.ttf'], ['Cover Text', 'MozillaText-Variable.ttf']]
    .map(([family, file]) => `@font-face{font-family:"${family}";src:url(data:font/ttf;base64,${readFileSync(join(HERE, 'brand/fonts', file)).toString('base64')}) format("truetype");font-weight:200 700;}`)
    .join('');
  return html.replace(/<head[^>]*>/i, (head) => `${head}<style>${fonts}</style>`);
}

export async function generateCover(day, daysDir, { complete, render = renderPng, force = false } = {}) {
  const dir = join(daysDir, day.date);
  if (!day.plan || !day.artifacts.some((a) => a.status !== 'failed')) return { status: 'skipped' };
  if (!force && hasCover(day, daysDir)) return { status: 'cached' };
  const out = await completeChecked(complete, coverMessages(day), 12000, coverProblems);
  if (out.problems.length) throw new Error(out.problems.join('; '));
  const html = addCsp(embedFonts(extractHtml(out.text)));
  const temp = join(dir, 'cover.pending.png');
  try {
    rmSync(temp, { force: true });
    if (!render(html, temp, 1200, 630)) throw new Error('cover render failed; set CHROME');
    const png = readFileSync(temp);
    if (png.length < 8000 || png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) throw new Error('cover render blank or wrong size');
    writeFileSync(join(dir, 'cover.html'), html);
    renameSync(temp, join(dir, 'cover.png'));
    const record = { status: 'ok', sourceHash: coverHash(day), model: out.model,
      direction: out.text.split(/```html/i)[0].trim(), width: 1200, height: 630 };
    writeFileSync(join(dir, 'cover.json'), `${JSON.stringify(record, null, 2)}\n`);
    return record;
  } finally { rmSync(temp, { force: true }); }
}

async function main() {
  const args = process.argv.slice(2);
  const value = (flag, fallback) => { const i = args.indexOf(flag); return i < 0 ? fallback : args[i + 1]; };
  const date = value('--date', today());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid --date');
  const daysDir = resolve(value('--out', join(HERE, 'days')));
  const day = JSON.parse(readFileSync(join(daysDir, date, 'day.json'), 'utf8'));
  if (day.date !== date) throw new Error('record date differs from directory');
  if (args.includes('--dry-run')) { console.log(JSON.stringify(coverMessages(day), null, 2)); return; }
  // Cached covers require no credentials or model calls.
  const result = await generateCover(day, daysDir, {
    complete: (...params) => prepareProvider(value('--provider', process.env.PROVIDER || day.provider))(...params),
    force: args.includes('--force'),
  });
  console.log(`${date} cover: ${result.status}`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(`cover.mjs: ${error.message}`); process.exitCode = 1; });
