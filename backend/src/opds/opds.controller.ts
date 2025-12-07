import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { OpdsService } from './opds.service';

@Controller('opds')
export class OpdsController {
  constructor(private readonly opds: OpdsService) {}

  @Get()
  async root(@Res() res: Response) {
    const xml = `
      <feed xmlns="http://www.w3.org/2005/Atom"
            xmlns:opds="http://opds-spec.org/2010/catalog">
        <id>urn:ebook-downloader:root</id>
        <title>Ebook Downloader OPDS</title>
        <updated>${new Date().toISOString()}</updated>

        <link rel="self" href="/opds" type="application/atom+xml" />
        <link rel="start" href="/opds" type="application/atom+xml" />
        <link rel="http://opds-spec.org/catalog"
              href="/opds/catalog"
              type="application/atom+xml"
              title="Full Catalog"/>
      </feed>
    `.trim();

    res.type('application/atom+xml').send(xml);
  }

  @Get('catalog')
  async catalog(@Res() res: Response) {
    const books = await this.opds.getAllBooks();

    const entries = books
      .map((book) => {
        const entryId = `/opds/book/${book.id}`;
        const fileLinks = book.files
          .map((f: any) => {
            const mime =
              f.format === 'epub'
                ? 'application/epub+zip'
                : f.format === 'pdf'
                ? 'application/pdf'
                : `application/${f.format}`;
            return `
              <link rel="http://opds-spec.org/acquisition"
                    href="/files/${encodeURIComponent(f.id)}"
                    type="${mime}" />
            `;
          })
          .join('');

        return `
          <entry>
            <id>${entryId}</id>
            <title>${book.title}</title>
            <updated>${book.updatedAt.toISOString()}</updated>
            <author><name>${book.author ?? ''}</name></author>
            <link rel="alternate"
                  type="application/atom+xml"
                  href="${entryId}" />
            ${fileLinks}
          </entry>
        `;
      })
      .join('');

    const xml = `
      <feed xmlns="http://www.w3.org/2005/Atom"
            xmlns:opds="http://opds-spec.org/2010/catalog">
        <id>urn:ebook-downloader:catalog</id>
        <title>Full Book Catalog</title>
        <updated>${new Date().toISOString()}</updated>
        ${entries}
      </feed>
    `.trim();

    res.type('application/atom+xml').send(xml);
  }

  @Get('book/:id')
  async book(@Param('id') id: string, @Res() res: Response) {
    const book = await this.opds.getBook(id);
    if (!book) {
      return res.status(404).send('Not found');
    }

    const fileLinks = book.files
      .map((f: any) => {
        const mime =
          f.format === 'epub'
            ? 'application/epub+zip'
            : f.format === 'pdf'
            ? 'application/pdf'
            : `application/${f.format}`;
        return `
          <link rel="http://opds-spec.org/acquisition"
                href="/files/${encodeURIComponent(f.id)}"
                type="${mime}" />
        `;
      })
      .join('');

    const xml = `
      <entry xmlns="http://www.w3.org/2005/Atom"
             xmlns:opds="http://opds-spec.org/2010/catalog">
        <id>urn:ebook:${book.id}</id>
        <title>${book.title}</title>
        <updated>${book.updatedAt.toISOString()}</updated>
        <author><name>${book.author ?? ''}</name></author>
        ${fileLinks}
      </entry>
    `.trim();

    res.type('application/atom+xml').send(xml);
  }
}
