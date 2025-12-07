import {
  Body,
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
  root() {
    return;
  }

  @Get('search')
  @Render('search')
  async searchPage(@Query('q') q?: string) {
    const query = q || '';
    const providers = await this.appService.getProviders();
    const results = query ? await this.appService.search(query) : [];
    return { query, providers, results };
  }

  @Get('library')
  @Render('library')
  async libraryPage() {
    const books = await this.appService.listLibrary();
    return { books };
  }

  @Get('settings/providers')
  @Render('providers')
  async providersPage() {
    const providers = await this.appService.getProviders();
    const types = await this.appService.getProviderTypes();
    return { providers, types };
  }

  @Post('settings/providers')
  @Redirect('/settings/providers')
  async createProvider(
    @Body() body: { type: string; name: string; baseUrl?: string },
  ) {
    if (!body.type || !body.name) {
      return;
    }
    await this.appService.createProvider(body);
    return;
  }

  @Post('settings/providers/:id/toggle')
  @Redirect('/settings/providers')
  async toggleProvider(
    @Param('id') id: string,
    @Body() body: { enabled: string },
  ) {
    const enable = body.enabled === 'true';
    await this.appService.toggleProvider(id, enable);
    return;
  }

  @Post('download')
  @Redirect('/library')
  async download(@Body() body: any) {
    if (!body.url || !body.providerType || !body.providerBookId) {
      return;
    }
    await this.appService.downloadAndStore({
      providerInstanceId: body.providerInstanceId,
      providerType: body.providerType,
      providerBookId: body.providerBookId,
      title: body.title,
      author: body.author,
      format: body.format,
      url: body.url,
    });
    return;
  }
}
