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



NODE_ENV=production

# Render FREE tier workaround (recommended for Free tier — automatically verifies users upon signup)
BYPASS_EMAIL_VERIFICATION=true

# Or Gmail SMTP (requires Render Starter plan, as Free tier blocks SMTP ports)
EMAIL_PROVIDER=smtp
EMAIL_USER=getaioutreach@gmail.com
EMAIL_PASS=            # Google App Password (no spaces)
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



## Email with SMTP (Gmail)



Your timeout error happens because **Render FREE tier blocks SMTP ports 587 and 465**. Gmail SMTP cannot connect — it is not a code bug.



### Step 1 — Upgrade Render to Starter ($7/month)



1. Render Dashboard → your backend service (`ai-outreach-backend-1-njls`)

2. **Settings** → **Instance Type**

3. Change **Free** → **Starter** ($7/mo)

4. Save (service redeploys automatically)



Paid Render instances allow outbound SMTP on ports 587 and 465.



### Step 2 — Create Gmail App Password



1. Google Account → [App Passwords](https://myaccount.google.com/apppasswords)

2. Enable 2-Step Verification if needed

3. Create app password for "Mail" → copy the 16-character password



### Step 3 — Set Render environment variables



In Render → **Environment**:



| Variable | Value |

|----------|-------|

| `NODE_ENV` | `production` |

| `EMAIL_PROVIDER` | `smtp` |

| `EMAIL_USER` | `getaioutreach@gmail.com` |

| `EMAIL_PASS` | your 16-char app password (no spaces) |

| `EMAIL_FROM` | `AI Outreach <getaioutreach@gmail.com>` |

| `SMTP_HOST` | `smtp.gmail.com` |

| `SMTP_PORT` | `587` |



To bypass email verification entirely on Render Free tier instead of upgrading, set `BYPASS_EMAIL_VERIFICATION=true`.



### Step 4 — Redeploy and verify logs



After deploy, logs should show:



```

[EmailService] SMTP connection verified

```



If signup still fails, try port 465:



```

SMTP_PORT=465

SMTP_SECURE=true

```



### Local dev (SMTP works without paid Render)



```bash

cp .env.example .env

# Fill EMAIL_USER, EMAIL_PASS, SMTP_HOST, SMTP_PORT

npm run start:dev

```



OTP is logged in the terminal if email is not configured.



---



## Local dev



```bash

npm ci

cp .env.example .env   # fill secrets

npx prisma migrate deploy

npm run start:dev

```



API: `http://localhost:3001/api/v1`

