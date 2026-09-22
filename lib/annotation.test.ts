import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderAnnotation, checkAnnotated, parseAnnotation, type RenderSpan } from './annotation.ts';

/**
 * The renderer's half of docs/annotations.html §3. The cases that matter are
 * the two list forms, because one of them was silently dropped until DIA-382
 * and the validator was right to accept it the whole time - and now headings,
 * which are the one part of a field that is not a passage at all (DIA-419).
 */

/** Only the passages, which is what every pre-heading case here is about. */
const spans = (src: string) =>
  renderAnnotation(src).filter((p): p is RenderSpan => p.kind === 'span');

const shape = (src: string) =>
  spans(src).map((s) => ({ kinds: s.blocks.map((b) => b.kind), ids: s.ids, marker: s.marker }));

const legal = (src: string) => checkAnnotated(src, { coverage: true });
const codes = (src: string) => checkAnnotated(src, { coverage: true }).map((i) => i.code);

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
  const [item] = spans('* [[הראשון]](c01)');
  const block = item?.blocks[0];
  assert.equal(block?.kind, 'p');
  assert.equal(block?.kind === 'p' && block.children[0]?.kind === 'text' && block.children[0].text, 'הראשון');
});

test('the shared-source form still draws one list inside one span', () => {
  assert.deepEqual(shape('[[* הראשון\n* השני]](c01)'), [
    { kinds: ['ul'], ids: ['c01'], marker: undefined },
  ]);
  const [span] = spans('[[* הראשון\n* השני]](c01)');
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

/* ------------------------------------------------------- §2's seventh feature */

test('a heading is a part of its own, between the passages', () => {
  const parts = renderAnnotation('## כותרת\n\n[[פסקה.]](c01)');
  assert.equal(parts.length, 2);
  assert.equal(parts[0]?.kind, 'heading');
  assert.equal(parts[0]?.kind === 'heading'
    && parts[0].children[0]?.kind === 'text' && parts[0].children[0].text, 'כותרת');
  assert.equal(parts[1]?.kind, 'span');
});

test('a heading asserts nothing, so the coverage rule lets it stand', () => {
  assert.deepEqual(legal('[[פסקה.]](c01)\n\n## כותרת\n\n[[עוד פסקה.]](c02)'), []);
});

test('every level is the same heading, because the page has one style', () => {
  for (const hashes of ['#', '##', '###', '######']) {
    const parts = renderAnnotation(`${hashes} כותרת\n\n[[פסקה.]](c01)`);
    assert.equal(parts[0]?.kind, 'heading', `${hashes} should open a heading`);
  }
});

test('a heading may carry the set\'s inline marks', () => {
  const [head] = renderAnnotation('## מה **לא** נשאר\n\n[[פסקה.]](c01)');
  assert.equal(head?.kind === 'heading' && head.children.some((c) => c.kind === 'bold'), true);
});

test('a heading among cited passages keeps its place in the order', () => {
  const parts = renderAnnotation('[[לפני.]](c01)\n\n## כותרת\n\n* [[אחרי]](c02)');
  assert.deepEqual(parts.map((p) => p.kind), ['span', 'heading', 'span']);
  assert.equal(parts[2]?.kind === 'span' && parts[2].marker, 'ul');
});

test('a heading that carries a cite is an error, not a heading', () => {
  // The pre-pass cuts the span out first, so what the heading line has left of
  // itself is the hashes - which is how the parser can tell the two apart.
  assert.deepEqual(codes('## [[כותרת]](c01)'), ['heading-cited']);
});

test('a heading with no words at all is an error of its own', () => {
  assert.deepEqual(codes('[[פסקה.]](c01)\n\n##'), ['heading-empty']);
});

test('a heading after the last passage is still drawn', () => {
  // The validator warns about the shape; the renderer does not answer a
  // writing problem by deleting the writing.
  const parts = renderAnnotation('[[פסקה.]](c01)\n\n## כותרת');
  assert.deepEqual(parts.map((p) => p.kind), ['span', 'heading']);
});

test('inside a cite a hash is not a heading - the words stay, the mark goes', () => {
  const [span] = spans('[[## כותרת\n\nפסקה.]](c01)');
  assert.deepEqual(span?.blocks.map((b) => b.kind), ['p', 'p']);
  const first = span?.blocks[0];
  assert.equal(first?.kind === 'p' && first.children[0]?.kind === 'text'
    && first.children[0].text, 'כותרת');
});
