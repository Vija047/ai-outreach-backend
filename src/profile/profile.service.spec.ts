import { UnprocessableEntityException } from '@nestjs/common';
import { ProfileService } from './profile.service';
import { SellerProfile } from '@prisma/client';

describe('ProfileService', () => {
  const prisma = {
    sellerProfile: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  let service: ProfileService;

  beforeEach(() => {
    service = new ProfileService(prisma as never);
  });

  it('assertComplete throws when required fields missing', () => {
    const incomplete = {
      role: 'Dev',
      company: null,
      services: [],
      targetCustomers: null,
      valueProposition: null,
    } as unknown as SellerProfile;

    expect(() => service.assertComplete(incomplete)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('assertComplete passes when profile is complete', () => {
    const complete = {
      role: 'Dev',
      company: 'ACME',
      services: ['Web'],
      targetCustomers: 'Startups',
      valueProposition: 'We ship fast',
    } as unknown as SellerProfile;

    expect(() => service.assertComplete(complete)).not.toThrow();
  });
});
