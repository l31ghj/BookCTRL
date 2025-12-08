import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { load, Element } from 'cheerio';
import { EbookProvider, EbookSearchResult } from './provider.interface';

@Injectable()
export class AnnasArchiveProvider implements EbookProvider {
  readonly type = 'annas-archive';

  async search(query: string, settings: any): Promise<EbookSearchResult[]> {
    if (!query) return [];

    const baseUrl: string = settings?.baseUrl || 'https://annas-archive.org';

    const res = await axios.get(baseUrl + '/search', {
      params: { q: query },
      headers: {
        'User-Agent':
          'BookCTRL/1.0 (+https://github.com/) axios',
      },
    });

    const $ = load(res.data);
    const results: EbookSearchResult[] = [];

    $('div.search-result').each((_: number, el: Element) => {
      const title = $(el).find('.result-title').text().trim();
      const author = $(el).find('.result-author').text().trim();
      const links: { format: string; url: string }[] = [];

      $(el)
        .find('a')
        .each((_: number, a: Element) => {
          const href = $(a).attr('href');
          const text = ($(a).text() || '').toLowerCase();
          if (!href) return;
          if (text.includes('epub') || href.toLowerCase().includes('.epub')) {
            links.push({ format: 'epub', url: new URL(href, baseUrl).toString() });
          } else if (text.includes('pdf') || href.toLowerCase().includes('.pdf')) {
            links.push({ format: 'pdf', url: new URL(href, baseUrl).toString() });
          }
        });

      if (!title) return;
      results.push({
        providerType: this.type,
        providerBookId: title + ':' + (author || ''),
        title,
        author: author || undefined,
        formats: links,
        description: undefined,
        language: undefined,
        coverUrl: null,
        year: undefined,
      });
    });

    return results;
  }
}
