import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getTransporter(): nodemailer.Transporter {
    if (this.transporter) return this.transporter;

    const user = this.configService.get<string>('app.emailUser') ?? '';
    const pass = this.configService.get<string>('app.emailPass') ?? '';
    const host = this.configService.get<string>('app.smtpHost') ?? 'smtp.gmail.com';
    const port = this.configService.get<number>('app.smtpPort') ?? 587;
    const secure = this.configService.get<boolean>('app.smtpSecure') ?? false;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
    });

    return this.transporter;
  }

  private fromAddress(): string {
    return (
      this.configService.get<string>('app.emailFrom') ??
      'AI Outreach <noreply@localhost>'
    );
  }

  async sendVerificationEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Verify your AI Outreach account',
      `Welcome to AI Outreach!\n\nClick the link below to verify your email:\n${link}\n\nThis link expires in 24 hours.`,
      `<p>Welcome to AI Outreach!</p><p><a href="${link}">Verify your email</a></p><p>This link expires in 24 hours.</p>`,
    );
  }

  async sendPasswordResetEmail(to: string, link: string): Promise<void> {
    await this.send(
      to,
      'Reset your AI Outreach password',
      `Reset your password using this link:\n${link}\n\nThis link expires in 1 hour. If you did not request this, ignore this email.`,
      `<p>Reset your password using this link:</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour.</p>`,
    );
  }

  private async send(
    to: string,
    subject: string,
    text: string,
    html: string,
  ): Promise<void> {
    const user = this.configService.get<string>('app.emailUser') ?? '';
    const pass = this.configService.get<string>('app.emailPass') ?? '';

    if (!user || !pass) {
      this.logger.warn(`Email not configured; would send to ${to}: ${subject}`);
      this.logger.warn(`Link/content: ${text.slice(0, 200)}`);
      return;
    }

    await this.getTransporter().sendMail({
      from: this.fromAddress(),
      to,
      subject,
      text,
      html,
    });
    this.logger.log(`Sent email to ${to}: ${subject}`);
  }
}
