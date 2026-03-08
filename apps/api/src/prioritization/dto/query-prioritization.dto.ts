import { IsOptional, IsInt } from 'class-validator';
import { Transform } from 'class-transformer';

export class QueryPrioritizationDto {
  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Transform(({ value }) => parseInt(value, 10))
  limit?: number = 20;
}
