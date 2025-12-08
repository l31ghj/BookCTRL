
import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  Body,
  Query,
  Redirect,
  Render,
} from '@nestjs/common';
import { AppService } from './app.service';
import { Request, Response } from 'express';

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

    const { providers, results } = await this.appService.search(query);

    return { query, providers, results, isSearch: true };
  }

  @Get('library')
  @Render('library')
  async libraryPage() {
    const books = await this.appService.listLibrary();
    return { books, isLibrary: true };
  }

  @Post('library/:id/delete')
  @Redirect('/library')
  async deleteBook(@Param('id') id: string) {
    await this.appService.deleteBook(id);
    return;
  }

  @Post('search/download')
  async download(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    try {
      await this.appService.downloadAndStore(body);
      const q = body.query ? `?q=${encodeURIComponent(body.query)}` : '';

      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.json({ ok: true, redirect: `/search${q}` });
      }

      return res.redirect(`/search${q}`);
    } catch (err: any) {
      const message = err?.message || 'Download failed';
      if (req.headers.accept && req.headers.accept.includes('application/json')) {
        return res.status(500).json({ ok: false, error: message });
      }
      return res.status(500).send(message);
    }
  }

  @Get('settings/providers')
  @Render('providers')
  async providersPage() {
    const providers = await this.appService.listProviders();
    const types = this.appService.listProviderTypes();
    return { providers, types, isProviders: true };
  }

  @Post('settings/providers')
  @Redirect('/settings/providers')
  async createProvider(@Body() body: any) {
    await this.appService.createProvider(body);
    return;
  }

  @Post('settings/providers/:id/toggle')
  @Redirect('/settings/providers')
  async toggleProvider(@Param('id') id: string, @Body('enabled') enabled: string) {
    const isEnabled = enabled === 'true';
    await this.appService.setProviderEnabled(id, isEnabled);
    return;
  }

  @Post('settings/providers/:id/delete')
  @Redirect('/settings/providers')
  async deleteProvider(@Param('id') id: string) {
    await this.appService.deleteProvider(id);
    return;
  }
}
