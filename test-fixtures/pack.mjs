// Deterministic integration fixture. Handwritten sample, never a live model result.
export function samplePack(count = 6) {
  const roles = [
    ['release-name', 'Release name', 'Inputs', 'Name the release', 'inline text edit', 'Type a name; keyboard typing works', 'Release label updates', 'Replace text or clear and retype'],
    ['package-card', 'Package card', 'Content', 'Choose package contents', 'radio-card selection', 'Choose Starter or Full with pointer or arrow keys', 'Package size changes', 'Choose another package'],
    ['audience-switch', 'Audience switch', 'Inputs', 'Set audience visibility', 'binary native checkbox', 'Toggle Public with pointer or Space', 'Audience changes', 'Toggle back to private'],
    ['size-budget', 'Size budget', 'Data', 'Check package against size budget', 'range threshold meter', 'Adjust budget with pointer or arrow keys', 'Remaining capacity updates', 'Increase budget or choose smaller package'],
    ['review-panel', 'Review panel', 'Feedback', 'Confirm local review', 'disclosure with confirmation', 'Expand with Enter and check review with Space', 'Review marks ready', 'Uncheck review to revise'],
    ['release-action', 'Release action', 'Actions', 'Build local release summary', 'validated commit with reset', 'Press Build release with pointer or Enter', 'Local summary shows current settings', 'Reset clears result and allows another build'],
  ].slice(0, count);
  const components = roles.map(([id, name, category, purpose, mechanism, input, outcome, recovery], i) => ({
    id, name, category, purpose, mechanism, input, outcome, recovery, row: i + 1, file: `artifact-${i + 1}.html`,
    description: `${name} for release preparation`, use: 'Prepare a local sample release', tags: ['release', id],
    nearestAnalogue: 'No recent matching pack in fixture', usefulness: purpose,
    creativeDifference: `Distinct ${mechanism} for this step`, states: ['Normal with sample values', 'Keyboard focus', `Changed: ${outcome}`, `Recovery: ${recovery}`],
    sources: [{ title: `WAI interaction patterns for ${name}`, url: 'https://www.w3.org/WAI/ARIA/apg/patterns/' }],
  }));
  return { schemaVersion: 1, categoryVersion: 1, id: 'release-kit', name: 'Forever release',
    description: 'A coordinated local release preparation pack', project: 'Prepare a release without sending data',
    sizeRationale: `${count} distinct jobs cover the requested sample flow`,
    opportunities: [{ id: 'daily-task', need: 'Prepare release settings', use: 'Local project release', interaction: 'Settings affect package readiness', similarity: 'No recent matching pack in fixture' }],
    selection: { id: 'daily-task', rationale: 'Concrete input, useful result and reversible steps' },
    tokens: { colors: { dark: { bg: '#101215', surface: '#1b1e23', text: '#f6f6f3', muted: '#b0b6bf', accent: '#ee875f', border: '#414751' },
      light: { bg: '#f7f8fa', surface: '#ffffff', text: '#171a1f', muted: '#535b66', accent: '#a73b16', border: '#c5cad1' } },
    typography: { family: 'system-ui, sans-serif', size: '16px' }, spacing: { gap: '16px', padding: '24px' },
    radii: { control: '8px' }, motion: { duration: '180ms', easing: 'ease-out' } },
    components, demo: { file: 'piece.html', rows: components.map((c) => c.row),
      sharedState: 'One release name, package, audience, budget and review state feed one build summary' } };
}

export function samplePlan(count = 6) {
  return `## Pitch\n**Member 1: Release**\nA release kit.\n**Member 2: Preview**\nA preview tool.\n**Member 3: Share**\nA sharing tool.\n**Member 4: Review**\nA review kit.\n\n## Clash\n`
    + ['Member 1', 'Member 2', 'Member 3', 'Member 4', 'Member 1', 'Member 2'].map((r) => `**${r}:** Keep a distinct useful job.`).join('\n')
    + `\n\n## Decision\nThe project prepares a local release and shows its result.\nConcept: Forever release\n\n\`\`\`json\n${JSON.stringify(samplePack(count), null, 2)}\n\`\`\`\n\n## Build notes\nConnect state. Keep labels clear. Check keyboard input.`;
}

export function sampleHtml(row = 0, count = 6) {
  const parts = [
    '<label class="sm-field">Release name<input class="sm-name" maxlength="40" value="Forever kit"></label>',
    '<fieldset class="sm-choice"><legend>Package</legend><label class="sm-card"><input class="sm-starter" type="radio" name="package" value="Starter" checked>Starter · 12 KB</label><label class="sm-card"><input class="sm-full" type="radio" name="package" value="Full">Full · 28 KB</label></fieldset>',
    '<label class="sm-field"><input class="sm-public" type="checkbox"> Public release</label>',
    '<label class="sm-field">Size budget<input class="sm-budget" type="range" min="10" max="40" value="20"></label><output class="sm-capacity" aria-live="polite"></output>',
    '<details class="sm-review"><summary>Review release</summary><label class="sm-field"><input class="sm-reviewed" type="checkbox"> Checked sample content</label></details>',
    '<div class="sm-actions"><button class="sm-build">Build release</button><button class="sm-reset">Reset</button></div><p class="sm-result" role="status"></p>',
  ].slice(0, count);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Forever release sample</title>
<style>
*{box-sizing:border-box}html{background:var(--pack-bg);color:var(--pack-text);font-family:var(--pack-typography-family);font-size:var(--pack-typography-size)}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px}.sm-root{width:min(100%,680px);display:grid;gap:var(--pack-spacing-gap)}.sm-unit{min-width:0;background:var(--pack-surface);border:1px solid var(--pack-border);border-radius:var(--pack-radii-control);padding:var(--pack-spacing-padding)}.sm-field{display:grid;gap:10px}.sm-field:has([type=checkbox]){display:flex;align-items:center}input,button{font:inherit;accent-color:var(--pack-accent)}input:not([type=radio]):not([type=checkbox]):not([type=range]){width:100%;padding:12px;background:var(--pack-bg);color:var(--pack-text);border:1px solid var(--pack-border);border-radius:var(--pack-radii-control)}fieldset{margin:0;border:0;padding:0;display:grid;gap:12px}legend{padding:0;margin-bottom:12px}.sm-card{padding:12px;border:1px solid var(--pack-border);border-radius:var(--pack-radii-control)}.sm-card:has(:checked){border-color:var(--pack-accent)}button{border:1px solid var(--pack-accent);border-radius:var(--pack-radii-control);padding:12px 16px;background:var(--pack-bg);color:var(--pack-text);cursor:pointer;transition:transform var(--pack-motion-duration) var(--pack-motion-easing)}button:active{transform:scale(.98)}.sm-actions{display:flex;gap:12px;flex-wrap:wrap}.sm-result{line-height:1.5;overflow-wrap:anywhere}.sm-capacity{color:var(--pack-muted)}:focus-visible{outline:2px solid var(--pack-accent);outline-offset:4px}summary{cursor:pointer}details[open] summary{margin-bottom:14px}@media(prefers-reduced-motion:reduce){*{transition:none!important}}body.sm-hidden *{transition:none!important}
</style></head><body><main class="sm-root" role="group" aria-label="Release preparation sample">
${row ? `<section class="sm-unit">${parts[row - 1]}</section>` : `<h1 class="sm-title">Forever release</h1>${parts.map((p) => `<section class="sm-unit">${p}</section>`).join('')}`}
</main><script>(function(){
const root=document.documentElement,find=s=>document.querySelector(s),state={name:'Forever kit',package:'Starter',public:false,budget:20,reviewed:false};
const theme=new URLSearchParams(location.search).get('theme');if(theme==='light'||theme==='dark')root.dataset.theme=theme;
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('sm-hidden',document.hidden));
window.addEventListener('message',e=>{if(e.data?.type==='forever:theme'&&['light','dark'].includes(e.data.theme))root.dataset.theme=e.data.theme});
function refresh(){const size=state.package==='Starter'?12:28;const meter=find('.sm-capacity');if(meter)meter.textContent=size+' KB / '+state.budget+' KB · '+(size>state.budget?'Over budget':'Within budget');const result=find('.sm-result');if(result)result.textContent='';}
find('.sm-name')?.addEventListener('input',e=>{state.name=e.target.value;refresh()});
document.querySelectorAll('[name=package]').forEach(el=>el.addEventListener('change',e=>{state.package=e.target.value;refresh()}));
find('.sm-public')?.addEventListener('change',e=>{state.public=e.target.checked;refresh()});
find('.sm-budget')?.addEventListener('input',e=>{state.budget=Number(e.target.value);refresh()});
find('.sm-reviewed')?.addEventListener('change',e=>{state.reviewed=e.target.checked;refresh()});
find('.sm-build')?.addEventListener('click',()=>{const result=find('.sm-result'),size=state.package==='Starter'?12:28;
if(!state.name.trim()){result.textContent='Enter a release name.';return}if(size>state.budget){result.textContent='Increase budget or choose Starter.';return}
${row === 6 ? "state.reviewed=true;" : ''}
if(!state.reviewed){result.textContent='Review sample content first.';return}result.textContent=state.name+' · '+state.package+' · '+(state.public?'Public':'Private')+' · '+size+' KB. Ready locally.';});
find('.sm-reset')?.addEventListener('click',()=>{find('.sm-result').textContent='Reset. Ready for another build.'});refresh();
})();</script></body></html>`;
}
