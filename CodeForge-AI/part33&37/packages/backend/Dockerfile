FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY packages/shared/package*.json ./packages/shared/
COPY packages/backend/package*.json ./packages/backend/

RUN npm ci --workspaces --include-workspace-root

# Copy source code
COPY packages/shared ./packages/shared
COPY packages/backend ./packages/backend

# Build shared package first
RUN npm run build --workspace=packages/shared

# Generate Prisma client
RUN npm run db:generate --workspace=packages/backend

# Build backend
RUN npm run build --workspace=packages/backend

EXPOSE 3001

CMD ["npm", "run", "start", "--workspace=packages/backend"]