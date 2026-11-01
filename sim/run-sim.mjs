// Runs one studio day: rounds of four member calls in parallel, applied in member order, with
// every event appended to days/<date>/sim.jsonl as it happens (so live mode can follow it).
// Also the after-day calls: interviews, draft reviews, and season memory.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { applyTurn, createWorld, endRound, perceive, snapshot, startRound } from './world.mjs';
import { takeTurn, who, parseTurn } from './agent.mjs';

export const DEFAULT_SIM_MODEL = 'claude-haiku-5-5';
export const SIM_DAYS = [];
export const LOG_VERSION = 1;
export const MEMORY_KEEP = 5;

export const isSimDay = (date, env = process.env) => env.SIM === '1'
  || SIM_DAYS.includes(date) || String(env.SIM_DAYS ?? '').split(',').map((s) => s.trim()).includes(date);

export class BudgetError extends Error {
  constructor(spent, cap) { super(`sim spent $${spent.toFixed(2)}, over the $${cap} cap`); this.budget = true; }
}

// A complete() bound to one model, with a running cost total and a hard cap.
export function meteredAsk(complete, model, maxUsd = Infinity) {
  const meter = { costUsd: 0, calls: 0, models: new Set() };
  const ask = async (messages, maxTokens) => {
    if (meter.costUsd > maxUsd) throw new BudgetError(meter.costUsd, maxUsd);
    meter.calls++;
    const out = await complete(messages, maxTokens, model);
    meter.costUsd += Number(out.costUsd) || 0;
    if (out.model) meter.models.add(out.model);
    return out;
  };
  return { ask, meter };
}

async function inParallel(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const worker = async () => { while (next < items.length) { const i = next++; results[i] = await fn(items[i], i); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}

export function logWriter(path) {
  if (path) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, ''); }
  const events = [];
  return {
    events,
    write(e) { events.push(e); if (path) appendFileSync(path, `${JSON.stringify(e)}\n`); },
  };
}

export async function runSim({ ask, date, members, task, constraint, rounds, concurrency = 4, sections, findBanned, logPath, memory, onEvent }) {
  const world = createWorld({ date, members, task, constraint, rounds, memory });
  const log = logWriter(logPath);
  const emit = (e) => { const ev = { r: world.round, phase: world.phase, seq: world.seq++, ...e }; log.write(ev); onEvent?.(ev); return ev; };
  log.write({ v: LOG_VERSION, type: 'header', date, task, constraint, rounds, events: world.events, ...snapshot(world) });
  let idle = 0;
  for (let r = 1; r <= world.rounds; r++) {
    const opening = startRound(world);
    for (const e of opening) emit(e);
    const active = world.members.filter((m) => m.present);
    const views = active.map((m) => perceive(world, m));
    const answers = await inParallel(active, concurrency, (m, i) => takeTurn(ask, m, views[i], sections, findBanned));
    const roundEvents = [];
    active.forEach((m, i) => {
      const a = answers[i];
      if (a.idle) { idle++; m.idle++; roundEvents.push(emit({ type: 'idle', who: m.label, text: a.problems.join('; ').slice(0, 200) })); return; }
      for (const e of applyTurn(world, m, a.turn)) roundEvents.push(emit(e));
    });
    for (const e of endRound(world, roundEvents)) emit(e);
  }
  emit({ type: 'end', ...snapshot(world) });
  return { world, events: log.events, idle, log };
}

// One short interview per member after the day. A failed answer is skipped.
export async function interviews({ ask, world, sections, findBanned, emit, concurrency = 4 }) {
  const record = log(world, emit);
  const answers = await inParallel(world.members, concurrency, async (m) => {
    const messages = [
      { role: 'system', content: `${sections['Studio interview'].replaceAll('{{WHO}}', who(m))}\n\nWriting rules:\n\n${sections['Writing rules']}` },
      { role: 'user', content: `Your notes from today: ${m.notes.join(' / ') || 'none'}\nYour trust now: ${Object.entries(m.trust).map(([k, v]) => `${k} ${v}`).join('; ')}\nThe vote chose: ${world.result ? `${world.result.concept} by ${world.result.by}` : 'nothing'}\n\nReturn one JSON object only.` },
    ];
    try {
      const out = await ask(messages, 500);
      const a = parseTurn(out.text);
      const text = [a.day, a.lost, a.trust].join('\n');
      if (!a.day || findBanned(text).length || /!|\p{Extended_Pictographic}/u.test(text)) return null;
      return { day: String(a.day), lost: String(a.lost ?? ''), trust: String(a.trust ?? '') };
    } catch (e) {
      if (e.budget) throw e;
      return null;
    }
  });
  world.members.forEach((m, i) => { if (answers[i]) record({ type: 'interview', who: m.label, ...answers[i] }); });
  return answers;
}

// Each non-lead member gives the lead one change for the draft. Returns the changes.
export async function reviewDraft({ ask, world, html, problems, sections, findBanned, emit, concurrency = 3 }) {
  const record = log(world, emit);
  const lead = world.members[0];
  record({ type: 'phase', text: 'Review. The lead shows a draft. Each member asks for one change.' });
  record({ type: 'build', who: lead.label, text: 'The lead shows the draft.', draft: 'draft-1.html' });
  const others = world.members.slice(1);
  const answers = await inParallel(others, concurrency, async (m) => {
    const messages = [
      { role: 'system', content: `${sections['Studio review'].replaceAll('{{WHO}}', who(m))}\n\nWriting rules:\n\n${sections['Writing rules']}` },
      { role: 'user', content: `The decision: ${world.result ? world.result.concept : 'the team plan'}\nWhat you pushed for: ${m.stance}\nCheck results: ${problems.length ? problems.join('; ') : 'all checks pass'}\nStart of the draft source:\n${html.slice(0, 3000)}\n\nReturn one JSON object only.` },
    ];
    try {
      const a = parseTurn((await ask(messages, 400)).text);
      const text = `${a.say ?? ''}\n${a.change ?? ''}`;
      if (!a.change || findBanned(text).length || /!|\p{Extended_Pictographic}/u.test(text)) return null;
      return { say: String(a.say ?? ''), change: String(a.change) };
    } catch (e) {
      if (e.budget) throw e;
      return null;
    }
  });
  const changes = [];
  others.forEach((m, i) => {
    if (!answers[i]) return;
    record({ type: 'say', who: m.label, to: lead.label, station: 'workbench', text: answers[i].say || answers[i].change, act: 'review' });
    record({ type: 'review', who: m.label, change: answers[i].change });
    changes.push(`${m.label}: ${answers[i].change}`);
  });
  return changes;
}

// Appends after-day events to an existing log, numbering on from its last event.
function log(world, emit) {
  return (e) => emit({ r: world.rounds, phase: e.type === 'interview' ? 'interview' : 'review', seq: world.seq++, ...e });
}

export function appendTo(path, events) {
  return (e) => { events.push(e); if (path) appendFileSync(path, `${JSON.stringify(e)}\n`); return e; };
}

export function readLog(path) {
  if (!existsSync(path)) return null;
  const lines = readFileSync(path, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { header: lines[0]?.type === 'header' ? lines[0] : null, events: lines.filter((e) => e.type !== 'header') };
}

// Season memory: each role keeps its last notes across days of one season.
export const memoryPath = (daysDir, season) => join(daysDir, '_studio', `memory-${season || 'none'}.json`);

export function readMemory(daysDir, season) {
  const p = memoryPath(daysDir, season);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}

export function writeMemory(daysDir, season, date, world) {
  const p = memoryPath(daysDir, season);
  const mem = readMemory(daysDir, season);
  for (const m of world.members) {
    const note = m.notes.at(-1);
    if (!note) continue;
    mem[m.label] = [...(mem[m.label] ?? []).filter((x) => x.date !== date), { date, note }].slice(-MEMORY_KEEP);
  }
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(mem, null, 2)}\n`);
  return mem;
}
