import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';
import { ProvidersRuntimeService } from './providers/providers-runtime.service';
import { GutenbergProvider } from './providers/gutenberg.provider';
import { FilesController } from './files/files.controller';
import { OpdsModule } from './opds/opds.module';

@Module({
  imports: [OpdsModule],
  controllers: [AppController, FilesController],
  providers: [
    AppService,
    PrismaService,
    ProvidersRuntimeService,
    GutenbergProvider,
  ],
})
export class AppModule {}
