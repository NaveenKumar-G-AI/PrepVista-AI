# Build with a reviewed immutable Node 24 base reference, never an implicit tag.
ARG NODE_BASE
FROM ${NODE_BASE}
WORKDIR /runner
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY evaluate.mjs job.mjs ./
USER 65532:65532
ENTRYPOINT ["/usr/bin/timeout", "--signal=KILL", "15s", "node", "--max-old-space-size=64", "job.mjs"]
