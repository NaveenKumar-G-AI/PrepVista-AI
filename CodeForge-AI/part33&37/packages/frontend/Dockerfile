FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/frontend/package*.json ./packages/frontend/

RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/frontend ./packages/frontend

# Build shared package first
RUN npm run build --workspace=packages/shared

# Build frontend
RUN npm run build --workspace=packages/frontend

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace=packages/frontend"]