export interface EbookFormat {
  format: string;
  url: string;
}

export interface EbookSearchResult {
  providerType: string;
  providerInstanceId?: string;
  providerBookId: string;
  title: string;
  author?: string;
  language?: string;
  year?: number;
  description?: string;
  coverUrl?: string | null;
  formats: EbookFormat[];
}

export interface EbookProvider {
  readonly type: string;
  search(query: string, settings: any): Promise<EbookSearchResult[]>;
}
