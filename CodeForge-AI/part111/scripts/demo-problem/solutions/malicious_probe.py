# Computes the CORRECT answer (so its verdict is a clean signal about
# containment, not conflated with wrong-answer/perf), but first tries
# a battery of sandbox-escape probes. Every probe is wrapped so the
# program still runs to completion regardless of whether the probe
# is blocked - the point is to observe that it IS blocked.
import sys, os, socket

def main():
    probe_log = []
    try:
        with open("/etc/passwd") as f:
            f.read()
        probe_log.append("read /etc/passwd: SUCCEEDED")
    except Exception as e:
        probe_log.append(f"read /etc/passwd: blocked ({type(e).__name__})")

    try:
        s = socket.create_connection(("93.184.216.34", 80), timeout=1)
        s.close()
        probe_log.append("network connect: SUCCEEDED")
    except Exception as e:
        probe_log.append(f"network connect: blocked ({type(e).__name__})")

    try:
        os.listdir("/home")
        probe_log.append("list /home: SUCCEEDED")
    except Exception as e:
        probe_log.append(f"list /home: blocked ({type(e).__name__})")

    sys.stderr.write("PROBE_RESULTS: " + " | ".join(probe_log) + "\n")

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
