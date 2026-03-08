import { Injectable } from '@nestjs/common';
import { parse } from 'csv-parse';
import { FeedbackService } from '../feedback.service';
import { FeedbackSourceType } from '@prisma/client';

@Injectable()
export class CsvImportService {
  constructor(private readonly feedbackService: FeedbackService) {}

  async import(workspaceId: string, fileBuffer: Buffer) {
    const records = await this.parseCsv(fileBuffer);
    let importedCount = 0;

    for (const record of records) {
      try {
        await this.feedbackService.create(workspaceId, {
          title: record.title,
          description: record.description,
          customerId: record.customerId,
          sourceType: FeedbackSourceType.CSV_IMPORT,
        });
        importedCount++;
      } catch (error) {
        // Log or handle individual row import errors
        console.error(`Failed to import row: ${JSON.stringify(record)}`, error);
      }
    }
    return { importedCount, total: records.length };
  }

  private parseCsv(buffer: Buffer): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const parser = parse({ columns: true, skip_empty_lines: true });
      const records: Record<string, string>[] = [];
      parser.on('readable', () => {
        let record;
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
