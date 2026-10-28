#!/usr/bin/env node
// Record at real speed, trim setup frames, and join equal-length rows into a square MP4.
// npm install --no-save playwright@1.63.0 && npx playwright install chromium
// node render-comparison.mjs --date 2026-10-21
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
async function main() {
  const args = process.argv.slice(2), opts = { days: join(HERE, 'days'), size: 1080 };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--allow-incomplete') opts.allowIncomplete = true;
    else if (['--date', '--days', '--size'].includes(a) && args[i + 1]) opts[a.slice(2)] = args[++i];
    else throw new Error(`unknown or incomplete argument ${a}`);
  }
  const date = opts.date || readdirSync(opts.days).filter((f) => /^\d{4}-\d{2}-\d{2}$/.test(f)).sort().at(-1);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('date must be YYYY-MM-DD');
  const dir = resolve(opts.days, date);
  const record = JSON.parse(readFileSync(join(dir, 'comparison.json'), 'utf8'));
  if (record.status !== 'ok' && !opts.allowIncomplete) throw new Error('comparison incomplete; finish model generation before recording');
  const size = Number(opts.size);
  if (!Number.isInteger(size) || size < 360 || size > 2160 || size % 2) throw new Error('size must be an even integer between 360 and 2160');
  if (record.seconds < 3 || record.seconds > 5) throw new Error('segment duration must be 3 to 5 seconds');
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  execFileSync(process.env.FFMPEG || 'ffmpeg', ['-version'], { stdio: 'ignore' });
  const scratch = mkdtempSync(join(tmpdir(), 'daily-team-video-'));
  const browser = await chromium.launch({ headless: true,
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
  const qa = { sourceHash: createHash('sha256').update(readFileSync(join(dir, 'comparison.html'))).digest('hex'),
    width: size, height: size, secondsPerRow: record.seconds, rows: [], errors: [] };
  try {
    for (let i = 0; i < record.rows.length; i++) {
      const context = await browser.newContext({ viewport: { width: size, height: size },
        deviceScaleFactor: 1, reducedMotion: 'no-preference', recordVideo: { dir: scratch, size: { width: size, height: size } } });
      try {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        // All media lives in srcdoc. Refuse outbound connections during recording.
        await context.route(/^https?:/, (route) => route.abort());
        await page.goto(`${pathToFileURL(join(dir, 'comparison.html')).href}?capture&row=${i + 1}`);
        await page.waitForFunction(() => window.comparisonState?.ready, null, { timeout: 20000 });
        await page.evaluate(() => document.fonts.ready);
        const quadrants = await page.locator('.cmp-cell').evaluateAll((cells) => cells.map((e) => {
          const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
        }));
        if (quadrants.length !== 4 || quadrants.some((r) => r.width !== size / 2 || r.height !== size / 2)) {
          throw new Error('quadrants are not four equal squares');
        }
        const before = {};
        for (const m of record.models) before[m.key] = createHash('sha256')
          .update(await page.locator(`#cmp-slot-${m.key}`).screenshot()).digest('hex');
        await page.evaluate(() => window.startComparisonDemo());
        await page.waitForFunction(() => Object.values(window.comparisonState.phases)
          .some((s) => s.phase === 'settle' || s.phase === 'done'), null,
        { timeout: (record.seconds + 3) * 1000 });
        const visualChanged = {};
        for (const m of record.models) {
          const after = createHash('sha256').update(await page.locator(`#cmp-slot-${m.key}`).screenshot()).digest('hex');
          visualChanged[m.key] = before[m.key] !== after;
          if (record.rows[i].variants[m.key]?.status === 'ok' && !visualChanged[m.key]) errors.push(`${m.key}: demo produced no visible change`);
        }
        await page.waitForFunction(() => window.comparisonState.finished, null, { timeout: (record.seconds + 5) * 1000 });
        const state = await page.evaluate(() => window.comparisonState);
        errors.push(...state.errors);
        for (const m of record.models) if (record.rows[i].variants[m.key]?.status === 'ok' && state.phases[m.key]?.phase !== 'done') {
          errors.push(`${m.key}: demo did not finish`);
        }
        if (i === 0) await page.screenshot({ path: join(dir, 'comparison.png') });
        const video = page.video();
        await context.close();
        const raw = await video.path(), segment = join(scratch, `row-${i}.mp4`);
        // The final N seconds contain the demo. Only setup time is removed; never use setpts.
        execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-sseof', `-${record.seconds}`,
          '-i', raw, '-t', String(record.seconds), '-an', '-r', '30', '-c:v', 'libx264', '-preset', 'fast',
          '-crf', '18', '-pix_fmt', 'yuv420p', segment], { stdio: 'pipe' });
        qa.rows.push({ row: record.rows[i].row, name: record.rows[i].name, quadrants,
          phases: state.phases, history: state.history, visualChanged, errors });
        qa.errors.push(...errors.map((e) => `row ${i + 1}: ${e}`));
        console.log(`recorded row ${i + 1}/${record.rows.length}, ${record.seconds}s${errors.length ? `, ${errors.length} errors` : ''}`);
      } finally { await context.close(); }
    }
    const list = join(scratch, 'segments.txt');
    writeFileSync(list, record.rows.map((_, i) => `file 'row-${i}.mp4'`).join('\n'));
    const out = join(dir, opts.allowIncomplete && record.status !== 'ok' ? 'comparison-preview.mp4' : 'comparison.mp4');
    execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list,
      '-c', 'copy', '-movflags', '+faststart', out], { stdio: 'pipe' });
    qa.video = out.split('/').at(-1);
    qa.duration = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out], { encoding: 'utf8' }).trim());
    if (Math.abs(qa.duration - record.rows.length * record.seconds) > .15) qa.errors.push('video duration differs from planned duration');
    if (qa.errors.length && !opts.allowIncomplete) {
      rmSync(out, { force: true });
      qa.video = null;
    }
    writeFileSync(join(dir, 'comparison-qa.json'), `${JSON.stringify(qa, null, 2)}\n`);
    console.log(`${out}: ${qa.width}×${qa.height}, ${qa.duration}s, ${qa.errors.length} errors`);
    if (qa.errors.length) process.exitCode = 3;
  } finally { await browser.close(); rmSync(scratch, { recursive: true, force: true }); }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exitCode = 1; });
