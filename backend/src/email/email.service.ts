import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer from 'nodemailer';
import { baseHtml } from './email.templates';

interface MailAttachment {
  filename: string;
  content?: Buffer | string;
  path?: string;
  contentType?: string;
}

interface MailMessage {
  from: string;
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html: string;
  attachments?: MailAttachment[];
}

interface MailTransporter {
  sendMail(message: MailMessage): Promise<{ messageId?: string }>;
}

@Injectable()
export class EmailService {
  private readonly log = new Logger(EmailService.name);
  private readonly enabled: boolean;

  /**
   * Map of authenticated SMTP user (lower-cased email) -> transporter.
   * Lets us send From: each mailbox without Zoho 553 relay rejection.
   */
  private readonly transporters = new Map<string, MailTransporter>();
  private readonly defaultTransporter: MailTransporter;
  private readonly defaultUser: string;

  constructor(private readonly config: ConfigService) {
    this.enabled =
      config.get<string>('EMAIL_ENABLED', 'false').toLowerCase() === 'true';

    const host = config.get<string>('SMTP_HOST');
    const port = config.get<number>('SMTP_PORT', 587);
    const secure =
      config.get<string>('SMTP_SECURE', 'false').toLowerCase() === 'true';

    const build = (user?: string, pass?: string): MailTransporter | null => {
      if (!user || !pass) return null;
      return nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
      }) as MailTransporter;
    };

    const register = (user?: string, pass?: string) => {
      const t = build(user, pass);
      if (t && user) {
        this.transporters.set(user.toLowerCase(), t);
      }
      return t;
    };

    // Per-mailbox transporters (preferred)
    register(
      config.get<string>('SMTP_FINANCE_USER'),
      config.get<string>('SMTP_FINANCE_PASS'),
    );
    register(
      config.get<string>('SMTP_AUDIT_USER'),
      config.get<string>('SMTP_AUDIT_PASS'),
    );
    register(
      config.get<string>('SMTP_PAYROLL_USER'),
      config.get<string>('SMTP_PAYROLL_PASS'),
    );

    // Legacy single-mailbox transporter (acts as fallback / default)
    const legacyUser = config.get<string>('SMTP_USER');
    const legacyPass = config.get<string>('SMTP_PASS');
    const legacy = register(legacyUser, legacyPass);

    // Default = legacy if present, else finance, else any registered transporter
    this.defaultUser = (
      legacyUser ||
      config.get<string>('SMTP_FINANCE_USER') ||
      config.get<string>('SMTP_AUDIT_USER') ||
      config.get<string>('SMTP_PAYROLL_USER') ||
      ''
    ).toLowerCase();
    this.defaultTransporter =
      legacy ||
      this.transporters.get(this.defaultUser) ||
      this.transporters.values().next().value!;
  }

  /**
   * Pick the transporter whose authenticated user matches the desired From
   * address. Falls back to the default transporter and rewrites `from` to the
   * default user so Zoho doesn't reject with 553 (sender not allowed to relay).
   */
  private pickTransport(fromEmail: string): {
    transporter: MailTransporter;
    fromUser: string;
  } {
    const wanted = (fromEmail || '').toLowerCase();
    const t = this.transporters.get(wanted);
    if (t) return { transporter: t, fromUser: wanted };
    if (wanted && wanted !== this.defaultUser) {
      this.log.warn(
        `No SMTP transporter for ${wanted}; falling back to ${this.defaultUser}`,
      );
    }
    return {
      transporter: this.defaultTransporter,
      fromUser: this.defaultUser,
    };
  }

  async send(
    to: string | string[],
    subject: string,
    title: string,
    bodyHtml: string,
    fromOverride?: { name?: string; email?: string },
    extras?: {
      cc?: string | string[];
      bcc?: string | string[];
      attachments?: Array<{
        filename: string;
        content?: Buffer | string;
        path?: string;
        contentType?: string;
      }>;
    },
  ) {
    if (!this.enabled) {
      const toStr = Array.isArray(to) ? to.join(',') : to;
      const ccStr = extras?.cc
        ? ` Cc=${Array.isArray(extras.cc) ? extras.cc.join(',') : extras.cc}`
        : '';
      this.log.warn(`[EMAIL DISABLED] Subject=${subject} To=${toStr}${ccStr}`);
      return { skipped: true } as const;
    }

    const fromName =
      fromOverride?.name ||
      this.config.get<string>('SMTP_FROM_NAME', 'StatCo Solutions');
    const requestedFrom =
      fromOverride?.email ||
      this.config.get<string>('SMTP_FROM_EMAIL') ||
      this.defaultUser;

    const { transporter, fromUser } = this.pickTransport(requestedFrom);
    const fromEmail = fromUser; // must match authenticated SMTP user

    const html = baseHtml(title, bodyHtml);

    try {
      const info = await transporter.sendMail({
        from: `${fromName} <${fromEmail}>`,
        to,
        cc: extras?.cc,
        bcc: extras?.bcc,
        subject,
        html,
        attachments: extras?.attachments,
      });
      return { ok: true, messageId: info.messageId } as const;
    } catch (e: unknown) {
      const msg = (e as Error)?.message || String(e);
      this.log.error(`Email send failed (from=${fromEmail}): ${msg}`);
      return { ok: false, error: msg } as const;
    }
  }

  /**
   * Send an audit-related email from the dedicated audit mailbox
   * (defaults to crm_india@statcosol.com; override via AUDIT_FROM_EMAIL
   * / AUDIT_FROM_NAME env vars). All audit notifications, NC alerts,
   * upload-window updates, and final report distribution emails go
   * through this helper so the From: address stays consistent.
   */
  async sendAuditMail(
    to: string | string[],
    subject: string,
    title: string,
    bodyHtml: string,
    extras?: { cc?: string | string[]; bcc?: string | string[] },
  ) {
    return this.send(
      to,
      subject,
      title,
      bodyHtml,
      {
        name: this.config.get<string>('AUDIT_FROM_NAME', 'StatCo Audit Desk'),
        email: this.config.get<string>(
          'AUDIT_FROM_EMAIL',
          'crm_india@statcosol.com',
        ),
      },
      extras,
    );
  }

  adminRecipients(): string[] {
    const raw = this.config.get<string>('ADMIN_ALERT_EMAILS', '');
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => !!s);
  }

  /**
   * Send a payroll-related email from the dedicated payroll mailbox
   * (defaults to payroll_audit@statcosol.com; override via
   * PAYROLL_FROM_EMAIL / PAYROLL_FROM_NAME). Use for salary slips,
   * PF/ESI notifications, and any payroll cron output.
   */
  async sendPayrollMail(
    to: string | string[],
    subject: string,
    title: string,
    bodyHtml: string,
    extras?: { cc?: string | string[]; bcc?: string | string[] },
  ) {
    return this.send(
      to,
      subject,
      title,
      bodyHtml,
      {
        name: this.config.get<string>('PAYROLL_FROM_NAME', 'StatCo Payroll'),
        email: this.config.get<string>(
          'PAYROLL_FROM_EMAIL',
          'payroll_audit@statcosol.com',
        ),
      },
      extras,
    );
  }
}
