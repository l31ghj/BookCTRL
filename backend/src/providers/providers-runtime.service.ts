import { Injectable } from '@nestjs/common';
import { GutenbergProvider } from './gutenberg.provider';
import { EbookProvider } from './provider.interface';

@Injectable()
export class ProvidersRuntimeService {
  private readonly providersByType: Record<string, EbookProvider>;

  constructor(
    private readonly gutenbergProvider: GutenbergProvider,
  ) {
    this.providersByType = {
      [this.gutenbergProvider.type]: this.gutenbergProvider,
    };
  }

  getProviderByType(type: string): EbookProvider | undefined {
    return this.providersByType[type];
  }

  listTypes(): string[] {
    return Object.keys(this.providersByType);
  }
}
