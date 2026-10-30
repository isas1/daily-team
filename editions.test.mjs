import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { slot, editionInput, DATES, LANES } from './editions.mjs';
import { packInputProblems, makeManifest } from './component-pack.mjs';
import { feedEvidence, dayReadme, publishEditions } from './publish.mjs';
import { samplePack, samplePlan, sampleHtml } from './test-fixtures/pack.mjs';
const temp = () => mkdtempSync(join(tmpdir(), 'daily-editions-'));

test('experiment has exactly six extra slots; date guard expires and unknown cron never runs', () => {
  for (const date of DATES) for (const cron of ['30 0 * * *', '30 2 * * *', '30 4 * * *']) assert.equal(slot(new Date(`${date}T04:00:00Z`), cron).due, true);
  assert.equal(DATES.length * LANES.length, 6);
  for (const date of ['2026-10-29', '2026-11-01', '2027-10-30']) assert.equal(slot(new Date(`${date}T00:30:00Z`), '30 0 * * *').due, false);
  assert.equal(slot(new Date('2026-10-30T00:30:00Z'), 'unknown').due, false);
});

test('news must choose a feed, cultures differ, popular snapshot names actual observed seeds', async () => {
  const root = temp(); mkdirSync(join(root, 'docs')); cpSync('docs/popular-snapshot-2026-10-30.json', join(root, 'docs/popular-snapshot-2026-10-30.json'));
  try {
    const news = await editionInput(DATES[0], 'news', { root, fetcher: async () => new Response('<rss><channel><item><title>Useful web design tool</title><link>https://example.test/news</link><pubDate>Thu, 29 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>', {headers:{'content-type':'application/rss+xml'}}) });
    assert.equal(news.requiredKind, 'feed'); assert.equal(news.request, null);
    const pack = samplePack(); assert.match(packInputProblems(pack, news).join(), /must select a feed/);
    pack.selection.id = news.candidates.find(c => c.kind === 'feed').id;
    pack.opportunities[0].id = pack.selection.id; assert.deepEqual(packInputProblems(pack, news), []);
    const cultures = await Promise.all(DATES.map(date => editionInput(date, 'culture', { root })));
    assert.match(cultures[0].task, /sashiko/); assert.match(cultures[1].task, /azulejo/);
    const popular = await editionInput(DATES[0], 'popular', { root });
    assert.match(popular.task, /Morphing Action FAB/); assert.equal(popular.edition.popularSnapshot.components[0].displayedScore, 9);
    await assert.rejects(editionInput('2026-11-01', 'news', {root}), /outside/);
    await assert.rejects(editionInput(DATES[1], 'news', {root:join(root,'empty'), offline:true, fetcher:async()=>{throw Error('must not fetch');}}).then(i => { if (!i.candidates.some(c=>c.kind==='feed')) throw Error('no eligible'); }), /no eligible/);
  } finally { rmSync(root, { recursive:true, force:true }); }
});

test('feed receipt separates fetched from used and escapes hostile saved text', () => {
  const root=temp(), date=DATES[0], dir=join(root,date); mkdirSync(dir);
  const input={sources:[{source:'hacker-news',status:'fetched',count:20}],candidates:[{id:'feed-1',title:'<script>alert(1)</script>',url:'https://example.test/article'}]};
  writeFileSync(join(dir,'planning-input.json'),JSON.stringify(input));
  const day={date,task:'Test task',team:'',artifacts:[],status:'failed',planning:{selection:{id:'daily-task',rationale:'Task fits'},selectedSourceIds:[]}};
  assert.match(feedEvidence(day,root).join(), /fetched \(20 items\)/); assert.match(feedEvidence(day,root).join(), /No feed article/);
  day.planning.selectedSourceIds=['feed-1']; assert.match(feedEvidence(day,root).join(), /Used feed inspiration/);
  assert.doesNotMatch(dayReadme(day,root,''), /<script>/);
  rmSync(root,{recursive:true,force:true});
});

test('same pack on same date has distinct lane manifest identities', () => {
  const day={date:DATES[0],pack:samplePack(),artifacts:[],planning:{}};
  const normal=makeManifest(day), news=makeManifest({...day,edition:{lane:'news'}}), culture=makeManifest({...day,edition:{lane:'culture'}});
  assert.notEqual(normal.id, news.id); assert.notEqual(news.components[0].id,culture.components[0].id);
});

test('real runner preserves edition input and publishes separate source and site paths', async () => {
  const root=temp(), date=DATES[0], dir=join(root,'editions','culture','days',date); mkdirSync(dir,{recursive:true});
  const input=await editionInput(date,'culture',{root}); writeFileSync(join(dir,'planning-input.json'),JSON.stringify(input,null,2)+'\n');
  const replies=[samplePlan(),...Array.from({length:6},(_,i)=>'```html\n'+sampleHtml(i+1)+'\n```'),'```html\n'+sampleHtml('demo')+'\n```'];
  const server=createServer(async(req,res)=>{for await(const _ of req){} res.setHeader('content-type','application/json');res.end(JSON.stringify({model:'mock',choices:[{message:{content:replies.shift()}}]}));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try {
    const args=['run.mjs','--provider','openrouter','--pack','--date',date,'--out',join(root,'editions','culture','days'),'--snapshot',join(dir,'planning-input.json')];
    const result=await new Promise(resolve=>{const p=spawn(process.execPath,args,{env:{...process.env,OPENROUTER_API_KEY:'fixture',API_URL:`http://127.0.0.1:${server.address().port}`,COMPONENT_REQUESTS_FILE:'',COMPONENT_SOURCES_FILE:'',COMPONENTS_DIR:''},stdio:['ignore','pipe','pipe']});let output='';p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);p.on('close',code=>resolve({code,output}));});
    assert.equal(result.code,0,result.output);assert.equal(replies.length,0);
    const day=JSON.parse(readFileSync(join(dir,'day.json')));assert.equal(day.edition.lane,'culture');assert.match(day.task,/sashiko/);
    // Avoid rendering during this metadata/export test; browser renders already have coverage.
    writeFileSync(join(dir,'team.png'),'fixture');
    publishEditions(root,{site:join(root,'site'),repo:'isas1/daily-team',pagesUrl:'https://example.test/'});
    const html=readFileSync(join(root,'site','editions','culture',date,'index.html'),'utf8');
    assert.match(html,/tree\/main\/editions\/culture\/days/);assert.match(html,/Feed evidence/);
    assert.match(readFileSync(join(root,'site','editions','index.html'),'utf8'),/1 published \/ 1 recorded/);
    assert.match(readFileSync(join(dir,'README.md'),'utf8'),/Saved planning input/);
  } finally { server.closeAllConnections();await new Promise(r=>server.close(r));rmSync(root,{recursive:true,force:true}); }
});
