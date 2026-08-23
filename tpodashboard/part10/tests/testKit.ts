export interface TestCase {
  name: string;
  fn: () => void | Promise<void>;
}

export function suite(fileLabel: string, tests: TestCase[]): { fileLabel: string; tests: TestCase[] } {
  return { fileLabel, tests };
}
