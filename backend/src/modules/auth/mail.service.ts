import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  async sendRegistrationOtp(email: string, otp: string): Promise<void> {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const password = process.env.SMTP_PASSWORD;
    const required = process.env.SMTP_REQUIRED !== 'false';

    if (!host || !user || !password) {
      if (required) {
        throw new ServiceUnavailableException(
          'Email service is not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASSWORD.',
        );
      }
      console.log(`[auth] Development OTP for ${email}: ${otp}`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: process.env.SMTP_SECURE !== 'false',
      auth: { user, pass: password },
    });
    await transporter.sendMail({
      from: process.env.SMTP_FROM ?? user,
      to: email,
      subject: 'Racehorse Transport System - Email verification code',
      text: `Your verification code is ${otp}. It expires in 10 minutes.`,
      html: `<p>Your verification code is <strong>${otp}</strong>.</p><p>This code expires in 10 minutes.</p>`,
    });
  }
}