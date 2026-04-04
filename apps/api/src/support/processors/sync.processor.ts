import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { IntegrationService } from '../../integrations/services/integration.service';
import { IngestionService } from '../services/ingestion.service';
import { IntegrationProvider } from '@prisma/client';

interface SyncJobData {
  workspaceId: string;
  provider: IntegrationProvider;
  lastSyncedAt?: Date;
}

@Processor('support-sync')
export class SyncProcessor {
  constructor(
    private readonly integrationService: IntegrationService,
    private readonly ingestionService: IngestionService,
  ) {}

  @Process()
  async handleSync(job: Job<SyncJobData>) {
    const { workspaceId, provider, lastSyncedAt } = job.data;
    const providerInstance = await this.integrationService.getProviderInstance(
      workspaceId,
      provider,
    );
    const tickets = await providerInstance.syncTickets(lastSyncedAt);
    await this.ingestionService.ingestTickets(workspaceId, provider, tickets);
    // Optionally, trigger embedding and clustering jobs here
  }
}
