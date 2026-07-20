import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Vijay Kumar' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'vijay@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class LoginDto {
  @ApiProperty({ example: 'vijay@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class UpdateAccountDto {
  @ApiPropertyOptional({ example: 'Vijay Kumar' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ example: 'vijay@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class SendSignupOtpDto {
  @ApiProperty({ example: 'Vijay Kumar' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'vijay@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'securePassword123' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class VerifySignupOtpDto {
  @ApiProperty({ example: 'vijay@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @MinLength(6)
  otp: string;
}

export class ResendSignupOtpDto {
  @ApiProperty({ example: 'vijay@example.com' })
  @IsEmail()
  email: string;
}
