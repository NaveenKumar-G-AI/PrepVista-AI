# Worker (placeholder)

This directory is a reserved extension point for the future background task
queue consumer(s) that will pick up planned work and drive the coding agent.

Part 1 defines the `app/workers/` package inside the backend (an import
target for later task definitions) but ships no standalone worker process.
This top-level `worker/` directory is where a separate worker
entrypoint/deployment unit will live once orchestration is introduced,
keeping the worker process boundary explicit and separate from the API
process from day one.
