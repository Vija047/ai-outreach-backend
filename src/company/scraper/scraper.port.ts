export interface ScrapedPage {
  url: string;
  markdown: string;
}

export interface ScraperPort {
  scrape(url: string): Promise<ScrapedPage[]>;
}

export const SCRAPER_PORT = Symbol('SCRAPER_PORT');
