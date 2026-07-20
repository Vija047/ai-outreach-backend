import { Module, OnModuleInit } from '@nestjs/common';
import { TemplatesService } from './templates.service';
import { TemplatesController } from './templates.controller';
import { PrismaService } from '../prisma/prisma.service';

const SYSTEM_TEMPLATES = [
  {
    name: 'Cold Email — Interview Ask',
    category: 'Email · Interview',
    body: `Subject: Quick question about {{company}}

Hi {{name}},

I noticed {{company}} is {{hook}}. I'm an {{role}} who helps teams {{valueProposition}}.

Would you be open to a 15-minute call this week? I'd love to learn more about your roadmap and share a few ideas that could help {{company}} move faster.

Best,
{{senderName}}`,
  },
  {
    name: 'Follow-up — Nudge for Reply',
    category: 'Email · Follow-up',
    body: `Subject: Re: {{company}} — quick bump

Hi {{name}},

Just bumping my note in case it got buried. I still think there's a strong fit between what {{company}} is building and how I help with {{services}}.

If now isn't ideal, no worries — happy to reconnect when timing is better.

Best,
{{senderName}}`,
  },
  {
    name: 'LinkedIn DM — Interview Intro',
    category: 'LinkedIn · Interview',
    body: `Hi {{name}} — I've been following {{company}}'s work in {{industry}}.

{{hook}}

I'm exploring opportunities where I can {{valueProposition}}. Would you be open to a quick chat about roles or projects on your team?`,
  },
  {
    name: 'LinkedIn — Connection Note',
    category: 'LinkedIn · Introduction',
    body: `Hi {{name}}, impressed by {{company}}'s momentum in {{industry}}. Would love to connect and follow your updates.`,
  },
  {
    name: 'SaaS Founder Outreach',
    category: 'Email · Interview',
    body: `Subject: Idea for {{company}}

Hi {{name}},

Congrats on what {{company}} is building. {{hook}}

I specialize in helping SaaS teams {{valueProposition}}. Open to a brief call if you're hiring or exploring partners?

Best,
{{senderName}}`,
  },
];

@Module({
  controllers: [TemplatesController],
  providers: [TemplatesService],
})
export class TemplatesModule implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const deprecated = ['Startup Outreach', 'Agency Pitch', 'SaaS Founder'];
    try {
      await this.prisma.template.deleteMany({
        where: { name: { in: deprecated }, isSystem: true },
      });
    } catch {
      // Tables may not exist yet before first migrate deploy
      return;
    }

    for (const tpl of SYSTEM_TEMPLATES) {
      const existing = await this.prisma.template.findFirst({
        where: { name: tpl.name, isSystem: true },
      });
      if (!existing) {
        await this.prisma.template.create({
          data: { ...tpl, isSystem: true },
        });
      } else {
        await this.prisma.template.update({
          where: { id: existing.id },
          data: {
            category: tpl.category,
            body: tpl.body,
          },
        });
      }
    }
  }
}
