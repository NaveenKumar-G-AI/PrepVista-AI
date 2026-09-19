// Authored assessment content copied from part7, without its database or identities.
export const assessmentTasks = [
{ sourceKey: "two_sum", ...{
      title: 'Two Sum',
      skill: 'arrays',
      difficulty: 'easy',
      language: 'python',
      statement:
        'Line 1: space-separated integers (the array). Line 2: target integer. Print the two 0-indexed positions whose values sum to target (space separated), scanning left to right.',
      starter_code: `import sys\ndef main():\n    data = sys.stdin.read().split('\\n')\n    nums = list(map(int, data[0].split()))\n    target = int(data[1])\n    # TODO\nmain()\n`,
      public_examples: [{ input: '2 7 11 15\n9', output: '0 1' }],
      hidden_tests: [
        { input: '2 7 11 15\n9', expected_output: '0 1' },
        { input: '3 2 4\n6', expected_output: '1 2' },
        { input: '1 5 3 8 2\n10', expected_output: '3 4' }, // 8(idx3)+2(idx4)=10 is the first-found pair; corrected after real execution caught my original arithmetic error here
      ],
    } },
{ sourceKey: "contains_duplicate", ...{
      title: 'Contains Duplicate',
      skill: 'arrays',
      difficulty: 'easy',
      language: 'python',
      statement: 'Line 1: space-separated integers. Print "true" if any value appears more than once, else "false".',
      starter_code: `import sys\nnums = list(map(int, sys.stdin.read().split()))\n# TODO\n`,
      public_examples: [{ input: '1 2 3 1', output: 'true' }],
      hidden_tests: [
        { input: '1 2 3 1', expected_output: 'true' },
        { input: '1 2 3 4', expected_output: 'false' },
        { input: '7 7 7', expected_output: 'true' },
      ],
    } },
{ sourceKey: "two_sum_js", ...{
      title: 'Two Sum (JavaScript)',
      skill: 'arrays',
      difficulty: 'easy',
      language: 'javascript',
      statement: 'Same as Two Sum, implemented in JavaScript reading from stdin.',
      starter_code: `let data='';process.stdin.on('data',d=>data+=d);process.stdin.on('end',()=>{\n  // TODO\n});\n`,
      public_examples: [{ input: '2 7 11 15\n9', output: '0 1' }],
      hidden_tests: [
        { input: '2 7 11 15\n9', expected_output: '0 1' },
        { input: '3 2 4\n6', expected_output: '1 2' },
      ],
    } },
{ sourceKey: "group_by_signature", ...{
      title: 'DNA Fragment Families (transfer probe: group-anagrams under a different wrapping)',
      skill: 'hash_maps',
      difficulty: 'medium',
      language: 'python',
      statement:
        'Line 1: integer N. Next N lines: DNA fragment strings (A/C/G/T only). Two fragments are in the same family iff they have exactly the same multiset of characters. Print the number of distinct families.',
      starter_code: `import sys\nlines = sys.stdin.read().split('\\n')\nn = int(lines[0])\nfrags = lines[1:1+n]\n# TODO\n`,
      public_examples: [{ input: '3\nACGT\nGTCA\nAACG', output: '2' }],
      hidden_tests: [
        { input: '3\nACGT\nGTCA\nAACG', expected_output: '2' },
        { input: '4\nAAAA\nAAAA\nCCCC\nCCCA', expected_output: '3' },
        { input: '2\nACGT\nTTTT', expected_output: '2' },
      ],
    } },
{ sourceKey: "fibonacci_memo", ...{
      title: 'Nth Fibonacci (must be efficient)',
      skill: 'algorithms',
      difficulty: 'medium',
      language: 'python',
      statement:
        'Print the nth Fibonacci number (fib(0)=0, fib(1)=1) for the given n. n can be up to 32 — a naive exponential-recursion solution risks the time limit; use memoization or an iterative DP.',
      starter_code: `n = int(input())\n# TODO\n`,
      public_examples: [{ input: '10', output: '55' }],
      hidden_tests: [
        { input: '10', expected_output: '55' },
        { input: '20', expected_output: '6765' },
        { input: '32', expected_output: '2178309' },
      ],
    } },
{ sourceKey: "two_sum_java", ...{
      title: 'Two Sum (Java)',
      skill: 'arrays',
      difficulty: 'easy',
      language: 'java',
      statement: 'Same as Two Sum, implemented in Java. Public class must be named Solution.',
      starter_code: `public class Solution {\n    public static void main(String[] args) {\n        // TODO\n    }\n}\n`,
      public_examples: [{ input: '2 7 11 15\n9', output: '0 1' }],
      hidden_tests: [
        { input: '2 7 11 15\n9', expected_output: '0 1' },
        { input: '3 2 4\n6', expected_output: '1 2' },
      ],
    } },
{ sourceKey: "two_sum_cpp", ...{
      title: 'Two Sum (C++)',
      skill: 'arrays',
      difficulty: 'easy',
      language: 'cpp',
      statement: 'Same as Two Sum, implemented in C++17.',
      starter_code: `#include <bits/stdc++.h>\nusing namespace std;\nint main() {\n    // TODO\n    return 0;\n}\n`,
      public_examples: [{ input: '2 7 11 15\n9', output: '0 1' }],
      hidden_tests: [
        { input: '2 7 11 15\n9', expected_output: '0 1' },
        { input: '3 2 4\n6', expected_output: '1 2' },
      ],
    } },
{ sourceKey: "fix_off_by_one", ...{
      title: 'Fix: Inclusive Range Sum',
      skill: 'debugging',
      difficulty: 'medium',
      language: 'python',
      statement:
        'The function below is supposed to sum all integers from a to b INCLUSIVE, but has a bug. Line 1 of input: "a b". Fix the function and print the correct sum.\n\nBroken code given:\ndef sum_range(a, b):\n    total = 0\n    for i in range(a, b):\n        total += i\n    return total',
      starter_code: `import sys\ndef sum_range(a, b):\n    total = 0\n    for i in range(a, b):\n        total += i\n    return total\na, b = map(int, sys.stdin.read().split())\nprint(sum_range(a, b))\n`,
      public_examples: [{ input: '1 5', output: '15' }],
      hidden_tests: [
        { input: '1 5', expected_output: '15' },
        { input: '3 3', expected_output: '3' },
        { input: '0 10', expected_output: '55' },
      ],
    } },
{ sourceKey: "bfs_shortest_path", ...{
      title: 'Shortest Path (BFS)',
      skill: 'graphs',
      difficulty: 'medium',
      language: 'python',
      statement:
        'Line 1: integer E (edge count). Next E lines: "u v" (undirected edge). Final line: "start end". Print the shortest path length in EDGES from start to end, or -1 if unreachable.',
      starter_code: `import sys\nfrom collections import defaultdict, deque\nlines = sys.stdin.read().split('\\n')\ne = int(lines[0])\nadj = defaultdict(list)\nfor i in range(1, e+1):\n    u, v = lines[i].split()\n    adj[u].append(v); adj[v].append(u)\nstart, end = lines[e+1].split()\n# TODO: BFS\n`,
      public_examples: [{ input: '3\n1 2\n2 3\n3 4\n1 4', output: '3' }],
      hidden_tests: [
        { input: '3\n1 2\n2 3\n3 4\n1 4', expected_output: '3' },
        { input: '1\n1 2\n1 1', expected_output: '0' },
        { input: '2\n1 2\n3 4\n1 4', expected_output: '-1' },
      ],
    } }
];
