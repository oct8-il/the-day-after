import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stageOf, reached, unreached, stageDate } from './stage.ts';

const claim = (asserts_stage: number, date = '01.2024', source_type = 'press') =>
  ({ asserts_stage, date, source_type, source: 'x — y' }) as never;
const inc = (...cs: ReturnType<typeof claim>[]) => ({ claims: cs });

test('stageOf takes the peak, and regression overrides it', () => {
  assert.equal(stageOf(inc(claim(1), claim(4), claim(2))), 4);
  assert.equal(stageOf(inc(claim(1), claim(4), claim(6))), 6);
  assert.equal(stageOf(inc(claim(0))), 0);
});

test('reached is the stages claimed, not everything up to the current one', () => {
  assert.deepEqual(reached(inc(claim(1), claim(3), claim(4), claim(6))), [1, 3, 4, 6]);
  assert.deepEqual(reached(inc(claim(1), claim(1), claim(2))), [1, 2]);
});

test('reached ignores a contesting claim, which asserts no stage', () => {
  assert.deepEqual(reached(inc(claim(0), claim(1))), [1]);
});

test('reached always holds the current stage, regression included', () => {
  const i = inc(claim(1), claim(3), claim(4), claim(6));
  assert.ok(reached(i).includes(stageOf(i)));
});

test('unreached is 1-5 minus reached, and never holds stage 6', () => {
  assert.deepEqual(unreached(inc(claim(1))), [2, 3, 4, 5]);              // i20, stuck at 1
  assert.deepEqual(unreached(inc(claim(1), claim(2), claim(3), claim(4))), [5]); // i13
  assert.deepEqual(unreached(inc(claim(1), claim(3), claim(4), claim(6))), [2, 5]);
  assert.ok(!unreached(inc(claim(6))).includes(6 as never));
});

test('an item at stage 5 has no slide 4 at all', () => {
  assert.deepEqual(unreached(inc(claim(1), claim(2), claim(3), claim(4), claim(5))), []);
});

test('stageDate takes the earliest claim asserting that stage', () => {
  const i = inc(claim(4, '27.06.2026'), claim(4, '25.10.2023'), claim(1, '19.10.2023'));
  assert.equal(stageDate(i, 4), '25.10.2023');
  assert.equal(stageDate(i, 1), '19.10.2023');
});

test('stageDate sorts by year then month, whatever precision the date carries', () => {
  const i = inc(claim(2, '03.2024'), claim(2, '15.01.2024'), claim(2, '2023'));
  assert.equal(stageDate(i, 2), '2023');
  assert.equal(stageDate(inc(claim(2, '03.2024'), claim(2, '15.01.2024')), 2), '15.01.2024');
});

test('a bare year sorts after any dated claim in the same year', () => {
  assert.equal(stageDate(inc(claim(2, '2024'), claim(2, '11.2024')), 2), '11.2024');
});

test('stageDate is null for a stage nothing asserts - every stage on slide 4', () => {
  assert.equal(stageDate(inc(claim(1)), 5), null);
});
