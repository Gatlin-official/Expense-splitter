// Thin line icons for categories, drawn on a 24px grid.
const PATHS = {
  food: 'M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M17 3c-1.7 0-3 2-3 5.5 0 2.2 1.3 3.5 3 3.5v9',
  groceries: 'M3 4h2.2l2.3 11h10l2.2-8H6.2M9 20h.01M17 20h.01',
  rent: 'M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-6h4v6',
  utilities: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.4c.8.8 1 1.6 1 2.6h6c0-1 .2-1.8 1-2.6A6 6 0 0 0 12 3z',
  transport: 'M5 16v-5l2-5h10l2 5v5M3 16h18M7 19v-3M17 19v-3M5 11h14',
  travel: 'M3 12.5l18-7.5-5.5 15-3.5-5.5L3 12.5zM12 14.5l3.5-5',
  fun: 'M12 3l2.6 5.6 6 .7-4.5 4 1.2 6L12 16.4l-5.3 2.9 1.2-6-4.5-4 6-.7L12 3z',
  shopping: 'M5 8h14l-1 13H6L5 8zM9 8V6a3 3 0 0 1 6 0v2',
  other: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12h.01M12 12h.01M16 12h.01',
  transfer: 'M4 8h15l-4-4M20 16H5l4 4',
};

export const Icon = ({ name }) => (
  <svg className="icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={PATHS[name] || PATHS.other} />
  </svg>
);
