# Where to deploy

| App | Platform | Why |
|-----|----------|-----|
| **Frontend** (`ai-outreach-frontend`) | **Vercel** | Next.js static/SSR |
| **Backend** (`ai-outreach-backend`) | **Render** (Docker) | NestJS + Prisma + Redis + BullMQ need a long-running server |

Do **not** deploy the backend to Vercel — serverless cannot run BullMQ workers or persistent Redis queues reliably.

---

## Deploy backend on Render

1. [render.com](https://render.com) → **New → Blueprint** (or Web Service)
2. Connect repo: `Vija047/ai-outreach-backend`
3. Uses `render.yaml` + `Dockerfile` automatically
4. Set env vars in Render dashboard (see below)
5. Health check: `/api/v1/health`

### Required env vars (Render)

```
DATABASE_URL=          # Neon Postgres
REDIS_URL=             # Upstash rediss://...
JWT_SECRET=            # auto-generated or openssl rand -base64 64
FRONTEND_URL=https://ai-outreach-frontend-ten.vercel.app
CORS_ORIGINS=https://ai-outreach-frontend-ten.vercel.app
GOOGLE_CALLBACK_URL=https://YOUR-API.onrender.com/api/v1/auth/google/callback

EMAIL_USER=getaioutreach@gmail.com
EMAIL_PASS=            # Google App Password
EMAIL_FROM=AI Outreach <getaioutreach@gmail.com>
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587

OPENAI_API_KEY=        # OpenRouter sk-or-v1-...
OPENAI_HTTP_REFERER=https://ai-outreach-frontend-ten.vercel.app
FIRECRAWL_API_KEY=
TAVILY_API_KEY=
ROCKETREACH_API_KEY=
HUNTER_API_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

### After Render is live

On **Vercel** (frontend project) → Settings → Environment Variables:

```
NEXT_PUBLIC_API_URL=https://YOUR-API.onrender.com/api/v1
```

Redeploy frontend.

---

## Local dev

```bash
npm ci
cp .env.example .env   # fill secrets
npx prisma migrate deploy
npm run start:dev
```

API: `http://localhost:3001/api/v1`
