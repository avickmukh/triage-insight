import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { PrismaModule } from '../prisma/prisma.module';
import { AiModule } from '../ai/ai.module';
import { ThemeService, AI_CLUSTERING_QUEUE } from './services/theme.service';
import { ThemeController } from './theme.controller';
import { ThemeRepository } from './repositories/theme.repository';

@Module({
  imports: [
    PrismaModule,
    AiModule,
    BullModule.registerQueue({ name: AI_CLUSTERING_QUEUE }),
  ],
  controllers: [ThemeController],
  providers: [ThemeService, ThemeRepository],
})
export class ThemeModule {}
