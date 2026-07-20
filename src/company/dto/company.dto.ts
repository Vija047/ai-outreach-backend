import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class AnalyzeCompanyDto {
  @ApiProperty({ example: 'https://company.com' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  url: string;
}
