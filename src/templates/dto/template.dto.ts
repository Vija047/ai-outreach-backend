import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateTemplateDto {
  @ApiProperty({ example: 'Interview follow-up' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'Email · Interview' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ example: 'Hi {{name}}, I noticed {{company}}...' })
  @IsString()
  @IsNotEmpty()
  body: string;
}

export class UpdateTemplateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  body?: string;
}
