
import {
  Controller,
  Get,
  Param,
  Post,
  Query,
  Redirect,
  Render,
} from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @Redirect('/search')
  root() {}

  @Get('search')
  @Render('search')
  async searchPage(@Query('q') q?: string) {
    const query = q || '';

    // Minimal mode: no providers yet
    const providers: unknown[] = [];
    const results: unknown[] = [];

    return { query, providers, results };
  }

  @Get('library')
  @Render('library')
  async libraryPage() {
    const books = await this.appService.listLibrary();
    return { books };
  }

  @Post('library/:id/delete')
  @Redirect('/library')
  async deleteBook(@Param('id') id: string) {
    await this.appService.deleteBook(id);
    return;
  }
}
