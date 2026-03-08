import { IsNumber, IsOptional, Min, Max } from 'class-validator';

export class UpdateSettingsDto {
  @IsOptional() @IsNumber() @Min(0) @Max(1)
  requestFrequencyWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  customerCountWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  arrValueWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  accountPriorityWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  dealValueWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  strategicWeight?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  dealStageProspecting?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  dealStageQualifying?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  dealStageProposal?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  dealStageNegotiation?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(1)
  dealStageClosedWon?: number;
}
