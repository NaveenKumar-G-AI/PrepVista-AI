import * as fs from 'fs';
import * as path from 'path';
import { withAdmin, closePools } from '../db';
import { createBlueprint } from '../services/blueprintService';
import { DEFAULT_READINESS_GATES } from '../config/readinessConfig';

const OUT_PATH = path.join(__dirname, '..', '..', 'scripts-output', 'seed-output.json');

async function main() {
  const out = await withAdmin(async (client) => {
    // ---- institution + students' auth identities --------------------------
    const {
      rows: [institution],
    } = await client.query(`INSERT INTO institutions (name) VALUES ('Nandagiri Institute of Technology') RETURNING id`);

    async function makeUser(role: string, name: string) {
      const {
        rows: [u],
      } = await client.query(`INSERT INTO app_users (role, institution_id, display_name) VALUES ($1,$2,$3) RETURNING id`, [
        role,
        institution.id,
        name,
      ]);
      return u.id as string;
    }

    const tpoId = await makeUser('tpo', 'Placement Officer (Mr. Iyer)');

    // ---- roles + skills -----------------------------------------------------
    const {
      rows: [swe],
    } = await client.query(`INSERT INTO roles (name) VALUES ('Software Engineer') RETURNING id`);

    const skillNames = ['arrays', 'hash_maps', 'algorithms', 'debugging', 'graphs'];
    const skillIds: Record<string, string> = {};
    for (const name of skillNames) {
      const {
        rows: [s],
      } = await client.query(`INSERT INTO skills (name, category) VALUES ($1, $2) RETURNING id`, [
        name,
        name === 'debugging' ? 'engineering_practice' : name === 'algorithms' ? 'algorithms' : 'data_structures',
      ]);
      skillIds[name] = s.id;
    }

    // ---- challenges (real hidden tests; stdin -> stdout contract) ----------
    async function makeChallenge(cfg: {
      title: string;
      skill: string;
      difficulty: 'easy' | 'medium' | 'hard';
      language: 'python' | 'javascript' | 'java' | 'cpp';
      statement: string;
      starter_code: string;
      public_examples: { input: string; output: string }[];
      hidden_tests: { input: string; expected_output: string }[];
    }) {
      const {
        rows: [c],
      } = await client.query(
        `INSERT INTO challenges (title, skill_id, difficulty, language, statement, starter_code, public_examples, hidden_tests)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [
          cfg.title,
          skillIds[cfg.skill],
          cfg.difficulty,
          cfg.language,
          cfg.statement,
          cfg.starter_code,
          JSON.stringify(cfg.public_examples),
          JSON.stringify(cfg.hidden_tests),
        ]
      );
      return c.id as string;
    }

    const challengeIds: Record<string, string> = {};

    challengeIds.two_sum = await makeChallenge({
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
    });

    challengeIds.contains_duplicate = await makeChallenge({
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
    });

    challengeIds.two_sum_js = await makeChallenge({
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
    });

    challengeIds.group_by_signature = await makeChallenge({
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
    });

    challengeIds.fibonacci_memo = await makeChallenge({
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
    });
    await client.query(`UPDATE challenges SET complexity_probe = $1 WHERE id = $2`, [
      JSON.stringify({ small_input: '15', large_input: '30', input_size_ratio: 2.0, max_acceptable_runtime_ratio: 4 }),
      challengeIds.fibonacci_memo,
    ]);

    challengeIds.two_sum_java = await makeChallenge({
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
    });

    challengeIds.two_sum_cpp = await makeChallenge({
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
    });

    challengeIds.fix_off_by_one = await makeChallenge({
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
    });

    challengeIds.bfs_shortest_path = await makeChallenge({
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
    });

    // ---- blueprint v1 (weights sum to 1.0) ----------------------------------
    const weights = [
      { skill_id: skillIds.arrays, skill_name: 'arrays', weight: 0.15 },
      { skill_id: skillIds.hash_maps, skill_name: 'hash_maps', weight: 0.15 },
      { skill_id: skillIds.algorithms, skill_name: 'algorithms', weight: 0.25 },
      { skill_id: skillIds.debugging, skill_name: 'debugging', weight: 0.2 },
      { skill_id: skillIds.graphs, skill_name: 'graphs', weight: 0.25 },
    ];
    const { blueprintId, version } = await createBlueprint(client, {
      roleId: swe.id,
      name: 'Software Engineer Coding Readiness',
      competencyWeights: weights,
      difficultyDistribution: { easy: 0.2, medium: 0.6, hard: 0.2 },
      readinessGates: DEFAULT_READINESS_GATES,
    });

    // ---- students + pre-existing mastery (section 8) -----------------------
    async function makeStudent(name: string, goal: string) {
      const id = await makeUser('student', name);
      await client.query(`INSERT INTO students (id, institution_id, target_role_id, goal, experience_level) VALUES ($1,$2,$3,$4,$5)`, [
        id,
        institution.id,
        swe.id,
        goal,
        'intermediate',
      ]);
      return id;
    }
    async function setMastery(studentId: string, skill: string, level: string, quality: string) {
      await client.query(
        `INSERT INTO student_skill_mastery (student_id, skill_id, mastery_level, evidence_quality) VALUES ($1,$2,$3,$4)`,
        [studentId, skillIds[skill], level, quality]
      );
    }

    // Ananya — exact section-85 starting scenario: Graphs deliberately left UNSET (unknown).
    const ananyaId = await makeStudent('Ananya Rao', 'Placement Preparation');
    await setMastery(ananyaId, 'arrays', 'strong', 'direct');
    await setMastery(ananyaId, 'hash_maps', 'strong', 'direct');
    await setMastery(ananyaId, 'algorithms', 'developing', 'direct');
    await setMastery(ananyaId, 'debugging', 'developing', 'direct');

    const vikramId = await makeStudent('Vikram Nair', 'Placement Preparation');
    for (const s of skillNames) await setMastery(vikramId, s, 'strong', 'direct');

    const priyaId = await makeStudent('Priya Menon', 'Placement Preparation');
    await setMastery(priyaId, 'arrays', 'weak', 'inferred');
    await setMastery(priyaId, 'hash_maps', 'weak', 'inferred');

    const karthikId = await makeStudent('Karthik Suresh', 'Placement Preparation');
    await setMastery(karthikId, 'arrays', 'competent', 'direct');
    await setMastery(karthikId, 'hash_maps', 'developing', 'direct');
    await setMastery(karthikId, 'algorithms', 'weak', 'inferred');
    await setMastery(karthikId, 'graphs', 'weak', 'inferred');

    const divyaId = await makeStudent('Divya Krishnan', 'Placement Preparation');
    await setMastery(divyaId, 'arrays', 'strong', 'direct');
    await setMastery(divyaId, 'hash_maps', 'competent', 'direct');
    await setMastery(divyaId, 'algorithms', 'competent', 'direct');
    await setMastery(divyaId, 'debugging', 'competent', 'direct');
    await setMastery(divyaId, 'graphs', 'developing', 'inferred');

    const rahulId = await makeStudent('Rahul Pillai', 'Placement Preparation'); // brand new — everything unknown (section 91)

    return {
      institutionId: institution.id,
      tpoId,
      roleId: swe.id,
      skillIds,
      challengeIds,
      blueprintId,
      blueprintVersionId: version.id,
      students: {
        ananya: ananyaId,
        vikram: vikramId,
        priya: priyaId,
        karthik: karthikId,
        divya: divyaId,
        rahul: rahulId,
      },
    };
  });

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log('Seed complete ->', OUT_PATH);
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((err) => {
    console.error('SEED FAILED:', err);
    process.exitCode = 1;
  })
  .finally(() => closePools());
