// One writer per day; staged work keeps the published day intact until completion.
import { closeSync, copyFileSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';

export function atomicWrite(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  try { writeFileSync(temp, data); renameSync(temp, file); }
  finally { rmSync(temp, { force: true }); }
}

export function acquireDay(out, date) {
  mkdirSync(out, { recursive: true });
  const lock = join(out, `.${date}.lock`);
  const claim = () => {
    const fd = openSync(lock, 'wx');
    try { writeFileSync(fd, JSON.stringify({ pid: process.pid, host: hostname() })); }
    finally { closeSync(fd); }
  };
  try { claim(); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let owner;
    try { owner = JSON.parse(readFileSync(lock, 'utf8')); } catch { /* incomplete lock */ }
    if (!owner || owner.host !== hostname() || !Number.isInteger(owner.pid) || owner.pid < 1) {
      throw new Error(`${date} lock needs manual review: ${lock}`);
    }
    try { process.kill(owner.pid, 0); throw new Error(`${date} run already active (PID ${owner.pid})`); }
    catch (probe) { if (probe.code !== 'ESRCH') throw probe; }
    rmSync(lock); claim();
  }
  let held = true;
  const release = () => { if (held) { held = false; rmSync(lock, { force: true }); } };
  process.once('exit', release);
  return release;
}

export function recoverDay(out, date) {
  const final = join(out, date), backup = join(out, `.${date}.backup`);
  if (existsSync(backup)) {
    if (!existsSync(final)) renameSync(backup, final);
    else rmSync(backup, { recursive: true, force: true });
  }
}

export function publishDay(out, date) {
  const final = join(out, date), pending = join(out, `.${date}.pending`), backup = join(out, `.${date}.backup`);
  if (existsSync(final)) renameSync(final, backup);
  try { renameSync(pending, final); }
  catch (error) { if (existsSync(backup) && !existsSync(final)) renameSync(backup, final); throw error; }
  rmSync(backup, { recursive: true, force: true });
}

export function seedFailedInput(final, pending) {
  const input = join(final, 'planning-input.json');
  if (existsSync(input)) { mkdirSync(pending, { recursive: true }); copyFileSync(input, join(pending, 'planning-input.json')); }
}
