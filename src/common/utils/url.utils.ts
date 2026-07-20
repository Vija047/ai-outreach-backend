export function normalizeAnalyzeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Invalid URL');
  }

  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withProtocol);
  } catch {
    throw new Error('Invalid URL');
  }

  if (!parsed.hostname || !parsed.hostname.includes('.')) {
    throw new Error('Invalid URL');
  }

  return parsed.toString();
}

export function extractDomain(url: string): string {
  const parsed = new URL(url);
  return parsed.hostname.replace(/^www\./, '').toLowerCase();
}
