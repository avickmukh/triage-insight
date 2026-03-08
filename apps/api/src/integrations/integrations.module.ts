import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { PrismaModule } from "../prisma/prisma.module";
import { IntegrationsController } from "./integrations.controller";
import { IntegrationService } from "./services/integration.service";

@Module({
  imports: [
    PrismaModule,
    BullModule.registerQueue({ name: "support-sync" }),
  ],
  controllers: [IntegrationsController],
  providers: [IntegrationService],
  exports: [IntegrationService],
})
export class IntegrationsModule {}
