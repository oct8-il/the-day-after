import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitSource, sourceLine, itemNumber, siblings } from './deck.ts';

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
