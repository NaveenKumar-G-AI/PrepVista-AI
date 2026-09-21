import { runSubmission } from '../execution/executionEngine';
import { SOLUTIONS } from './solutions';
import { heading, sub, assertTrue } from './printUtils';

const TWO_SUM_TESTS = [
  { input: '2 7 11 15\n9', expected_output: '0 1' },
  { input: '3 2 4\n6', expected_output: '1 2' },
];

async function main() {
  heading('MULTI-LANGUAGE EXECUTION — Java & C++ compile+run, and a real compile error');

  sub('Java — correct solution');
  const javaCorrect = await runSubmission('java', SOLUTIONS.two_sum_java.correct!.code, TWO_SUM_TESTS);
  console.log(javaCorrect);
  assertTrue(javaCorrect.status === 'passed' && javaCorrect.tests_passed === 2, 'javac compiled it and both hidden tests passed for real');

  sub('Java — broken solution');
  const javaBroken = await runSubmission('java', SOLUTIONS.two_sum_java.broken!.code, TWO_SUM_TESTS);
  console.log(javaBroken);
  assertTrue(javaBroken.tests_passed === 1, 'Broken Java submission gets partial credit (matches test 1 by luck) — real per-test grading, not pass/fail-only');

  sub('C++ — correct solution');
  const cppCorrect = await runSubmission('cpp', SOLUTIONS.two_sum_cpp.correct!.code, TWO_SUM_TESTS);
  console.log(cppCorrect);
  assertTrue(cppCorrect.status === 'passed' && cppCorrect.tests_passed === 2, 'g++ compiled it and both hidden tests passed for real');

  sub('C++ — broken solution');
  const cppBroken = await runSubmission('cpp', SOLUTIONS.two_sum_cpp.broken!.code, TWO_SUM_TESTS);
  console.log(cppBroken);
  assertTrue(cppBroken.tests_passed === 1, 'Broken C++ submission gets partial credit — same grading path as every other language');

  sub('C++ — genuinely unparseable source (proves compile_error is a real, reachable status)');
  const cppInvalid = await runSubmission('cpp', SOLUTIONS.two_sum_cpp_unparseable.correct!.code, TWO_SUM_TESTS);
  console.log({ status: cppInvalid.status, compile_stderr_excerpt: cppInvalid.compile_stderr?.slice(0, 200) });
  assertTrue(cppInvalid.status === 'compile_error', `Status is compile_error (got ${cppInvalid.status})`);
  assertTrue(!!cppInvalid.compile_stderr && cppInvalid.compile_stderr.includes('error'), 'Real g++ stderr is captured and stored, not synthesized');

  sub('Python & JavaScript — unaffected by the refactor (regression check)');
  const pyCorrect = await runSubmission('python', SOLUTIONS.two_sum.correct!.code, TWO_SUM_TESTS);
  const jsCorrect = await runSubmission('javascript', SOLUTIONS.two_sum_js.correct!.code, TWO_SUM_TESTS);
  assertTrue(pyCorrect.status === 'passed', 'Python still passes after the executionEngine refactor');
  assertTrue(jsCorrect.status === 'passed', 'JavaScript still passes after the executionEngine refactor');
}

main().catch((err) => {
  console.error('MULTI-LANGUAGE TEST FAILED:', err);
  process.exitCode = 1;
});
