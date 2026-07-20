import 'dotenv/config';

const ROCKETREACH_KEY = process.env.ROCKETREACH_API_KEY;
const HUNTER_KEY = process.env.HUNTER_API_KEY;
const DOMAIN = 'prized.dev';

async function rocketReachSearch() {
  const res = await fetch(
    'https://api.rocketreach.co/api/v2/person/search',
    {
      method: 'POST',
      headers: {
        'Api-Key': ROCKETREACH_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: {
          current_employer: ['Prized'],
          current_title: ['Founder', 'CEO', 'Co-Founder', 'CTO'],
        },
        page_size: 10,
        order_by: 'popularity',
      }),
    },
  );

  const text = await res.text();
  console.log('\n=== RocketReach Search ===');
  console.log('Status:', res.status);
  try {
    return JSON.parse(text);
  } catch {
    console.log('Body:', text.slice(0, 500));
    return null;
  }
}

async function rocketReachAccount() {
  const res = await fetch('https://api.rocketreach.co/api/v2/account/', {
    headers: { 'Api-Key': ROCKETREACH_KEY },
  });
  const body = await res.json().catch(() => ({}));
  console.log('\n=== RocketReach Account ===');
  console.log('Status:', res.status);
  console.log(JSON.stringify(body, null, 2));
  return body;
}

async function rocketReachLookup(profile) {
  const url = new URL('https://api.rocketreach.co/api/v2/person/lookup');
  if (profile.id) url.searchParams.set('id', String(profile.id));
  else if (profile.linkedin_url) url.searchParams.set('linkedin_url', profile.linkedin_url);
  else {
    url.searchParams.set('name', profile.name);
    if (profile.current_title) url.searchParams.set('current_title', profile.current_title);
  }

  const res = await fetch(url.toString(), {
    headers: { 'Api-Key': ROCKETREACH_KEY },
  });
  const body = await res.json().catch(async () => ({ raw: await res.text() }));
  console.log('\n=== RocketReach Lookup ===');
  console.log('Profile:', profile.name);
  console.log('Status:', res.status);
  console.log(JSON.stringify(body, null, 2));
  return body;
}

async function hunterDomainSearch() {
  const url = new URL('https://api.hunter.io/v2/domain-search');
  url.searchParams.set('domain', DOMAIN);
  url.searchParams.set('limit', '10');
  url.searchParams.set('api_key', HUNTER_KEY);

  const res = await fetch(url.toString());
  const body = await res.json().catch(() => ({}));
  console.log('\n=== Hunter Domain Search ===');
  console.log('Status:', res.status);
  console.log(JSON.stringify(body, null, 2));
  return body;
}

async function main() {
  if (!ROCKETREACH_KEY) {
    console.error('Missing ROCKETREACH_API_KEY');
    process.exit(1);
  }

  await rocketReachAccount();
  const search = await rocketReachSearch();

  const profiles = Array.isArray(search) ? search : search?.profiles ?? [];
  console.log(`\nFound ${profiles.length} profiles from search`);

  for (const p of profiles.slice(0, 3)) {
    console.log(`- ${p.name} | ${p.current_title ?? 'N/A'} | ${p.linkedin_url ?? 'no linkedin'}`);
  }

  const founder =
    profiles.find((p) =>
      /founder|ceo|co-founder/i.test(`${p.current_title ?? ''} ${p.name ?? ''}`),
    ) ?? profiles[0];

  if (founder) {
    await rocketReachLookup(founder);
  }

  if (HUNTER_KEY) {
    await hunterDomainSearch();
  }
}

main().catch(console.error);
