FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* turbo.json tsconfig.base.json ./

# Copy package sources
COPY packages/shared ./packages/shared
COPY apps/backend ./apps/backend

# Install dependencies
RUN pnpm install --frozen-lockfile || pnpm install

# Build shared package first
RUN pnpm --filter @agent-safe/shared build

# Build backend
RUN pnpm --filter @agent-safe/backend build

EXPOSE 4000
CMD ["node", "apps/backend/dist/index.js"]
