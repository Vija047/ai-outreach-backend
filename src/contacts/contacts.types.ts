import { ContactSource, EmailStatus } from '@prisma/client';

export interface RawPersonRecord {
  name: string;
  title: string;
  linkedinUrl?: string | null;
  profilePicUrl?: string | null;
  email?: string | null;
  emailConfidence?: number | null;
  emailStatus?: EmailStatus;
  source: ContactSource;
  sourceNote: string;
  rankScore: number;
}

export interface MergedContact {
  name: string;
  title: string;
  linkedinUrl: string | null;
  profilePicUrl: string | null;
  email: string | null;
  emailConfidence: number | null;
  emailStatus: EmailStatus;
  source: ContactSource;
  sourceNote: string;
  rankScore: number;
}

export interface ContactDiscoveryResult {
  contacts: MergedContact[];
  linkedinCompanyUrl: string | null;
  warnings: string[];
}

export interface RocketReachProfile {
  id?: number;
  name: string;
  title: string;
  linkedinUrl?: string | null;
  profilePicUrl?: string | null;
  email?: string | null;
  emailConfidence?: number | null;
  emailStatus?: EmailStatus;
}

export interface NinjaPearExecutive {
  name: string;
  title: string;
  role?: string;
  person_profile_url?: string | null;
}

export interface HunterDomainEmail {
  value: string;
  type?: string;
  confidence?: number;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  linkedin?: string | null;
}
