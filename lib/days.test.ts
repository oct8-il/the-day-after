import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysAfter, daysSince, daysWaiting } from './days.ts';

test('daysAfter counts from 7 October', () => {
  assert.equal(daysAfter('07.10.2023'), 0);
  assert.equal(daysAfter('08.10.2023'), 1);
  // The spec's own example: 25.10.2023 is 18 days after.
  assert.equal(daysAfter('25.10.2023'), 18);
});

test('daysAfter crosses a year and a leap day', () => {
  assert.equal(daysAfter('07.10.2024'), 366);   // 2024 is a leap year
  assert.equal(daysAfter('18.03.2025'), 528);
});

test('a month-only date has no day to count', () => {
  // The source dated itself to a month. Printing a day count would mean
  // choosing a day inside it, which the ledger has not.
  assert.equal(daysAfter('03.2024'), null);
  assert.equal(daysAfter('2024'), null);
  assert.equal(daysAfter(''), null);
  assert.equal(daysAfter('nonsense'), null);
});

test('a date before the attack counts as nothing', () => {
  // A 2017 report about a risk is not "-2000 days after 7 October".
  assert.equal(daysAfter('01.01.2017'), null);
});

test('daysWaiting counts from the day a stage was reached, not from a second clock', () => {
  // Expressed as the difference of two counts from 7.10, so the numeral on
  // slide 4 and the age line on slide 3 can never disagree about the date.
  const total = daysSince();
  assert.equal(daysWaiting('07.10.2023'), total);
  assert.equal(daysWaiting('19.10.2023'), total - 12);
  // A month-only date has no distance from 7.10, so it has no wait either.
  assert.equal(daysWaiting('03.2024'), null);
  assert.equal(daysWaiting(null), null);
});
