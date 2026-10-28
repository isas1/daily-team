import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoBootstrap } from './comparison-demo.mjs';
const HERE = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const json = (x) => JSON.stringify(x).replace(/</g, '\\u003c');

export function comparisonHtml(record, dir) {
  const data = { ...record, rows: record.rows.map((r) => ({ ...r,
    variants: Object.fromEntries(record.models.map((m) => {
      const v = r.variants[m.key];
      const available = v && ['ok', 'needs review'].includes(v.status) && existsSync(join(dir, v.file));
      let html = available ? readFileSync(join(dir, v.file), 'utf8') : '';
      if (html) html = html.replace(/<head\b[^>]*>/i, (head) => `${head}<script>(${demoBootstrap.toString()})()<\/script>`);
      return [m.key, { ...v, html }];
    })),
  })) };
  const font = readFileSync(join(HERE, 'brand/fonts/MozillaHeadline-Variable.ttf')).toString('base64');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self' about:; font-src data:; img-src data:; form-action 'none'">
<title>${esc(record.date)} · ${esc(record.title || 'Three models, one task')}</title>
<style>
@font-face{font-family:Mozilla;src:url(data:font/ttf;base64,${font})}*{box-sizing:border-box}
:root{color-scheme:light;--ink:#0e2a47;--accent:#a53f3f;--paper:#fdfdfb;--line:#dce2e9}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Mozilla,system-ui,sans-serif}
::selection{background:var(--ink);color:white}button,select{font:inherit;color:inherit;accent-color:var(--accent)}
button:focus-visible,select:focus-visible{outline:3px solid var(--accent);outline-offset:3px}
.cmp-stage{container-type:inline-size;width:min(100vw,calc(100dvh - 76px));aspect-ratio:1;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr));margin:auto;outline:1px solid var(--line)}
.cmp-cell{min-width:0;min-height:0;overflow:hidden;position:relative;border:1px solid var(--line)}
.cmp-hook{background:var(--ink);color:white;display:flex;flex-direction:column;justify-content:space-between;padding:6cqw}
h1{font-size:6.6cqw;line-height:1.02;letter-spacing:-.025em;margin:0;font-weight:700;max-width:8ch;text-wrap:balance}
.cmp-detail{font-size:clamp(10px,1.7cqw,18px);line-height:1.5;color:#d0dce9;margin:0;white-space:pre-line}
.cmp-model{display:flex;flex-direction:column;background:#fff}
.cmp-title{height:6cqw;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 2.5cqw;background:var(--paper);font-size:clamp(12px,2.6cqw,28px);font-weight:650;margin:0;border-bottom:1px solid var(--line)}
.cmp-version{font-size:1.25cqw;font-weight:400;color:#4a5d72}.cmp-slot{position:relative;flex:1;min-height:0}
iframe{width:100%;height:100%;border:0;display:block;transform-origin:top left}.cmp-empty{position:absolute;inset:0;display:grid;place-content:center;padding:24px;font-size:2cqw;text-align:center;color:#4a5d72}
.cmp-tools{display:flex;align-items:center;justify-content:center;gap:12px;min-height:76px;padding:12px;flex-wrap:wrap}
button,select{border:1px solid var(--line);background:white;min-height:44px;padding:8px 14px;border-radius:6px;font-size:14px}
button{cursor:pointer}button:hover{background:#e7ebf0}button:disabled{opacity:.45;cursor:default}.cmp-tools label{font-size:14px}
.cmp-sources{display:flex;justify-content:center;gap:16px;padding:0 16px 16px;flex-wrap:wrap;font-size:14px}.cmp-sources a{color:var(--ink)}
body[data-capture] .cmp-stage{width:100vw}body[data-capture] .cmp-tools,body[data-capture] .cmp-sources{display:none}
@media(max-width:480px){.cmp-stage{width:100vw}.cmp-tools{gap:8px}.cmp-version{display:none}}
</style></head><body>
<main class="cmp-stage" aria-label="${esc(record.stageLabel || 'Three model comparison in four equal quadrants')}">
<section class="cmp-cell cmp-hook"><h1 id="cmp-hook">${esc(record.hook)}</h1><p class="cmp-detail" id="cmp-detail"></p></section>
${record.models.map((m) => `<section class="cmp-cell cmp-model"><h2 class="cmp-title"><span id="cmp-label-${m.key}">${esc(m.label)}</span><span class="cmp-version" id="cmp-version-${m.key}"></span></h2><div class="cmp-slot" id="cmp-slot-${m.key}"></div></section>`).join('')}
</main><nav class="cmp-tools" aria-label="Comparison playback"><label for="cmp-row">Component</label><select id="cmp-row"></select><button id="cmp-play">Play all</button><button id="cmp-replay">Replay row</button></nav>
${record.standaloneLinks ? `<nav class="cmp-sources" aria-label="Play components independently">${record.models.map((m) => `<a id="cmp-source-${m.key}" target="_blank" rel="noopener"></a>`).join('')}</nav>` : ''}
<script>const comparisonData=${json(data)};(${viewer.toString()})(comparisonData);</script></body></html>\n`;
}

function viewer(data) {
  const q = (id) => document.getElementById(id);
  let index = 0, playing = false, timer = 0, token = 0;
  const frames = new Map();
  const observers = [];
  const params = new URLSearchParams(location.search);
  if (params.has('capture')) document.body.dataset.capture = 'true';
  window.comparisonState = { index: 0, ready: false, phases: {}, history: {}, errors: [], finished: false };
  for (const row of data.rows) { const o = document.createElement('option'); o.value = row.row;
    o.textContent = `${row.row}. ${row.name}`; q('cmp-row').append(o); }
  async function load(n, autoplay) {
    clearTimeout(timer);
    const ownToken = ++token;
    index = (n + data.rows.length) % data.rows.length;
    const row = data.rows[index];
    window.comparisonState = { index, ready: false, phases: {}, history: {}, errors: [], finished: false };
    q('cmp-row').value = row.row;
    q('cmp-hook').textContent = row.hook || data.hook;
    q('cmp-detail').textContent = `${row.name}\n${index + 1} / ${data.rows.length} · ${data.seconds} seconds · 1×`;
    frames.clear();
    observers.splice(0).forEach((o) => o.disconnect());
    await Promise.all(data.models.map((m) => new Promise((resolve) => {
      const slot = q(`cmp-slot-${m.key}`), v = row.variants[m.key];
      slot.replaceChildren();
      q(`cmp-label-${m.key}`).textContent = v?.label || m.label;
      q(`cmp-version-${m.key}`).textContent = v?.modelLabel || v?.model?.replace('claude-', '') || m.model.replace('claude-', '');
      const sourceLink = q(`cmp-source-${m.key}`);
      if (sourceLink) { sourceLink.href = v.file; sourceLink.textContent = `Open ${v.label || m.label}`; }
      if (!v?.html) { const p = document.createElement('p'); p.className = 'cmp-empty';
        p.textContent = v?.status === 'failed' ? 'Generation failed' : 'Not generated'; slot.append(p); resolve(); return; }
      const frame = document.createElement('iframe'); frame.sandbox = 'allow-scripts';
      frame.title = `${v.label || m.label} · ${row.name}`;
      frame.addEventListener('load', () => resolve(), { once: true });
      frame.srcdoc = v.html; slot.append(frame); frames.set(m.key, frame);
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        const scale = Math.min(1, Math.min(width, height) / 180);
        if (!scale) return;
        frame.style.width = `${width / scale}px`; frame.style.height = `${height / scale}px`;
        frame.style.transform = `scale(${scale})`;
      });
      observer.observe(slot); observers.push(observer);
    })));
    if (ownToken !== token) return;
    window.comparisonState.ready = true;
    if (autoplay) run();
  }
  function run() {
    clearTimeout(timer);
    const row = data.rows[index];
    for (const [key, frame] of frames) frame.contentWindow.postMessage({ type: 'comparison:demo', play: true,
      input: row.variants[key]?.input || row.input, seconds: data.seconds }, '*');
    timer = setTimeout(() => {
      window.comparisonState.finished = true;
      if (playing && index + 1 < data.rows.length) load(index + 1, true);
      else if (playing) { playing = false; q('cmp-play').textContent = 'Play all'; }
    }, data.seconds * 1000);
  }
  window.startComparisonDemo = run;
  window.addEventListener('message', (e) => {
    if (e.data?.type !== 'comparison:state') return;
    const model = [...frames].find(([, frame]) => frame.contentWindow === e.source)?.[0];
    if (!model) return;
    window.comparisonState.phases[model] = e.data;
    (window.comparisonState.history[model] ||= []).push(e.data);
    if (e.data.error) window.comparisonState.errors.push(`${model}: ${e.data.error}`);
  });
  q('cmp-row').addEventListener('change', () => { playing = false; q('cmp-play').textContent = 'Play all';
    load(data.rows.findIndex((r) => String(r.row) === q('cmp-row').value), true); });
  q('cmp-replay').addEventListener('click', () => load(index, true));
  q('cmp-play').addEventListener('click', () => {
    playing = !playing; q('cmp-play').textContent = playing ? 'Pause' : 'Play all';
    if (playing) load(0, true);
    else { clearTimeout(timer); for (const f of frames.values()) f.contentWindow.postMessage({ type: 'comparison:demo', play: false }, '*'); }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) {
    clearTimeout(timer); playing = false; q('cmp-play').textContent = 'Play all';
    for (const f of frames.values()) f.contentWindow.postMessage({ type: 'comparison:demo', play: false }, '*');
  } });
  load(Math.max(0, Number(params.get('row') || 1) - 1), params.has('autoplay'));
}
