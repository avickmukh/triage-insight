import { IsString, IsOptional, IsIn } from 'class-validator';

export const ARCHIVE_REASONS = [
  'Duplicate',
  'Noise',
  'Wrong clustering',
  'Other',
] as const;

export type ArchiveReasonType = (typeof ARCHIVE_REASONS)[number];

export class ArchiveThemeDto {
  @IsString()
  @IsOptional()
  @IsIn(ARCHIVE_REASONS)
  reason?: ArchiveReasonType;
}
