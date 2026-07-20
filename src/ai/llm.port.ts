export type HookSourceType = 'website' | 'news';

export interface CompanyAnalysisResult {
  companyName: string;
  industry: string;
  summary: string;
  techStack: string[];
  mission: string;
  hooks: Array<{
    title: string;
    description: string;
    confidence: number;
    sourceUrl?: string;
    sourceType?: HookSourceType;
    excerpt?: string;
  }>;
}

export interface OutreachVariant {
  tone: string;
  email: string;
  linkedInDm: string;
  connectionNote: string;
  subjectLines: string[];
  followUp1: string;
  followUp2: string;
}

export interface OutreachGenerationResult {
  email: string;
  linkedInDm: string;
  connectionNote: string;
  subjectLines: string[];
  followUp1: string;
  followUp2: string;
  variants?: OutreachVariant[];
}

export interface LlmPort {
  analyzeCompany(
    websiteContent: string,
    newsContent: string,
    domain: string,
  ): Promise<CompanyAnalysisResult>;

  generateOutreach(input: {
    profile: Record<string, unknown>;
    company: Record<string, unknown>;
    hook?: Record<string, unknown>;
    recipient?: Record<string, unknown>;
    tone: string;
  }): Promise<OutreachGenerationResult>;
}

export const LLM_PORT = Symbol('LLM_PORT');
