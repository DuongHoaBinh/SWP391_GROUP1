import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  private async sendOtpEmail(
    email: string,
    subject: string,
    heading: string,
    otp: string,
  ): Promise<void> {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;
    const required = process.env.SMTP_REQUIRED !== 'false';

    if (!host || !user || !password) {
      if (required) {
        throw new ServiceUnavailableException(
          'Email service is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.',
        );
      }
      this.logger.log(`Development OTP for ${email}: ${otp}`);
      return;
    }

    const port = Number(process.env.SMTP_PORT ?? 465);
    const secure =
      process.env.SMTP_SECURE !== undefined
        ? process.env.SMTP_SECURE !== 'false'
        : port === 465;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass: password },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to: email,
      subject,
      text: `${heading}: Your verification code is ${otp}. It expires in 10 minutes.`,
      html: `<p>${heading}</p><p>Your verification code is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes.</p>`,
    });
  }

  async sendRegistrationOtp(email: string, otp: string): Promise<void> {
    await this.sendOtpEmail(
      email,
      'EquiTransit Logistics - Email verification code',
      'Complete your customer registration.',
      otp,
    );
  }

  async sendPasswordResetOtp(email: string, otp: string): Promise<void> {
    await this.sendOtpEmail(
      email,
      'EquiTransit Logistics - Password reset verification code',
      'Use this code to reset your account password.',
      otp,
    );
  }

  async sendOperationalEmail(
    email: string,
    subject: string,
    message: string,
  ): Promise<{ delivered: boolean; dryRun?: boolean }> {
    const recipient = (email || '').trim();
    if (!recipient) return { delivered: false };

    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS;
    if (!host || !user || !password) {
      this.logger.log(`[SMTP Dry-Run] To: ${recipient} | Subject: ${subject}`);
      return { delivered: false, dryRun: true };
    }

    try {
      const port = Number(process.env.SMTP_PORT ?? 465);
      const secure =
        process.env.SMTP_SECURE !== undefined
          ? process.env.SMTP_SECURE !== 'false'
          : port === 465;

      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass: password },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? user,
        to: recipient,
        subject: `EquiTransit - ${subject}`,
        text: message,
        html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h3>${subject.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</h3><p>${message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>')}</p></div>`,
      });
      return { delivered: true };
    } catch (err) {
      this.logger.warn(`Failed operational email to ${recipient}: ${(err as Error).message}`);
      return { delivered: false };
    }
  }

  async sendNotificationEmail(to: string, subject: string, html: string): Promise<boolean> {
    const res = await this.sendOperationalEmail(to, subject, html);
    return res.delivered;
  }
}
