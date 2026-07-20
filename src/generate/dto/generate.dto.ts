import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class GenerateDto {
  @ApiProperty({ example: 'clxxxxxxxx' })
  @IsString()
  @IsNotEmpty()
  companyId: string;

  @ApiPropertyOptional({ example: 'clxxxxxxxx' })
  @IsOptional()
  @IsString()
  hookId?: string;

  @ApiPropertyOptional({ example: 'clxxxxxxxx' })
  @IsOptional()
  @IsString()
  contactId?: string;

  @ApiPropertyOptional({ example: 'Professional' })
  @IsOptional()
  @IsString()
  tone?: string;
}
