# Subtle bug: uses a set instead of a frequency map, so it silently
# undercounts whenever a value's multiplicity matters (duplicates,
# self-pairs). Passes simple public tests with distinct values.
import sys
def main():
    data = sys.stdin.read().split()
    idx = 0
    n = int(data[idx]); idx += 1
    target = int(data[idx]); idx += 1
    arr = [int(x) for x in data[idx:idx + n]]
    seen = set()
    count = 0
    for x in arr:
        complement = target - x
        if complement in seen:
            count += 1
        seen.add(x)
    print(count)
main()
