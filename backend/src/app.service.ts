
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as fs from 'fs';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import * as path from 'path';
import { load } from 'cheerio';
import { ProvidersRuntimeService } from './providers/providers-runtime.service';

@Injectable()
export class AppService {
  private readonly ebooksDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providersRuntime: ProvidersRuntimeService,
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

    const md5PageUrl =
      providedUrl.includes('/md5/') || providedUrl.includes('md5:')
        ? new URL(providedUrl, baseUrl).toString()
        : md5
        ? `${baseUrl}/md5/${md5}`
        : new URL(providedUrl, baseUrl).toString();

    try {
      const res = await axios.get(md5PageUrl, {
        headers: { 'User-Agent': 'BookCTRL/1.0 (+https://github.com/) axios' },
        maxRedirects: 5,
      });
      const $ = load(res.data);
      const links: string[] = [];

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

      const unique = Array.from(new Set(absolute));
      if (unique.length) return unique;
    } catch {
      // fall back to provided url
    }

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
