export class AnalysisError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export const MIN_SCRAPED_CONTENT_LENGTH = 200;
