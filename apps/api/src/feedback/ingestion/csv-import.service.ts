import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse';
import { FeedbackService } from '../feedback.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FeedbackSourceType,
  FeedbackPrimarySource,
  FeedbackSecondarySource,
} from '@prisma/client';

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
 *
 * ── Column Mapping (Blocker 1 Fix) ──────────────────────────────────────────
 * An optional CsvColumnMapping object can be supplied to explicitly map user
 * CSV headers to TriageInsight fields. When provided, the explicit mapping
 * takes priority over the auto-detection aliases above.
 */

/** Explicit column mapping provided by the user via the mapping UI. */
export interface CsvColumnMapping {
  /** Required: the column that contains the main feedback text. */
  feedbackText: string;
  /** Optional: column for a short title / subject. */
  title?: string;
  /** Optional: column for the customer email address. */
  customerEmail?: string;
  /** Optional: column for the source type (e.g. "email", "slack"). */
  source?: string;
}

/** Legacy sourceType string → FeedbackSourceType enum */
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

/**
 * Maps a resolved FeedbackSourceType to the unified (primarySource, secondarySource) pair.
 * This is the single source of truth for the CSV import path.
 */
function resolveUnifiedSources(sourceType: FeedbackSourceType): {
  primarySource: FeedbackPrimarySource;
  secondarySource: FeedbackSecondarySource;
} {
  switch (sourceType) {
    case FeedbackSourceType.VOICE:
      return { primarySource: FeedbackPrimarySource.VOICE,    secondarySource: FeedbackSecondarySource.TRANSCRIPT };
    case FeedbackSourceType.SURVEY:
      return { primarySource: FeedbackPrimarySource.SURVEY,   secondarySource: FeedbackSecondarySource.PORTAL };
    case FeedbackSourceType.EMAIL:
      return { primarySource: FeedbackPrimarySource.FEEDBACK, secondarySource: FeedbackSecondarySource.EMAIL };
    case FeedbackSourceType.SLACK:
      return { primarySource: FeedbackPrimarySource.FEEDBACK, secondarySource: FeedbackSecondarySource.SLACK };
    case FeedbackSourceType.PUBLIC_PORTAL:
      return { primarySource: FeedbackPrimarySource.FEEDBACK, secondarySource: FeedbackSecondarySource.PORTAL };
    case FeedbackSourceType.API:
      return { primarySource: FeedbackPrimarySource.FEEDBACK, secondarySource: FeedbackSecondarySource.API };
    case FeedbackSourceType.MANUAL:
      return { primarySource: FeedbackPrimarySource.FEEDBACK, secondarySource: FeedbackSecondarySource.MANUAL };
    case FeedbackSourceType.CSV_IMPORT:
    default:
      return { primarySource: FeedbackPrimarySource.FEEDBACK, secondarySource: FeedbackSecondarySource.CSV_UPLOAD };
  }
}

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

/** Resolve a single column by exact name (used when an explicit mapping is provided). */
function resolveExact(record: Record<string, string>, col: string): string | undefined {
  if (record[col] !== undefined) return record[col];
  const found = Object.keys(record).find((k) => k.toLowerCase() === col.toLowerCase());
  return found !== undefined ? record[found] : undefined;
}

@Injectable()
export class CsvImportService {
  private readonly logger = new Logger(CsvImportService.name);

  constructor(
    private readonly feedbackService: FeedbackService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Parse a CSV buffer and return:
   *  - headers: all detected column names
   *  - preview: first 3 data rows (as key→value objects)
   *  - totalRows: total number of data rows in the file
   *
   * Used by the frontend column-mapping step before the actual import.
   */
  async parseHeaders(fileBuffer: Buffer): Promise<{
    headers: string[];
    preview: Record<string, string>[];
    totalRows: number;
  }> {
    const records = await this.parseCsv(fileBuffer);
    const headers = records.length > 0 ? Object.keys(records[0]) : [];
    return {
      headers,
      preview: records.slice(0, 3),
      totalRows: records.length,
    };
  }

  async import(
    workspaceId: string,
    fileBuffer: Buffer,
    mapping?: CsvColumnMapping,
  ): Promise<{ importedCount: number; total: number; batchId: string }> {
    const records = await this.parseCsv(fileBuffer);

    // ── Validate mapping if provided ────────────────────────────────────────
    if (mapping) {
      if (!mapping.feedbackText || !mapping.feedbackText.trim()) {
        throw new BadRequestException(
          'Column mapping is invalid: "feedbackText" must be specified.',
        );
      }
      // Verify the mapped column actually exists in the first row
      if (records.length > 0) {
        const firstRow = records[0];
        const colExists =
          firstRow[mapping.feedbackText] !== undefined ||
          Object.keys(firstRow).some(
            (k) => k.toLowerCase() === mapping.feedbackText.toLowerCase(),
          );
        if (!colExists) {
          throw new BadRequestException(
            `Column mapping error: column "${mapping.feedbackText}" was not found in the CSV file. ` +
            `Available columns: ${Object.keys(firstRow).join(', ')}`,
          );
        }
      }
    }

    // Count valid rows first so we can set totalRows on the batch
    const validRecords = records.filter((r) => {
      if (mapping) {
        // With explicit mapping: a row is valid if the feedbackText column has a value
        const text = resolveExact(r, mapping.feedbackText);
        return !!(text && text.trim());
      }
      // Without mapping: fall back to auto-detection aliases
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
        let rawTitle: string | undefined;
        let rawDescription: string | undefined;
        let rawSource: string | undefined;
        let customerId: string | undefined;

        if (mapping) {
          // ── Explicit mapping path ──────────────────────────────────────────
          rawDescription = resolveExact(record, mapping.feedbackText);
          rawTitle = mapping.title ? resolveExact(record, mapping.title) : undefined;
          rawSource = mapping.source ? resolveExact(record, mapping.source) : undefined;
          const emailCol = mapping.customerEmail ? resolveExact(record, mapping.customerEmail) : undefined;
          customerId = emailCol || undefined;
        } else {
          // ── Auto-detection path (legacy) ──────────────────────────────────
          rawTitle = resolveColumn(record, ['title', 'text', 'feedback', 'subject', 'summary']);
          rawDescription = resolveColumn(record, ['description', 'body', 'content', 'detail', 'details', 'message', 'comment']);
          rawSource = resolveColumn(record, ['source', 'sourceType', 'source_type', 'channel', 'type']);
          customerId = resolveColumn(record, ['customerId', 'customer_id', 'customer', 'account', 'accountId', 'account_id']) || undefined;
        }

        // Skip rows with no usable text at all
        if (!rawTitle && !rawDescription) {
          this.logger.warn(`[CsvImport] Skipping row with no title or description: ${JSON.stringify(record)}`);
          continue;
        }

        // ── Resolve sourceType ───────────────────────────────────────────────
        const sourceType: FeedbackSourceType =
          (rawSource && SOURCE_TYPE_MAP[rawSource.toLowerCase()]) ||
          FeedbackSourceType.CSV_IMPORT;

        // ── Derive unified primary/secondary source from sourceType ──────────
        const { primarySource, secondarySource } = resolveUnifiedSources(sourceType);

        // ── Resolve sentiment ────────────────────────────────────────────────
        const rawSentiment = resolveColumn(record, ['sentiment', 'score']);
        const sentiment = rawSentiment
          ? Math.max(-1, Math.min(1, parseFloat(rawSentiment) || 0))
          : undefined;

        await this.feedbackService.create(workspaceId, {
          title:           (rawTitle ?? rawDescription ?? '').trim() || 'Untitled',
          description:     (rawDescription ?? '').trim(),
          customerId,
          sourceType,
          primarySource,
          secondarySource,
          importBatchId:   batch.id,
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
