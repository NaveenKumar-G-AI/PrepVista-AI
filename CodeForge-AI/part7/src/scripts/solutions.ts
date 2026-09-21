export interface Solution {
  language: 'python' | 'javascript' | 'java' | 'cpp';
  code: string;
}

// Every "broken"/"partial" variant below is a REAL, runnable program with a
// genuine bug — nothing here pre-decides pass/fail; the actual test outcome
// comes from src/execution/executionEngine.ts actually running it.
export const SOLUTIONS: Record<string, Partial<Record<'correct' | 'broken' | 'partial' | 'correct_inefficient', Solution>>> = {
  two_sum: {
    correct: {
      language: 'python',
      code: `import sys
data = sys.stdin.read().split('\\n')
nums = list(map(int, data[0].split()))
target = int(data[1])
seen = {}
for i, n in enumerate(nums):
    c = target - n
    if c in seen:
        print(seen[c], i)
        break
    seen[n] = i
`,
    },
    broken: { language: 'python', code: `print("0 1")\n` }, // matches test 1 by luck, wrong for 2 & 3 -> weak
    partial: undefined,
  },

  contains_duplicate: {
    correct: {
      language: 'python',
      code: `import sys
nums = list(map(int, sys.stdin.read().split()))
print("true" if len(nums) != len(set(nums)) else "false")
`,
    },
    broken: { language: 'python', code: `print("false")\n` },
    partial: undefined,
  },

  two_sum_js: {
    correct: {
      language: 'javascript',
      code: `let data='';
process.stdin.on('data',d=>data+=d);
process.stdin.on('end',()=>{
  const lines = data.split('\\n');
  const nums = lines[0].trim().split(/\\s+/).map(Number);
  const target = parseInt(lines[1].trim(),10);
  const seen = new Map();
  for (let i=0;i<nums.length;i++){
    const c = target-nums[i];
    if (seen.has(c)) { console.log(seen.get(c), i); return; }
    seen.set(nums[i], i);
  }
});
`,
    },
    broken: {
      language: 'javascript',
      code: `let data='';
process.stdin.on('data',d=>data+=d);
process.stdin.on('end',()=>{ console.log("0 1"); });
`,
    },
    partial: undefined,
  },

  two_sum_java: {
    correct: {
      language: 'java',
      code: `import java.util.*;
import java.io.*;

public class Solution {
    public static void main(String[] args) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String[] parts = br.readLine().trim().split("\\\\s+");
        int[] nums = new int[parts.length];
        for (int i = 0; i < parts.length; i++) nums[i] = Integer.parseInt(parts[i]);
        int target = Integer.parseInt(br.readLine().trim());
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int c = target - nums[i];
            if (seen.containsKey(c)) {
                System.out.println(seen.get(c) + " " + i);
                return;
            }
            seen.put(nums[i], i);
        }
    }
}
`,
    },
    broken: {
      language: 'java',
      code: `public class Solution {
    public static void main(String[] args) {
        System.out.println("0 1");
    }
}
`,
    },
    partial: undefined,
  },

  two_sum_cpp: {
    correct: {
      language: 'cpp',
      code: `#include <bits/stdc++.h>
using namespace std;
int main() {
    string line1, line2;
    getline(cin, line1);
    getline(cin, line2);
    stringstream ss(line1);
    vector<int> nums;
    int x;
    while (ss >> x) nums.push_back(x);
    int target = stoi(line2);
    unordered_map<int,int> seen;
    for (int i = 0; i < (int)nums.size(); i++) {
        int c = target - nums[i];
        if (seen.count(c)) {
            cout << seen[c] << " " << i << endl;
            return 0;
        }
        seen[nums[i]] = i;
    }
    return 0;
}
`,
    },
    broken: {
      language: 'cpp',
      code: `#include <iostream>
int main() {
    std::cout << "0 1" << std::endl;
    return 0;
}
`,
    },
    partial: undefined,
  },

  // Deliberately invalid C++ — proves compile_error is a real, distinct
  // outcome rather than a theoretical enum value nothing ever produces.
  two_sum_cpp_unparseable: {
    correct: { language: 'cpp', code: `int main() { this is not valid c++ at all !!! }\n` },
    broken: undefined,
    partial: undefined,
  },

  group_by_signature: {
    correct: {
      language: 'python',
      code: `import sys
lines = sys.stdin.read().split('\\n')
n = int(lines[0])
frags = lines[1:1+n]
seen = set()
for f in frags:
    seen.add(''.join(sorted(f.strip())))
print(len(seen))
`,
    },
    broken: { language: 'python', code: `print(0)\n` },
    partial: undefined,
  },

  fibonacci_memo: {
    correct: {
      language: 'python',
      code: `n = int(input())
a, b = 0, 1
for _ in range(n):
    a, b = b, a + b
print(a)
`,
    },
    broken: { language: 'python', code: `print(int(input()) * 2)\n` }, // not fibonacci at all -> 0/3
    // Mathematically CORRECT (passes all 3 correctness tests) but exponential
    // time — no memoization. Used specifically to exercise the real
    // complexity probe: correctness alone can't tell these two apart, but
    // measureComplexity() (an actual timed experiment) can and does.
    correct_inefficient: {
      language: 'python',
      code: `import sys
sys.setrecursionlimit(10000)
def fib(n):
    if n < 2:
        return n
    return fib(n - 1) + fib(n - 2)
n = int(input())
print(fib(n))
`,
    },
    partial: undefined,
  },

  fix_off_by_one: {
    correct: {
      language: 'python',
      code: `import sys
def sum_range(a, b):
    total = 0
    for i in range(a, b + 1):
        total += i
    return total
a, b = map(int, sys.stdin.read().split())
print(sum_range(a, b))
`,
    },
    broken: {
      language: 'python',
      code: `import sys
def sum_range(a, b):
    total = 0
    for i in range(a, b):
        total += i
    return total
a, b = map(int, sys.stdin.read().split())
print(sum_range(a, b))
`,
    },
    // Realistic partial fix: correctly fixes the range bug, but mishandles
    // the a==b edge case -> passes 2/3 hidden tests (section 85's
    // "Debugging -> Developing" outcome, reached honestly via a real bug).
    partial: {
      language: 'python',
      code: `import sys
def sum_range(a, b):
    if a == b:
        return 0  # should be a (== b)
    total = 0
    for i in range(a, b + 1):
        total += i
    return total
a, b = map(int, sys.stdin.read().split())
print(sum_range(a, b))
`,
    },
  },

  bfs_shortest_path: {
    correct: {
      language: 'python',
      code: `import sys
from collections import defaultdict, deque
lines = sys.stdin.read().split('\\n')
e = int(lines[0])
adj = defaultdict(list)
for i in range(1, e + 1):
    u, v = lines[i].split()
    adj[u].append(v); adj[v].append(u)
start, end = lines[e + 1].split()
dist = {start: 0}
q = deque([start])
while q:
    cur = q.popleft()
    for nxt in adj[cur]:
        if nxt not in dist:
            dist[nxt] = dist[cur] + 1
            q.append(nxt)
print(dist.get(end, -1))
`,
    },
    broken: {
      language: 'python',
      code: `import sys
lines = sys.stdin.read().split('\\n')
print(-1)
`,
    },
    // Realistic partial: correct BFS, but forgets the "unreachable" default
    // and crashes with KeyError on that one case -> 2/3 -> developing.
    partial: {
      language: 'python',
      code: `import sys
from collections import defaultdict, deque
lines = sys.stdin.read().split('\\n')
e = int(lines[0])
adj = defaultdict(list)
for i in range(1, e + 1):
    u, v = lines[i].split()
    adj[u].append(v); adj[v].append(u)
start, end = lines[e + 1].split()
dist = {start: 0}
q = deque([start])
while q:
    cur = q.popleft()
    for nxt in adj[cur]:
        if nxt not in dist:
            dist[nxt] = dist[cur] + 1
            q.append(nxt)
print(dist[end])
`,
    },
  },
};
