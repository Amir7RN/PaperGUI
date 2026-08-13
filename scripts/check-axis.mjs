/**
 * Axis tick labels must reproduce the paper's own ticks.
 *
 * A reproduction that prints "0.1, 0.1, 0.2, 0.2" where the paper printed
 * "0.1, 0.15, 0.2, 0.25" is wrong in the one way this feature cannot afford:
 * a reader checking it against the figure finds two identical labels at
 * different heights. The precision an axis needs is a property of the axis.
 */
import { axisFmt } from "../src/axis.js";

const cases = [
  { name: "the reported case", lo: 0.1, hi: 0.25, n: 4, want: ["0.1", "0.15", "0.2", "0.25"] },
  { name: "0 → 1",             lo: 0,   hi: 1,    n: 5, want: ["0", "0.25", "0.5", "0.75", "1"] },
  { name: "0 → 100",           lo: 0,   hi: 100,  n: 5, want: ["0", "25", "50", "75", "100"] },
  { name: "0 → 0.004",         lo: 0,   hi: 0.004, n: 5, want: ["0", "0.001", "0.002", "0.003", "0.004"] },
  { name: "big counts",        lo: 0,   hi: 4000, n: 5, want: ["0", "1000", "2000", "3000", "4000"] },
  { name: "negative span",     lo: -20, hi: 20,   n: 5, want: ["-20", "-10", "0", "10", "20"] },
];

let bad = 0;
for (const c of cases) {
  const tick = axisFmt(c.lo, c.hi, c.n);
  const got = Array.from({ length: c.n }, (_, i) => tick(c.lo + (c.hi - c.lo) * (i / (c.n - 1))));
  const ok = JSON.stringify(got) === JSON.stringify(c.want);
  // Distinct labels matter as much as exact ones: duplicates are the bug.
  const distinct = new Set(got).size === got.length;
  console.log(`${ok && distinct ? "ok  " : "FAIL"} ${c.name.padEnd(18)} ${got.join(", ")}`);
  if (!ok) { console.log(`      wanted: ${c.want.join(", ")}`); bad++; }
  else if (!distinct) { console.log("      duplicate labels"); bad++; }
}
process.exit(bad ? 1 : 0);
