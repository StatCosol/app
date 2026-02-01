import { Injectable, Logger } from '@nestjs/common';
import nodemailer from 'nodemailer';
import { baseHtml } from './email.templates';

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);

  private readonly enabled =
    (process.env.EMAIL_ENABLED || 'false').toLowerCase() === 'true';

  private readonly transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: (process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  async send(
    to: string | string[],
    subject: string,
    title: string,
    bodyHtml: string,
  ) {
    if (!this.enabled) {
      const toStr = Array.isArray(to) ? to.join(',') : to;
      this.log.warn(`[EMAIL DISABLED] Subject=${subject} To=${toStr}`);
      return { skipped: true } as const;
    }

    const fromName = process.env.SMTP_FROM_NAME || 'StatCo Solutions';
    const fromEmail =
      process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER || '';

    const html = baseHtml(title, bodyHtml);

    try {
      const info = await this.transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to,
        subject,
        html,
      });
      return { ok: true, messageId: info.messageId } as const;
    } catch (e: any) {
      const msg = e?.message || String(e);
      this.log.error(`Email send failed: ${msg}`);
      return { ok: false, error: msg } as const;
    }
  }

  adminRecipients(): string[] {
    const raw = process.env.ADMIN_ALERT_EMAILS || '';
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => !!s);
  }
}
