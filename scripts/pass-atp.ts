/**
 * The acceptance test for one item's pass (docs/method/pass.md): an ATP the
 * editor works through at review, filled in as far as the machine can fill it.
 *
 *   npm run atp -- i07          writes docs/passes/i07-atp.html
 *
 * Part A is automatic: every check that can be computed from the incident file
 * and the validator. Part B is the editor's gate: the checks only a person can
 * make, laid out with the material to make them - quote links flagged for the
 * spot-check, the overviews rendered, the photos, the open calls. The verdict
 * is the editor's; this page only prepares it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Incident } from '../data/schema/index.ts';
import { stageOf, reached } from '../lib/stage.ts';
import { plainText } from '../lib/annotation.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const id = process.argv[2];
if (!id || !/^i\d{2,}$/.test(id)) { console.error('\n  usage: npm run atp -- i07\n'); process.exit(2); }

const raw = JSON.parse(readFileSync(join(ROOT, 'data/live/incidents', `${id}.json`), 'utf8'));
const inc = Incident.parse(raw);
const taxonomy = JSON.parse(readFileSync(join(ROOT, 'data/taxonomy.json'), 'utf8'));
const stageName = (n: number) => taxonomy.stages.find((s: { n: number }) => s.n === n)?.he ?? String(n);
const published: string[] = JSON.parse(readFileSync(join(ROOT, 'data/live/published.json'), 'utf8'));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A reading render of the annotation: enough to review, not the site's renderer. */
function review(src: string): string {
  return src.split(/\n{2,}/).map((para) => {
    const lines = para.split('\n').map((l) => {
      let h = esc(l);
      h = h.replace(/\[\[([\s\S]*?)\]\]\(([^)]*)\)/g, (_m, t, ids) => `${t}<sup class="chip">${ids.replace(/\s/g, '')}</sup>`);
      h = h.replace(/==([^=]+)==/g, '<mark>$1</mark>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      if (/^#{1,6}\s/.test(l)) return `<h4>${h.replace(/^#{1,6}\s*/, '')}</h4>`;
      if (/^\s*[-*]\s/.test(l)) return `<li>${h.replace(/^\s*[-*]\s*/, '')}</li>`;
      return `<p>${h}</p>`;
    });
    const out = lines.join('');
    return out.includes('<li>') ? `<ul>${out}</ul>` : out;
  }).join('');
}

// ---------- Part A: automatic ----------
type Check = { id: string; what: string; ok: boolean | null; detail: string };
const A: Check[] = [];
const add = (what: string, ok: boolean | null, detail: string) => A.push({ id: `A${A.length + 1}`, what, ok, detail });

const v = spawnSync('node', ['--experimental-strip-types', 'scripts/validate.ts', '--pool=live', '--strict'], { cwd: ROOT, encoding: 'utf8' });
const mine = (v.stdout + v.stderr).split('\n').filter((l) => l.includes(`incidents/${id}.json`));
const vErr = mine.filter((l) => l.includes('FAIL'));
add('validate:strict: no errors on this item', vErr.length === 0, vErr.length ? vErr.map((l) => l.trim()).join(' · ') : `clean${mine.length ? ` (${mine.length} warning${mine.length > 1 ? 's' : ''}: ${mine.map((l) => l.replace(/.*json:?\s*/, '')).join('; ')})` : ''}`);

const p = inc.pass;
add('A pass block is present (§1.7)', !!p, p ? `dated ${p.date}` : 'missing — nothing below it can pass');

const after = stageOf(inc);
add('Stage before → after recorded (§1.5)', !!p, p ? `${p.stage_before ?? 'new'} → ${after} (${stageName(after)})${p.stage_before != null && p.stage_before !== after ? ' · moved' : ' · held'}` : '—');

add('Responsible body named, institutions only (§1.1)', !!p && p.responsible.length > 0, p ? p.responsible.join(' · ') : '—');

const origins = p?.stage1_origins ?? [];
add('Stage 1 rests on two independent origins, or says why not (§1.2)', origins.length >= 2 ? true : null, origins.length ? `${origins.length}: ${origins.join(' · ')}` : 'none logged');

const searches = p?.searches ?? [];
add('Stages 2–6 each searched once, with where / date / outcome (§1.3)', [2, 3, 4, 5, 6].every((s) => searches.filter((x) => x.stage === s).length === 1),
  searches.map((s) => `${s.stage}: ${s.outcome}`).join(' · ') || '—');

const GROUPS: Record<string, RegExp> = {
  traditional: /ynet|n12|mako|כאן|kan\b|הארץ|haaretz|מעריב|maariv|וואלה|walla|כלכליסט|calcalist|גלובס|globes|ישראל היום|israel hayom|times of israel|ערוץ 13|channel 13/i,
  'outside the consensus': /ערוץ 14|channel 14|מקור ראשון|makor|ערוץ 7|inn\.co\.il|זמן ישראל|zman|שומרים|shomrim|העין השביעית|seventh eye|שיחה מקומית|local call/i,
  independent: /אבו עלי|abu ali|עמרם|amram|טלגרם|telegram/i,
};
const everywhere = [...searches.flatMap((s) => s.where), ...(p?.counter.where ?? []), ...inc.claims.map((c) => c.source)].join(' | ');
const missingGroups = Object.entries(GROUPS).filter(([, re]) => !re.test(everywhere)).map(([g]) => g);
add('All three outlet groups searched (§2.3)', missingGroups.length === 0, missingGroups.length ? `missing: ${missingGroups.join(', ')}` : 'traditional · outside the consensus · independent');

add('Counter-evidence searched and logged (§1.4)', !!p, p ? `${p.counter.outcome}${p.counter.claims.length ? ` → ${p.counter.claims.join(', ')}` : ''}` : '—');

const noUrl = inc.claims.filter((c) => !c.url);
add('Every claim has a URL', noUrl.length === 0, noUrl.length ? noUrl.map((c) => c.id).join(', ') : `${inc.claims.length} claims`);

const long = inc.claims.filter((c) => (c.quote ?? '').trim().split(/\s+/).length > 40);
add('Quotes ≤ 40 words (§2.4)', long.length === 0, long.length ? long.map((c) => c.id).join(', ') : 'all within');

const reachedStages = reached(inc);
const written = new Set<number>((inc.summaries ?? []).map((s) => s.stage));
const unwritten = reachedStages.filter((s) => !written.has(s));
add('An overview for every reached stage (§1.6)', unwritten.length === 0, unwritten.length ? `missing: ${unwritten.join(', ')}` : `stages ${reachedStages.join(', ')} written`);

const hl = (t: string) => (t.match(/==[^=]+==/g) ?? []).length;
const heads = (t: string) => (t.match(/^#{1,6}\s/gm) ?? []).length;
const shape: string[] = [];
if (hl(inc.summary) !== 1) shape.push(`summary has ${hl(inc.summary)} highlights`);
if (heads(inc.summary) < 1 || heads(inc.summary) > 2) shape.push(`summary has ${heads(inc.summary)} headings`);
for (const s of inc.summaries ?? []) if (hl(s.text) !== 1) shape.push(`stage ${s.stage} has ${hl(s.text)} highlights`);
add('Overview shape: one highlight each, 1–2 headings in the summary (§5)', shape.length === 0, shape.length ? shape.join(' · ') : 'conforms');

add('poll and card_line present (§1.8)', !!inc.poll && !!inc.card_line, `${inc.poll ? 'poll ✓' : 'poll ✗'} · ${inc.card_line ? 'card_line ✓' : 'card_line ✗'}`);

const crops = (['portrait', 'landscape'] as const).map((k) => {
  const c = inc.photo?.[k];
  return { k, c, onDisk: !!c && existsSync(join(ROOT, 'public/photos', c.file)) };
});
add('Both photo crops with full credit, files on disk (§1.9, §6)', crops.every((x) => x.c && x.onDisk),
  crops.map((x) => `${x.k}: ${x.c ? (x.onDisk ? x.c.file : `${x.c.file} NOT ON DISK`) : 'none'}`).join(' · '));

add('Published', published.includes(id), published.includes(id) ? 'in published.json' : 'not in published.json');

// ---------- Part B: the editor's gate ----------
const stageSetting = new Set(inc.claims.filter((c) => c.asserts_stage === after).map((c) => c.id));
const contestIds = new Set(inc.claims.filter((c) => c.contests).map((c) => c.id));
const unreachable = new Set(p?.unreachable ?? []);
const pick = inc.claims.filter((c) => !stageSetting.has(c.id) && !contestIds.has(c.id) && c.asserts_stage !== 0);
const extra = new Set(pick.length ? [pick[0].id, pick[Math.floor(pick.length / 2)].id] : []);

const claimRows = inc.claims.map((c) => {
  const flag = stageSetting.has(c.id) ? '<span class="tag must">spot-check · sets the stage</span>'
    : contestIds.has(c.id) ? '<span class="tag must">spot-check · contest</span>'
    : unreachable.has(c.url ?? '') ? '<span class="tag must">open · unreachable here</span>'
    : extra.has(c.id) ? '<span class="tag some">spot-check</span>' : '';
  return `<tr><td class="mono">${c.id}</td><td>${c.asserts_stage === 0 ? `contests ${c.contests}` : c.asserts_stage}</td><td>${esc(c.source_type)}</td>
  <td dir="rtl">${esc(c.source)}<div class="sub">${esc(c.date)}${c.place ? ` · ${esc(c.place)}` : ''}</div></td>
  <td dir="rtl" class="q">${esc(c.quote ?? '')}</td><td><a href="${esc(c.url ?? '#')}" target="_blank" rel="noopener">open</a></td><td>${flag}</td><td><input type="checkbox"></td></tr>`;
}).join('');

const overviews = [
  { label: 'summary · slide 2 (systemic)', text: inc.summary },
  ...(inc.summaries ?? []).slice().sort((a, b) => a.stage - b.stage).map((s) => ({ label: `stage ${s.stage} · ${stageName(s.stage)}`, text: s.text })),
].map((o) => `<div class="ov"><div class="ovh">${esc(o.label)}</div><div dir="rtl">${review(o.text)}</div></div>`).join('');

const photos = crops.map((x) => x.c ? `<figure><img src="../../public/photos/${esc(x.c.file)}" alt=""><figcaption><b>${x.k}</b><br><span dir="rtl">צילום: ${esc(x.c.photographer)} · ${esc(x.c.source)} · ${esc(x.c.licence)}</span><br><span class="sub">${esc(x.c.place)} · ${esc(x.c.year)}</span></figcaption></figure>` : `<figure class="none"><figcaption><b>${x.k}</b><br>none</figcaption></figure>`).join('');

const searchRows = [...searches.map((s) => ({ label: `stage ${s.stage}`, ...s })), ...(p ? [{ label: 'counter', ...p.counter }] : [])]
  .map((s) => `<tr><td>${s.label}</td><td>${s.outcome}</td><td class="mono">${s.claims.join(', ')}</td><td dir="auto">${s.where.map(esc).join(' · ')}</td><td>${esc(s.note ?? '')}</td></tr>`).join('');

const autoPass = A.filter((c) => c.ok === true).length;
const autoFail = A.filter((c) => c.ok === false).length;
const tag = (ok: boolean | null) => ok === true ? '<span class="tag P">PASS</span>' : ok === false ? '<span class="tag F">FAIL</span>' : '<span class="tag O">CHECK</span>';

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${id} · pass ATP</title>
<style>
:root{--bg:#0f1115;--panel:#171a21;--line:#2a2f3a;--ink:#e6e8ec;--dim:#9aa3b2;--pass:#3fb67f;--fail:#e5534b;--open:#d4a72c;--accent:#7aa2f7}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:1180px;margin:0 auto;padding:28px 16px 64px}h1{font-size:22px;margin:0 0 4px}h2{font-size:17px;margin:34px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
h4{margin:10px 0 4px;font-size:14px;color:var(--dim)}.sub{color:var(--dim);font-size:12.5px}.mono{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;white-space:nowrap}
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.kpi{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 14px}.kpi b{font-size:20px;display:block}.kpi span{color:var(--dim);font-size:12px}
table{width:100%;border-collapse:collapse;font-size:13.5px;background:var(--panel);border:1px solid var(--line)}th,td{text-align:left;vertical-align:top;padding:8px 9px;border-bottom:1px solid var(--line)}
th{color:var(--dim);font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;background:#141720}td[dir=rtl]{text-align:right}.q{max-width:360px}
.wrap{overflow-x:auto}.tag{display:inline-block;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;color:#0f1115;white-space:nowrap}
.P{background:var(--pass)}.F{background:var(--fail)}.O,.must{background:var(--open)}.some{background:#8b95a7}
.ov{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:10px 0}.ovh{color:var(--dim);font-size:12px;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.ov p{margin:6px 0}.ov ul{margin:6px 0;padding-right:20px}mark{background:#5a4a12;color:#ffe9a8;padding:0 2px}.chip{color:var(--accent);font-size:10px;margin-inline-start:3px}
.photos{display:flex;gap:16px;flex-wrap:wrap}figure{margin:0;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px;max-width:420px}figure img{max-height:360px;max-width:100%;display:block;margin-bottom:8px}
.gate li{margin:8px 0}.gate input{margin-inline-end:8px}a{color:var(--accent)}
</style></head><body><main>
<h1>${id} · pass acceptance (ATP / ATR)</h1>
<div dir="rtl" style="font-size:17px;margin:6px 0">${esc(inc.he)}</div>
<div class="sub">generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC by <code>npm run atp -- ${id}</code> · criteria: docs/method/pass.md v2${p?.issue ? ` · <a href="${esc(p.issue)}">issue</a>` : ''}</div>
<div class="kpis">
 <div class="kpi"><b>${p?.stage_before ?? '—'} → ${after}</b><span>stage before → after</span></div>
 <div class="kpi"><b style="color:var(--pass)">${autoPass}</b><span>automatic pass</span></div>
 <div class="kpi"><b style="color:var(--fail)">${autoFail}</b><span>automatic fail</span></div>
 <div class="kpi"><b>${inc.claims.length}</b><span>claims</span></div>
</div>

<h2>Part A · automatic checks</h2>
<div class="wrap"><table><tr><th>#</th><th>Check</th><th>Result</th><th>Verdict</th></tr>
${A.map((c) => `<tr><td>${c.id}</td><td>${esc(c.what)}</td><td>${esc(c.detail)}</td><td>${tag(c.ok)}</td></tr>`).join('')}
</table></div>

<h2>Part B · editor's gate</h2>
<ol class="gate">
 <li><label><input type="checkbox">B1 · <b>Quote spot-check (§4):</b> open the flagged links below. Every "sets the stage" and contest row, plus the two picked at random. The quote must be on the page, word for word.</label></li>
 <li><label><input type="checkbox">B2 · <b>Overviews say no more than their citations</b>, and each lead carries what the reader most needs at that stage (§5).</label></li>
 <li><label><input type="checkbox">B3 · <b>Stage movement</b> ${p?.stage_before != null && p.stage_before !== after ? `(${p.stage_before} → ${after})` : ''} is justified by the search log below.</label></li>
 <li><label><input type="checkbox">B4 · <b>Photos:</b> of the item or topic-related, no faces / victims / memorials, credit as the source asks (§6).</label></li>
 <li><label><input type="checkbox">B5 · <b>poll and card_line</b> say only what slides 2 and 3 say; the question is generic in substance (§1.8).</label></li>
 <li><label><input type="checkbox">B6 · <b>Unreachable pages</b> opened in the browser (${unreachable.size}).</label></li>
 <li><label><input type="checkbox">B7 · <b>Rendered in <code>npm run dev:live</code></b> at 390 × 844: the lead ends above the fade on slides 2 and 3.</label></li>
</ol>
<p class="sub">Accept = all of A pass and B1–B7 ticked. Otherwise, reply with what to change.</p>

<h2>Claims · for B1</h2>
<div class="wrap"><table><tr><th>id</th><th>stage</th><th>type</th><th>source · date</th><th>quote</th><th>link</th><th>flag</th><th>✓</th></tr>${claimRows}</table></div>

<h2>Overviews · for B2</h2>
${overviews}

<h2>Search log · for B3</h2>
<div class="wrap"><table><tr><th>search</th><th>outcome</th><th>claims</th><th>where</th><th>note</th></tr>${searchRows}</table></div>

<h2>Photos · for B4</h2>
<div class="photos">${photos}</div>

<h2>poll and card_line · for B5</h2>
<div class="ov" dir="rtl">
 <div class="ovh" dir="ltr">card_line</div><p>${esc(inc.card_line ?? '—')}</p>
 ${inc.poll ? `<div class="ovh" dir="ltr">poll</div><p><b>${esc(inc.poll.question)}</b></p>${review(inc.poll.failure)}${review(inc.poll.status)}<p class="sub">${esc(plainText(inc.poll.caveat))}</p>` : '<p>no poll</p>'}
</div>

<h2>Unreachable here · for B6</h2>
<ul>${[...unreachable].map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(decodeURI(u))}</a></li>`).join('') || '<li>none</li>'}</ul>
</main></body></html>
`;

mkdirSync(join(ROOT, 'docs/passes'), { recursive: true });
const out = join(ROOT, 'docs/passes', `${id}-atp.html`);
writeFileSync(out, html);
console.log(`\n  ${id}: ${autoPass} automatic pass, ${autoFail} fail · ${out.replace(ROOT + '/', '')}\n`);
