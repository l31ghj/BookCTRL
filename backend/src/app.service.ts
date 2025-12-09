
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as fs from 'fs';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import * as path from 'path';
import { load } from 'cheerio';
import { ProvidersRuntimeService } from './providers/providers-runtime.service';
import { FlareSolverrService } from './flaresolverr.service';

@Injectable()
export class AppService {
  private readonly ebooksDir: string;
  private readonly defaultUserAgent =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  constructor(
    private readonly prisma: PrismaService,
    private readonly providersRuntime: ProvidersRuntimeService,
    private readonly flaresolverr: FlareSolverrService,
  ) {
    this.ebooksDir = process.env.EBOOKS_DIR || '/data/ebooks';
  }

  private resolveBaseUrl(url: string, fallback: string) {
    try {
      const u = new URL(url, fallback);
      return u.origin;
    } catch {
      return fallback;
    }
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private formatBytes(bytes?: number | null): string | undefined {
    if (bytes == null || isNaN(bytes)) return;
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
  }

  private async fetchWithBypass(
    url: string,
    headers: Record<string, string> = {},
    timeoutMs = 20000,
  ) {
    if (this.flaresolverr.isEnabled()) {
      try {
        const res = await this.flaresolverr.fetch(url, timeoutMs);
        if (res) {
          return {
            data: res.data,
            headers: res.headers,
            status: res.status,
            url: res.url,
          };
        }
      } catch {
        // fallback to direct request
      }
    }

    const res = await axios.get(url, {
      headers,
      timeout: timeoutMs,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    const normalizedHeaders: Record<string, string> = {};
    Object.entries(res.headers || {}).forEach(([k, v]) => {
      if (Array.isArray(v)) normalizedHeaders[k] = v.join(', ');
      else if (typeof v === 'string') normalizedHeaders[k] = v;
      else if (v != null) normalizedHeaders[k] = String(v);
    });

    return {
      data: res.data,
      headers: normalizedHeaders,
      status: res.status,
      url: (res.request as any)?.res?.responseUrl || url,
    };
  }

  async listLibrary() {
    const books = await this.prisma.book.findMany({ include: { files: true } });
    return books.map((b) => ({
      ...b,
      files: b.files.map((f) => ({
        ...f,
        sizeLabel: this.formatBytes(f.sizeBytes),
      })),
    }));
  }

  async deleteBook(bookId: string) {
    const files = await this.prisma.file.findMany({ where: { bookId } });
    for (const f of files) {
      try { await fs.promises.unlink(f.path); } catch {}
    }
    await this.prisma.file.deleteMany({ where: { bookId } });
    await this.prisma.book.delete({ where: { id: bookId } });
  }

  async downloadAndStore(input: any) {
    await mkdir(this.ebooksDir, { recursive: true });

    function safe(s?: string) {
      if (!s) return '';
      return s.replace(/[^a-zA-Z0-9\-\s]+/g, '').trim().replace(/\s+/g, ' ');
    }

    const author = safe(input.author);
    const title = safe(input.title);
    if (!title) {
      throw new Error('Missing title for download');
    }
    let base = author ? `${author} - ${title}` : title;
    const filename = `${base}.${input.format}`;
    const filepath = path.join(this.ebooksDir, filename);

    let finalPath = filepath;
    let counter = 1;
    while (fs.existsSync(finalPath)) {
      const ext = path.extname(filename);
      const nameWithoutExt = filename.replace(ext, '');
      finalPath = path.join(this.ebooksDir, `${nameWithoutExt} (${counter})${ext}`);
      counter++;
    }

    const downloadUrls = await this.resolveDownloadUrls(input);

    let response: any = null;
    for (const url of downloadUrls) {
      try {
        const res = await axios.get(url, {
          responseType: 'stream',
          maxRedirects: 5,
          validateStatus: (s) => s >= 200 && s < 400,
        });
        const contentType = (res.headers['content-type'] || '').toLowerCase();
        const contentLength = Number(res.headers['content-length'] || 0);
        if (contentType.includes('text/html') || contentType.includes('text/plain')) {
          if (res.data?.destroy) res.data.destroy();
          continue;
        }
        if (contentLength && contentLength < 10 * 1024) {
          if (res.data?.destroy) res.data.destroy();
          continue;
        }
        response = res;
        break;
      } catch (err) {
        continue;
      }
    }

    if (!response) {
      throw new Error('No usable download link found');
    }

    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(finalPath);
      response.data.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });

    const stats = await stat(finalPath);

    const book = await this.prisma.book.upsert({
      where: { source_sourceId: { source: input.providerType, sourceId: input.providerBookId } },
      update: {},
      create: {
        title: input.title,
        author: input.author,
        source: input.providerType,
        sourceId: input.providerBookId,
      },
    });

    const file = await this.prisma.file.create({
      data: {
        bookId: book.id,
        format: input.format,
        path: finalPath,
        sizeBytes: Number(stats.size),
      },
    });

    return { book, file };
  }

  private async resolveDownloadUrls(input: any): Promise<string[]> {
    const providedUrl: string = input.url;
    const providerType: string = input.providerType;
    if (providerType !== 'annas-archive') {
      return [providedUrl];
    }

    const baseUrl = this.resolveBaseUrl(providedUrl, 'https://annas-archive.org');
    const md5 =
      (input.providerBookId as string | undefined)?.replace(/^md5:/i, '') ||
      this.extractMd5FromUrl(providedUrl);

    const candidateLinks: string[] = [];

    // 1) Try slow download servers directly (paths 0-1, servers 0-6)
    if (md5) {
      const slowLink = await this.trySlowDownloads(baseUrl, md5);
      if (slowLink) {
        candidateLinks.push(slowLink);
      }
    }

    // 2) Parse MD5 page for IPFS / other links as fallback
    const md5PageUrl =
      providedUrl.includes('/md5/') || providedUrl.includes('md5:')
        ? new URL(providedUrl, baseUrl).toString()
        : md5
        ? `${baseUrl}/md5/${md5}`
        : new URL(providedUrl, baseUrl).toString();

    try {
      const page = await this.fetchWithBypass(
        md5PageUrl,
        {
          'User-Agent': this.defaultUserAgent,
        },
        45000,
      );
      const $ = load(page.data);
      const links: string[] = [];

      const ipfsCids: string[] = [];
      $('a[href^="ipfs://"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) ipfsCids.push(href.replace('ipfs://', ''));
      });
      $('span:contains("IPFS CID")')
        .next('span')
        .each((_, el) => {
          const cid = $(el).text().trim();
          if (cid) ipfsCids.push(cid);
        });

      ipfsCids.forEach((cid) => {
        links.push(`https://cloudflare-ipfs.com/ipfs/${cid}`);
        links.push(`https://ipfs.io/ipfs/${cid}`);
      });

      $('a[href*="ipfs_downloads/md5"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) links.push(href);
      });

      $('a[href*="/slow_download/"]').each((_, el) => {
        const href = $(el).attr('href');
        if (href) links.push(href);
      });

      $('a.js-download-link').each((_, el) => {
        const href = $(el).attr('href');
        if (href) links.push(href);
      });

      const absolute = links
        .filter(Boolean)
        .map((href) => new URL(href!, baseUrl).toString());

      candidateLinks.push(...absolute);
    } catch {
      // ignore
    }

    const unique = Array.from(new Set(candidateLinks));
    if (unique.length) return unique;

    return [new URL(providedUrl, baseUrl).toString()];
  }

  private extractMd5FromUrl(url: string): string | undefined {
    try {
      const u = new URL(url);
      const parts = u.pathname.split('/');
      const md5Part = parts.find((p) => p && p.length === 32);
      return md5Part;
    } catch {
      return;
    }
  }

  private async trySlowDownloads(baseUrl: string, md5: string): Promise<string | undefined> {
    const MAX_PATHS = 2; // 0-1
    const MAX_SERVERS = 7; // 0-6

    for (let pathIndex = 0; pathIndex < MAX_PATHS; pathIndex++) {
      for (let serverIndex = 0; serverIndex < MAX_SERVERS; serverIndex++) {
        const slowUrl = `${baseUrl}/slow_download/${md5}/${pathIndex}/${serverIndex}`;
        try {
          const direct = await this.fetchSlowDirectLink(slowUrl);
          if (direct) return direct;
        } catch {
          continue;
        }
      }
    }

    return;
  }

  private async fetchSlowDirectLink(slowUrl: string): Promise<string | undefined> {
    const headers = {
      'User-Agent': this.defaultUserAgent,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    };
    const PAGE_TIMEOUT_MS = 120000; // allow for challenge + 30s countdown

    const fetchHtml = async () => {
      const res = await this.fetchWithBypass(slowUrl, headers, PAGE_TIMEOUT_MS);
      if (typeof res.data !== 'string') return '';
      return res.data as string;
    };

    let html = await fetchHtml();

    // Check for countdown
    const countdownMatch = html.match(/js-partner-countdown[^>]*>(\d+)</i);
    if (countdownMatch) {
      const seconds = parseInt(countdownMatch[1], 10);
      if (seconds > 0 && seconds < 300) {
        await this.sleep((seconds + 2) * 1000);
        html = await fetchHtml();
      }
    }

    const patterns = [
      /navigator\.clipboard\.writeText\(['"]([^'"]+)['"]/i,
      /<span[^>]*class=["'][^"']*whitespace-normal[^"']*["'][^>]*>(https?:\/\/[^<]+)<\/span>/i,
      /<a[^>]*href=["']([^"']*)"[^>]*download[^>]*>/i,
      /<a[^>]*download[^>]*href=["']([^"']*)"[^>]*>/i,
      /window\.location\.href\s*=\s*["']([^"']*)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        let url = match[1]
          .replace(/&gt;/g, '>')
          .replace(/&lt;/g, '<')
          .replace(/&amp;/g, '&');
        if (url.startsWith('http') && !url.includes('slow_download')) {
          return url;
        }
      }
    }

    return;
  }

  async search(query: string) {
    const providers = await this.prisma.provider.findMany({
      orderBy: { createdAt: 'asc' },
    });
    if (!query) {
      return { providers, results: [] };
    }

    const enabledProviders = providers.filter((p) => p.isEnabled);
    const results = [];

    for (const provider of enabledProviders) {
      const runtime = this.providersRuntime.getProviderByType(provider.type);
      if (!runtime) continue;

      try {
        const providerResults = await runtime.search(query, provider.settings || {});
        results.push(
          ...providerResults
            .map((r) => {
              const formats = (r.formats || [])
                .filter((f) => typeof f.format === 'string' && f.format.toLowerCase() === 'epub')
                .map((f) => ({
                  ...f,
                  sizeLabel: this.formatBytes(f.sizeBytes),
                }));
              return { ...r, formats };
            })
            .filter((r) => r.formats.length > 0)
            .map((r) => ({
              ...r,
              providerInstanceId: provider.id,
              providerName: provider.name,
            })),
        );
      } catch (err) {
        // swallow per-provider errors so the page still renders
        console.error(`Provider ${provider.name} failed`, err);
      }
    }

    return { providers, results };
  }

  listProviders() {
    return this.prisma.provider.findMany({ orderBy: { createdAt: 'asc' } });
  }

  listProviderTypes() {
    return this.providersRuntime.listTypes().map((type) => {
      const defaults =
        type === 'gutenberg'
          ? { baseUrl: 'https://gutendex.com' }
          : type === 'annas-archive'
          ? { baseUrl: 'https://annas-archive.org' }
          : {};
      return { type, defaults };
    });
  }

  async createProvider(input: any) {
    const type = input.type;
    const runtime = this.providersRuntime.getProviderByType(type);
    if (!runtime) {
      throw new Error('Unknown provider type');
    }

    const name = (input.name || runtime.type).trim();
    const settings: Record<string, any> = {};
    if (input.baseUrl) settings.baseUrl = input.baseUrl;

    return this.prisma.provider.create({
      data: { type, name, isEnabled: true, settings },
    });
  }

  async setProviderEnabled(id: string, isEnabled: boolean) {
    return this.prisma.provider.update({ where: { id }, data: { isEnabled } });
  }

  async deleteProvider(id: string) {
    return this.prisma.provider.delete({ where: { id } });
  }
}
