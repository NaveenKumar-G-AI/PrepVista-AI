# Deliberately allocates far more memory than any reasonable solution
# to this problem needs, regardless of n - should hit MEMORY_LIMIT_EXCEEDED.
import sys
def main():
    data = sys.stdin.read().split()
    huge = [0] * (10 ** 9)
    print(len(huge))
main()
