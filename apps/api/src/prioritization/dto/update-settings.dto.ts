import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
  // ─── Core signal weights ───────────────────────────────────────────────────
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  requestFrequencyWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  customerCountWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  arrValueWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  accountPriorityWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dealValueWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  strategicWeight?: number;

  // ─── Extended CIQ weights (PRD formula fields) ────────────────────────────
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  voteWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  sentimentWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  recencyWeight?: number;

  // ─── Deal stage multipliers ────────────────────────────────────────────────
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dealStageProspecting?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dealStageQualifying?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dealStageProposal?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dealStageNegotiation?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  dealStageClosedWon?: number;

  // ─── 4-dimension top-level weights ────────────────────────────────────────
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  demandStrengthWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  revenueImpactWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  strategicImportanceWeight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  urgencySignalWeight?: number;
}
