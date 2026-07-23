import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { Resend } from 'resend';

const SMTP_TIMEOUT_MS = 5_000;

type EmailProvider = 'smtp' | 'resend';

@Injectable()
export class EmailService implements OnModuleInit {
  private readonly logger = new Logger(EmailService.name);
  private transporter: Transporter | null = null;
  private resendClient: Resend | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (this.resolveProvider() !== 'smtp') return;

    const transporter = this.getTransporter();
    if (!transporter) return;

    try {
      await transporter.verify();
      this.logger.log('SMTP connection verified');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `SMTP verify failed: ${message}. ` +
          'Render FREE tier blocks ports 587/465 — upgrade to Starter ($7/mo) or set RESEND_API_KEY as fallback.',
      );
    }
  }

  private hasSmtpCredentials(): boolean {
    const user = this.configService.get<string>('app.emailUser')?.trim();
    const pass = this.configService
      .get<string>('app.emailPass')
      ?.replace(/\s+/g, '');
    return Boolean(user && pass);
  }

  private hasResendCredentials(): boolean {
    return Boolean(
      this.configService.get<string>('app.resendApiKey')?.trim(),
    );
  }

  private resolveProvider(): EmailProvider | null {
    const explicit = this.configService
      .get<string>('app.emailProvider')
      ?.trim()
      .toLowerCase();

    if (explicit === 'smtp' || explicit === 'resend') {
      return explicit;
    }

    if (this.hasSmtpCredentials()) return 'smtp';
    if (this.hasResendCredentials()) return 'resend';

    return null;
  }

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const user = this.configService.get<string>('app.emailUser')?.trim();
    const pass = this.configService
      .get<string>('app.emailPass')
      ?.replace(/\s+/g, '');
    if (!user || !pass) return null;

    const host =
      this.configService.get<string>('app.smtpHost') ?? 'smtp.gmail.com';
    const port = this.configService.get<number>('app.smtpPort') ?? 587;
    const secure =
      this.configService.get<boolean>('app.smtpSecure') ?? port === 465;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      requireTLS: !secure,
      auth: { user, pass },
      connectionTimeout: SMTP_TIMEOUT_MS,
      greetingTimeout: SMTP_TIMEOUT_MS,
      socketTimeout: SMTP_TIMEOUT_MS,
    });

    return this.transporter;
  }

  private getResendClient(): Resend | null {
    if (this.resendClient) return this.resendClient;

    const apiKey = this.configService.get<string>('app.resendApiKey')?.trim();
    if (!apiKey) return null;

    this.resendClient = new Resend(apiKey);
    return this.resendClient;
  }

  private resolveFromAddress(): string | undefined {
    const user = this.configService.get<string>('app.emailUser')?.trim();
    return (
      this.configService.get<string>('app.emailFrom')?.trim() ||
      (user ? `AI Outreach <${user}>` : undefined)
    );
  }

  private resolveResendFromAddress(): string {
    return (
      this.configService.get<string>('app.emailFrom')?.trim() ||
      'AI Outreach <onboarding@resend.dev>'
    );
  }

  private buildOtpContent(
    otp: string,
    name: string,
  ): { subject: string; html: string } {
    return {
      subject: 'Verify your AI Outreach account',
      html: `
      <p>Hi ${name},</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not sign up, you can ignore this email.</p>
    `,
    };
  }

  private buildVerificationLinkContent(
    link: string,
    name: string,
  ): { subject: string; html: string } {
    return {
      subject: 'Verify your AI Outreach account',
      html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; background: #ffffff;">
        <div style="padding: 32px; border: 1px solid #e4e4e7; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);">
          <h2 style="font-size: 20px; font-weight: 600; color: #18181b; margin-top: 0; margin-bottom: 16px;">Verify your email address</h2>
          <p style="font-size: 15px; line-height: 24px; color: #52525b; margin-top: 0; margin-bottom: 24px;">
            Hi ${name},<br><br>
            Thanks for signing up for AI Outreach! Please click the button below to verify your email address and activate your account.
          </p>
          <div style="margin-bottom: 24px;">
            <a href="${link}" style="background-color: #18181b; color: #ffffff; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; display: inline-block;">
              Verify Email Address
            </a>
          </div>
          <p style="font-size: 13px; line-height: 20px; color: #71717a; margin-top: 0; margin-bottom: 24px;">
            This link is valid for <strong>24 hours</strong>. If you did not sign up for an AI Outreach account, you can safely ignore this email.
          </p>
          <hr style="border: 0; border-top: 1px solid #e4e4e7; margin: 24px 0;">
          <p style="font-size: 12px; line-height: 18px; color: #a1a1aa; margin: 0;">
            If you are having trouble with the button above, copy and paste the URL below into your web browser:<br>
            <a href="${link}" style="color: #2563eb; text-decoration: underline; word-break: break-all;">${link}</a>
          </p>
        </div>
      </div>
    `,
    };
  }

  private async sendViaResend(
    to: string,
    from: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const resend = this.getResendClient();
    if (!resend) {
      throw new ServiceUnavailableException('Email service is not configured');
    }

    const { error } = await resend.emails.send({
      from,
      to: [to],
      subject,
      html,
    });

    if (error) {
      throw new Error(error.message);
    }

    this.logger.log(`Email sent to ${to} via Resend`);
  }

  private async sendViaSmtp(
    to: string,
    from: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const transporter = this.getTransporter();
    if (!transporter) {
      throw new ServiceUnavailableException('Email service is not configured');
    }

    await transporter.sendMail({ from, to, subject, html });
    this.logger.log(`Email sent to ${to} via SMTP`);
  }

  private throwEmailUnavailable(message: string): never {
    throw new ServiceUnavailableException(
      `${message} On Render free tier: upgrade to Starter for Gmail SMTP, or set RESEND_API_KEY.`,
    );
  }

  async sendOtpEmail(to: string, otp: string, name: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('app.nodeEnv');
    const isProd = nodeEnv === 'production';
    const provider = this.resolveProvider();
    const from = this.resolveFromAddress();
    const { subject, html } = this.buildOtpContent(otp, name);

    if (!provider) {
      if (isProd) {
        this.throwEmailUnavailable('Email service is not configured.');
      }
      this.logger.warn(
        `EMAIL not configured — OTP for ${to}: ${otp} (dev only)`,
      );
      return;
    }

    try {
      if (provider === 'smtp') {
        if (!from) {
          throw new ServiceUnavailableException('EMAIL_FROM is not configured');
        }

        try {
          await this.sendViaSmtp(to, from, subject, html);
          return;
        } catch (smtpErr) {
          const smtpMessage =
            smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
          this.logger.error(`SMTP failed: ${smtpMessage}`);

          if (this.hasResendCredentials()) {
            this.logger.warn('Falling back to Resend after SMTP failure');
            await this.sendViaResend(
              to,
              this.resolveResendFromAddress(),
              subject,
              html,
            );
            return;
          }

          throw smtpErr;
        }
      }

      await this.sendViaResend(
        to,
        this.resolveResendFromAddress(),
        subject,
        html,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send OTP email: ${message}`);
      if (isProd) {
        this.throwEmailUnavailable(
          'Failed to send verification email. Please try again shortly.',
        );
      }
      this.logger.warn(`OTP fallback for ${to}: ${otp}`);
    }
  }

  async sendVerificationLinkEmail(to: string, token: string, name: string): Promise<void> {
    const nodeEnv = this.configService.get<string>('app.nodeEnv');
    const isProd = nodeEnv === 'production';
    const provider = this.resolveProvider();
    const from = this.resolveFromAddress();
    
    const frontendUrl =
      this.configService.get<string>('app.frontendUrl') ??
      'http://localhost:3000';
    const verificationLink = `${frontendUrl}/verify-email?token=${token}`;
    
    const { subject, html } = this.buildVerificationLinkContent(verificationLink, name);

    if (!provider) {
      if (isProd) {
        this.throwEmailUnavailable('Email service is not configured.');
      }
      this.logger.warn(
        `EMAIL not configured — Verification Link for ${to}: ${verificationLink} (dev only)`,
      );
      return;
    }

    try {
      if (provider === 'smtp') {
        if (!from) {
          throw new ServiceUnavailableException('EMAIL_FROM is not configured');
        }

        try {
          await this.sendViaSmtp(to, from, subject, html);
          return;
        } catch (smtpErr) {
          const smtpMessage =
            smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
          this.logger.error(`SMTP failed: ${smtpMessage}`);

          if (this.hasResendCredentials()) {
            this.logger.warn('Falling back to Resend after SMTP failure');
            await this.sendViaResend(
              to,
              this.resolveResendFromAddress(),
              subject,
              html,
            );
            return;
          }

          throw smtpErr;
        }
      }

      await this.sendViaResend(
        to,
        this.resolveResendFromAddress(),
        subject,
        html,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to send verification email: ${message}`);
      if (isProd) {
        this.throwEmailUnavailable(
          'Failed to send verification email. Please try again shortly.',
        );
      }
      this.logger.warn(`Verification Link fallback for ${to}: ${verificationLink}`);
    }
  }
}
