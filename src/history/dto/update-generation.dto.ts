import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { ReplyOutcome } from '@prisma/client';

export class UpdateGenerationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  linkedInDm?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  connectionNote?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subjectLines?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  followUp1?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  followUp2?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  sentAt?: string;

  @ApiPropertyOptional({ enum: ReplyOutcome })
  @IsOptional()
  @IsEnum(ReplyOutcome)
  replyOutcome?: ReplyOutcome;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  repliedAt?: string;
}
