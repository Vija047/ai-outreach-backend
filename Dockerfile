FROM node:22-alpine AS builder

WORKDIR /app

# Dummy URL only for prisma generate during build (not used at runtime)
ENV DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ai_outreach?schema=public

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci --ignore-scripts \
  && npx prisma generate

COPY . .

RUN npx nest build \
  && npm prune --omit=dev

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma/
COPY prisma.config.ts ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["sh", "-c", "if [ -z \"$DATABASE_URL\" ]; then echo 'ERROR: DATABASE_URL environment variable is missing on Render!' && exit 1; fi && npx prisma migrate deploy && node dist/main.js"]

