import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAnnotation, checkAnnotated, parseAnnotation } from './annotation.ts';

/**
 * The renderer's half of docs/annotations.html §3. The cases that matter are
 * the two list forms, because one of them was silently dropped until DIA-382
 * and the validator was right to accept it the whole time.
 */

const shape = (src: string) =>
  renderAnnotation(src).map((s) => ({ kinds: s.blocks.map((b) => b.kind), ids: s.ids, marker: s.marker }));

const legal = (src: string) => checkAnnotated(src, { coverage: true });

test('a marker outside a span is legal authoring - the validator says so', () => {
  const src = '* [[הראשון]](c01)\n* [[השני]](c02)';
  assert.deepEqual(legal(src), []);
  assert.equal(parseAnnotation(src).spans.length, 2);
});

test('a marker in the gap makes the span that follows a list item', () => {
  assert.deepEqual(shape('* [[הראשון]](c01)\n* [[השני]](c02)'), [
    { kinds: ['p'], ids: ['c01'], marker: 'ul' },
    { kinds: ['p'], ids: ['c02'], marker: 'ul' },
  ]);
});

test('every marker character the contract names opens an item', () => {
  for (const mark of ['-', '*', '+']) {
    assert.equal(shape(`${mark} [[x]](c01)`)[0]?.marker, 'ul', `${mark} should open a ul`);
  }
  for (const mark of ['1.', '2)']) {
    assert.equal(shape(`${mark} [[x]](c01)`)[0]?.marker, 'ol', `${mark} should open an ol`);
  }
});

test('the marker is not part of the cited text', () => {
  const [item] = renderAnnotation('* [[הראשון]](c01)');
  const block = item?.blocks[0];
  assert.equal(block?.kind, 'p');
  assert.equal(block?.kind === 'p' && block.children[0]?.kind === 'text' && block.children[0].text, 'הראשון');
});

test('the shared-source form still draws one list inside one span', () => {
  assert.deepEqual(shape('[[* הראשון\n* השני]](c01)'), [
    { kinds: ['ul'], ids: ['c01'], marker: undefined },
  ]);
  const [span] = renderAnnotation('[[* הראשון\n* השני]](c01)');
  const block = span?.blocks[0];
  assert.equal(block?.kind === 'ul' && block.items.length, 2);
});

test('a paragraph before a list is not swallowed by it', () => {
  assert.deepEqual(shape('[[פסקה.]](c01)\n\n* [[הראשון]](c02)\n* [[השני]](c03)'), [
    { kinds: ['p'], ids: ['c01'], marker: undefined },
    { kinds: ['p'], ids: ['c02'], marker: 'ul' },
    { kinds: ['p'], ids: ['c03'], marker: 'ul' },
  ]);
});

test('a marker only counts on the line immediately before the span', () => {
  // The marker opens its own line; prose on the line before it belongs to the
  // span that already closed, not to the one about to open.
  assert.equal(shape('[[פסקה.]](c01) - ועוד [[המשך]](c02)')[1]?.marker, undefined);
});

test('nothing in the ordinary case gains a marker', () => {
  assert.deepEqual(shape('[[**כותרת.**\n\nפסקה שנייה.]](c01, c02)'), [
    { kinds: ['p', 'p'], ids: ['c01', 'c02'], marker: undefined },
  ]);
});
