import { Module } from '@nestjs/common';
import { OpdsController } from './opds.controller';
import { OpdsService } from './opds.service';
import { PrismaService } from '../prisma.service';

@Module({
  controllers: [OpdsController],
  providers: [OpdsService, PrismaService],
})
export class OpdsModule {}
