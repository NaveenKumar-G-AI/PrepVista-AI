// Original authored reference programs; strings only, never executed by the server.
export const assessmentSolutions = {
two_sum: {
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
contains_duplicate: {
      language: 'python',
      code: `import sys
nums = list(map(int, sys.stdin.read().split()))
print("true" if len(nums) != len(set(nums)) else "false")
`,
    },
two_sum_js: {
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
two_sum_java: {
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
two_sum_cpp: {
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
two_sum_cpp_unparseable: { language: 'cpp', code: `int main() { this is not valid c++ at all !!! }\n` },
group_by_signature: {
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
fibonacci_memo: {
      language: 'python',
      code: `n = int(input())
a, b = 0, 1
for _ in range(n):
    a, b = b, a + b
print(a)
`,
    },
fix_off_by_one: {
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
bfs_shortest_path: {
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
    }
};
