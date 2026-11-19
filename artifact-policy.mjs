// Offline artifact validation, CSP, and verified vendor embedding.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { markupText } from './security.mjs';
import { findBanned } from './prompt-rules.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';

const HERE = dirname(fileURLToPath(import.meta.url));

const MAX_BYTES = 100 * 1024;
// Studio tier: a trial of richer pages. The model may ask for vendored libraries and fonts by
// name; artifact-policy.mjs inlines them after the checks, so the page stays one offline file under the
// same CSP. It runs only on these dates (or with STUDIO=1), so the next season is unchanged.
export const STUDIO_DAYS = ['2026-10-17', '2026-10-18'];
const STUDIO_MAX_BYTES = 300 * 1024;
// Component days: from this season on, tasks feed the Forever Components library.
// Historical days plan ten variations; new packs use distinct component jobs under the
// owner's component rules (prompt.md "Build a component") and the checks in componentProblems.
export const COMPONENTS_FROM = '2026-10-19';
const COMPONENT_MAX_BYTES = 16 * 1024;
const COMPONENT_MAX_WORDS = 80;
// Component/pack limit remains ten; new packs default to six distinct tiles plus a demo.
export const MAX_ARTIFACTS = 10;
export const ARTIFACT_SANDBOX = 'allow-scripts allow-modals allow-downloads allow-popups allow-forms';
const PIECE_MAX_BYTES = 120 * 1024;
export const PIECE_FILE = 'piece.html';
// Members take turns to lead the rows: 1-4, 1-4, 1, 2.
export const rowLead = (n) => ((n - 1) % 4) + 1;
// The placeholder colours in prompt.md's component skeleton.
const SKELETON_COLOURS = ['#15130F', '#E9E2D0', '#C8402F', '#EFE8D8', '#1E1B16', '#7A2E22'];
const STUDIO_MAX_TOTAL = 1536 * 1024;
const LIB_TAG = /<script\b[^>]*\bdata-lib\s*=\s*["']?([\w-]+)["']?[^>]*>\s*<\/script>/gi;
const FONT_TAG = /<style\b[^>]*\bdata-font\s*=\s*["']?([\w-]+)["']?[^>]*>\s*<\/style>/gi;
const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; "
  + "img-src data: blob:; media-src data: blob:; font-src data:; form-action 'none'";

export function extractHtml(text) {
  const fenced = text.match(/```html[^\n]*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const start = text.search(/<!doctype html|<html/i);
  const end = text.toLowerCase().lastIndexOf('</html>');
  return start >= 0 && end > start ? text.slice(start, end + 7).trim() : null;
}

// Problems that block an artifact from being marked ready.
export function isComponentDay(date, brief = '') {
  return !brief && date >= COMPONENTS_FROM;
}

// The owner's craft floor for a component tile. Each line names one fix.
export function componentProblems(html) {
  const problems = [];
  const bytes = Buffer.byteLength(html);
  if (bytes > COMPONENT_MAX_BYTES) problems.push(`larger than 16 KB (${Math.ceil(bytes / 1024)} KB)`);
  if (!/<html\b[^>]*\blang\s*=\s*["']?en/i.test(html)) problems.push('no lang="en" on the html element');
  if (!/<[a-z]+\b(?=[^>]*\brole\s*=)(?=[^>]*\baria-label\s*=)[^>]*>/i.test(html)) problems.push('no element with both a role and an aria-label');
  if (!/matchMedia\(\s*['"]\(prefers-reduced-motion/.test(html)) problems.push('does not read prefers-reduced-motion with matchMedia');
  if (!/visibilitychange/.test(html)) problems.push('does not stop when the tab is hidden');
  if (!/:focus-visible/.test(html)) problems.push('no :focus-visible outline');
  if (!/forever:theme/.test(html)) problems.push('does not answer the forever:theme message');
  if (/\.innerHTML\s*\+?=/.test(html)) problems.push('assigns innerHTML');
  const kept = SKELETON_COLOURS.filter((c) => new RegExp(c, 'i').test(html));
  if (kept.length) problems.push(`keeps the skeleton's placeholder colours (${kept.join(', ')}); give this variation its own palette`);
  const names = [];
  for (const [, v] of html.matchAll(/\bclass\s*=\s*["']([^"']+)["']/gi)) names.push(...v.split(/\s+/).filter(Boolean));
  for (const [, v] of html.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) names.push(v);
  let stem = names[0] || '';
  for (const n of names) while (!n.startsWith(stem)) stem = stem.slice(0, -1);
  if (names.length > 1 && stem.length < 2) problems.push('class and id names do not share one short prefix such as "ab1-"');
  const words = markupText(html, true)
    .replace(/&[a-z#0-9]+;/gi, ' ').split(/\s+/).filter((w) => /[a-z]{2}/i.test(w));
  if (words.length > COMPONENT_MAX_WORDS) problems.push(`shows ${words.length} words in the markup; keep visible text to what is needed to use it`);
  return problems;
}

export function isStudio(date) {
  return STUDIO_DAYS.includes(date) || process.env.STUDIO === '1';
}

export function vendorManifest() {
  return JSON.parse(readFileSync(join(HERE, 'vendor', 'manifest.json'), 'utf8'));
}

// Source-only gate. Compile classic scripts without running generated code.
export function projectScriptProblem(html) {
  let found = false;
  for (const [, attrs, code] of html.matchAll(/<!--[\s\S]*?-->|<script(?=[\t\n\f\r />])([^>]*)>([\s\S]*?)<\/script(?=[\t\n\f\r />])[^>]*>/gi)) {
    if (!code?.trim() || /(?:^|\s)src\s*=/i.test(attrs)) continue;
    const [, doubleQuoted, singleQuoted, unquoted] = attrs.match(/(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i) || [];
    const type = (doubleQuoted ?? singleQuoted ?? unquoted ?? '').trim().toLowerCase();
    if (type && type !== 'module' && !/^(?:text|application)\/(?:java|ecma)script$/.test(type)) continue;
    found = true;
    if (type === 'module') continue;
    try { new Script(code); }
    catch (error) { return `project script has a syntax error: ${error.message}`; }
  }
  return found ? null : 'project needs inline JavaScript for its working interaction';
}

export function checkArtifact(html, mode = 'page') {
  const problems = [];
  if (mode === 'component') problems.push(...componentProblems(html));
  else if (mode === 'piece') {
    if (Buffer.byteLength(html) > PIECE_MAX_BYTES) problems.push('larger than 120 KB');
    if (!/matchMedia\(\s*['"]\(prefers-reduced-motion/.test(html)) problems.push('does not read prefers-reduced-motion with matchMedia');
    if (!/visibilitychange/.test(html)) problems.push('does not stop when the tab is hidden');
    if (/\.innerHTML\s*\+?=/.test(html)) problems.push('assigns innerHTML');
  }
  else if (mode === 'studio') {
    if (Buffer.byteLength(html) > STUDIO_MAX_BYTES) problems.push('larger than 300 KB before libraries are added');
    const { libs, fonts } = vendorManifest();
    for (const [, name] of html.matchAll(LIB_TAG)) if (!libs[name]) problems.push(`asks for unknown library "${name}"`);
    for (const [, name] of html.matchAll(FONT_TAG)) if (!fonts[name]) problems.push(`asks for unknown font "${name}"`);
  } else if (Buffer.byteLength(html) > MAX_BYTES) problems.push('larger than 100 KB');
  if (!/<title>[^<]*\S[^<]*<\/title>/i.test(html)) problems.push('no title element');
  if (!/<meta[^>]+name=["']?viewport/i.test(html)) problems.push('no viewport meta tag');
  if (/<(script|img|iframe|link|source|video|audio|embed|object)\b[^>]*\b(src|href)\s*=\s*["']?(https?:)?\/\//i.test(html)
    || /url\(\s*["']?(https?:)?\/\//i.test(html) || /@import/i.test(html)) problems.push('loads an external resource');
  if (/<form\b[^>]*\baction\s*=\s*["']?(https?:)?\/\//i.test(html)) problems.push('sends a form to another site');
  if (/\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|sendBeacon|new\s+EventSource/.test(html)) problems.push('makes network calls');
  const text = markupText(html);
  for (const w of findBanned(text)) problems.push(`uses the word "${w}"`);
  return problems;
}

// Replaces each library and font tag with the vendored file, after checking its hash.
// Runs after checkArtifact, so library code is never scanned as if the model wrote it.
export function inlineVendor(html) {
  const { libs, fonts } = vendorManifest();
  const read = (o) => {
    const buf = readFileSync(join(HERE, 'vendor', o.file));
    if (createHash('sha256').update(buf).digest('hex') !== o.sha256) throw new Error(`vendor/${o.file} does not match its hash`);
    return buf;
  };
  // A placeholder keeps text on either side from forming a new HTML tag.
  const skipped = '<!-- Vendor request skipped -->';
  const used = new Set();
  const out = html
    .replace(LIB_TAG, (m, name) => {
      const lib = libs[name];
      if (!lib || used.has(`lib:${name}`)) return skipped;
      used.add(`lib:${name}`);
      return `<script>/* ${lib.version}, ${lib.license} */\n${read(lib).toString('utf8')}\n</script>`;
    })
    .replace(FONT_TAG, (m, name) => {
      const f = fonts[name];
      if (!f || used.has(`font:${name}`)) return skipped;
      used.add(`font:${name}`);
      return `<style>/* ${f.version}, ${f.license} */ @font-face{font-family:"${f.family}";font-weight:${f.weight};`
        + `font-display:block;src:url(data:font/woff2;base64,${read(f).toString('base64')}) format("woff2")}</style>`;
    });
  if (Buffer.byteLength(out) > STUDIO_MAX_TOTAL) throw new Error('larger than 1.5 MB with libraries added');
  return out;
}

// Blocks all network requests from the artifact.
export function addCsp(html) {
  const meta = `<meta http-equiv="Content-Security-Policy" content="${CSP}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}\n${meta}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}\n<head>${meta}</head>`);
  return `${meta}\n${html}`;
}
