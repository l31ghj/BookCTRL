import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ProvidersRuntimeService } from './providers/providers-runtime.service';
import { Prisma } from '@prisma/client';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AppService {
  private readonly ebooksDir: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly providersRuntime: ProvidersRuntimeService,
  ) {
    this.ebooksDir = process.env.EBOOKS_DIR || '/data/ebooks';
  }

  async getProviders() {
    return this.prisma.provider.findMany({
      orderBy: { createdAt: 'asc' },
    });
  }

  async getProviderTypes() {
    return this.providersRuntime.listTypes().map((t) => ({ type: t }));
  }

  async createProvider(input: { type: string; name: string; baseUrl?: string }) {
    const settings: Prisma.JsonValue = {};
    if (input.baseUrl) (settings as any).baseUrl = input.baseUrl;

    return this.prisma.provider.create({
      data: {
        type: input.type,
        name: input.name,
        isEnabled: true,
        settings,
      },
    });
  }

  async toggleProvider(id: string, enable: boolean) {
    return this.prisma.provider.update({
      where: { id },
      data: { isEnabled: enable },
    });
  }

  async search(query: string) {
    if (!query) return [];

    const providers = await this.prisma.provider.findMany({
      where: { isEnabled: true },
    });

    const allResults: any[] = [];

    for (const provider of providers) {
      const handler = this.providersRuntime.getProviderByType(provider.type);
      if (!handler) continue;
      try {
        const results = await handler.search(query, provider.settings || {});
        results.forEach((r) => (r.providerInstanceId = provider.id));
        allResults.push(...results);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Error searching provider', provider.name, err);
      }
    }

    return allResults;
  }

  async listLibrary() {
    return this.prisma.book.findMany({
      orderBy: { createdAt: 'desc' },
      include: { files: true },
    });
  }

  async downloadAndStore(input: {
    providerInstanceId: string;
    providerType: string;
    providerBookId: string;
    title: string;
    author?: string;
    format: string;
    url: string;
  }) {
    await mkdir(this.ebooksDir, { recursive: true });

    const safeTitle = input.title.replace(/[^\w\-]+/g, '_');
    const filename = `${safeTitle}.${input.format}`;
    const filepath = path.join(this.ebooksDir, filename);

    const response = await axios.get(input.url, { responseType: 'stream' });

    await new Promise<void>((resolve, reject) => {
      const ws = createWriteStream(filepath);
      response.data.pipe(ws);
      ws.on('finish', resolve);
      ws.on('error', reject);
    });

    const stats = await stat(filepath);

    const book = await this.prisma.book.upsert({
      where: {
        source_sourceId: {
          source: input.providerType,
          sourceId: input.providerBookId,
        },
      },
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
        path: filepath,
        sizeBytes: Number(stats.size),
      },
    });

    return { book, file };
  }
}
