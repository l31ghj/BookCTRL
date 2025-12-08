import { Injectable } from '@nestjs/common';
import { GutenbergProvider } from './gutenberg.provider';
import { AnnasArchiveProvider } from './annasarchive.provider';
import { EbookProvider } from './provider.interface';

@Injectable()
export class ProvidersRuntimeService {
  private readonly providersByType: Record<string, EbookProvider>;

  constructor(
    private readonly gutenbergProvider: GutenbergProvider,
    private readonly annasArchiveProvider: AnnasArchiveProvider,
  ) {
    this.providersByType = {
      [this.gutenbergProvider.type]: this.gutenbergProvider,
      [this.annasArchiveProvider.type]: this.annasArchiveProvider,
    };
  }

  getProviderByType(type: string): EbookProvider | undefined {
    return this.providersByType[type];
  }

  listTypes(): string[] {
    return Object.keys(this.providersByType);
  }
}
