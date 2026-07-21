import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly configService: ConfigService) {}

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const user = this.configService.get<string>('app.emailUser')?.trim();
    // Google app passwords are often shown with spaces — strip them
    const pass = this.configService
      .get<string>('app.emailPass')
      ?.replace(/\s+/g, '');
    if (!user || !pass) return null;

    const host =
      this.configService.get<string>('app.smtpHost') ?? 'smtp.gmail.com';
    const port = this.configService.get<number>('app.smtpPort') ?? 587;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: false,
      requireTLS: true,
      auth: { user, pass },
    });

    return this.transporter;
  }

  async sendOtpEmail(to: string, otp: string, name: string): Promise<void> {
    const user = this.configService.get<string>('app.emailUser')?.trim();
    const from =
      this.configService.get<string>('app.emailFrom')?.trim() ||
      (user ? `AI Outreach <${user}>` : undefined);
    const nodeEnv = this.configService.get<string>('app.nodeEnv');
    const isProd = nodeEnv === 'production';

    const subject = 'Verify your AI Outreach account';
    const html = `
      <p>Hi ${name},</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not sign up, you can ignore this email.</p>
    `;

    const transporter = this.getTransporter();
    if (!transporter || !from) {
      if (isProd) {
        throw new ServiceUnavailableException(
          'Email service is not configured',
        );
      }
      this.logger.warn(
        `EMAIL_USER / EMAIL_PASS not set — OTP for ${to}: ${otp} (dev only)`,
      );
      return;
    }

    try {
      await transporter.sendMail({
        from,
        to,
        subject,
        html,
      });
      this.logger.log(`OTP email sent to ${to}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send OTP email: ${message}`);
      if (isProd) {
        throw new ServiceUnavailableException(
          'Failed to send verification email',
        );
      }
      this.logger.warn(`OTP fallback for ${to}: ${otp}`);
    }
  }
}
