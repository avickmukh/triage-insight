import { Injectable, Logger } from '@nestjs/common';
import { parse } from 'csv-parse';
import { FeedbackService } from '../feedback.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FeedbackSourceType } from '@prisma/client';

/**
 * Flexible CSV import for feedback.
 *
 * Accepted column names (case-insensitive, any order):
 *
 *   Title / text / feedback / subject / summary
 *     → mapped to `title`
 *
 *   Description / body / content / detail / details / message / comment
 *     → mapped to `description`
 *
 *   Source / sourceType / source_type / channel / type
 *     → mapped to `sourceType` (EMAIL, SLACK, API, CSV_IMPORT, etc.)
 *     → unknown values default to CSV_IMPORT
 *
 *   CustomerId / customer_id / customer / account / accountId / account_id
 *     → mapped to `customerId`
 *
 *   Sentiment / score
 *     → mapped to `sentiment` (numeric, clamped to -1..1)
 *
 * Any column not listed above is silently ignored.
 * Rows with no resolvable title AND no resolvable description are skipped.
 */

const SOURCE_TYPE_MAP: Record<string, FeedbackSourceType> = {
  email:       FeedbackSourceType.EMAIL,
  slack:       FeedbackSourceType.SLACK,
  api:         FeedbackSourceType.API,
  csv:         FeedbackSourceType.CSV_IMPORT,
  csv_import:  FeedbackSourceType.CSV_IMPORT,
  web:         FeedbackSourceType.API,
  app:         FeedbackSourceType.API,
  support:     FeedbackSourceType.EMAIL,
  portal:      FeedbackSourceType.PUBLIC_PORTAL,
  voice:       FeedbackSourceType.VOICE,
};

function resolveColumn(record: Record<string, string>, candidates: string[]): string | undefined {
  for (const key of candidates) {
    // Exact match first
    if (record[key] !== undefined) return record[key];
    // Case-insensitive match
    const found = Object.keys(record).find((k) => k.toLowerCase() === key.toLowerCase());
    if (found !== undefined) return record[found];
  }
  return undefined;
}

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly prisma: PrismaService,
  ) {}

  async import(workspaceId: string, fileBuffer: Buffer): Promise<{ importedCount: number; total: number; batchId: string }> {
    const records = await this.parseCsv(fileBuffer);

    // Count valid rows first so we can set totalRows on the batch
    const validRecords = records.filter((r) => {
      const rawTitle = resolveColumn(r, ['title', 'text', 'feedback', 'subject', 'summary']);
      const rawDescription = resolveColumn(r, ['description', 'body', 'content', 'detail', 'details', 'message', 'comment']);
      return !!(rawTitle || rawDescription);
    });

    // Create an ImportBatch row scoped to this upload
    const batch = await this.prisma.importBatch.create({
      data: {
        workspaceId,
        status: 'PROCESSING',
        stage: 'UPLOADED',
        totalRows: validRecords.length,
        completedRows: 0,
        failedRows: 0,
      },
    });

    this.logger.log(`[CsvImport] Created batch ${batch.id} with ${validRecords.length} valid rows for workspace ${workspaceId}`);

    let importedCount = 0;
    let failedCount = 0;

    for (const record of records) {
      try {
        // ── Resolve title ────────────────────────────────────────────────────
        const rawTitle = resolveColumn(record, [
          'title', 'text', 'feedback', 'subject', 'summary',
        ]);

        // ── Resolve description ──────────────────────────────────────────────
        const rawDescription = resolveColumn(record, [
          'description', 'body', 'content', 'detail', 'details', 'message', 'comment',
        ]);

        // Skip rows with no usable text at all
        if (!rawTitle && !rawDescription) {
          this.logger.warn(`[CsvImport] Skipping row with no title or description: ${JSON.stringify(record)}`);
          continue;
        }

        // ── Resolve sourceType ───────────────────────────────────────────────
        const rawSource = resolveColumn(record, [
          'source', 'sourceType', 'source_type', 'channel', 'type',
        ]);
        const sourceType: FeedbackSourceType =
          (rawSource && SOURCE_TYPE_MAP[rawSource.toLowerCase()]) ||
          FeedbackSourceType.CSV_IMPORT;

        // ── Resolve customerId ───────────────────────────────────────────────
        const customerId = resolveColumn(record, [
          'customerId', 'customer_id', 'customer', 'account', 'accountId', 'account_id',
        ]) || undefined;

        // ── Resolve sentiment ────────────────────────────────────────────────
        const rawSentiment = resolveColumn(record, ['sentiment', 'score']);
        const sentiment = rawSentiment
          ? Math.max(-1, Math.min(1, parseFloat(rawSentiment) || 0))
          : undefined;

        await this.feedbackService.create(workspaceId, {
          title:         (rawTitle ?? rawDescription ?? '').trim() || 'Untitled',
          description:   (rawDescription ?? '').trim(),
          customerId,
          sourceType,
          importBatchId: batch.id,
          ...(sentiment !== undefined && { sentiment }),
        });
        importedCount++;
      } catch (error) {
        failedCount++;
        this.logger.error(`[CsvImport] Failed to import row: ${JSON.stringify(record)}`, error);
      }
    }

    // Update batch: stage moves to ANALYZING (pipeline will update to CLUSTERING/COMPLETED)
    await this.prisma.importBatch.update({
      where: { id: batch.id },
      data: {
        totalRows:     importedCount + failedCount,
        failedRows:    failedCount,
        stage:         'ANALYZING',
        status:        'PROCESSING',
      },
    });

    this.logger.log(`[CsvImport] Batch ${batch.id}: imported=${importedCount}, failed=${failedCount}`);

    return { importedCount, total: records.length, batchId: batch.id };
  }

  private parseCsv(buffer: Buffer): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns:           true,
        skip_empty_lines:  true,
        trim:              true,
        relax_column_count: true,
      });
      const records: Record<string, string>[] = [];
      parser.on('readable', () => {
        let record: Record<string, string>;
        while ((record = parser.read()) !== null) {
          records.push(record);
        }
      });
      parser.on('error', (err) => reject(err));
      parser.on('end', () => resolve(records));
      parser.write(buffer);
      parser.end();
    });
  }
}
