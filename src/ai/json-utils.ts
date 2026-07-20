import { OutreachGenerationResult, OutreachVariant } from './llm.port';

const NESTED_KEYS = ['outreach', 'result', 'data', 'response', 'content', 'output'];

const EMAIL_KEYS = [
  'email',
  'coldEmail',
  'cold_email',
  'emailBody',
  'email_body',
  'emailText',
  'email_text',
  'emailContent',
  'email_content',
  'body',
  'message',
  'initialEmail',
  'initial_email',
];

const LINKEDIN_KEYS = [
  'linkedInDm',
  'linkedinDm',
  'linkedin_dm',
  'linkedInMessage',
  'linkedin_message',
  'linkedin',
  'dm',
];

const CONNECTION_KEYS = [
  'connectionNote',
  'connection_note',
  'linkedinConnectionNote',
  'linkedin_connection_note',
  'connectionRequest',
  'connection_request',
];

const FOLLOWUP1_KEYS = ['followUp1', 'follow_up_1', 'followup1', 'follow_up_one'];
const FOLLOWUP2_KEYS = ['followUp2', 'follow_up_2', 'followup2', 'follow_up_two'];

export function parseModelJson(content: string): Record<string, unknown> {
  const trimmed = content.trim();
  if (!trimmed) {
    throw new Error('Model returned empty content');
  }

  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1].trim()) as Record<string, unknown>;
    }

    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
    }

    throw new Error('Model returned invalid JSON');
  }
}

function flattenOutreachRaw(raw: Record<string, unknown>): Record<string, unknown> {
  let merged = { ...raw };

  for (const key of NESTED_KEYS) {
    const nested = merged[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      merged = { ...merged, ...(nested as Record<string, unknown>) };
    }
  }

  return merged;
}

function readString(
  raw: Record<string, unknown>,
  keys: string[],
  fallback = '',
): string {
  const lowerLookup = new Map<string, unknown>();
  for (const [key, value] of Object.entries(raw)) {
    lowerLookup.set(key.toLowerCase(), value);
  }

  for (const key of keys) {
    const direct = raw[key];
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    const caseInsensitive = lowerLookup.get(key.toLowerCase());
    if (typeof caseInsensitive === 'string' && caseInsensitive.trim()) {
      return caseInsensitive.trim();
    }
  }

  return fallback;
}

function readSubjectLines(raw: Record<string, unknown>): string[] {
  const value =
    raw.subjectLines ??
    raw.subject_lines ??
    raw.subjects ??
    raw.subjectLine ??
    raw.subject_line ??
    raw.emailSubjects ??
    raw.email_subjects;

  if (Array.isArray(value)) {
    const lines = value.map(String).map((line) => line.trim()).filter(Boolean);
    if (lines.length > 0) return lines.slice(0, 5);
  }
  if (typeof value === 'string' && value.trim()) {
    return [value.trim()];
  }
  return ['Quick idea', 'Following up', 'Introduction'];
}

function findFallbackEmailBody(raw: Record<string, unknown>): string {
  for (const value of Object.values(raw)) {
    if (typeof value === 'string' && value.trim().length >= 40) {
      return value.trim();
    }
  }
  return '';
}

export function normalizeOutreachResult(
  raw: Record<string, unknown>,
  companyName = 'your company',
): OutreachGenerationResult {
  const flat = flattenOutreachRaw(raw);

  let email = readString(flat, EMAIL_KEYS);
  const linkedInDm = readString(flat, LINKEDIN_KEYS);
  const connectionNote = readString(flat, CONNECTION_KEYS);
  const followUp1 = readString(flat, FOLLOWUP1_KEYS);
  const followUp2 = readString(flat, FOLLOWUP2_KEYS);

  if (!email) {
    email = findFallbackEmailBody(flat);
  }

  if (!email && linkedInDm) {
    email = `Hi,\n\n${linkedInDm}\n\nBest regards`;
  }

  if (!email) {
    throw new Error('Model response missing required field: email');
  }

  return {
    email,
    linkedInDm:
      linkedInDm ||
      `Hi! I wanted to reach out about an idea for ${companyName}.`,
    connectionNote:
      connectionNote || `Interested in ${companyName}'s work.`,
    subjectLines: readSubjectLines(flat),
    followUp1:
      followUp1 || `Just following up on my note about ${companyName}.`,
    followUp2:
      followUp2 || `Wanted to check if now is a better time to connect.`,
  };
}

export const OUTREACH_JSON_SCHEMA = {
  type: 'object',
  properties: {
    email: { type: 'string', description: 'Full cold email body' },
    linkedInDm: { type: 'string', description: 'LinkedIn direct message' },
    connectionNote: { type: 'string', description: 'LinkedIn connection request note' },
    subjectLines: {
      type: 'array',
      items: { type: 'string' },
      minItems: 3,
      maxItems: 3,
    },
    followUp1: { type: 'string' },
    followUp2: { type: 'string' },
  },
  required: [
    'email',
    'linkedInDm',
    'connectionNote',
    'subjectLines',
    'followUp1',
    'followUp2',
  ],
  additionalProperties: false,
} as const;

export const OUTREACH_SYSTEM_PROMPT = `You are an expert SDR writing personalized B2B outreach.
When a recipient object is provided, address them by first name in the email greeting (e.g. "Hi Priya,") and reference their title naturally where appropriate. Never use placeholders like [Recipient's Name].
Return ONLY valid JSON with EXACTLY this structure (camelCase, no nesting):
{
  "variants": [
    {
      "tone": "Direct",
      "email": "full cold email body",
      "linkedInDm": "LinkedIn direct message",
      "connectionNote": "LinkedIn connection request note under 300 chars",
      "subjectLines": ["subject 1", "subject 2", "subject 3"],
      "followUp1": "first follow-up email",
      "followUp2": "second follow-up email"
    },
    {
      "tone": "Consultative",
      ...
    },
    {
      "tone": "Casual",
      ...
    }
  ]
}

Provide exactly 3 variants with tones Direct, Consultative, and Casual.
Each variant must include all fields. Do not wrap the JSON in markdown.`;

const VARIANT_TONES = ['Direct', 'Consultative', 'Casual'] as const;

function normalizeVariant(
  raw: Record<string, unknown>,
  tone: string,
  companyName: string,
): OutreachVariant {
  const normalized = normalizeOutreachResult(raw, companyName);
  return {
    tone,
    email: normalized.email,
    linkedInDm: normalized.linkedInDm,
    connectionNote: normalized.connectionNote,
    subjectLines: normalized.subjectLines,
    followUp1: normalized.followUp1,
    followUp2: normalized.followUp2,
  };
}

export function normalizeOutreachVariantsResult(
  raw: Record<string, unknown>,
  companyName = 'your company',
): OutreachGenerationResult {
  const variantsRaw = raw.variants;

  if (Array.isArray(variantsRaw) && variantsRaw.length > 0) {
    const variants: OutreachVariant[] = variantsRaw
      .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
      .map((v, index) =>
        normalizeVariant(
          v,
          String(v.tone ?? VARIANT_TONES[index] ?? `Variant ${index + 1}`),
          companyName,
        ),
      );

    if (variants.length > 0) {
      const primary =
        variants.find((v) => v.tone === 'Direct') ?? variants[0];
      return { ...primary, variants };
    }
  }

  const single = normalizeOutreachResult(raw, companyName);
  const variants: OutreachVariant[] = VARIANT_TONES.map((tone) => ({
    tone,
    ...single,
  }));

  return { ...single, variants };
}
