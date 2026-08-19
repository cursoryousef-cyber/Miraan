# ============================================================================
# Production Dockerfile for Miran NestJS Backend
# ============================================================================

# Stage 1: Build stage
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma Client & Build NestJS app
RUN npx prisma generate
RUN npm run build

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /usr/src/app

ENV NODE_ENV=production

# Copy built artifacts and dependencies
COPY package*.json ./
COPY prisma ./prisma/
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist

# Create upload directory
RUN mkdir -p uploads

EXPOSE 3000

# Start command — nest build (no explicit tsconfig rootDir) preserves the
# src/ layout under dist/, so the real entry file is dist/src/main.js.
CMD ["node", "dist/src/main.js"]
