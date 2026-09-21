"""
Load test starting point (Feature 84).

NOT executed as part of this build — there is no deployed instance of this
service anywhere for it to hit (this sandbox has no inbound network and no
persistent deployment), so any numbers this would produce here would be
meaningless. This file exists so you have a real starting point rather
than nothing: point it at a running `uvicorn ai_gateway.api:app` (locally
or in staging) and run for real.

Usage:
    pip install locust
    uvicorn ai_gateway.api:app --port 8000 &
    locust -f loadtest/locustfile.py --host http://localhost:8000 \
           --users 50 --spawn-rate 5 --run-time 2m --headless

What to look at afterward (Feature 84's actual metrics):
    - request throughput and p50/p90/p95/p99 latency (Locust reports these)
    - whether cost/budget accounting stayed correct under concurrency
      (query ai_cost_events afterward and cross-check against Locust's
      request count x expected per-request cost)
    - whether the circuit breaker or rate limiter engaged unexpectedly —
      check GET /v1/admin/health/circuit-breakers during the run
"""

from locust import HttpUser, between, task


class GatewayUser(HttpUser):
    wait_time = between(0.2, 1.5)

    @task(3)
    def interactive_hint(self):
        self.client.post(
            "/v1/ai/execute",
            json={
                "feature": "hint_ladder",
                "operation": "hint_ladder.next_hint",
                "messages": [{"role": "user", "content": "why is my loop infinite?"}],
                "input_payload": {"code": "while True:\n    pass"},
                "user_id": "loadtest_student",
                "organization_id": "loadtest_org",
            },
            name="/v1/ai/execute [hint_ladder]",
        )

    @task(1)
    def code_explanation(self):
        self.client.post(
            "/v1/ai/execute",
            json={
                "feature": "code_coach",
                "operation": "code_coach.explain_error",
                "messages": [{"role": "user", "content": "explain this traceback"}],
                "input_payload": {"error": "IndexError: list index out of range"},
                "user_id": "loadtest_student",
                "organization_id": "loadtest_org",
            },
            name="/v1/ai/execute [code_coach]",
        )

    @task(1)
    def health_check(self):
        self.client.get("/healthz")
