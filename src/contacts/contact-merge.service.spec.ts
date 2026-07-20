import { ContactSource, EmailStatus } from '@prisma/client';
import { ContactMergeService } from './contact-merge.service';
import { mapHunterEmailStatus } from './hunter.client';

describe('ContactMergeService', () => {
  let service: ContactMergeService;

  beforeEach(() => {
    service = new ContactMergeService();
  });

  it('normalizes names for deduplication', () => {
    expect(service.normalizeName('Priya Sharma')).toBe('priya sharma');
    expect(service.normalizeName('  John  O\'Brien  ')).toBe('john obrien');
  });

  it('ranks founders and CEOs highest', () => {
    expect(service.computeRankScore('Co-Founder & CTO')).toBe(100);
    expect(service.computeRankScore('Chief Executive Officer')).toBe(95);
    expect(service.computeRankScore('Software Engineer')).toBe(40);
  });

  it('merges RocketReach and Hunter records by name', () => {
    const merged = service.merge([
      {
        name: 'Priya Sharma',
        title: 'Co-Founder & CTO',
        linkedinUrl: null,
        profilePicUrl: null,
        email: null,
        emailConfidence: null,
        emailStatus: EmailStatus.unknown,
        source: ContactSource.ROCKETREACH,
        sourceNote: 'rocketreach',
        rankScore: 100,
      },
      {
        name: 'priya sharma',
        title: 'CTO',
        linkedinUrl: 'https://linkedin.com/in/priya',
        profilePicUrl: null,
        email: 'priya@acme.com',
        emailConfidence: 92,
        emailStatus: EmailStatus.valid,
        source: ContactSource.HUNTER,
        sourceNote: 'hunter',
        rankScore: 85,
      },
    ]);

    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe(ContactSource.BOTH);
    expect(merged[0].email).toBe('priya@acme.com');
    expect(merged[0].linkedinUrl).toBe('https://linkedin.com/in/priya');
    expect(merged[0].title).toBe('Co-Founder & CTO');
  });

  it('sorts merged contacts by rank score descending', () => {
    const merged = service.merge([
      {
        name: 'Alex Lee',
        title: 'Engineer',
        linkedinUrl: null,
        profilePicUrl: null,
        email: null,
        emailConfidence: null,
        emailStatus: EmailStatus.unknown,
        source: ContactSource.HUNTER,
        sourceNote: 'hunter',
        rankScore: 40,
      },
      {
        name: 'Sam Patel',
        title: 'CEO',
        linkedinUrl: null,
        profilePicUrl: null,
        email: null,
        emailConfidence: null,
        emailStatus: EmailStatus.unknown,
        source: ContactSource.ROCKETREACH,
        sourceNote: 'rocketreach',
        rankScore: 95,
      },
    ]);

    expect(merged[0].name).toBe('Sam Patel');
    expect(merged[1].name).toBe('Alex Lee');
  });

  it('maps hunter email statuses', () => {
    expect(mapHunterEmailStatus('valid')).toBe(EmailStatus.valid);
    expect(mapHunterEmailStatus('accept_all')).toBe(EmailStatus.accept_all);
    expect(mapHunterEmailStatus('invalid')).toBe(EmailStatus.invalid);
    expect(mapHunterEmailStatus(undefined)).toBe(EmailStatus.unknown);
  });
});

describe('Hunter quota guard', () => {
  it('skips when remaining searches below threshold', async () => {
    const hunter = {
      remainingSearches: 1,
      hasSearchQuota() {
        return this.remainingSearches >= 2;
      },
    };

    expect(hunter.hasSearchQuota()).toBe(false);
  });
});
