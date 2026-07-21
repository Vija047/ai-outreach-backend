# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

COPY . .

RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# prisma is a production dependency so migrate deploy works at runtime
RUN npm ci --omit=dev && npx prisma generate

COPY --from=builder /app/dist ./dist

# Render injects PORT; default matches local/docker-compose expectations
EXPOSE 3001

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
