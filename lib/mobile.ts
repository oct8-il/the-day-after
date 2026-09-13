/**
 * The item, shaped for the phone deck (DIA-360).
 *
 * Built on the server from the ledger, so the six slides render as static HTML
 * and the only client work is moving between them. Everything here is either
 * read from data/ or computed by a published rule; nothing is authored in this
 * file except the stage vocabulary below, which is copy, not fact.
 */
import { taxonomy, visibleIncidents, published, stageOf, placeById, parentById, type Incident, type Claim } from './data';
import { daysSince } from './days';

/** The wording each stage is given on a stage page. From the spec; a definition
 *  may never use its own term. Stages 3 and 6 are DRAFTS awaiting the design
 *  session's wording - the spec only settled 1, 2, 4 and 5. */
const DEFINITION: Record<number, string> = {
  1: 'מה שקרה בשטח, כפי שנרשם בתיעוד ציבורי',
  2: 'הגוף האחראי הודה בפומבי שהכשל התרחש',
  3: 'הוחלט על תיקון — החלטה, תקציב, נוהל או חקיקה שפורסמו',      // DRAFT
  4: 'התיקון דווח כמבוצע בשטח בידי הגוף האחראי',
  5: 'גוף שאינו הגוף האחראי בדק את התיקון בשטח ופרסם ממצאים',
  6: 'מקור מאוחר מדווח שהתיקון נשחק או הוסר',                      // DRAFT
};

/** What an unreached stage says. Computed, never authored per item - the whole
 *  content of the page is this statement plus who would count. 2 and 5 are the
 *  spec's; 3 and 4 are DRAFTS in the same register. */
const ABSENCE: Record<number, { statement: string; who: string }> = {
  2: {
    statement: 'לא תועדה הודאה פומבית של הגוף האחראי בכשל.',
    who: 'הודעה רשמית, עדות בוועדה או מסמך פנימי שפורסם — כל אחד מהם נחשב.',
  },
  3: {
    statement: 'לא תועדה תוכנית לתיקון הכשל.',                                   // DRAFT
    who: 'החלטת ממשלה, תקציב מאושר, נוהל חדש או חקיקה — כל אחד מהם נחשב.',      // DRAFT
  },
  4: {
    statement: 'לא תועד יישום של התיקון בשטח.',                                  // DRAFT
    who: 'דיווח של הגוף המבצע על כניסה לתוקף, בהיקף ובמועד — כל אחד מהם נחשב.', // DRAFT
  },
  5: {
    statement: 'לא תועד אימות בלתי תלוי של היישום.',
    who: 'מבקר המדינה, ועדת חקירה, מחקר או עיתונות — כל אחד מהם נחשב.',
  },
};

/** "N ימים מאז ש…" on an unreached page, naming the last thing that did happen. */
const SINCE_LABEL: Record<number, string> = {
  1: 'ימים מאז שהכשל זוהה',
  2: 'ימים מאז שהכשל הוכר',
  3: 'ימים מאז שהוכרזה התוכנית',
  4: 'ימים מאז שהיישום דווח',
  5: 'ימים מאז האימות',
};

export type SourceCard = { id: string; outlet: string; quote?: string; date: string; url: string | null; type: string; typeHe: string; color: string };
export type StagePage = {
  n: number; he: string; color: string; reached: boolean;
  definition: string;
  /** Reached: the date and age of the claim that established it. */
  date?: string; days?: number;
  /** Reached: editor prose, when it exists. Absent is a legitimate state. */
  overview?: string;
  sources: SourceCard[];
  /** Unreached: the computed statement and who would count. */
  statement?: string; who?: string; sinceLabel?: string; sinceDays?: number;
  hasMap?: boolean;
};
export type DeckItem = {
  id: string; number: number; total: number;
  title: string; parent: string;
  summary: string;
  currentStage: number;
  gate: { sourceLine: string; ageLine: string | null; color: string };
  rail: { n: number; he: string; color: string; reached: boolean; current: boolean }[];
  reached: StagePage[];
  unreached: StagePage[];
  question: { he: string; sub: string; lo?: string; hi?: string };
  onward: { id: string; number: number; parent: string; he: string; stage: number; stageHe: string; color: string }[];
  pins: { place: string; type: Claim['source_type']; src: string }[];
};

const OCT7 = Date.UTC(2023, 9, 7, 3, 29);
const num = (id: string) => parseInt(id.replace(/\D/g, ''), 10);
const meta = (n: number) => taxonomy.stages.find((s) => s.n === n)!;

/** A published date resolved to the end of the period it names. */
function asDate(date: string): Date | null {
  const p = date.split('.').map(Number);
  if (p.some(Number.isNaN)) return null;
  if (p.length === 1) return new Date(Date.UTC(p[0], 11, 31));
  if (p.length === 2) return new Date(Date.UTC(p[1], p[0], 0));
  return new Date(Date.UTC(p[2], p[1] - 1, p[0]));
}
const daysAfterOct7 = (d: Date) => Math.max(0, Math.round((d.getTime() - OCT7) / 864e5));

function card(c: Claim): SourceCard {
  const t = taxonomy.source_types.find((x) => x.id === c.source_type)!;
  // "ynet — סיקור תחקיר" → the outlet is what precedes the dash.
  const outlet = c.source.split(/\s+[—–-]\s+/)[0].trim();
  return { id: c.id, outlet, quote: c.quote, date: c.date, url: c.url, type: c.source_type, typeHe: t.he, color: t.color };
}

export function buildDeck(inc: Incident): DeckItem {
  const parent = parentById(inc.parent)!;
  const current = stageOf(inc);
  const asserted = new Set<number>(inc.claims.filter((c) => c.asserts_stage > 0).map((c) => c.asserts_stage));
  const ladder = asserted.has(6) ? [1, 2, 3, 4, 5, 6] : [1, 2, 3, 4, 5];

  const claimsAt = (n: number) => inc.claims.filter((c) => c.asserts_stage === n);
  const earliestAt = (n: number) => {
    const dates = claimsAt(n).map((c) => asDate(c.date)).filter(Boolean) as Date[];
    return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null;
  };

  const page = (n: number): StagePage => {
    const reached = asserted.has(n);
    const s = meta(n);
    const base = { n, he: s.he, color: s.color, reached, definition: DEFINITION[n] ?? '' };
    if (reached) {
      const d = earliestAt(n);
      return {
        ...base,
        date: d ? claimsAt(n)[0].date : undefined,
        days: d ? daysAfterOct7(d) : undefined,
        overview: inc.summaries?.find((x) => x.stage === n)?.lines.map((l) => l.text).join('\n\n'),
        sources: claimsAt(n).map(card),
        hasMap: n === 1 && inc.claims.some((c) => c.place),
      };
    }
    // The last stage that did happen, for the days-since line.
    const behind = [...asserted].filter((x) => x < n && x > 0).sort((a, b) => b - a)[0] ?? 1;
    const from = earliestAt(behind);
    return {
      ...base,
      sources: [],
      statement: ABSENCE[n]?.statement,
      who: ABSENCE[n]?.who,
      sinceLabel: SINCE_LABEL[behind],
      sinceDays: from ? Math.floor((Date.now() - from.getTime()) / 864e5) : undefined,
    };
  };

  const pages = ladder.map(page);
  const reached = pages.filter((p) => p.reached);
  // Slide 4 never holds the current stage, whatever route the item took there.
  const unreached = pages.filter((p) => !p.reached && p.n !== current && p.n !== 6);

  const stage1 = claimsAt(1);
  const outlets = [...new Set(stage1.map((c) => card(c).outlet))];
  const rest = outlets.length - 2;
  const sourceLine = outlets.length <= 2
    ? outlets.join(' · ')
    : `${outlets.slice(0, 2).join(' · ')} · ${rest === 1 ? 'ועוד מקור אחד' : `ועוד ${rest} מקורות`}`;

  const currentPage = pages.find((p) => p.n === current);
  const ageLine = currentPage?.date && currentPage.days !== undefined
    ? `${currentPage.days.toLocaleString('he-IL')} ימים אחרי 7.10 · ${currentPage.date}`
    : null;

  const q = (taxonomy.questions as Record<string, { he: string; sub: string; lo?: string; hi?: string }>)[String(current)];

  const onward = visibleIncidents
    .filter((x) => x.id !== inc.id)
    .sort((a, b) => Math.abs(num(a.id) - num(inc.id)) - Math.abs(num(b.id) - num(inc.id)))
    .slice(0, 4)
    .map((x) => {
      const st = stageOf(x);
      return {
        id: x.id, number: num(x.id), parent: parentById(x.parent)?.short ?? '',
        he: x.he, stage: st, stageHe: meta(st).he, color: meta(st).color,
      };
    });

  return {
    id: inc.id, number: num(inc.id), total: published.length,
    title: inc.he, parent: parent.short, summary: inc.summary,
    currentStage: current,
    gate: { sourceLine, ageLine, color: meta(current).color },
    rail: ladder.map((n) => ({ n, he: meta(n).he, color: meta(n).color, reached: asserted.has(n), current: n === current })),
    reached, unreached,
    question: q ? { he: q.he, sub: q.sub, lo: q.lo, hi: q.hi } : { he: '', sub: '' },
    onward,
    pins: inc.claims.filter((c) => c.place).map((c) => ({ place: c.place as string, type: c.source_type, src: c.source })),
  };
}

export { daysSince, placeById };
