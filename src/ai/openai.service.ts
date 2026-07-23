import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  CompanyAnalysisResult,
  LlmPort,
  OutreachGenerationResult,
} from './llm.port';
import {
  normalizeOutreachVariantsResult,
  OUTREACH_SYSTEM_PROMPT,
  parseModelJson,
} from './json-utils';

const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

@Injectable()
export class OpenAiService implements LlmPort {
  private readonly logger = new Logger(OpenAiService.name);
  private client: OpenAI | null = null;

  constructor(private readonly configService: ConfigService) {}

  private isOpenRouterKey(apiKey: string): boolean {
    return apiKey.startsWith('sk-or-');
  }

  private resolveBaseUrl(apiKey: string): string | undefined {
    const configured = this.configService.get<string>('app.openaiBaseUrl');
    if (configured) return configured;
    if (this.isOpenRouterKey(apiKey)) return OPENROUTER_BASE_URL;
    return undefined;
  }

  private resolveModel(model: string, apiKey: string): string {
    const baseUrl = this.resolveBaseUrl(apiKey);
    const usesOpenRouter =
      baseUrl === OPENROUTER_BASE_URL || this.isOpenRouterKey(apiKey);

    if (!usesOpenRouter || model.includes('/')) {
      return model;
    }

    // OpenRouter expects provider-prefixed models, e.g. openai/gpt-4o
    return `openai/${model}`;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = this.configService.get<string>('app.openaiApiKey');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured');
      }

      const baseURL = this.resolveBaseUrl(apiKey);
      const referer = this.configService.get<string>('app.openaiReferer');
      const appTitle = this.configService.get<string>('app.openaiAppTitle');

      this.client = new OpenAI({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        ...(baseURL === OPENROUTER_BASE_URL
          ? {
              defaultHeaders: {
                'HTTP-Referer': referer ?? 'http://localhost:3000',
                'X-Title': appTitle ?? 'AI Outreach',
              },
            }
          : {}),
      });

      if (baseURL === OPENROUTER_BASE_URL) {
        this.logger.log(`LLM client configured for OpenRouter (${baseURL})`);
      }
    }
    return this.client;
  }

  async analyzeCompany(
    websiteContent: string,
    newsContent: string,
    domain: string,
  ): Promise<CompanyAnalysisResult> {
    const apiKey = this.configService.get<string>('app.openaiApiKey');
    if (!apiKey) {
      this.logger.warn('OPENAI_API_KEY not set, returning stub analysis');
      return {
        companyName: domain,
        industry: 'Unknown',
        summary: `Analysis for ${domain}`,
        techStack: [],
        mission: '',
        hooks: [
          {
            title: 'Recent company activity',
            description: `Explore opportunities with ${domain}`,
            confidence: 0.5,
            sourceUrl: `https://${domain}`,
            sourceType: 'website',
            excerpt: `Explore opportunities with ${domain}`,
          },
        ],
      };
    }

    const model = this.resolveModel(
      this.configService.get<string>('app.openaiModel') ?? 'gpt-4o',
      apiKey,
    );
    const client = this.getClient();

    try {
      const response = await client.chat.completions.create({
        model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a B2B sales intelligence analyst. Return valid JSON with keys: companyName, industry, summary, techStack (array), mission, hooks (array of {title, description, confidence 0-1, sourceUrl, sourceType ("website" or "news"), excerpt (1-2 sentences quoted from the source)}). Every hook MUST include sourceUrl and excerpt.',
          },
          {
            role: 'user',
            content: `Domain: ${domain}\n\nWebsite content:\n${websiteContent.slice(0, 12000)}\n\nNews:\n${newsContent.slice(0, 6000)}`,
          },
        ],
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      return parseModelJson(content) as unknown as CompanyAnalysisResult;
    } catch (error) {
      this.logger.error('Company analysis LLM call failed', error);
      throw error;
    }
  }

  async generateOutreach(input: {
    profile: Record<string, unknown>;
    company: Record<string, unknown>;
    hook?: Record<string, unknown>;
    recipient?: Record<string, unknown>;
    tone: string;
  }): Promise<OutreachGenerationResult> {
    const apiKey = this.configService.get<string>('app.openaiApiKey');
    if (!apiKey) {
      const companyName =
        (input.company.name as string) ??
        (input.company.domain as string) ??
        'the company';
      return {
        email: `Hi,\n\nI noticed ${companyName} and thought my services could help.\n\nBest regards`,
        linkedInDm: `Hi! I'd love to connect regarding ${companyName}.`,
        connectionNote: `Interested in ${companyName}'s work.`,
        subjectLines: [
          `Quick idea for ${companyName}`,
          `Partnership with ${companyName}`,
          `Thought for ${companyName}`,
        ],
        followUp1: `Just following up on my previous message about ${companyName}.`,
        followUp2: `Wanted to check if now is a better time to connect.`,
        variants: [
          {
            tone: 'Direct',
            email: `Hi,\n\nI noticed ${companyName} and thought my services could help.\n\nBest regards`,
            linkedInDm: `Hi! I'd love to connect regarding ${companyName}.`,
            connectionNote: `Interested in ${companyName}'s work.`,
            subjectLines: [
              `Quick idea for ${companyName}`,
              `Partnership with ${companyName}`,
              `Thought for ${companyName}`,
            ],
            followUp1: `Just following up on my previous message about ${companyName}.`,
            followUp2: `Wanted to check if now is a better time to connect.`,
          },
          {
            tone: 'Consultative',
            email: `Hi,\n\nI've been following ${companyName}'s work and have a perspective that might be useful.\n\nBest regards`,
            linkedInDm: `Hi — I have an idea that could help ${companyName}. Open to a quick chat?`,
            connectionNote: `Would love to share a perspective on ${companyName}'s growth.`,
            subjectLines: [
              `Perspective for ${companyName}`,
              `Idea for your team`,
              `Quick thought on ${companyName}`,
            ],
            followUp1: `Circling back on my note — happy to share more context if helpful.`,
            followUp2: `No rush — let me know if timing is better later this month.`,
          },
          {
            tone: 'Casual',
            email: `Hey,\n\nSaw what ${companyName} is up to and had a quick idea to share.\n\nCheers`,
            linkedInDm: `Hey! Love what ${companyName} is building — mind if I share a quick idea?`,
            connectionNote: `Big fan of what you're doing at ${companyName}!`,
            subjectLines: [
              `Quick idea 👋`,
              `Saw ${companyName} — had a thought`,
              `Hey from a fellow builder`,
            ],
            followUp1: `Bumping this in case it got buried — no worries if not a fit!`,
            followUp2: `Last nudge from me — happy to connect whenever.`,
          },
        ],
      };
    }

    const model = this.resolveModel(
      this.configService.get<string>('app.openaiModel') ?? 'gpt-4o',
      apiKey,
    );
    const client = this.getClient();
    const companyName =
      (input.company.name as string) ??
      (input.company.domain as string) ??
      'your company';

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: 'system', content: OUTREACH_SYSTEM_PROMPT },
      { role: 'user', content: JSON.stringify(input) },
    ];

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model,
          response_format: { type: 'json_object' },
          messages,
        });

        const content = response.choices[0]?.message?.content ?? '{}';
        return normalizeOutreachVariantsResult(
          parseModelJson(content),
          companyName,
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unknown generation error';

        if (attempt === 1 && message.includes('missing required field')) {
          this.logger.warn(
            'Outreach JSON missing fields, retrying with stricter prompt',
          );
          messages.push({
            role: 'user',
            content:
              'Your previous response was invalid. Return JSON with a variants array of 3 objects (Direct, Consultative, Casual). Each variant must include: tone, email, linkedInDm, connectionNote, subjectLines (array of 3), followUp1, followUp2.',
          });
          continue;
        }

        this.logger.error('Outreach generation LLM call failed', error);
        throw error;
      }
    }

    throw new Error('Outreach generation failed after retries');
  }
}
