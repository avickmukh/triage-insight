import { PartialType } from '@nestjs/mapped-types';
import { CreateRoadmapItemDto } from './create-roadmap-item.dto';

export class UpdateRoadmapItemDto extends PartialType(CreateRoadmapItemDto) {}
