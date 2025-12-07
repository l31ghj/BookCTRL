
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import * as fs from 'fs';
import axios from 'axios';
import { createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import * as path from 'path';

@Injectable()
export class AppService {
  private readonly ebooksDir: string;

  constructor(private readonly prisma: PrismaService) {
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
    await this.prisma.book.delete({ where: { id: bookId } });
  }

  async downloadAndStore(input: any) {
    await mkdir(this.ebooksDir, { recursive: true });

    function safe(s: string) {
      return s.replace(/[^a-zA-Z0-9\-\s]+/g, '').trim().replace(/\s+/g, ' ');
    }

    const author = input.author ? safe(input.author) : '';
    const title = safe(input.title);
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
}
