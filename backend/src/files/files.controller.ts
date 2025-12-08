import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { createReadStream } from 'fs';

@Controller('files')
export class FilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getFile(@Param('id') id: string, @Res() res: Response) {
    const file = await this.prisma.file.findUnique({
      where: { id },
      include: { book: true },
    });
    if (!file) {
      return res.status(404).send('File not found');
    }

    function safeName(s?: string) {
      if (!s) return '';
      return s.replace(/[^a-zA-Z0-9\-\s]+/g, '').trim().replace(/\s+/g, ' ');
    }

    const author = safeName(file.book?.author);
    const title = safeName(file.book?.title) || 'book';
    const base = author ? `${author} - ${title}` : title;
    const filename = `${base}.${file.format}`;

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    // If no stored path, bail early to avoid stream errors
    if (!file.path) {
      return res.status(500).send('File path missing');
    }

    const stream = createReadStream(file.path);
    const mime =
      file.format === 'epub'
        ? 'application/epub+zip'
        : file.format === 'pdf'
        ? 'application/pdf'
        : `application/${file.format}`;

    res.setHeader('Content-Type', mime);
    return stream.pipe(res);
  }
}
