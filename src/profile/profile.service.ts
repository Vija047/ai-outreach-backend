import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SellerProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  REQUIRED_PROFILE_FIELDS,
  UpdateProfileDto,
} from './dto/profile.dto';

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(userId: string) {
    const profile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const { phoneCountryCode, phoneNumber, ...rest } = dto;
    const data: Record<string, unknown> = { ...rest };

    if (phoneCountryCode !== undefined || phoneNumber !== undefined) {
      const normalizedCountry = phoneCountryCode?.trim().toUpperCase() ?? '';
      const normalizedNumber = phoneNumber?.replace(/\D/g, '') ?? '';

      if (normalizedNumber && !normalizedCountry) {
        throw new UnprocessableEntityException({
          message: 'Phone country is required when phone number is provided',
          code: 'PHONE_COUNTRY_REQUIRED',
        });
      }

      if (!normalizedNumber && !normalizedCountry) {
        data.phoneCountryCode = null;
        data.phoneNumber = null;
      } else {
        data.phoneCountryCode = normalizedCountry;
        data.phoneNumber = normalizedNumber;
      }
    }

    return this.prisma.sellerProfile.update({
      where: { userId },
      data,
    });
  }

  assertComplete(profile: SellerProfile) {
    const missing = REQUIRED_PROFILE_FIELDS.filter((field) => {
      const value = profile[field];
      if (Array.isArray(value)) return value.length === 0;
      return !value;
    });

    if (missing.length > 0) {
      throw new UnprocessableEntityException({
        message: `Profile incomplete. Missing: ${missing.join(', ')}`,
        code: 'PROFILE_INCOMPLETE',
      });
    }
  }
}
