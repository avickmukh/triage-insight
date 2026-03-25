import { Processor, Process } from '@nestjs/bull';
import type { Job } from 'bull';
import { DigestService } from './digest.service';
import { Logger } from '@nestjs/common';

export const DIGEST_QUEUE = 'digest';

interface DigestJobData {
  workspaceId: string;
}

@Processor(DIGEST_QUEUE)
export class DigestProcessor {
  private readonly logger = new Logger(DigestProcessor.name);

  constructor(private readonly digestService: DigestService) {}

  @Process()
  async handleDigest(job: Job<DigestJobData>) {
    this.logger.log(`Processing digest job for workspace ${job.data.workspaceId}`);
    await this.digestService.generateDigest(job.data.workspaceId);
  }
}
