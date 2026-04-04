import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { WorkspaceRole } from '@prisma/client';

export class InviteMemberDto {
  @IsEmail({}, { message: 'Please enter a valid email address.' })
  email: string;

  @IsEnum(WorkspaceRole)
  role: WorkspaceRole;

  /** Pre-filled first name for the invitee. Stored on the invite and used to populate User.firstName on accept. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  firstName?: string;

  /** Pre-filled last name for the invitee. Stored on the invite and used to populate User.lastName on accept. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  lastName?: string;

  /** Job title / position for the invitee. Stored on WorkspaceMember on accept. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  position?: string;
}
