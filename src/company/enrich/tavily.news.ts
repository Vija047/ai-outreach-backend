import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NewsPort, NewsResult } from './news.port';

@Injectable()
export class TavilyNewsService implements NewsPort {
  private readonly logger = new Logger(TavilyNewsService.name);

  constructor(private readonly configService: ConfigService) {}

  async search(companyName: string, domain: string): Promise<NewsResult[]> {
    const apiKey = this.configService.get<string>('app.tavilyApiKey');
    if (!apiKey) {
      this.logger.warn('TAVILY_API_KEY not set, skipping news enrichment');
      return [];
    }

    const query = `${companyName || domain} latest news funding hiring product launch`;

    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: apiKey,
          query,
          max_results: 5,
          include_answer: false,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        this.logger.warn(`Tavily error (${response.status}): ${text}`);
        return [];
      }

      const data = (await response.json()) as {
        results?: Array<{ title: string; url: string; content: string }>;
      };

      return (data.results ?? []).map((r) => ({
        title: r.title,
        url: r.url,
        content: r.content,
      }));
    } catch (error) {
      this.logger.warn(
        'Tavily enrichment failed, continuing without news',
        error,
      );
      return [];
    }
  }
}
