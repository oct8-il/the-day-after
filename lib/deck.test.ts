import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSource, sourceLine, itemNumber, siblings, sourceLineText, stageAge,
  stageAbsence, absenceIsDraft, notDocumented, sinceLabel, ABSENCE_PLACEHOLDER } from './deck.ts';

const claim = (source_type: string, source: string, date: string) =>
  ({ source_type, source, date });

test('splitSource takes the publisher off the front and the document off the back', () => {
  assert.deepEqual(splitSource('צה"ל — תחקיר הקרב בקיבוץ בארי'),
    { publisher: 'צה"ל', title: 'תחקיר הקרב בקיבוץ בארי' });
  assert.deepEqual(splitSource('מבקר המדינה'), { publisher: 'מבקר המדינה', title: null });
});

test('oversight outranks official for the document slot', () => {
  const l = sourceLine({ claims: [
    claim('official', 'צה"ל — תחקיר פנימי', '01.2024'),
    claim('oversight', 'מבקר המדינה — דוח ניהול המערכה', '09.2025'),
  ] });
  assert.equal(l.document, 'דוח ניהול המערכה');
  assert.equal(l.documentPublisher, 'מבקר המדינה');
});

test('within a tier the earliest claim wins', () => {
  const l = sourceLine({ claims: [
    claim('official', 'צה"ל — תחקיר מאוחר', '06.2026'),
    claim('official', 'צה"ל — תחקיר מוקדם', '10.2023'),
  ] });
  assert.equal(l.document, 'תחקיר מוקדם');
});

test('the outlet is the earliest press claim, named by publisher', () => {
  const l = sourceLine({ claims: [
    claim('oversight', 'מבקר המדינה — דוח', '09.2025'),
    claim('press', 'ynet — כתבה מאוחרת', '04.2025'),
    claim('press', 'כאן חדשות — כתבה מוקדמת', '19.10.2023'),
  ] });
  assert.equal(l.outlet, 'כאן חדשות');
});

test('an item with no official or oversight source names two outlets', () => {
  const l = sourceLine({ claims: [
    claim('press', 'כל רגע — הראשונה', '19.10.2023'),
    claim('press', 'כאן חדשות — השנייה', '09.04.2025'),
    claim('press', 'ynet — השלישית', '27.06.2026'),
  ] });
  assert.equal(l.document, 'כל רגע');
  assert.equal(l.outlet, 'כאן חדשות');
  assert.equal(l.documentPublisher, null);
  assert.equal(l.more, 1);
});

test('more counts distinct publishers, not claims', () => {
  const l = sourceLine({ claims: [
    claim('oversight', 'מבקר המדינה — דוח', '09.2025'),
    claim('press', 'כאן חדשות — א', '04.2025'),
    claim('press', 'כאן חדשות — ב', '04.2025'),
    claim('press', 'ynet — ג', '04.2025'),
  ] });
  assert.equal(l.more, 1); // ynet. כאן חדשות is already named, twice over.
});

test('a single-source item counts nothing more', () => {
  const l = sourceLine({ claims: [claim('oversight', 'מבקר המדינה — דוח', '09.2025')] });
  assert.equal(l.more, 0);
  assert.equal(l.outlet, null);
});

const published = ['i01', 'i02', 'i03', 'i04', 'i05'];
const RECORDS: Record<string, { id: string; parent: string }> = {
  i01: { id: 'i01', parent: 'p1' }, i02: { id: 'i02', parent: 'p2' },
  i03: { id: 'i03', parent: 'p1' }, i04: { id: 'i04', parent: 'p3' },
  i05: { id: 'i05', parent: 'p1' },
};
const LEDGER = { published, byId: (id: string) => RECORDS[id] };

test('itemNumber is the position in published.json, not the file id', () => {
  assert.equal(itemNumber('i03', published), 3);
  assert.equal(itemNumber('i01', published), 1);
});

test('an unpublished item has no number', () => {
  assert.equal(itemNumber('i99', published), null);
});

test('siblings takes the same parent first', () => {
  const out = siblings({ id: 'i01', parent: 'p1' }, 4, LEDGER).map((x) => x.id);
  assert.deepEqual(out.slice(0, 2), ['i03', 'i05']);
});

test('then it fills onward from this item, wrapping', () => {
  const out = siblings({ id: 'i04', parent: 'p3' }, 3, LEDGER).map((x) => x.id);
  assert.deepEqual(out, ['i05', 'i01', 'i02']); // no p3 sibling; walk on from i04 and wrap
});

test('two items with different positions get different rows', () => {
  const a = siblings({ id: 'i02', parent: 'p2' }, 2, LEDGER).map((x) => x.id);
  const b = siblings({ id: 'i04', parent: 'p3' }, 2, LEDGER).map((x) => x.id);
  assert.notDeepEqual(a, b);
});

test('never itself, never a duplicate, never more than asked', () => {
  const out = siblings({ id: 'i01', parent: 'p1' }, 3, LEDGER).map((x) => x.id);
  assert.equal(out.length, 3);
  assert.ok(!out.includes('i01'));
  assert.equal(new Set(out).size, out.length);
});

test('a small ledger returns what it has rather than padding', () => {
  const out = siblings({ id: 'i01', parent: 'p1' }, 9, LEDGER);
  assert.equal(out.length, 4);
});

test('the source line names the document while it fits', () => {
  const line = sourceLineText({
    document: 'תחקיר צה״ל',
    documentPublisher: 'צה״ל',
    outlet: 'כאן חדשות',
    more: 2,
  });
  assert.equal(line, 'תחקיר צה״ל · כאן חדשות · ועוד 2 מקורות');
});

test('on overflow the publisher replaces the document, and only then', () => {
  // The worst real one. 75 characters with the document, which is two lines.
  const long = {
    document: 'סיכום דוח צוות המומחים לבדיקת תחקירי צה"ל',
    documentPublisher: 'צה״ל',
    outlet: 'Times of Israel',
    more: 3,
  };
  const line = sourceLineText(long);
  assert.ok(!line.includes('סיכום דוח'), 'the document is dropped');
  assert.ok(line.startsWith('צה״ל'), 'the publisher takes its place');
  assert.ok(line.length <= 44, `line is ${line.length} characters`);
});

test('a line with no publisher behind it is left alone', () => {
  // An item whose only sources are press: there is no document to shorten to,
  // so truncating would be the only option and the rule declines to.
  const only = { document: 'ynet', documentPublisher: null, outlet: 'כאן חדשות', more: 1 };
  assert.equal(sourceLineText(only), 'ynet · כאן חדשות · ועוד 1 מקורות');
});

test('the tail collapses when there is nothing to count', () => {
  assert.equal(
    sourceLineText({ document: 'תחקיר צה״ל', documentPublisher: 'צה״ל', outlet: null, more: 0 }),
    'תחקיר צה״ל',
  );
});

test('the definition box frames the stage\'s own clause into a sentence', () => {
  // §7: one frame for every stage, completed by the taxonomy's clause. The
  // clause is not a sentence, so the full stop belongs to the frame.
  const said = notDocumented('הגוף האחראי הודה בפומבי שהכשל התרחש');
  assert.equal(said, 'לא מצאנו תיעוד לכך שהגוף האחראי הודה בפומבי שהכשל התרחש.');
  assert.ok(said.startsWith('לא מצאנו תיעוד לכך ש'));
  assert.ok(said.endsWith('.'));
});

test('the age line reads as a date and a distance, and survives a month-only date', () => {
  assert.equal(stageAge('25.10.2023', 18), '25.10.2023 · 18 ימים אחרי 7.10');
  // daysAfter returns null for a month-only date; the day still shows.
  assert.equal(stageAge('03.2024', null), '03.2024');
  assert.equal(stageAge(null, null), null);
});

test('an unwritten absence statement says so rather than showing nothing', () => {
  // §7's screens draw the statements for stages 2 and 5; 3 and 4 were never
  // written - DIA-367.
  assert.ok(stageAbsence(5).startsWith('לא תועד'));
  assert.equal(absenceIsDraft(2), false);
  assert.equal(absenceIsDraft(3), true);
  assert.equal(absenceIsDraft(4), true);
  assert.equal(stageAbsence(4), ABSENCE_PLACEHOLDER);
});

test('the days-since label names the event that put the item where it is', () => {
  assert.equal(sinceLabel(1), 'ימים מאז שהכשל זוהה');
  assert.equal(sinceLabel(4), 'ימים מאז שהיישום דווח');
  // Every stage has one, so the numeral is never left unexplained.
  for (const n of [1, 2, 3, 4, 5, 6]) assert.ok(sinceLabel(n).startsWith('ימים מאז'));
});
