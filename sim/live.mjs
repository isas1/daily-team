#!/usr/bin/env node
// Live mode: watch a studio day while it runs. Serves the replay viewer on localhost and streams
// new lines of sim.jsonl to it as server-sent events. Local only: it binds to 127.0.0.1.
//
// Usage: node sim/live.mjs [--date YYYY-MM-DD] [--dir days] [--port 4417] [--run [--rounds N]]
//   --run starts the sim itself (node sim/cli.mjs) and writes into --dir.
// Without --run, start the day in another terminal (node run.mjs, or node sim/cli.mjs --out days).
import { spawn } from 'node:child_process';
import { existsSync, openSync, readSync, closeSync, statSync, watch } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTeam, teamFor, today } from '../run.mjs';
import { watchHtml } from '../sim-view.mjs';
import { defaultLook } from './rig.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIVE_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-src 'none'; form-action 'none'";

function opt(argv, name, fallback) { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; }

export function livePage(date, team) {
  const { members, task } = parseTeam(team);
  const cast = members.map((m) => ({ label: m.role, method: m.method, stance: m.stance, temperament: m.temperament, guest: m.guest, historical: m.guest?.kind === 'historical' }));
  const title = `Live: ${task.split(':')[0]}`;
  const data = { date, title, task, members: cast, events: [], look: defaultLook(members, date), artifact: '', lateGuests: [], live: '/events' };
  return watchHtml({ date, concept: title, task }, '', { csp: LIVE_CSP, data });
}

// Reads lines appended to a file since the last read.
export function tail(path) {
  let pos = 0;
  let rest = '';
  return () => {
    if (!existsSync(path)) return [];
    const size = statSync(path).size;
    if (size < pos) { pos = 0; rest = ''; }
    if (size === pos) return [];
    const fd = openSync(path, 'r');
    const buf = Buffer.alloc(size - pos);
    readSync(fd, buf, 0, buf.length, pos);
    closeSync(fd);
    pos = size;
    const text = rest + buf.toString('utf8');
    const lines = text.split('\n');
    rest = lines.pop();
    return lines.filter(Boolean);
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const date = opt(argv, '--date', today());
  const dir = resolve(opt(argv, '--dir', join(HERE, '..', 'days')));
  const port = Number(opt(argv, '--port', 4417));
  const log = join(dir, date, 'sim.jsonl');
  const page = livePage(date, teamFor(date));
  const clients = new Set();
  const read = tail(log);
  const sent = [];
  const pump = () => {
    for (const line of read()) { sent.push(line); for (const res of clients) res.write(`data: ${line}\n\n`); }
  };
  setInterval(pump, 500);
  try { watch(dirname(log), pump); } catch { /* the folder appears once the run starts; polling covers it */ }
  createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      for (const line of sent) res.write(`data: ${line}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    if (req.url === '/' || req.url.startsWith('/?')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': LIVE_CSP });
      res.end(page);
      return;
    }
    res.writeHead(404).end();
  }).listen(port, '127.0.0.1', () => console.log(`live studio for ${date}: http://127.0.0.1:${port}/  (following ${log})`));
  if (argv.includes('--run')) {
    const child = spawn(process.execPath, [join(HERE, 'cli.mjs'), '--date', date, '--out', dir, '--rounds', opt(argv, '--rounds', '12'), '--quiet'], { stdio: 'inherit' });
    child.on('close', (code) => console.log(`sim finished with code ${code}; the page keeps the full day until you stop this server`));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
