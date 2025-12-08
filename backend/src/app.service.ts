
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as fs from 'fs';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import * as path from 'path';
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

  async listLibrary() {
    return this.prisma.book.findMany({ include: { files: true } });
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

    const response = await axios.get(input.url, { responseType: 'stream' });

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
          ...providerResults.map((r) => ({
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
