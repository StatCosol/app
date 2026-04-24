import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { baseHtml } from './email.templates';

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private readonly enabled: boolean;
  private readonly transporter: ReturnType<typeof nodemailer.createTransport>;

  constructor(private readonly config: ConfigService) {
    this.enabled =
      config.get<string>('EMAIL_ENABLED', 'false').toLowerCase() === 'true';

    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT', 587),
      secure:
        config.get<string>('SMTP_SECURE', 'false').toLowerCase() === 'true',
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

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

    const fromName = this.config.get<string>(
      'SMTP_FROM_NAME',
      'StatCo Solutions',
    );
    const fromEmail =
      this.config.get<string>('SMTP_FROM_EMAIL') ||
      this.config.get<string>('SMTP_USER', '');

    const html = baseHtml(title, bodyHtml);

    try {
      const info = await this.transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to,
        subject,
        html,
      });
      return { ok: true, messageId: info.messageId } as const;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      this.log.error(`Email send failed: ${msg}`);
      return { ok: false, error: msg } as const;
    }
  }

  adminRecipients(): string[] {
    const raw = this.config.get<string>('ADMIN_ALERT_EMAILS', '');
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => !!s);
  }
}
