import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtpEmail(to: string, otp: string, name: string): Promise<void> {
    const apiKey = this.configService.get<string>('app.resendApiKey');
    const from = this.configService.get<string>('app.emailFrom');
    const nodeEnv = this.configService.get<string>('app.nodeEnv');

    const subject = 'Verify your AI Outreach account';
    const html = `
      <p>Hi ${name},</p>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px;">${otp}</p>
      <p>This code expires in 10 minutes.</p>
      <p>If you did not sign up, you can ignore this email.</p>
    `;

    if (!apiKey) {
      this.logger.warn(
        `RESEND_API_KEY not set — OTP for ${to}: ${otp} (dev only)`,
      );
      return;
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      this.logger.error(`Failed to send OTP email: ${res.status} ${body}`);
      if (nodeEnv === 'production') {
        throw new Error('Failed to send verification email');
      }
      this.logger.warn(`OTP fallback for ${to}: ${otp}`);
    }
  }
}
