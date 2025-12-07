
// PATCHED VERSION (only relevant fixed parts shown)

import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { ProvidersRuntimeService } from './providers/providers-runtime.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class AppService {

  async createProvider(input: { type: string; name: string; baseUrl?: string }) {
    const settings: Prisma.InputJsonValue = {};

    if (input.baseUrl) {
      (settings as any).baseUrl = input.baseUrl;
    }

    return this.prisma.provider.create({
      data: {
        type: input.type,
        name: input.name,
        isEnabled: true,
        settings,
      },
    });
  }
}
