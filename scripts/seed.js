// Demo data for presentations. Run with the app running: `npm run seed`.
// Goes through the real API, so every expense is validated like a user's would be.
const BASE = process.env.APP_URL || 'http://localhost:3000';

async function call(path, method = 'GET', body) {
  const r = await fetch(`${BASE}/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const data = await r.json();
  if (!r.ok) throw new Error(`${method} ${path}: ${data.error}`);
  return data;
}

// Date `monthsAgo` months back, on `day` of that month.
const on = (monthsAgo, day) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(day);
  return d.toISOString().slice(0, 10);
};
const rs = (rupees) => Math.round(rupees * 100); // ₹ → paise

// Each expense builder gets the member ids in the order listed in `members`.
const GROUPS = [
  {
    name: 'Goa Trip 2026', currency: 'INR', members: ['Gatlin', 'Arjun', 'Priya', 'Rahul'],
    expenses: ([G, A, P, R]) => [
      { description: 'Train tickets to Goa', amount: rs(8600), paidBy: G, mode: 'equal', input: { members: [G, A, P, R] }, category: 'travel', date: on(4, 12) },
      { description: 'Beach villa (3 nights)', amount: rs(18000), paidBy: A, mode: 'shares', input: { shares: { [G]: 1, [A]: 1, [P]: 2, [R]: 1 } }, category: 'rent', date: on(3, 5) },
      { description: 'Seafood dinner at Baga', paidBy: P, mode: 'itemized', input: { items: [{ name: 'Prawn curry', amount: rs(680), members: [G, P] }, { name: 'Fish thali', amount: rs(520), members: [A, R] }, { name: 'Drinks', amount: rs(400), members: [G, A, P, R] }], tax: rs(80), tip: rs(100) }, category: 'food', date: on(3, 6) },
      { description: 'Scooter rentals', amount: rs(2400), paidBy: R, mode: 'exact', input: { amounts: { [G]: rs(600), [A]: rs(600), [P]: rs(600), [R]: rs(600) } }, category: 'transport', date: on(2, 7) },
      { description: 'Water sports', amount: rs(6000), paidBy: G, mode: 'percent', input: { percents: { [G]: 30, [A]: 30, [P]: 20, [R]: 20 } }, category: 'fun', date: on(1, 14) },
      { description: 'Groceries for villa', amount: rs(3150), paidBy: A, mode: 'adjust', input: { members: [G, A, P, R], adjustments: { [R]: rs(150) } }, category: 'groceries', date: on(0, 3) },
      { description: 'Souvenir shopping', amount: rs(4200), paidBy: P, mode: 'equal', input: { members: [G, P] }, category: 'shopping', date: on(0, 8) },
      { isTransfer: true, mode: 'exact', amount: rs(2000), paidBy: R, input: { amounts: { [A]: rs(2000) } } },
    ],
  },
  {
    // Flatmates: monthly rent and bills over six months, so the bar chart fills in.
    name: 'Hostel Room 204', currency: 'INR', members: ['Gatlin', 'Karthik', 'Vishnu'],
    expenses: ([G, K, V]) => [
      ...[5, 4, 3, 2, 1, 0].flatMap((m, i) => [
        { description: 'Room rent', amount: rs(9000), paidBy: [G, K, V][i % 3], mode: 'equal', input: { members: [G, K, V] }, category: 'rent', date: on(m, 2) },
        { description: 'Electricity bill', amount: rs(1200 + i * 85), paidBy: [K, V, G][i % 3], mode: 'equal', input: { members: [G, K, V] }, category: 'utilities', date: on(m, 10) },
      ]),
      { description: 'WiFi (6 months)', amount: rs(3600), paidBy: G, mode: 'equal', input: { members: [G, K, V] }, category: 'utilities', date: on(5, 4) },
      { description: 'Monthly groceries', amount: rs(2700), paidBy: V, mode: 'shares', input: { shares: { [G]: 1, [K]: 1, [V]: 1 } }, category: 'groceries', date: on(1, 18) },
      { description: 'Late night biryani', amount: rs(960), paidBy: K, mode: 'equal', input: { members: [G, K, V] }, category: 'food', date: on(0, 6) },
      { description: 'New water purifier', amount: rs(4500), paidBy: G, mode: 'percent', input: { percents: { [G]: 40, [K]: 30, [V]: 30 } }, category: 'shopping', date: on(0, 12) },
    ],
  },
  {
    // A one-off event with an itemised bill.
    name: "Priya's Birthday Party", currency: 'INR', members: ['Gatlin', 'Priya', 'Arjun', 'Meera', 'Rahul'],
    expenses: ([G, P, A, M, R]) => [
      { description: 'Birthday cake', amount: rs(1800), paidBy: M, mode: 'equal', input: { members: [G, A, M, R] }, category: 'food', date: on(0, 15) },
      { description: 'Decorations and balloons', amount: rs(750), paidBy: G, mode: 'equal', input: { members: [G, A, M, R] }, category: 'shopping', date: on(0, 15) },
      { description: 'Dinner at Barbeque Nation', paidBy: A, mode: 'itemized', input: { items: [{ name: 'Veg buffet', amount: rs(1798), members: [M, R] }, { name: 'Non-veg buffet', amount: rs(3297), members: [G, P, A] }, { name: 'Mocktails', amount: rs(900), members: [G, P, A, M, R] }], tax: rs(300), tip: rs(250) }, category: 'food', date: on(0, 16) },
      { description: 'Gift: smartwatch', amount: rs(4999), paidBy: R, mode: 'equal', input: { members: [G, A, M, R] }, category: 'shopping', date: on(0, 14) },
      { description: 'Cab back home', amount: rs(620), paidBy: G, mode: 'exact', input: { amounts: { [G]: rs(200), [P]: rs(200), [M]: rs(220) } }, category: 'transport', date: on(0, 16) },
    ],
  },
  {
    // Fully paid back, to show the "All square" state.
    name: 'Movie Night', currency: 'INR', members: ['Gatlin', 'Arjun', 'Karthik'],
    expenses: ([G, A, K]) => [
      { description: 'Movie tickets', amount: rs(900), paidBy: G, mode: 'equal', input: { members: [G, A, K] }, category: 'fun', date: on(0, 20) },
      { description: 'Popcorn combo', amount: rs(600), paidBy: A, mode: 'equal', input: { members: [G, A, K] }, category: 'food', date: on(0, 20) },
      // Karthik owes ₹500: ₹400 to Gatlin, ₹100 to Arjun.
      { isTransfer: true, mode: 'exact', amount: rs(400), paidBy: K, input: { amounts: { [G]: rs(400) } } },
      { isTransfer: true, mode: 'exact', amount: rs(100), paidBy: K, input: { amounts: { [A]: rs(100) } } },
    ],
  },
];

for (const def of GROUPS) {
  const { id } = await call('/groups', 'POST', { name: def.name, currency: def.currency, members: def.members });
  const g = await call(`/groups/${id}`);
  for (const e of def.expenses(g.members.map((m) => m.id))) await call(`/groups/${id}/expenses`, 'POST', e);
  console.log(`${def.name.padEnd(24)} ${BASE}/g/${id}`);
}
