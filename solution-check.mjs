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

export function validSolutionReceipt(receipt, cases, artifactHash, qualityVersion) {
  return Boolean(receipt) && Array.isArray(cases) && receipt.artifactHash === artifactHash && receipt.casesHash === hash(cases) && Array.isArray(receipt.passed) && receipt.passed.length === PHASES.length
    && PHASES.every((phase, i) => receipt.passed[i] === phase)
    && (qualityVersion !== 1 || (receipt.quality?.phoneFit === true && receipt.quality?.keyboardReplay === true));
}

export async function openSolutionBrowser() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
  return chromium.launch({ headless: true, timeout: 30_000, chromiumSandbox: !process.env.CI,
    ...(process.env.CHROME ? { executablePath: process.env.CHROME } : {}) });
}

const clean = text => (text || '').replace(/\s+/g, ' ').trim();

async function checkCheckpoint(frame, entry, keyboard) {
  try {
    // The builder never sees the planner's error wording, so a mistake passes on any new visible message.
    const loose = entry.phase === 'mistake';
    const before = loose ? clean(await frame.locator(`#${entry.expect.target}`).evaluate(el => el.textContent).catch(() => '')) : '';
    for (const { action, target, value } of entry.steps) {
      const control = frame.locator(`#${target}`);
      if (keyboard) {
        await control.focus();
        if (!(await control.evaluate(el => el.tabIndex >= 0 && el === el.ownerDocument.activeElement))) {
          throw new Error(`${target} cannot take keyboard focus`);
        }
      }
      if (action === 'fill') await control.fill(value);
      else if (action === 'select') await control.selectOption(value);
      else if (keyboard) {
        if (action !== 'click') {
          if (await control.isChecked() !== (action === 'check')) await control.press('Space');
          if (await control.isChecked() !== (action === 'check')) throw new Error(`${target} did not change with Space`);
        } else {
          const key = await control.evaluate(el => el.matches('input[type="checkbox"], input[type="radio"]') ? 'Space' : 'Enter');
          await control.press(key);
        }
      } else await control[action]();
    }
    if (loose) {
      const shown = frame.locator(`#${entry.expect.target}`).filter({ hasText: /\S/ });
      await shown.waitFor({ state: 'visible' });
      const text = clean(await shown.innerText());
      if (!text || text === before) throw new Error('unexpected output');
      return;
    }
    const expected = clean(entry.expect.text);
    const literal = expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const result = frame.locator(`#${entry.expect.target}`)
      .filter({ hasText: new RegExp(`^\\s*${literal.replaceAll(' ', '\\s+')}\\s*$`) });
    await result.waitFor({ state: 'visible' });
    if (clean(await result.innerText()) !== expected) throw new Error('unexpected output');
  } catch (error) {
    const reason = error.message.match(/^solution-[\w-]+ (?:cannot take keyboard focus|did not change with Space)$/)?.[0];
    throw new Error(`browser ${keyboard ? 'keyboard ' : ''}${entry.phase} failed: ${reason || `${entry.expect.target} did not show the expected visible result after the saved steps`}`);
  }
}

async function checkJourney(context, wrapper, entries, { phoneFit, keyboard }) {
  const page = await context.newPage();
  const failures = [];
  page.setDefaultTimeout(2200);
  page.on('pageerror', () => failures.push('uncaught JavaScript error'));
  if (keyboard) await page.setViewportSize({ width: 1024, height: 768 });
  await page.setContent(wrapper);
  const frame = page.frameLocator('iframe');
  const fits = () => frame.locator('html').evaluate(root => root.scrollWidth <= root.clientWidth + 1);
  if (phoneFit && !await fits()) throw new Error(`browser ${entries[0].phase} failed: page overflows the phone width before input`);
  for (const entry of entries) {
    await checkCheckpoint(frame, entry, keyboard);
    if (phoneFit && !await fits()) throw new Error(`browser ${entry.phase} failed: page overflows the phone width after input`);
    if (failures.length) throw new Error(`browser ${entry.phase}: ${failures[0]}`);
  }
}

export async function checkSolution(browser, html, cases, qualityVersion) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce', serviceWorkers: 'block' });
  try {
    let attemptedRequest = false;
    await context.route('**/*', route => {
      attemptedRequest = true;
      return route.abort();
    });
    const srcdoc = html.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const wrapper = `<style>body{margin:0}iframe{border:0;width:100%;height:100vh}</style><iframe sandbox="${ARTIFACT_SANDBOX}" title="Try it" srcdoc="${srcdoc}"></iframe>`;
    const [primary, alternate, mistake, recovery] = cases;
    const phoneFit = qualityVersion === 1;
    const journeys = [[primary], [alternate], [mistake, recovery]]
      .map(entries => checkJourney(context, wrapper, entries, { phoneFit, keyboard: false }));
    if (phoneFit) journeys.push(checkJourney(context, wrapper, [alternate], { phoneFit: false, keyboard: true }));
    const results = await Promise.allSettled(journeys);
    const failure = results.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    if (attemptedRequest) throw new Error('browser attempted an external request');
    return { artifactHash: hash(html), casesHash: hash(cases), passed: [...PHASES],
      ...(phoneFit ? { quality: { phoneFit: true, keyboardReplay: true } } : {}) };
  } finally {
    await context.close();
  }
}
