import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, computeSplits, balances, settleUp, toCents, itemizedTotal, fmt, symbol } from './money.js';

const sum = (s) => s.reduce((a, x) => a + x.amount, 0);
const map = (s) => Object.fromEntries(s.map((x) => [x.member, x.amount]));

test('allocate sums exactly', () => {
  assert.deepEqual(allocate(1000, [1, 1, 1]), [334, 333, 333]);
  assert.equal(allocate(1, [1, 1, 1]).reduce((a, b) => a + b), 1);
  assert.deepEqual(allocate(100, [2, 1, 1]), [50, 25, 25]);
});

test('modes', () => {
  assert.deepEqual(map(computeSplits(1000, 'equal', { members: ['a', 'b', 'c'] })), { a: 334, b: 333, c: 333 });
  assert.deepEqual(map(computeSplits(1000, 'exact', { amounts: { a: 700, b: 300 } })), { a: 700, b: 300 });
  assert.throws(() => computeSplits(1000, 'exact', { amounts: { a: 700 } }), /add up/);
  assert.equal(sum(computeSplits(999, 'percent', { percents: { a: 33.3, b: 33.3, c: 33.4 } })), 999);
  assert.throws(() => computeSplits(999, 'percent', { percents: { a: 50 } }), /100%/);
  assert.deepEqual(map(computeSplits(900, 'shares', { shares: { a: 2, b: 1 } })), { a: 600, b: 300 });
  // $30 equal among 3, Sam +$6 for an extra drink → rest $24 / 3 = $8, Sam $14
  assert.deepEqual(map(computeSplits(3000, 'adjust', { members: ['a', 'b', 's'], adjustments: { s: 600 } })), { a: 800, b: 800, s: 1400 });
  assert.throws(() => computeSplits(100, 'adjust', { members: ['a'], adjustments: { a: 200 } }));
  assert.throws(() => computeSplits(0, 'equal', { members: ['a'] }));
});

test('itemized: tax+tip proportional', () => {
  const input = { items: [{ name: 'steak', amount: 3000, members: ['a'] }, { name: 'salad', amount: 1000, members: ['b'] }, { name: 'wine', amount: 2000, members: ['a', 'b'] }], tax: 600, tip: 0 };
  const s = map(computeSplits(0, 'itemized', input));
  assert.deepEqual(s, { a: 4400, b: 2200 }); // subtotals 4000/2000 → tax 400/200
  assert.equal(itemizedTotal(input), 6600);
});

test('settleUp zeroes balances', () => {
  const members = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const ex = [
    { paidBy: 'a', amount: 1000, splits: computeSplits(1000, 'equal', { members: ['a', 'b', 'c', 'd'] }) },
    { paidBy: 'b', amount: 777, splits: computeSplits(777, 'equal', { members: ['a', 'b', 'c'] }) },
  ];
  const bal = balances(members, ex);
  assert.equal(Object.values(bal).reduce((a, b) => a + b), 0);
  const pays = settleUp(bal);
  assert.ok(pays.length <= 3);
  for (const p of pays) { bal[p.from] += p.amount; bal[p.to] -= p.amount; }
  assert.ok(Object.values(bal).every((v) => v === 0));
});

test('fmt', () => {
  assert.match(fmt(123456, 'INR'), /₹/);
  assert.match(fmt(1050, 'EUR'), /€/);
  assert.match(fmt(1050, '$'), /\$/); // legacy symbol → USD
  assert.equal(symbol('GBP'), '£');
});

test('toCents', () => {
  assert.equal(toCents('12.34'), 1234);
  assert.equal(toCents('0.1'), 10);
  assert.ok(Number.isNaN(toCents('1.234')));
  assert.ok(Number.isNaN(toCents('abc')));
});
