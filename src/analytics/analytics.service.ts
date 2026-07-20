import { Injectable } from '@nestjs/common';
import { ReplyOutcome } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreditsService } from '../credits/credits.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly creditsService: CreditsService,
  ) {}

  private computeReplyRate(replied: number, sent: number): number | null {
    if (sent === 0) return null;
    return Math.round((replied / sent) * 100);
  }

  async getSummary(userId: string) {
    const [
      emailsGenerated,
      companiesAnalyzed,
      creditsRemaining,
      toneGroups,
      hookGroups,
      sentCount,
      repliedYesCount,
      toneReplyGroups,
      hookReplyGroups,
    ] = await Promise.all([
      this.prisma.generation.count({ where: { userId } }),
      this.prisma.analysisJob.count({
        where: { userId, status: 'DONE' },
      }),
      this.creditsService.getBalance(userId),
      this.prisma.generation.groupBy({
        by: ['tone'],
        where: { userId },
        _count: { tone: true },
        orderBy: { _count: { tone: 'desc' } },
        take: 1,
      }),
      this.prisma.generation.groupBy({
        by: ['hookId'],
        where: { userId, hookId: { not: null } },
        _count: { hookId: true },
        orderBy: { _count: { hookId: 'desc' } },
        take: 1,
      }),
      this.prisma.generation.count({
        where: { userId, sentAt: { not: null } },
      }),
      this.prisma.generation.count({
        where: { userId, replyOutcome: ReplyOutcome.YES },
      }),
      this.prisma.generation.groupBy({
        by: ['tone'],
        where: { userId, sentAt: { not: null } },
        _count: { tone: true },
      }),
      this.prisma.generation.groupBy({
        by: ['hookId'],
        where: { userId, sentAt: { not: null }, hookId: { not: null } },
        _count: { hookId: true },
      }),
    ]);

    let mostUsedHook: string | null = null;
    if (hookGroups[0]?.hookId) {
      const hook = await this.prisma.companyHook.findUnique({
        where: { id: hookGroups[0].hookId },
        select: { title: true },
      });
      mostUsedHook = hook?.title ?? null;
    }

    const toneReplyStats = await Promise.all(
      toneReplyGroups.map(async (group) => {
        const [sent, replied] = await Promise.all([
          this.prisma.generation.count({
            where: { userId, tone: group.tone, sentAt: { not: null } },
          }),
          this.prisma.generation.count({
            where: {
              userId,
              tone: group.tone,
              replyOutcome: ReplyOutcome.YES,
            },
          }),
        ]);
        return {
          tone: group.tone,
          sent,
          replied,
          replyRate: this.computeReplyRate(replied, sent),
        };
      }),
    );

    const hookReplyStats = await Promise.all(
      hookReplyGroups
        .filter((group) => group.hookId)
        .slice(0, 5)
        .map(async (group) => {
          const hook = await this.prisma.companyHook.findUnique({
            where: { id: group.hookId! },
            select: { title: true },
          });
          const [sent, replied] = await Promise.all([
            this.prisma.generation.count({
              where: {
                userId,
                hookId: group.hookId,
                sentAt: { not: null },
              },
            }),
            this.prisma.generation.count({
              where: {
                userId,
                hookId: group.hookId,
                replyOutcome: ReplyOutcome.YES,
              },
            }),
          ]);
          return {
            hookTitle: hook?.title ?? 'Unknown hook',
            sent,
            replied,
            replyRate: this.computeReplyRate(replied, sent),
          };
        }),
    );

    const bestToneStat = toneReplyStats
      .filter((stat) => stat.sent >= 1 && stat.replyRate != null)
      .sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))[0];

    const bestHookStat = hookReplyStats
      .filter((stat) => stat.sent >= 1 && stat.replyRate != null)
      .sort((a, b) => (b.replyRate ?? 0) - (a.replyRate ?? 0))[0];

    const [recentJobs, contactsFoundTotal] = await Promise.all([
      this.prisma.analysisJob.findMany({
        where: { userId, status: 'DONE', companyId: { not: null } },
        orderBy: { updatedAt: 'desc' },
        take: 30,
        include: {
          user: { select: { id: true, name: true } },
          company: {
            select: {
              id: true,
              name: true,
              domain: true,
              websiteUrl: true,
              analyzedAt: true,
              _count: {
                select: {
                  contacts: true,
                  generations: { where: { userId } },
                },
              },
              contacts: {
                where: { email: { not: null } },
                select: { id: true },
              },
            },
          },
        },
      }),
      this.prisma.companyContact.count({
        where: {
          email: { not: null },
          company: {
            analysisJobs: { some: { userId, status: 'DONE' } },
          },
        },
      }),
    ]);

    const seenCompanyIds = new Set<string>();
    const recentCompanies: {
      id: string;
      name: string | null;
      domain: string;
      websiteUrl: string;
      analyzedAt: Date;
      reviewedAt: Date;
      reviewedByUserId: string;
      reviewedByName: string;
      emailsGenerated: number;
      contactsFound: number;
      hasOutreach: boolean;
    }[] = [];

    for (const job of recentJobs) {
      if (!job.companyId || !job.company || seenCompanyIds.has(job.companyId)) {
        continue;
      }
      seenCompanyIds.add(job.companyId);
      const emailsGenerated = job.company._count.generations;
      recentCompanies.push({
        id: job.company.id,
        name: job.company.name,
        domain: job.company.domain,
        websiteUrl: job.company.websiteUrl,
        analyzedAt: job.company.analyzedAt,
        reviewedAt: job.updatedAt,
        reviewedByUserId: job.userId,
        reviewedByName: job.user?.name ?? 'Unknown user',
        emailsGenerated,
        contactsFound: job.company.contacts.length,
        hasOutreach: emailsGenerated > 0,
      });
      if (recentCompanies.length >= 5) break;
    }

    const pendingJobs = await this.prisma.analysisJob.findMany({
      where: { userId, status: 'DONE', companyId: { not: null } },
      orderBy: { updatedAt: 'desc' },
      take: 30,
      include: {
        user: { select: { id: true, name: true } },
        company: {
          select: {
            id: true,
            name: true,
            domain: true,
            websiteUrl: true,
            analyzedAt: true,
            _count: {
              select: {
                generations: { where: { userId } },
              },
            },
            contacts: {
              where: { email: { not: null } },
              select: { id: true },
            },
          },
        },
      },
    });

    const pendingSeen = new Set<string>();
    const pendingOutreach: typeof recentCompanies = [];

    for (const job of pendingJobs) {
      if (!job.companyId || !job.company || pendingSeen.has(job.companyId)) {
        continue;
      }
      pendingSeen.add(job.companyId);
      const emailsGenerated = job.company._count.generations;
      if (emailsGenerated === 0 && pendingOutreach.length < 5) {
        pendingOutreach.push({
          id: job.company.id,
          name: job.company.name,
          domain: job.company.domain,
          websiteUrl: job.company.websiteUrl,
          analyzedAt: job.company.analyzedAt,
          reviewedAt: job.updatedAt,
          reviewedByUserId: job.userId,
          reviewedByName: job.user?.name ?? 'Unknown user',
          emailsGenerated: 0,
          contactsFound: job.company.contacts.length,
          hasOutreach: false,
        });
      }
    }

    const companiesWithoutOutreach = await this.prisma.company.count({
      where: {
        analysisJobs: { some: { userId, status: 'DONE' } },
        generations: { none: { userId } },
      },
    });

    return {
      emailsGenerated,
      companiesAnalyzed,
      creditsRemaining,
      contactsFoundTotal,
      companiesWithoutOutreach,
      recentCompanies,
      pendingOutreach,
      mostUsedTone: toneGroups[0]?.tone ?? null,
      mostUsedHook,
      outreachSent: sentCount,
      repliesReceived: repliedYesCount,
      overallReplyRate: this.computeReplyRate(repliedYesCount, sentCount),
      bestToneReplyRate: bestToneStat?.replyRate ?? null,
      bestToneLabel: bestToneStat?.tone ?? null,
      bestHookReplyRate: bestHookStat?.replyRate ?? null,
      bestHookLabel: bestHookStat?.hookTitle ?? null,
      toneReplyStats,
      hookReplyStats,
    };
  }
}
