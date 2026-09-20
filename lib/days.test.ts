import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysAfter } from './days.ts';

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
