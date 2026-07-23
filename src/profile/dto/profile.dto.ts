import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  Matches,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'AI Full Stack Developer' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  role?: string;

  @ApiPropertyOptional({ example: 'VR Solutions' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  company?: string;

  @ApiPropertyOptional({ example: ['Web Development', 'AI Automation'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  services?: string[];

  @ApiPropertyOptional({ example: 'https://portfolio.example.com' })
  @IsOptional()
  @IsUrl()
  portfolioUrl?: string;

  @ApiPropertyOptional({ example: 'US Startups' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  targetCustomers?: string;

  @ApiPropertyOptional({
    example: 'I help startups build AI-powered web applications faster.',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  valueProposition?: string;

  @ApiPropertyOptional({ example: 'Professional' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  tone?: string;

  @ApiPropertyOptional({
    example: 'IN',
    description: 'ISO 3166-1 alpha-2 country code',
  })
  @IsOptional()
  @IsString()
  @Length(2, 2)
  @Matches(/^[A-Z]{2}$/)
  phoneCountryCode?: string;

  @ApiPropertyOptional({
    example: '9876543210',
    description: 'National phone number digits only',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[0-9]{6,15}$/)
  phoneNumber?: string;
}

export const REQUIRED_PROFILE_FIELDS = [
  'role',
  'company',
  'services',
  'targetCustomers',
  'valueProposition',
] as const;
