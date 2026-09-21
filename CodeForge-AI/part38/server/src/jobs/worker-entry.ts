import "dotenv/config";
import { migrate } from "../db/migrate";
import { buildFixtureIntelligencePorts } from "../adapters/fixture-adapters";
import { processNext } from "./queue";

const POLL_INTERVAL_MS = 1500;

async function main() {
  migrate();
  const ports = buildFixtureIntelligencePorts();
  // eslint-disable-next-line no-console
  console.log(`[worker] polling every ${POLL_INTERVAL_MS}ms`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      const didWork = await processNext(ports);
      if (!didWork) await sleep(POLL_INTERVAL_MS);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[worker] unexpected error, continuing", err);
      await sleep(POLL_INTERVAL_MS);
    }
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
