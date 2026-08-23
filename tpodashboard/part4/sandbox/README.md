# Sandbox (placeholder)

This directory is a reserved extension point for the future **agent
execution sandbox** — the isolated environment where the coding agent will
run code, execute tests, and interact with a project's files.

This is architecturally distinct from the *development* Docker Compose
setup in `docker-compose.yml` at the repository root:

- `docker-compose.yml` (root): runs the backend API and PostgreSQL for
  local development of this platform itself.
- `sandbox/` (this directory): will define the isolated runtime(s) in which
  the autonomous agent executes *other* people's code. It has different
  security, resource, and lifecycle requirements and must not be conflated
  with the development environment.

Part 1 implements neither the sandbox execution engine nor its container
images. Nothing in this directory is used yet.
