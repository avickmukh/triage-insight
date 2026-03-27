import { IsString, IsNotEmpty, IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class SemanticSearchDto {
  /**
   * Natural-language query string.
   * An embedding will be generated for this text and used for cosine
   * similarity search against Feedback.embedding (pgvector).
   */
  @IsString()
  @IsNotEmpty()
  q!: string;

  /**
   * Maximum number of results to return (default 10, max 50).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  /**
   * Minimum cosine similarity threshold (0–1, default 0.5).
   * Results below this threshold are excluded.
   */
  @IsOptional()
  @Type(() => Number)
  threshold?: number = 0.5;
}
