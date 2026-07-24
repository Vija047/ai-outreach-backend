/**
 * Live API test script for AI Outreach backend.
 * Usage: node scripts/test-live-flow.mjs
 *
 * Set BYPASS_EMAIL_VERIFICATION=true in backend .env for auto-login after register,
 * or pass VERIFY_TOKEN=<raw token from email> to test the verify flow.
 */
const BASE = process.env.API_BASE ?? 'http://localhost:3001/api/v1';
const TEST_EMAIL = process.env.TEST_EMAIL ?? `test-${Date.now()}@outreach.test`;
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'password123';
const VERIFY_TOKEN = process.env.VERIFY_TOKEN ?? '';
const COMPANY_URL = 'https://talentpluto.com/';

async function request(method, path, body, token) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
    return { status: res.status, data };
  } finally {
    clearTimeout(timeout);
  }
}

function log(step, result) {
  console.log(`\n=== ${step} ===`);
  console.log(`Status: ${result.status}`);
  console.log(JSON.stringify(result.data, null, 2));
}

async function pollJob(token, jobId, maxAttempts = 30) {
  for (let i = 1; i <= maxAttempts; i++) {
    const result = await request('GET', `/company/jobs/${jobId}`, null, token);
    log(`Poll Job (${i}/${maxAttempts})`, result);
    const status = result.data?.status;
    if (status === 'DONE' || status === 'FAILED') return result;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error('Job polling timed out');
}

async function main() {
  console.log(`Testing API at ${BASE}`);
  console.log(`Company URL: ${COMPANY_URL}`);
  console.log(`Test user: ${TEST_EMAIL}`);

  const health = await request('GET', '/health');
  log('Health', health);
  if (health.status !== 200) throw new Error('Health check failed');

  const register = await request('POST', '/auth/register', {
    name: 'Test User',
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
  });
  log('Register', register);
  if (register.status >= 400) throw new Error('Register failed');

  let token = register.data?.accessToken;

  if (!token && VERIFY_TOKEN) {
    const verify = await request(
      'GET',
      `/auth/verify-email?token=${encodeURIComponent(VERIFY_TOKEN)}`,
    );
    log('Verify Email', verify);
    if (verify.status >= 400) throw new Error('Email verification failed');

    const login = await request('POST', '/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    log('Login', login);
    token = login.data?.accessToken;
  }

  if (!token) {
    throw new Error(
      'No access token after register. Set BYPASS_EMAIL_VERIFICATION=true on backend, or VERIFY_TOKEN=<token from email>.',
    );
  }

  const me = await request('GET', '/auth/me', null, token);
  log('Get Me', me);
  if (me.status !== 200) throw new Error('Get me failed');

  const profile = await request('PATCH', '/profile', {
    role: 'AI Full Stack Developer',
    company: 'VR Solutions',
    services: ['Web Development', 'AI Automation', 'Cold Email'],
    targetCustomers: 'US Startups',
    valueProposition:
      'I help startups build AI-powered web applications and outreach systems faster.',
    tone: 'Professional',
  }, token);
  log('Update Profile', profile);

  const creditsBefore = await request('GET', '/credits', null, token);
  log('Credits Before', creditsBefore);

  const analyze = await request('POST', '/company/analyze', {
    url: COMPANY_URL,
  }, token);
  log('Analyze Company', analyze);
  if (!analyze.data?.jobId) throw new Error('Analyze failed');

  const job = await pollJob(token, analyze.data.jobId);
  if (job.data?.status === 'FAILED') {
    throw new Error(`Analysis failed: ${job.data?.error ?? 'unknown'}`);
  }

  const companyId = job.data?.companyId ?? job.data?.company?.id;
  const hookId = job.data?.company?.hooks?.[0]?.id;

  if (!companyId) throw new Error('No companyId from job');

  const hooks = await request('GET', `/company/${companyId}/hooks`, null, token);
  log('Company Hooks', hooks);

  const generate = await request('POST', '/generate', {
    companyId,
    hookId: hookId ?? hooks.data?.[0]?.id,
    tone: 'Professional',
  }, token);
  log('Generate Outreach', generate);

  const history = await request('GET', '/history?page=1&limit=5', null, token);
  log('History', history);

  const analytics = await request('GET', '/analytics/summary', null, token);
  log('Analytics', analytics);

  const creditsAfter = await request('GET', '/credits', null, token);
  log('Credits After', creditsAfter);

  console.log('\n✅ Live flow test completed successfully');
}

main().catch((err) => {
  console.error('\n❌ Test failed:', err.message);
  process.exit(1);
});
