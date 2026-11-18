// Team records and session rules shared by generation, reports, and pages.
import { execFileSync } from 'node:child_process';
import { markupText } from './security.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Limits on the team's session. Breaking one flags the day for review; it never triggers a retry.
export const CLASH_LINES = [6, 10];
export const CLASH_TURNS = 3;
export const PLAN_WORDS = 1200;

export function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function teamFor(date) {
  return execFileSync('sh', [join(HERE, 'team.sh'), date], { encoding: 'utf8' }).trim();
}

export function parseTeam(text) {
  const clean = (s) => s.replace(/ \[new\]$/, '');
  const members = [...text.matchAll(/^\d\. (.+)\n {3}Method: (.+)\n {3}Stance: (.+)(?:\n {3}Temperament: (.+))?$/gm)]
    .map(([, role, method, stance, temperament]) => {
      let name = clean(role);
      const g = name.endsWith(' [guest]') && name.slice(0, -8).match(/^(.*) \(([a-z]+); (.+)\)$/);
      if (g) name = g[1];
      return {
        role: name, method: clean(method), stance, temperament: temperament ?? '', newRole: role.endsWith(' [new]'), newMethod: method.endsWith(' [new]'),
        guest: g ? { kind: g[2], source: g[3] } : null,
      };
    });
  return {
    members,
    season: text.match(/^Season: (.+)$/m)?.[1] ?? '',
    constraint: text.match(/^Constraint: (.+)$/m)?.[1] ?? '',
    task: text.match(/^Task: (.+)$/m)?.[1] ?? '',
    suggestedBy: text.match(/^Suggested by: (@[\w-]+)$/m)?.[1] ?? '',
  };
}

// The first sentence after the Decision heading, as plain text.
export function decisionLine(plan) {
  const m = plan.match(/^[#*\s\d.]*Decision\b[*:]*\s*\n+([\s\S]*?)(?:\n\s*\n|\n[#*\s\d.]*(?:Build notes|Next steps|Proposals|Objections|Pitch|Clash|Referee|Deadlock)\b|$)/im);
  if (!m) return '';
  const text = markupText(m[1].replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'))
    .replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim();
  const sentence = text.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? text;
  return sentence.length > 240 ? `${sentence.slice(0, 237)}...` : sentence;
}

// The plan's sections, keyed by heading without numbers or markup.
export function planSections(text) {
  const out = {};
  for (const part of `\n${text}`.split(/\n#{1,3} +/).slice(1)) {
    const nl = part.indexOf('\n');
    const head = (nl < 0 ? part : part.slice(0, nl)).replace(/[*:]/g, '').replace(/^\d+\.\s*/, '').trim();
    out[head] = nl < 0 ? '' : part.slice(nl + 1).trim();
  }
  return out;
}

// The concept name from the Decision's "Concept: <name>" line, or '' for older days.
export function conceptName(plan) {
  const name = (planSections(plan).Decision ?? '').match(/^\s*\**Concept:?\**:?\s*(.+)$/m)?.[1] ?? '';
  return name.replace(/[*_`#<>[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

// A day's headline: the team's concept when there is one, else the task name.
export const dayTitle = (day) => day.concept || (day.brief || day.task).split(':')[0].trim();
// The task name alone, for subtitles under a concept headline.
export const taskName = (day) => (day.brief || day.task).split(':')[0].trim();

// Problems with the session's shape and length, recorded but not retried.
export function sessionProblems(text) {
  const parts = planSections(text);
  const problems = [];
  for (const h of ['Pitch', 'Clash']) if (parts[h] === undefined) problems.push(`no ${h} section`);
  if (parts.Decision === undefined && parts.Deadlock === undefined) problems.push('no Decision or Deadlock section');
  const speakers = [...(parts.Clash ?? '').matchAll(/^\s*(?:[-*]\s+)?\*\*([^*\n]+?):?\*\*/gm)].map((m) => m[1].trim());
  const [min, max] = CLASH_LINES;
  if (parts.Clash !== undefined && (speakers.length < min || speakers.length > max)) {
    problems.push(`Clash has ${speakers.length} lines, outside ${min} to ${max}`);
  }
  const turns = {};
  for (const s of speakers) turns[s] = (turns[s] ?? 0) + 1;
  for (const [s, n] of Object.entries(turns)) if (n > CLASH_TURNS) problems.push(`${s} speaks ${n} times in the Clash, more than ${CLASH_TURNS}`);
  // Tables (the component plan's variation table) are not prose, so they do not count.
  const words = text.split('\n').filter((l) => !/^\s*\|/.test(l)).join(' ').split(/\s+/).filter(Boolean).length;
  if (words > PLAN_WORDS) problems.push(`session is ${words} words, more than ${PLAN_WORDS}`);
  return problems;
}

// A deadlocked session gets one referee call. If that call fails or returns no Decision,
// the lead's option stands. Never more than one call.
export async function settle(complete, system, context, rules, plan) {
  const deadlock = planSections(plan).Deadlock ?? '';
  let ruling = '';
  let model = null;
  try {
    const out = await complete([system, { role: 'user', content: `${context}\n\n<deadlock>\n${deadlock}\n</deadlock>\n\n${rules}` }], 2000);
    ruling = out.text.trim();
    model = out.model;
  } catch { /* the lead's option stands */ }
  const parts = planSections(ruling);
  if (parts.Referee !== undefined && parts.Decision) return { text: `${plan}\n\n${ruling}`, ruled: true, model };
  const lead = deadlock.match(/\*\*Option A:?\*\*:?\s*(.+)/)?.[1]?.trim() || 'Option A, the lead\'s option.';
  return {
    text: `${plan}\n\n## Referee\n\nThe referee's ruling could not be read, so the lead's option stands.\n\n## Decision\n\n${lead}`,
    ruled: false, model,
  };
}
