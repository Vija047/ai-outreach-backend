export interface NewsResult {
  title: string;
  url: string;
  content: string;
}

export interface NewsPort {
  search(companyName: string, domain: string): Promise<NewsResult[]>;
}

export const NEWS_PORT = Symbol('NEWS_PORT');
