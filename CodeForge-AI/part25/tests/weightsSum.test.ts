import { test, assertTrue } from './harness';
import { DEFAULT_WEIGHTS_V1 } from '../src/config/selectionWeights';

test('default weights sum to 1.0', () => {
  const { version, ...rest } = DEFAULT_WEIGHTS_V1;
  const sum = Object.values(rest).reduce((a, b) => a + (b as number), 0);
  assertTrue(Math.abs(sum - 1) < 1e-6, `weights must sum to 1, got ${sum}`);
});
