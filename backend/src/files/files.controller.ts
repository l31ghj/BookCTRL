import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../prisma.service';
import { createReadStream } from 'fs';

@Controller('files')
export class FilesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(':id')
  async getFile(@Param('id') id: string, @Res() res: Response) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file) {
      return res.status(404).send('File not found');
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
