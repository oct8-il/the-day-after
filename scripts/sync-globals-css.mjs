/**
 * One-off: copy the prototype's <style> block into app/globals.css, verbatim.
 *
 * Rule 1 of the port: the prototype's stylesheet becomes the app's stylesheet.
 * Not re-created, not translated into a framework's tokens — copied. After this
 * has run once, globals.css is the living design and docs/prototype.html is a
 * frozen reference (tag prototype-v0.4-final). Re-running this would throw away
 * every fix made while porting with real data, so it refuses unless --force.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'app', 'globals.css');

if (existsSync(OUT) && !process.argv.includes('--force')) {
  console.error('app/globals.css already exists. It is the design now; edit it directly.');
  console.error('Pass --force only if you mean to discard every change made since the port began.');
  process.exit(1);
}

const html = readFileSync(join(ROOT, 'docs', 'prototype.html'), 'utf8');
const m = html.match(/<style>\n?([\s\S]*?)<\/style>/);
if (!m) throw new Error('no <style> block in docs/prototype.html');

const header = `/* ---------------------------------------------------------------------------
 * The design.
 *
 * Copied verbatim from the <style> block of docs/prototype.html at tag
 * prototype-v0.4-final. Token names (--s1…--s6, --bub-pro, --t-press) and class
 * names are the prototype's and do not get renamed. Design changes happen here,
 * not in the prototype, which is frozen as the fidelity baseline.
 * ------------------------------------------------------------------------- */

`;
writeFileSync(OUT, header + m[1].replace(/\s*$/, '\n'), 'utf8');
console.log(`app/globals.css written — ${m[1].split('\n').length} lines of the prototype's CSS`);
