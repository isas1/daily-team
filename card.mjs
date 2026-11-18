#!/usr/bin/env node
// Branded images in the Sam Creates design system: the daily team card (1200 x 630) and the
// repository social preview (1280 x 640). Built as HTML with the brand fonts and red arrow,
// then rendered to PNG with headless Chrome, so the fonts show everywhere the image does.
//
// Usage: node card.mjs --social [out.png]     writes brand/social-preview.png
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dayTitle, parseTeam, taskName } from './team-session.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAND = pathToFileURL(join(HERE, 'brand')).href;
const SMALL = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'in', 'of', 'on', 'or', 'per', 'the', 'to', 'with']);

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Brand headlines use Title Case.
export const titleCase = (s) => s.split(' ')
  .map((w, i) => (i > 0 && SMALL.has(w.toLowerCase()) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

const BASE_CSS = `
@import url("${BRAND}/tokens.css");
html, body { margin: 0; }
body { font-family: var(--font-body); color: var(--text-body); }
.canvas { position: relative; overflow: hidden; box-sizing: border-box; background: var(--sc-canvas); }
.kicker { font-family: var(--font-headline); font-weight: 600; letter-spacing: var(--tracking-caps); text-transform: uppercase; color: var(--text-accent); }
h1 { font-family: var(--font-headline); font-weight: 700; font-stretch: var(--stretch-condensed); line-height: var(--leading-display);
  letter-spacing: -0.01em; color: var(--text-heading); margin: 0; }
.sub { font-family: var(--font-headline); font-weight: 700; color: var(--text-accent); margin: 0; }
.arrow { position: absolute; }
`;

export function cardHtml(day, seasonNumber = 0) {
  const { members, constraint, suggestedBy } = parseTeam(day.team);
  const title = titleCase(dayTitle(day));
  const kicker = [`Daily team`, day.date, seasonNumber ? `Season ${seasonNumber}` : ''].filter(Boolean).join(' · ');
  const cards = members.map((m, i) => {
    const pill = [m.guest ? m.guest.kind : '', m.newRole || m.newMethod ? 'new' : ''].filter(Boolean).join(' · ');
    return `
    <div class="member${m.guest ? ' guest' : ''}">
      <div class="num">${i + 1}</div>${pill ? `\n      <div class="new">${esc(pill.toUpperCase())}</div>` : ''}
      <div class="role">${esc(m.role)}</div>${m.guest ? `\n      <div class="source">${esc(m.guest.source)}</div>` : ''}
      <div class="method${m.temperament ? ' short' : ''}">${esc(m.method)}</div>${m.temperament ? `\n      <div class="temper">${esc(m.temperament.replace(/\.$/, ''))}</div>` : ''}
      <div class="stance">${esc(m.stance.replace(/\.$/, ''))}</div>
    </div>`;
  }).join('');
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${BASE_CSS}
.canvas { width: 1200px; height: 630px; padding: 44px 56px; }
.kicker { font-size: 16px; }
h1 { font-size: 80px; max-width: 840px; margin-top: 10px; }
.sub { font-size: 28px; margin-top: 6px; }
.arrow { right: 96px; top: 150px; width: 220px; transform: rotate(-4deg); }
.team { position: absolute; left: 56px; right: 56px; bottom: 72px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
.member { position: relative; height: 236px; box-sizing: border-box; padding: 16px 18px; display: flex; flex-direction: column;
  background: var(--sc-white); border: 1px solid var(--border-line); border-radius: var(--radius-md); box-shadow: var(--shadow-card); }
.num { width: 28px; height: 28px; border-radius: var(--radius-pill); background: var(--sc-navy); color: var(--sc-white);
  font: 700 15px var(--font-headline); display: grid; place-items: center; }
.new { position: absolute; top: 18px; right: 16px; padding: 4px 10px; border-radius: var(--radius-pill); background: var(--sc-red);
  color: var(--sc-white); font: 700 12.5px var(--font-headline); letter-spacing: var(--tracking-caps); }
.role { font-family: var(--font-headline); font-weight: 700; font-stretch: 85%; font-size: 27px; line-height: 1.05; margin: 10px 0 6px; }
.guest { border: 2px solid var(--sc-navy); }
.source { margin: -4px 0 6px; font-size: 13px; color: var(--text-support); }
.method { flex: 1; font-size: 15px; line-height: 1.4; color: var(--text-muted); overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; }
.method.short { -webkit-line-clamp: 2; }
.temper { margin-top: 6px; font-size: 13.5px; line-height: 1.3; font-style: italic; color: var(--sc-olive); overflow: hidden;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.stance { align-self: flex-start; margin-top: 8px; padding: 4px 8px; border-radius: var(--radius-xs); background: var(--sc-red-100);
  color: var(--sc-red-600); font: 600 13px var(--font-body); }
.foot { position: absolute; left: 56px; right: 56px; bottom: 32px; display: flex; justify-content: space-between; gap: 24px;
  font-size: 16px; color: var(--text-support); white-space: nowrap; }
.foot span:first-child { overflow: hidden; text-overflow: ellipsis; }
.brand { font-family: var(--font-headline); font-weight: 700; letter-spacing: var(--tracking-caps); font-size: 14px; color: var(--sc-navy); }
</style></head>
<body><div class="canvas">
  <div class="kicker">${esc(kicker)}</div>
  <h1>${esc(title)}</h1>
  <p class="sub">(${esc(day.concept ? taskName(day) : 'a new team every day')})</p>
  <img class="arrow" src="${BRAND}/arrow-red.png" alt="">
  <div class="team">${cards}
  </div>
  <div class="foot"><span>Constraint: ${esc(constraint)}</span><span>${suggestedBy ? `Task suggested by ${esc(suggestedBy)} · ` : ''}<span class="brand">SAM CREATES</span></span></div>
</div></body></html>
`;
}

export function socialHtml(roles) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${BASE_CSS}
.canvas { width: 1280px; height: 640px; padding: 64px 72px; }
.kicker { font-size: 18px; }
h1 { font-size: 132px; max-width: 900px; margin-top: 14px; }
.sub { font-size: 40px; margin-top: 14px; }
.arrow { right: 110px; top: 300px; width: 260px; transform: rotate(-4deg); }
.roles { position: absolute; left: 72px; right: 72px; bottom: 64px; display: flex; gap: 12px; flex-wrap: wrap; }
.roles span { padding: 10px 16px; border: 1px solid var(--border-line); border-radius: var(--radius-sm); background: var(--sc-white);
  box-shadow: var(--shadow-card); font: 700 24px var(--font-headline); font-stretch: 85%; }
</style></head>
<body><div class="canvas">
  <div class="kicker">Sam Creates · Open source</div>
  <h1>A New Creative Team Every Day</h1>
  <p class="sub">(and the web tool it built)</p>
  <img class="arrow" src="${BRAND}/arrow-red.png" alt="">
  <div class="roles">${roles.map((r) => `<span>${esc(r)}</span>`).join('')}</div>
</div></body></html>
`;
}

export function findChrome() {
  const candidates = [process.env.CHROME, 'google-chrome', 'chromium', 'chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].filter(Boolean);
  return candidates.find((c) => spawnSync('sh', ['-c', `command -v "${c}"`]).status === 0) ?? null;
}

// Renders HTML to a PNG of the given size. Returns false when Chrome is not installed.
export function renderPng(html, out, width, height) {
  const chrome = findChrome();
  if (!chrome) return false;
  const dir = mkdtempSync(join(tmpdir(), 'daily-team-card-'));
  try {
    const page = join(dir, 'card.html');
    writeFileSync(page, html);
    spawnSync(chrome, ['--headless=new', ...(process.env.CI ? ['--no-sandbox'] : []), '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
      `--window-size=${width},${height}`, '--virtual-time-budget=3000', '--blink-settings=preferredColorScheme=1',
      `--screenshot=${out}`, pathToFileURL(page).href], { stdio: 'ignore', timeout: 60_000 });
    return existsSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args[0] !== '--social') {
    console.error('usage: node card.mjs --social [out.png]');
    process.exit(2);
  }
  const out = args[1] || join(HERE, 'brand', 'social-preview.png');
  const roles = ['Typographer', 'Chef', 'Cartographer', 'Puppeteer', 'Glassblower', 'Urban planner', 'Composer'];
  if (!renderPng(socialHtml(roles), out, 1280, 640)) {
    console.error('card.mjs: Chrome not found; set CHROME');
    process.exit(2);
  }
  console.log(out);
}
