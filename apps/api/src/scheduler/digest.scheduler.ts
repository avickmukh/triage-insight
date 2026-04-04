import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { DigestFrequency } from '@prisma/client';
import { DIGEST_QUEUE } from '../digest/digest.processor';

@Injectable()
export class DigestScheduler {
  private readonly logger = new Logger(DigestScheduler.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(DIGEST_QUEUE) private readonly digestQueue: Queue,
  ) {}

  /**
   * Runs every Sunday at 08:00 UTC.
   * Finds all workspaces subscribed to a weekly digest and enqueues a
   * generation job for each of them.
   */
  @Cron('0 8 * * 0')
  async handleWeeklyDigest() {
    this.logger.log('Starting weekly digest generation job...');

    const subscriptions = await this.prisma.digestSubscription.findMany({
      where: {
        enabled: true,
        frequency: DigestFrequency.WEEKLY,
      },
      select: {
        workspaceId: true,
      },
    });

    if (subscriptions.length === 0) {
      this.logger.log('No workspaces subscribed to weekly digests. Exiting.');
      return;
    }

    this.logger.log(
      `Found ${subscriptions.length} workspaces subscribed to weekly digests.`,
    );

    for (const sub of subscriptions) {
      try {
        await this.digestQueue.add({ workspaceId: sub.workspaceId });
        this.logger.log(
          `Enqueued digest generation for workspace ${sub.workspaceId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to enqueue digest generation for workspace ${sub.workspaceId}`,
          error,
        );
      }
    }

    this.logger.log('Finished enqueuing all weekly digest generation jobs.');
  }
}
