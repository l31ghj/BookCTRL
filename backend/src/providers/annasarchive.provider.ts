import { Injectable } from '@nestjs/common';
import axios from 'axios';
import { load } from 'cheerio';
import type { Element as CheerioElement } from 'domhandler';
import { FlareSolverrService } from '../flaresolverr.service';
import { EbookProvider, EbookSearchResult } from './provider.interface';

@Injectable()
export class AnnasArchiveProvider implements EbookProvider {
  readonly type = 'annas-archive';
  private readonly userAgent = 'BookCTRL/1.0 (+https://github.com/) axios';

  constructor(private readonly flaresolverr: FlareSolverrService) {}

  async search(query: string, settings: any): Promise<EbookSearchResult[]> {
    if (!query) return [];

    const baseUrl: string = settings?.baseUrl || 'https://annas-archive.org';
    const headers = { 'User-Agent': this.userAgent };
    const searchUrl = new URL('/search', baseUrl);
    searchUrl.searchParams.set('q', query);

    const html = await this.fetchPage(searchUrl.toString(), headers);
    const $ = load(html);
    const results: EbookSearchResult[] = [];

    const cards = $('div.flex')
      .filter((_: number, el: CheerioElement) => $(el).find('a[href^="/md5/"]').length > 0)
      .slice(0, 12); // keep requests reasonable

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i] as CheerioElement;
      const md5Anchor = $(card).find('a[href^="/md5/"]').first();
      const md5Href = md5Anchor.attr('href');
      const md5 = md5Href ? md5Href.split('/').pop() : undefined;
      if (!md5) continue;

      const detailUrl = new URL(md5Href!, baseUrl).toString();
      const title = md5Anchor.text().trim();
      const authorLink = $(card).find('a[href^="/search?q="]').first();
      const author = authorLink.text().replace(/^[^A-Za-z0-9]+/, '').trim() || undefined;

      const metaText = $(card).find('div.text-gray-800').text().trim();
      const formatFromMeta = this.extractFormat(metaText);
      const fallbackFormat = this.extractFormat($(card).text());
      const sizeBytes = this.extractSize(metaText);

      const format = formatFromMeta || fallbackFormat || 'download';
      const downloadUrl = await this.fetchDownloadLink(baseUrl, md5);

      results.push({
        providerType: this.type,
        providerBookId: md5,
        title,
        author,
        description: undefined,
        language: undefined,
        coverUrl: null,
        year: undefined,
        formats: downloadUrl ? [{ format, url: downloadUrl, sizeBytes }] : [],
      });
    }

    return results;
  }

  private extractFormat(text: string): string | undefined {
    const match = text.match(/\b(epub|pdf|mobi|azw3|djvu|rtf|txt)\b/i);
    return match ? match[1].toLowerCase() : undefined;
  }

  private extractSize(text: string): number | undefined {
    const match = text.match(/([\d\.]+)\s*(kb|mb|gb)/i);
    if (!match) return;
    const value = parseFloat(match[1]);
    const unit = match[2].toLowerCase();
    if (isNaN(value)) return;
    const multiplier = unit === 'gb' ? 1024 * 1024 * 1024 : unit === 'mb' ? 1024 * 1024 : 1024;
    return Math.round(value * multiplier);
  }

  private async fetchDownloadLink(baseUrl: string, md5: string): Promise<string | undefined> {
    try {
      const html = await this.fetchPage(`${baseUrl}/md5/${md5}`, { 'User-Agent': this.userAgent });
      const $ = load(html);
      const ipfsLinks = $('a[href*="ipfs_downloads"]')
        .map((_: number, el: CheerioElement) => $(el).attr('href'))
        .get()
        .filter(Boolean);

      const slowLinks = $('h3:contains("Slow downloads")')
        .next('p')
        .next('ul')
        .find('a.js-download-link')
        .map((_: number, el: CheerioElement) => $(el).attr('href'))
        .get()
        .filter(Boolean);

      const fallbackLinks = $('a.js-download-link')
        .map((_: number, el: CheerioElement) => $(el).attr('href'))
        .get()
        .filter(Boolean);

      const candidates = [...ipfsLinks, ...slowLinks, ...fallbackLinks];
      if (!candidates.length) return;

      const first = candidates.find(Boolean);
      if (!first) return;
      return new URL(first, baseUrl).toString();
    } catch {
      return;
    }
  }

  private async fetchPage(url: string, headers: Record<string, string>): Promise<string> {
    if (this.flaresolverr.isEnabled()) {
      try {
        const res = await this.flaresolverr.get(url, headers);
        if (res?.data) return res.data;
      } catch {
        // fall through to direct request
      }
    }

    const res = await axios.get(url, {
      headers,
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });
    return res.data;
  }
}
