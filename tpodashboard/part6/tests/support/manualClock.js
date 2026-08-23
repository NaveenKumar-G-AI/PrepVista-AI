'use strict';

/**
 * A controllable clock for tests that need to assert on elapsed time
 * (e.g. "time to verify"). `advance(ms)` moves it forward deterministically
 * between service calls instead of relying on real wall-clock time, which
 * would make timing tests flaky.
 */
function createManualClock(startIso) {
  let current = new Date(startIso).getTime();
  const clock = () => new Date(current);
  clock.advance = (ms) => {
    current += ms;
  };
  return clock;
}

module.exports = { createManualClock };
