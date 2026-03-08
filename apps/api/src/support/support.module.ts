import { Module } from "@nestjs/common";
import { BullModule } from "@nestjs/bull";
import { PrismaModule } from "../prisma/prisma.module";
import { IntegrationsModule } from "../integrations/integrations.module";
import { SupportController } from "./support.controller";
import { IngestionService } from "./services/ingestion.service";
import { TicketService } from "./services/ticket.service";
import { ClusteringService } from "./services/clustering.service";
import { SpikeDetectionService } from "./services/spike-detection.service";
import { SyncProcessor } from "./processors/sync.processor";
import { ClusteringProcessor } from "./processors/clustering.processor";
import { SpikeDetectionProcessor } from "./processors/spike-detection.processor";

@Module({
  imports: [
    PrismaModule,
    IntegrationsModule,
    BullModule.registerQueue(
      { name: "support-sync" },
      { name: "support-clustering" },
      { name: "support-spike-detection" }
    ),
  ],
  controllers: [SupportController],
  providers: [
    IngestionService,
    TicketService,
    ClusteringService,
    SpikeDetectionService,
    SyncProcessor,
    ClusteringProcessor,
    SpikeDetectionProcessor,
  ],
})
export class SupportModule {}
