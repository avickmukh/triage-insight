import { IsArray, IsString, IsNotEmpty, ArrayMinSize, ArrayMaxSize, IsOptional } from 'class-validator';

/**
 * DTO for bulk feedback actions (Step 3 Gap Fix — Bulk Inbox Actions).
 *
 * Supports:
 *   - bulk dismiss  → set status to ARCHIVED
 *   - bulk assign   → link all feedbackIds to a themeId
 *   - bulk merge    → merge all feedbackIds into a single targetId
 */
export class BulkDismissFeedbackDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  feedbackIds: string[];
}

export class BulkAssignFeedbackDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsString({ each: true })
  feedbackIds: string[];

  @IsString()
  @IsNotEmpty()
  themeId: string;
}

export class BulkMergeFeedbackDto {
  /** The feedback item that all others will be merged INTO */
  @IsString()
  @IsNotEmpty()
  targetId: string;

  /** The feedback items to be merged (must not include targetId) */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(499)
  @IsString({ each: true })
  sourceIds: string[];
}
