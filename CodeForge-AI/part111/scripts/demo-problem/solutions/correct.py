import sys
def main():
    data = sys.stdin.read().split()
    idx = 0
    n = int(data[idx]); idx += 1
    target = int(data[idx]); idx += 1
    arr = [int(x) for x in data[idx:idx + n]]
    freq = {}
    count = 0
    for x in arr:
        complement = target - x
        if complement in freq:
            count += freq[complement]
        freq[x] = freq.get(x, 0) + 1
    print(count)
main()
