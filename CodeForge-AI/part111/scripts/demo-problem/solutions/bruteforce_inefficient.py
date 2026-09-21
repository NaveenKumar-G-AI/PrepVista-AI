# Correct, but O(n^2) - fine for small inputs, times out on the
# large-input/performance hidden test.
import sys
def main():
    data = sys.stdin.read().split()
    idx = 0
    n = int(data[idx]); idx += 1
    target = int(data[idx]); idx += 1
    arr = [int(x) for x in data[idx:idx + n]]
    count = 0
    for i in range(n):
        for j in range(i + 1, n):
            if arr[i] + arr[j] == target:
                count += 1
    print(count)
main()
