
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { QueueModule } from './queue/queue.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { FeedbackModule } from './feedback/feedback.module';
import { AiModule } from './ai/ai.module';
import { UploadsModule } from './uploads/uploads.module';
import { ThemeModule } from './theme/theme.module';
import { PrioritizationModule } from './prioritization/prioritization.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { SupportModule } from './support/support.module';
import { PublicPortalModule } from './public/public-portal.module';
import { PortalModule } from './portal/portal.module';
import { validationSchema } from './config/validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema,
    }),
    PrismaModule,
    HealthModule,
    QueueModule,
    AuthModule,
    WorkspaceModule,
    FeedbackModule,
    AiModule,
    UploadsModule,
    ThemeModule,
    PrioritizationModule,
    RoadmapModule,
    IntegrationsModule,
    SupportModule,
    PublicPortalModule,
    PortalModule,
  ],
})
export class AppModule {}
