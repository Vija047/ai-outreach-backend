import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET ?? 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  signupCredits: parseInt(process.env.SIGNUP_CREDITS ?? '20', 10),
  analyzeCreditCost: parseInt(process.env.ANALYZE_CREDIT_COST ?? '1', 10),
  generateCreditCost: parseInt(process.env.GENERATE_CREDIT_COST ?? '1', 10),
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiBaseUrl: process.env.OPENAI_BASE_URL ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-4o',
  openaiReferer: process.env.OPENAI_HTTP_REFERER ?? 'http://localhost:3000',
  openaiAppTitle: process.env.OPENAI_APP_TITLE ?? 'AI Outreach',
  firecrawlApiKey: process.env.FIRECRAWL_API_KEY ?? '',
  tavilyApiKey: process.env.TAVILY_API_KEY ?? '',
  rocketreachApiKey: process.env.ROCKETREACH_API_KEY ?? '',
  hunterApiKey: process.env.HUNTER_API_KEY ?? '',
  contactsCacheDays: parseInt(process.env.CONTACTS_CACHE_DAYS ?? '30', 10),
  redisUrl: (() => {
    const host =
      process.env.UPSTASH_REDIS_HOST ?? 'robust-mutt-170161.upstash.io';
    const password = process.env.UPSTASH_REDIS_PASSWORD;
    const direct = process.env.REDIS_URL;

    if (password) {
      return `rediss://default:${password}@${host}:6379`;
    }
    if (direct && !direct.includes('YOUR_UPSTASH_PASSWORD')) {
      return direct;
    }
    return 'redis://localhost:6379';
  })(),
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? '',
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
  googleCallbackUrl:
    process.env.GOOGLE_CALLBACK_URL ??
    'http://localhost:3001/api/v1/auth/google/callback',
  resendApiKey: process.env.RESEND_API_KEY ?? '',
  emailFrom: process.env.EMAIL_FROM ?? 'AI Outreach <onboarding@resend.dev>',
  otpExpiryMinutes: parseInt(process.env.OTP_EXPIRY_MINUTES ?? '10', 10),
}));
