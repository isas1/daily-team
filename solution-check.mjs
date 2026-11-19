import { hash } from './component-pack.mjs';
import { ARTIFACT_SANDBOX } from './artifact-policy.mjs';

const PHASES = ['primary', 'alternate', 'mistake', 'recovery'];
const TARGET = /^solution-[a-z][a-z0-9-]{0,39}$/;
const ACTIONS = ['fill', 'click', 'select', 'check', 'uncheck'];

export function solutionCaseProblems(cases) {
  if (!Array.isArray(cases) || cases.length !== PHASES.length) return ['provide four browser checkpoints: primary, alternate, mistake, recovery'];
  if (!cases.every((entry, i) => entry?.phase === PHASES[i] && Array.isArray(entry.steps) && entry.steps.length >= 1 && entry.steps.length <= 10
    && entry.steps.every(step => step && typeof step.target === 'string' && TARGET.test(step.target) && ACTIONS.includes(step.action)
      && (['fill', 'select'].includes(step.action) ? typeof step.value === 'string' && step.value.length <= 500 : step.value === undefined))
    && typeof entry.expect?.target === 'string' && TARGET.test(entry.expect.target)
    && typeof entry.expect.text === 'string' && entry.expect.text.trim() && entry.expect.text.length <= 200)) {
    return ['browser checkpoints need ordered phases, 1–10 supported steps and one visible exact text expectation with solution-* IDs'];
  }
  const [primary, alternate, mistake, recovery] = cases;
  if (primary.expect.target !== alternate.expect.target || primary.expect.text.trim() === alternate.expect.text.trim()
    || mistake.expect.text.trim() === recovery.expect.text.trim()
    || JSON.stringify(primary.steps) === JSON.stringify(alternate.steps)) {
    return ['use a different input and result in the same output for the alternate case; error and recovery must show different results'];
  }
  return [];
}

export function solutionBuildSpec(cases) {
  const controls = new Map();
  for (const entry of cases) for (const { action, target } of entry.steps) controls.set(`${action}:${target}`, { action, target });
  return { primary: cases[0], controls: [...controls.values()], outputs: [...new Set(cases.map(c => c.expect.target))] };
}

export function validSolutionReceipt(receipt, cases, artifactHash) {
  return Boolean(receipt) && Array.isArray(cases) && receipt.artifactHash === artifactHash && receipt.casesHash === hash(cases) && Array.isArray(receipt.passed) && receipt.passed.length === PHASES.length
    && PHASES.every((phase, i) => receipt.passed[i] === phase);
}

export async function openSolutionBrowser() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  return chromium.launch({ headless: true, timeout: 30_000, chromiumSandbox: !process.env.CI,
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
}

export async function checkSolution(browser, html, cases) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    const failures = [];
    page.setDefaultTimeout(2200);
    page.on('pageerror', () => failures.push('uncaught JavaScript error'));
    await context.route('**/*', route => {
      failures.push('attempted an external request');
      return route.abort();
    });
    const passed = [];
    const srcdoc = html.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const wrapper = `<style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe sandbox="${ARTIFACT_SANDBOX}" title="Try it" srcdoc="${srcdoc}"></iframe>`;
    const frame = page.frameLocator('iframe');
    for (const entry of cases) {
      if (entry.phase !== 'recovery') {
        await page.goto('about:blank');
        await page.setContent(wrapper);
      }
      try {
        for (const { action, target, value } of entry.steps) {
          const control = frame.locator(`#${target}`);
          if (action === 'fill') await control.fill(value);
          else if (action === 'select') await control.selectOption(value);
          else await control[action]();
        }
        const expected = entry.expect.text.replace(/\s+/g, ' ').trim();
        const literal = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const result = frame.locator(`#${entry.expect.target}`)
          .filter({ hasText: new RegExp(`^\\s*${literal.replaceAll(' ', '\\s+')}\\s*$`) });
        await result.waitFor({ state: 'visible' });
        if ((await result.innerText()).replace(/\s+/g, ' ').trim() !== expected) throw new Error('unexpected output');
      } catch {
        throw new Error(`browser ${entry.phase} failed: ${entry.expect.target} did not show the expected visible result after the saved steps`);
      }
      if (failures.length) throw new Error(`browser ${entry.phase}: ${failures[0]}`);
      passed.push(entry.phase);
    }
    return { artifactHash: hash(html), casesHash: hash(cases), passed };
  } finally {
    await context.close();
  }
}
