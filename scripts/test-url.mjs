const BASE = 'http://localhost:3001/api/v1';
const companyUrl = 'https://nextjobconnect.com/?ref=trustmrr';
const email = `test-${Date.now()}@outreach.test`;

async function req(method, path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: await res.json().catch(() => ({})) };
}

async function main() {
  const reg = await req('POST', '/auth/register', {
    name: 'Test User',
    email,
    password: 'password123',
  });
  console.log('Register', reg.status, reg.data.message ?? 'ok');
  const token = reg.data.accessToken;
  if (!token) throw new Error('No token');

  const analyze = await req(
    'POST',
    '/company/analyze',
    { url: companyUrl },
    token,
  );
  console.log('Analyze', analyze);

  if (!analyze.data.jobId) return;

  for (let i = 0; i < 40; i++) {
    const job = await req('GET', `/company/jobs/${analyze.data.jobId}`, null, token);
    console.log(
      `Poll ${i + 1}:`,
      job.data.status,
      job.data.step ?? '',
      job.data.errorCode ?? '',
    );
    if (job.data.status === 'DONE' || job.data.status === 'FAILED') {
      console.log(JSON.stringify(job.data, null, 2));
      break;
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
