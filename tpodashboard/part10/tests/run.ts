import { tests as metricServiceTests } from "./metricService.test.js";
import { tests as reportingFunnelTests } from "./reportingFunnel.test.js";
import { tests as dataQualityTests } from "./dataQuality.test.js";
import { tests as reportSnapshotTests } from "./reportSnapshot.test.js";
import type { TestCase } from "./testKit.js";

const suites: { file: string; tests: TestCase[] }[] = [
  { file: "metricService.test.ts", tests: metricServiceTests },
  { file: "reportingFunnel.test.ts", tests: reportingFunnelTests },
  { file: "dataQuality.test.ts", tests: dataQualityTests },
  { file: "reportSnapshot.test.ts", tests: reportSnapshotTests },
];

let pass = 0;
let fail = 0;
const failures: { file: string; name: string; error: unknown }[] = [];

for (const s of suites) {
  console.log(`\n${s.file}`);
  for (const t of s.tests) {
    try {
      await t.fn();
      pass++;
      console.log(`  \u2713 ${t.name}`);
    } catch (err) {
      fail++;
      failures.push({ file: s.file, name: t.name, error: err });
      console.log(`  \u2717 ${t.name}`);
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);

if (fail > 0) {
  console.log("\n--- Failures ---");
  for (const f of failures) {
    console.log(`\n${f.file} > ${f.name}`);
    console.log(f.error instanceof Error ? f.error.stack ?? f.error.message : f.error);
  }
  process.exit(1);
}
