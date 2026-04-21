/**
 * Fiscal calendar unit tests.
 * Run with: tsx src/lib/__tests__/fiscal.test.ts
 */

import { getFyBoundaries, getMonthWindowsForFy } from '../fiscal';

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.error(`  FAIL: ${label}`);
    failed++;
  }
}

function dateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

console.log('\n=== fiscal.ts unit tests ===\n');

// ── Test 1: getFyBoundaries(2026-04-20) ──────────────────────────────────────
{
  const b = getFyBoundaries(new Date('2026-04-20'));
  console.log('Test 1: getFyBoundaries(2026-04-20)');
  assert(b.uwYear === 2026, `uwYear === 2026 (got ${b.uwYear})`);
  assert(b.currentMonthLabel === 'April 2026', `currentMonthLabel === 'April 2026' (got '${b.currentMonthLabel}')`);
  assert(dateStr(b.currentMonthStart) === '2026-03-22', `currentMonthStart === 2026-03-22 (got ${dateStr(b.currentMonthStart)})`);
  assert(dateStr(b.currentMonthEnd) === '2026-04-21', `currentMonthEnd === 2026-04-21 (got ${dateStr(b.currentMonthEnd)})`);
  assert(b.currentMonthIndex === 3, `currentMonthIndex === 3 (April = index 3) (got ${b.currentMonthIndex})`);
}

// ── Test 2: getMonthWindowsForFy(2026)[0] — Jan bucket ───────────────────────
{
  const windows = getMonthWindowsForFy(2026);
  const w = windows[0];
  console.log('\nTest 2: getMonthWindowsForFy(2026)[0] — Jan bucket');
  assert(w.index === 0, `index === 0 (got ${w.index})`);
  assert(w.label === 'Jan', `label === 'Jan' (got '${w.label}')`);
  assert(dateStr(w.start) === '2025-12-22', `start === 2025-12-22 (got ${dateStr(w.start)})`);
  assert(dateStr(w.end) === '2026-01-21', `end === 2026-01-21 (got ${dateStr(w.end)})`);
}

// ── Test 3: getMonthWindowsForFy(2026)[11] — Dec bucket ──────────────────────
{
  const windows = getMonthWindowsForFy(2026);
  const w = windows[11];
  console.log('\nTest 3: getMonthWindowsForFy(2026)[11] — Dec bucket');
  assert(w.index === 11, `index === 11 (got ${w.index})`);
  assert(w.label === 'Dec', `label === 'Dec' (got '${w.label}')`);
  assert(dateStr(w.start) === '2026-11-22', `start === 2026-11-22 (got ${dateStr(w.start)})`);
  assert(dateStr(w.end) === '2026-12-21', `end === 2026-12-21 (got ${dateStr(w.end)})`);
}

// ── Test 4: Dec 22 is the first day of the next FY ───────────────────────────
{
  const b = getFyBoundaries(new Date('2025-12-22'));
  console.log('\nTest 4: getFyBoundaries(2025-12-22) — Dec 22 starts new FY');
  assert(b.uwYear === 2026, `uwYear === 2026 (got ${b.uwYear})`);
  assert(b.currentMonthIndex === 0, `currentMonthIndex === 0 (Jan bucket) (got ${b.currentMonthIndex})`);
  assert(b.currentMonthLabel === 'January 2026', `currentMonthLabel === 'January 2026' (got '${b.currentMonthLabel}')`);
  assert(dateStr(b.currentMonthStart) === '2025-12-22', `currentMonthStart === 2025-12-22 (got ${dateStr(b.currentMonthStart)})`);
  assert(dateStr(b.currentMonthEnd) === '2026-01-21', `currentMonthEnd === 2026-01-21 (got ${dateStr(b.currentMonthEnd)})`);
  assert(dateStr(b.fyStart) === '2025-12-22', `fyStart === 2025-12-22 (got ${dateStr(b.fyStart)})`);
  assert(dateStr(b.fyEnd) === '2026-12-22', `fyEnd === 2026-12-22 (got ${dateStr(b.fyEnd)})`);
}

// ── Test 5: Dec 21 is the LAST day of FY 2026 ────────────────────────────────
{
  const b = getFyBoundaries(new Date('2026-12-21'));
  console.log('\nTest 5: getFyBoundaries(2026-12-21) — last day of FY 2026');
  assert(b.uwYear === 2026, `uwYear === 2026 (got ${b.uwYear})`);
  assert(b.currentMonthIndex === 11, `currentMonthIndex === 11 (Dec bucket) (got ${b.currentMonthIndex})`);
}

// ── Test 6: FY boundary year check ───────────────────────────────────────────
// 2024-12-21 is one day before FY 2025 starts (FY 2025 starts 2024-12-22),
// so 2024-12-21 belongs to FY 2024.
{
  const b = getFyBoundaries(new Date('2024-12-21'));
  console.log('\nTest 6: getFyBoundaries(2024-12-21) — last day of FY 2024');
  assert(b.uwYear === 2024, `uwYear === 2024 (got ${b.uwYear})`);
}

// ── Test 6b: Dec 22 of prior year starts next FY ─────────────────────────────
{
  const b = getFyBoundaries(new Date('2024-12-22'));
  console.log('\nTest 6b: getFyBoundaries(2024-12-22) — first day of FY 2025');
  assert(b.uwYear === 2025, `uwYear === 2025 (got ${b.uwYear})`);
}

// ── Test 7: daysInFy sanity check ────────────────────────────────────────────
{
  const b = getFyBoundaries(new Date('2026-04-20'));
  console.log('\nTest 7: daysInFy sanity check for FY 2026');
  // FY 2026: 2025-12-22 to 2026-12-22 exclusive → 365 days (2026 is not a leap year)
  assert(b.daysInFy === 365, `daysInFy === 365 (got ${b.daysInFy})`);
}

// ── Test 8: All 12 windows in FY 2026 span correctly ─────────────────────────
{
  const windows = getMonthWindowsForFy(2026);
  console.log('\nTest 8: All 12 month windows for FY 2026');
  assert(windows.length === 12, `12 windows returned (got ${windows.length})`);
  // Check contiguity: end + 1 day = next start
  let contiguous = true;
  for (let i = 0; i < 11; i++) {
    const endPlusOne = new Date(windows[i].end);
    endPlusOne.setDate(endPlusOne.getDate() + 1);
    if (dateStr(endPlusOne) !== dateStr(windows[i + 1].start)) {
      contiguous = false;
      console.error(`    Gap between window ${i} and ${i + 1}: ${dateStr(windows[i].end)} -> ${dateStr(windows[i+1].start)}`);
    }
  }
  assert(contiguous, 'All windows are contiguous (end+1 = next start)');
}

// ── Summary ──────────────────────────────────────────────────────────────────
console.log(`\n=== Results: ${passed} passed, ${failed} failed ===\n`);
if (failed > 0) {
  process.exit(1);
}
