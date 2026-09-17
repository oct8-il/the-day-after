/**
 * One-off (DIA-371): lines[{ text, cites }] -> one annotated text.
 *
 * Every line becomes its own cite span, wrapped as [[...]](ids) and separated
 * by a blank line, which is exactly how the lines already rendered - one
 * paragraph each. So the conversion is lossless in both directions that matter:
 * no sentence loses its sources, and no text ends up uncovered.
 *
 * It also drops `illustrative` from parents and incidents. The field said "I am
 * a fixture", which the pool split now guarantees structurally.
 *
 * Both pools move together, because CI validates both on every push.
 *
 *   node --experimental-strip-types scripts/migrate-annotation.ts [--dry]
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DRY = process.argv.includes('--dry');

type OldLine = { text: string; cites: string[] };
type OldSummary = { stage: number; lines?: OldLine[]; text?: string };

const read = (p: string) => JSON.parse(readFileSync(p, 'utf8'));
const write = (p: string, v: unknown) => {
  if (!DRY) writeFileSync(p, `${JSON.stringify(v, null, 2)}\n`, 'utf8');
};

/** A cite span per line, in the order written. */
function toAnnotated(lines: OldLine[]): string {
  return lines.map((l) => `[[${l.text.trim()}]](${l.cites.join(', ')})`).join('\n\n');
}

let touched = 0;
for (const pool of ['live', 'test'] as const) {
  const dir = join(ROOT, 'data', pool);

  const parentsPath = join(dir, 'parents.json');
  const parents = read(parentsPath) as Record<string, unknown>[];
  let parentsChanged = false;
  for (const p of parents) {
    if ('illustrative' in p) { delete p.illustrative; parentsChanged = true; }
  }
  if (parentsChanged) { write(parentsPath, parents); console.log(`  ${pool}/parents.json  dropped illustrative from ${parents.length} parents`); }

  const incDir = join(dir, 'incidents');
  for (const file of readdirSync(incDir).filter((f) => f.endsWith('.json')).sort()) {
    const path = join(incDir, file);
    const inc = read(path) as Record<string, unknown> & { summaries?: OldSummary[] };
    let changed = false;

    if ('illustrative' in inc) { delete inc.illustrative; changed = true; }

    for (const sum of inc.summaries ?? []) {
      if (!sum.lines) continue;
      sum.text = toAnnotated(sum.lines);
      delete sum.lines;
      changed = true;
    }

    if (changed) { write(path, inc); touched++; console.log(`  ${pool}/${file}`); }
  }
}

console.log(`\n  ${DRY ? 'would touch' : 'migrated'} ${touched} incident${touched === 1 ? '' : 's'}.\n`);
