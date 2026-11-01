// The studio replay page (watch.html) and the text highlights for the day README.
// The page is one offline file: viewer script, look and log inlined as data, under the site CSP.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultLook, normalizeLook } from './sim/rig.mjs';
import { readLog } from './sim/run-sim.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const WATCH_FILE = 'watch.html';
const MAX_HIGHLIGHTS = 8;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Model text for markdown: no markup, links, images or tables.
export const plain = (s) => String(s ?? '').replace(/\b(?:https?|ftp|file|javascript|data):\S*/gi, '').replace(/www\.\S+/gi, '')
  .replace(/[<>[\]()`*_#|\\!]/g, ' ').replace(/\s+/g, ' ').trim();
// Data inside a script element: nothing can close the element or break the JavaScript.
export const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/>/g, '\\u003e')
  .replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

export const hasSim = (day, dir) => Boolean(day.sim?.log) && existsSync(join(dir, day.sim.log));

export function dayLook(day, dir, members) {
  const p = join(dir, 'look.json');
  if (existsSync(p)) {
    try { return normalizeLook(JSON.parse(readFileSync(p, 'utf8')).look, members, day.date); } catch { /* defaults below */ }
  }
  return defaultLook(members, day.date);
}

// The headline asset the end card can open: the piece, else the first artifact that worked.
function finalArtifact(day, dir) {
  const a = day.artifacts?.find((x) => x.kind === 'piece' && x.status !== 'failed') ?? day.artifacts?.find((x) => x.status !== 'failed');
  return a && existsSync(join(dir, a.file)) ? readFileSync(join(dir, a.file), 'utf8') : '';
}

export function watchData(day, dir, { live = '' } = {}) {
  const log = readLog(join(dir, day.sim.log));
  const members = (log.header?.members ?? []).map((m) => ({
    label: m.label, method: m.method, stance: m.stance, temperament: m.temperament, guest: m.guest, historical: m.historical,
  }));
  return {
    date: day.date, title: day.concept || (day.brief || day.task).split(':')[0], task: day.brief || day.task,
    members, events: log.events, look: dayLook(day, dir, members), artifact: live ? '' : finalArtifact(day, dir),
    lateGuests: (log.header?.events ?? []).filter((e) => e.kind === 'late').map((e) => e.target), live,
  };
}

const STYLE = `
:root{--floor:#f2f2f0;--wall:#e4e4e1;--ink:#121316;--accent:#c43d12;--bg:#f7f7f5;--fg:#121316;--muted:#5d6068;--line:#d6d7da;--panel:#ffffff}
@media (prefers-color-scheme:dark){:root{--bg:#0e0f11;--fg:#f2f2f0;--muted:#a3a6ad;--line:#2b2d32;--panel:#16171a}}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
#studio{max-width:1280px;margin:0 auto;padding:16px;overflow-x:hidden;display:flex;flex-direction:column;gap:12px;min-height:100vh}
.sv-top{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;justify-content:space-between}
.sv-kicker{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.sv-title{margin:2px 0 0;font-size:clamp(22px,4vw,34px);line-height:1.1;letter-spacing:-.01em}
.sv-task{margin:4px 0 0;color:var(--muted);max-width:60ch;font-size:14px}
.sv-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.sv-btn,.sv-select{font:inherit;font-size:14px;min-height:40px;padding:0 14px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--fg);cursor:pointer;text-decoration:none;display:inline-flex;align-items:center}
.sv-play{background:var(--fg);color:var(--bg);border-color:var(--fg);min-width:84px;justify-content:center}
.sv-btn:focus-visible,.sv-select:focus-visible,.sv-toggle input:focus-visible,.sv-scrub:focus-visible,.sv-card:focus-visible,.sv-actor:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.sv-toggle{display:inline-flex;gap:6px;align-items:center;font-size:14px;min-height:40px;cursor:pointer}
.sv-toggle input{width:18px;height:18px;accent-color:var(--accent)}
.sv-main{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:12px;align-items:start}
@media (max-width:900px){.sv-main{grid-template-columns:1fr}}
.sv-stage{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:var(--floor)}
.sv-stage svg{display:block;width:100%;height:auto}
.sv-slabel{font:600 13px system-ui,sans-serif;fill:var(--ink);opacity:.65;letter-spacing:.02em}
.sv-tag{font:700 12px system-ui,sans-serif;fill:#fff}
.sv-name{font:600 12px system-ui,sans-serif;fill:var(--ink);transition:opacity .2s}
.sv-card-t{font:600 10px system-ui,sans-serif;fill:#121316}
.sv-btext{font:500 15px system-ui,sans-serif;fill:#121316}.sv-btext.is-think{font-style:italic;fill:#41444b}
.sv-ctitle{font:700 22px system-ui,sans-serif;fill:var(--floor)}.sv-csub{font:500 15px system-ui,sans-serif;fill:var(--floor);opacity:.85}
.sv-actor{cursor:pointer}
.sv-side{display:flex;flex-direction:column;gap:10px;min-width:0}
.sv-main>*{min-width:0}
.sv-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.sv-card{font:inherit;text-align:left;border:1px solid var(--line);border-left-width:4px;border-radius:10px;background:var(--panel);color:var(--fg);padding:8px 10px;cursor:pointer;min-height:44px}
.sv-card.is-open{grid-column:1/-1}
.sv-card-head{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.sv-card-name{font-weight:650;font-size:13px;overflow-wrap:anywhere;min-width:0}.sv-card-mood{margin-left:auto;font-size:12px;color:var(--muted)}
.sv-energy{display:flex;gap:3px;margin-top:6px}.sv-energy span{width:14px;height:4px;border-radius:2px;background:var(--line)}.sv-energy span.on{background:var(--fg)}
.sv-detail{margin:6px 0 0;font-size:13px;color:var(--muted)}
.sv-chip{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;color:#fff;font-size:11px;font-weight:700;flex:none}
.sv-h2{margin:4px 0 0;font-size:14px;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.sv-feed{list-style:none;margin:0;padding:0;max-height:52vh;overflow:auto;display:flex;flex-direction:column;gap:6px;font-size:14px}
.sv-line{display:block;padding:6px 8px;border-radius:8px;background:var(--panel);border:1px solid var(--line)}
.sv-line .sv-chip{vertical-align:-4px;margin-right:6px}
.sv-line.sv-card,.sv-line.sv-event,.sv-line.sv-result{background:transparent;border-style:dashed;color:var(--muted)}
.sv-line.sv-think{font-style:italic;color:var(--muted)}
.sv-beat{display:block;margin-top:2px;font-size:12px;color:var(--accent);font-style:normal}
.sv-bar{display:flex;gap:12px;align-items:center}
.sv-round{font-size:13px;color:var(--muted);min-width:130px;font-variant-numeric:tabular-nums}
.sv-track{position:relative;flex:1}
.sv-scrub{width:100%;accent-color:var(--accent);min-height:32px}
.sv-marks{position:absolute;left:8px;right:8px;top:0;height:6px;pointer-events:none}
.sv-mark{position:absolute;top:0;width:2px;height:6px;background:var(--accent)}
.sv-end{border:1px solid var(--line);border-radius:12px;background:var(--panel);padding:16px}
.sv-end-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.sv-iv{margin:8px 0 0;padding-left:18px;color:var(--muted)}
.sv-frame{display:block;width:100%;height:70vh;border:1px solid var(--line);border-radius:10px;margin-top:12px;background:#fff}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto}}
`;

export function watchHtml(day, dir, { csp, live = '', data: given } = {}) {
  const data = given ?? watchData(day, dir, { live });
  const viewer = readFileSync(join(HERE, 'sim', 'viewer.js'), 'utf8');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${csp ? `<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">\n` : ''}<title>${esc(`Watch ${day.date}: ${data.title}`)}</title>
<style>${STYLE}</style></head><body>
<div id="studio"></div>
<noscript><p>The studio replay needs JavaScript. The full session is on the <a href="./">day page</a>.</p></noscript>
<script type="application/json" id="sim-data">${scriptJson(data)}</script>
<script>${viewer}</script>
</body></html>
`;
}

// The day's turning points as plain lines, for the README and the day page.
export function highlights(day, dir, max = MAX_HIGHLIGHTS) {
  if (!hasSim(day, dir)) return { beats: [], members: [], interviews: [] };
  const log = readLog(join(dir, day.sim.log));
  const order = { vote: 0, block: 1, trust: 2, event: 3, proposal: 4, keyboard: 5, tired: 6 };
  const beats = log.events.filter((e) => e.type === 'beat');
  const chosen = [...beats].sort((a, b) => (order[a.why] ?? 9) - (order[b.why] ?? 9) || a.seq - b.seq).slice(0, max).sort((a, b) => a.seq - b.seq)
    .map((e) => `Round ${e.r} · ${plain(e.text)}`);
  const end = log.events.find((e) => e.type === 'end');
  const members = (end?.members ?? []).map((m) => {
    const best = Object.entries(m.trust ?? {}).sort((a, b) => b[1] - a[1])[0];
    const worst = Object.entries(m.trust ?? {}).sort((a, b) => a[1] - b[1])[0];
    const t = best && best[1] > 0 ? `trusts ${plain(best[0])} most (+${best[1]})` : worst && worst[1] < 0 ? `trusts ${plain(worst[0])} least (${worst[1]})` : 'trust unchanged';
    return `${plain(m.label)} ends ${plain(m.mood) || 'quiet'}, ${t}`;
  });
  const interviews = log.events.filter((e) => e.type === 'interview').map((e) => `${plain(e.who)}: ${plain(e.day)}`);
  return { beats: chosen, members, interviews };
}
