import { registerAs } from '@nestjs/config';

function resolveRedisUrl(): string {
  const direct = process.env.REDIS_URL?.trim();
  if (direct && !direct.includes('YOUR_UPSTASH_PASSWORD')) {
    return direct;
  }

  const host = process.env.UPSTASH_REDIS_HOST?.trim();
  const password = process.env.UPSTASH_REDIS_PASSWORD?.trim();
  if (host && password) {
    return `rediss://default:${password}@${host}:6379`;
  }

  return 'redis://localhost:6379';
}

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  databaseUrl: process.env.DATABASE_URL ?? '',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  signupCredits: parseInt(process.env.SIGNUP_CREDITS ?? '20', 10),
  analyzeCreditCost: parseInt(process.env.ANALYZE_CREDIT_COST ?? '1', 10),
  generateCreditCost: parseInt(process.env.GENERATE_CREDIT_COST ?? '1', 10),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'openai/gpt-4o-mini',
  openaiReferer: process.env.OPENAI_HTTP_REFERER ?? 'http://localhost:3000',
  openaiAppTitle: process.env.OPENAI_APP_TITLE ?? 'AI Outreach',
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? '',
  tavilyApiKey: process.env.TAVILY_API_KEY ?? '',
  rocketreachApiKey: process.env.ROCKETREACH_API_KEY ?? '',
  hunterApiKey: process.env.HUNTER_API_KEY ?? '',
  contactsCacheDays: parseInt(process.env.CONTACTS_CACHE_DAYS ?? '30', 10),
  redisUrl: resolveRedisUrl(),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ??
    'http://localhost:3001/api/v1/auth/google/callback',
  // smtp (default) — SMTP needs Render Starter+ (free tier blocks port 587/465)
  emailProvider: process.env.EMAIL_PROVIDER ?? 'smtp',
  bypassEmailVerification: process.env.BYPASS_EMAIL_VERIFICATION === 'true',
  emailUser: process.env.EMAIL_USER ?? '',
  emailPass: process.env.EMAIL_PASS ?? '',
  emailFrom:
    process.env.EMAIL_FROM ??
    (process.env.EMAIL_USER
      ? `AI Outreach <${process.env.EMAIL_USER}>`
      : 'AI Outreach <noreply@localhost>'),
  smtpHost: process.env.SMTP_HOST ?? 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT ?? '587', 10),
  smtpSecure:
    process.env.SMTP_SECURE === 'true' ||
    parseInt(process.env.SMTP_PORT ?? '587', 10) === 465,
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES ?? '10', 10),
}));
