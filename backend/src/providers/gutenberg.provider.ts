import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { EbookProvider, EbookSearchResult } from './provider.interface';

@Injectable()
export class GutenbergProvider implements EbookProvider {
  readonly type = 'gutenberg';

  async search(query: string, settings: any): Promise<EbookSearchResult[]> {
    if (!query) return [];

    const baseUrl: string = settings?.baseUrl || 'https://gutendex.com';

    const res = await axios.get(baseUrl + '/books', {
      params: { search: query },
    });

    const results: EbookSearchResult[] = res.data.results.map((item: any) => {
      const formats: { format: string; url: string }[] = [];
      const formatsObj = item.formats || {};
      for (const [mime, url] of Object.entries<any>(formatsObj)) {
        if (typeof url !== 'string') continue;
        if (mime.includes('epub')) {
          formats.push({ format: 'epub', url });
        } else if (mime.includes('pdf')) {
          formats.push({ format: 'pdf', url });
        }
      }

      return {
        providerType: this.type,
        providerBookId: String(item.id),
        title: item.title,
        author: item.authors?.[0]?.name,
        language: item.languages?.[0],
        year: undefined,
        description: undefined,
        coverUrl: formatsObj['image/jpeg'] ?? null,
        formats,
      };
    });

    return results;
  }
}
