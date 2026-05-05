import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import {
  PendingPaymentFollowup,
  PendingPaymentStatus,
} from '../entities/pending-payment-followup.entity';
import { InvoiceEmailLog } from '../entities/invoice-email-log.entity';
import { MailStatus } from '../enums';
import { EmailService } from '../../email/email.service';
import {
  CreatePendingPaymentFollowupDto,
  UpdatePendingPaymentFollowupDto,
} from '../dto/pending-payment-followup.dto';

interface ParsedRow {
  invoiceNumber: string;
  clientName: string;
  clientEmail: string;
  ccEmail?: string;
  amount: number;
  invoiceDate?: string;
  dueDate?: string;
  notes?: string;
}

interface RowError {
  line: number;
  reason: string;
}

export interface UploadResult {
  created: number;
  sent: number;
  failed: number;
  skipped: number;
  parseErrors: { line: number; reason: string }[];
}

@Injectable()
export class PendingPaymentFollowupsService {
  private readonly log = new Logger(PendingPaymentFollowupsService.name);

  constructor(
    @InjectRepository(PendingPaymentFollowup)
    private readonly repo: Repository<PendingPaymentFollowup>,
    @InjectRepository(InvoiceEmailLog)
    private readonly emailLogRepo: Repository<InvoiceEmailLog>,
    private readonly emailService: EmailService,
    private readonly config: ConfigService,
  ) {}

  // ── CSV parsing ─────────────────────────────────────────────────────
  /**
   * Minimal CSV parser supporting double-quoted fields and embedded commas.
   * Expected header (case-insensitive, order-flexible):
   *   invoiceNumber,clientName,clientEmail,ccEmail,amount,invoiceDate,dueDate,notes
   */
  private parseCsv(buffer: Buffer): { rows: ParsedRow[]; errors: RowError[] } {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) {
      throw new BadRequestException(
        'CSV must contain a header row and at least one data row',
      );
    }

    const splitLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
          if (ch === '"' && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else if (ch === '"') {
            inQuotes = false;
          } else {
            cur += ch;
          }
        } else if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          out.push(cur);
          cur = '';
        } else {
          cur += ch;
        }
      }
      out.push(cur);
      return out.map((c) => c.trim());
    };

    const headers = splitLine(lines[0]).map((h) => h.replace(/\s+/g, '').toLowerCase());
    const idx: Record<string, number> = {};
    for (const key of [
      'invoicenumber',
      'clientname',
      'clientemail',
      'ccemail',
      'amount',
      'invoicedate',
      'duedate',
      'notes',
    ]) {
      idx[key] = headers.indexOf(key);
    }
    if (idx['invoicenumber'] < 0 || idx['clientname'] < 0 || idx['clientemail'] < 0 || idx['amount'] < 0) {
      throw new BadRequestException(
        'CSV missing required headers: invoiceNumber, clientName, clientEmail, amount',
      );
    }

    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];

    for (let i = 1; i < lines.length; i++) {
      const cols = splitLine(lines[i]);
      const get = (k: string) => (idx[k] >= 0 ? (cols[idx[k]] ?? '').trim() : '');
      const invoiceNumber = get('invoicenumber');
      const clientName = get('clientname');
      const clientEmail = get('clientemail');
      const ccEmail = get('ccemail') || undefined;
      const amountRaw = get('amount').replace(/[, ]/g, '');
      const invoiceDate = get('invoicedate') || undefined;
      const dueDate = get('duedate') || undefined;
      const notes = get('notes') || undefined;
      const lineNo = i + 1;

      if (!invoiceNumber || !clientName || !clientEmail || !amountRaw) {
        errors.push({ line: lineNo, reason: 'missing required field(s)' });
        continue;
      }
      if (!/^\S+@\S+\.\S+$/.test(clientEmail)) {
        errors.push({ line: lineNo, reason: `invalid clientEmail: ${clientEmail}` });
        continue;
      }
      if (ccEmail && !/^\S+@\S+\.\S+$/.test(ccEmail)) {
        errors.push({ line: lineNo, reason: `invalid ccEmail: ${ccEmail}` });
        continue;
      }
      const amount = Number(amountRaw);
      if (!isFinite(amount) || amount < 0) {
        errors.push({ line: lineNo, reason: `invalid amount: ${amountRaw}` });
        continue;
      }
      const isoDate = (raw?: string): string | undefined => {
        if (!raw) return undefined;
        // Strip trailing time component if present (Excel often appends "0:00:00")
        const s = raw.trim().split(/[ T]/)[0];
        if (!s) return undefined;
        // yyyy-mm-dd or yyyy/mm/dd
        let m = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/);
        if (m) {
          const [, yyyy, mm, dd] = m;
          return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }
        // dd/mm/yyyy or dd-mm-yyyy (Indian/EU default)
        m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
        if (m) {
          const [, dd, mm, yyyy] = m;
          return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }
        // dd/mm/yy or dd-mm-yy (2-digit year — pivot at 70)
        m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})$/);
        if (m) {
          const [, dd, mm, yy] = m;
          const n = parseInt(yy, 10);
          const yyyy = n >= 70 ? 1900 + n : 2000 + n;
          return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
        }
        // dd-MMM-yyyy e.g. 01-May-2026 or 1/May/2026
        m = s.match(/^(\d{1,2})[\/\-]([A-Za-z]{3,9})[\/\-](\d{4})$/);
        if (m) {
          const months: Record<string, string> = {
            jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
            jul: '07', aug: '08', sep: '09', sept: '09', oct: '10', nov: '11', dec: '12',
          };
          const mm = months[m[2].toLowerCase().slice(0, 3)];
          if (mm) return `${m[3]}-${mm}-${m[1].padStart(2, '0')}`;
        }
        // Last-resort: Date.parse
        const d = new Date(raw);
        if (!isNaN(d.getTime())) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          return `${yyyy}-${mm}-${dd}`;
        }
        return undefined;
      };
      const invoiceDateIso = isoDate(invoiceDate);
      const dueDateIso = isoDate(dueDate);
      if (invoiceDate && !invoiceDateIso) {
        errors.push({ line: lineNo, reason: `invalid invoiceDate: ${invoiceDate}` });
        continue;
      }
      if (dueDate && !dueDateIso) {
        errors.push({ line: lineNo, reason: `invalid dueDate: ${dueDate}` });
        continue;
      }
      rows.push({
        invoiceNumber,
        clientName,
        clientEmail,
        ccEmail,
        amount,
        invoiceDate: invoiceDateIso,
        dueDate: dueDateIso,
        notes,
      });
    }
    return { rows, errors };
  }

  // ── Upload + auto-send reminders ────────────────────────────────────
  async uploadAndSend(
    file: Express.Multer.File,
    userId: string | null,
    options: { autoSend: boolean },
  ): Promise<UploadResult> {
    if (!file) throw new BadRequestException('No file uploaded');
    const ext = (file.originalname || '').split('.').pop()?.toLowerCase();
    if (ext !== 'csv') throw new BadRequestException('Only .csv files are accepted');

    const { rows, errors } = this.parseCsv(file.buffer);
    if (rows.length === 0) {
      return {
        created: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        parseErrors: errors,
      };
    }

    // De-duplicate within the CSV (keep first occurrence) and against DB.
    const seenInCsv = new Set<string>();
    const dedupedRows: typeof rows = [];
    for (const r of rows) {
      const key = r.invoiceNumber.trim().toLowerCase();
      if (seenInCsv.has(key)) {
        errors.push({
          line: 0,
          reason: `duplicate invoiceNumber in file: ${r.invoiceNumber}`,
        });
        continue;
      }
      seenInCsv.add(key);
      dedupedRows.push(r);
    }
    const allInvoiceNumbers = dedupedRows.map((r) => r.invoiceNumber);
    const existing = allInvoiceNumbers.length
      ? await this.repo.find({
          where: { invoiceNumber: In(allInvoiceNumbers) },
          select: ['invoiceNumber'],
        })
      : [];
    const existingSet = new Set(
      existing.map((e) => e.invoiceNumber.trim().toLowerCase()),
    );
    let dbDuplicateSkips = 0;
    const finalRows = dedupedRows.filter((r) => {
      if (existingSet.has(r.invoiceNumber.trim().toLowerCase())) {
        errors.push({
          line: 0,
          reason: `invoiceNumber already exists: ${r.invoiceNumber}`,
        });
        dbDuplicateSkips++;
        return false;
      }
      return true;
    });

    const created: PendingPaymentFollowup[] = [];
    for (const r of finalRows) {
      const entity = this.repo.create({
        invoiceNumber: r.invoiceNumber,
        clientName: r.clientName,
        clientEmail: r.clientEmail,
        ccEmail: r.ccEmail ?? null,
        amount: r.amount,
        invoiceDate: r.invoiceDate ?? null,
        dueDate: r.dueDate ?? null,
        notes: r.notes ?? null,
        status: PendingPaymentStatus.PENDING,
        uploadedBy: userId,
      });
      created.push(await this.repo.save(entity));
    }

    let sent = 0;
    let failed = 0;
    const skipped = 0;
    if (options.autoSend) {
      for (const ent of created) {
        try {
          const ok = await this.sendReminderForEntity(ent);
          if (ok) sent++;
          else failed++;
        } catch {
          failed++;
        }
      }
    }

    return {
      created: created.length,
      sent,
      failed,
      skipped: skipped + dbDuplicateSkips,
      parseErrors: errors,
    };
  }

  // ── List / CRUD ─────────────────────────────────────────────────────
  async findAll(query: { status?: string; page?: number; limit?: number }) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(query.limit || 50, 200);
    const qb = this.repo.createQueryBuilder('p').orderBy('p.uploadedAt', 'DESC');
    if (query.status && query.status !== 'ALL') {
      qb.andWhere('p.status = :status', { status: query.status });
    }
    const [data, total] = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const ent = await this.repo.findOne({ where: { id } });
    if (!ent) throw new NotFoundException('Pending payment not found');
    return ent;
  }

  async create(dto: CreatePendingPaymentFollowupDto, userId: string | null) {
    const dup = await this.repo.findOne({
      where: { invoiceNumber: dto.invoiceNumber },
      select: ['id'],
    });
    if (dup) {
      throw new BadRequestException(
        `Invoice number already exists: ${dto.invoiceNumber}`,
      );
    }
    const ent = this.repo.create({
      ...dto,
      status: PendingPaymentStatus.PENDING,
      uploadedBy: userId,
    });
    return this.repo.save(ent);
  }

  async update(id: string, dto: UpdatePendingPaymentFollowupDto) {
    const ent = await this.findOne(id);
    if (dto.invoiceNumber && dto.invoiceNumber !== ent.invoiceNumber) {
      const dup = await this.repo.findOne({
        where: { invoiceNumber: dto.invoiceNumber },
        select: ['id'],
      });
      if (dup && dup.id !== id) {
        throw new BadRequestException(
          `Invoice number already exists: ${dto.invoiceNumber}`,
        );
      }
    }
    Object.assign(ent, dto);
    return this.repo.save(ent);
  }

  async remove(id: string) {
    const ent = await this.findOne(id);
    await this.repo.remove(ent);
    return { success: true };
  }

  // ── Pause / resume daily auto-reminders ─────────────────────────────
  async setPause(id: string, paused: boolean) {
    const ent = await this.findOne(id);
    ent.remindersPaused = !!paused;
    await this.repo.save(ent);
    return { id: ent.id, remindersPaused: ent.remindersPaused };
  }

  // ── Daily auto-reminder cron (09:00 IST) ────────────────────────────
  // Runs every day at 09:00 Asia/Kolkata time. Sends one reminder per
  // PENDING follow-up that has not been paused. PAID / CANCELLED rows
  // and rows with remindersPaused=true are skipped.
  @Cron('0 9 * * *', { timeZone: 'Asia/Kolkata', name: 'pendingPaymentDailyReminder' })
  async runDailyReminders(): Promise<void> {
    const due = await this.repo.find({
      where: {
        status: PendingPaymentStatus.PENDING,
        remindersPaused: false,
      },
    });
    if (!due.length) {
      this.log.log('Daily pending-payment reminders: nothing to send.');
      return;
    }
    let sent = 0;
    let failed = 0;
    for (const ent of due) {
      try {
        const ok = await this.sendReminderForEntity(ent);
        if (ok) sent++;
        else failed++;
      } catch (e) {
        this.log.error(
          `Daily reminder failed for ${ent.invoiceNumber}: ${(e as Error).message}`,
        );
        failed++;
      }
    }
    this.log.log(
      `Daily pending-payment reminders: sent=${sent}, failed=${failed}, total=${due.length}`,
    );
  }

  // ── Reminder email ──────────────────────────────────────────────────
  async sendReminder(id: string) {
    const ent = await this.findOne(id);
    if (ent.status !== PendingPaymentStatus.PENDING) {
      throw new BadRequestException(
        `Cannot send reminder for status=${ent.status}`,
      );
    }
    const ok = await this.sendReminderForEntity(ent);
    return { success: ok, reminderCount: ent.reminderCount };
  }

  async sendBulk(ids: string[]) {
    if (!ids?.length) throw new BadRequestException('No ids supplied');
    let sent = 0;
    let failed = 0;
    const skipped: string[] = [];
    for (const id of ids) {
      try {
        const ent = await this.repo.findOne({ where: { id } });
        if (!ent) continue;
        if (ent.status !== PendingPaymentStatus.PENDING) {
          skipped.push(id);
          continue;
        }
        const ok = await this.sendReminderForEntity(ent);
        if (ok) sent++;
        else failed++;
      } catch (e) {
        this.log.error(`Bulk reminder ${id} failed: ${(e as Error).message}`);
        failed++;
      }
    }
    return { sent, failed, skipped: skipped.length };
  }

  private async sendReminderForEntity(
    ent: PendingPaymentFollowup,
  ): Promise<boolean> {
    const subject = `Payment Reminder — Invoice ${ent.invoiceNumber}`;
    const dueLine = ent.dueDate
      ? `<p>This invoice was due on <strong>${ent.dueDate}</strong>.</p>`
      : '';
    const invLine = ent.invoiceDate
      ? `<p>Invoice date: <strong>${ent.invoiceDate}</strong></p>`
      : '';
    const notesLine = ent.notes
      ? `<p style="color:#555">${ent.notes.replace(/[<>]/g, '')}</p>`
      : '';
    const amountFmt = Number(ent.amount).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const html = `
      <p>Dear ${ent.clientName},</p>
      <p>This is a gentle reminder that the payment against the following invoice
         is still outstanding. Please arrange the remittance at your earliest
         convenience.</p>
      <table style="border-collapse:collapse;margin:12px 0;">
        <tr><td style="padding:4px 12px;color:#666;">Invoice #</td><td style="padding:4px 12px;"><strong>${ent.invoiceNumber}</strong></td></tr>
        <tr><td style="padding:4px 12px;color:#666;">Amount</td><td style="padding:4px 12px;"><strong>₹ ${amountFmt}</strong></td></tr>
      </table>
      ${invLine}
      ${dueLine}
      ${notesLine}
      <p>If the payment has already been made, kindly ignore this email and
         share the transaction details so we can update our records.</p>
      <p>Regards,<br/>StatCo Solutions — Accounts Team</p>
    `;

    const fromName = this.config.get<string>('INVOICE_FROM_NAME')
      || this.config.get<string>('SMTP_FROM_NAME', 'StatCo Solutions');
    const fromEmail = this.config.get<string>('INVOICE_FROM_EMAIL')
      || this.config.get<string>('SMTP_FROM_EMAIL')
      || this.config.get<string>('SMTP_USER', '');
    const smtpUser = this.config.get<string>('SMTP_USER', '');
    // Many SMTP relays (Zoho, etc.) reject sending from any address other
    // than the authenticated user. Fall back silently to SMTP_USER when the
    // configured From doesn't match.
    const safeFromEmail =
      smtpUser && fromEmail && fromEmail.toLowerCase() !== smtpUser.toLowerCase()
        ? smtpUser
        : fromEmail;

    let ok = false;
    let failureReason: string | null = null;
    try {
      const result = await this.emailService.send(
        ent.clientEmail,
        subject,
        `Payment Reminder — Invoice ${ent.invoiceNumber}`,
        html,
        { name: fromName, email: safeFromEmail },
        { cc: ent.ccEmail || undefined },
      );
      if ('ok' in result && result.ok) {
        ok = true;
      } else if ('error' in result) {
        failureReason = String(result.error);
      } else {
        failureReason = 'email skipped (mailer disabled)';
      }
    } catch (e) {
      failureReason = (e as Error).message;
    }

    ent.reminderCount = (ent.reminderCount || 0) + 1;
    ent.lastReminderSentAt = new Date();
    ent.lastReminderStatus = ok ? 'SENT' : 'FAILED';
    ent.lastFailureReason = ok ? null : failureReason;
    await this.repo.save(ent);

    // Mirror into invoice_email_logs so the Email Logs page surfaces it.
    try {
      await this.emailLogRepo.save(
        this.emailLogRepo.create({
          invoiceId: null,
          pendingPaymentId: ent.id,
          source: 'PENDING_PAYMENT',
          toEmail: ent.clientEmail,
          ccEmail: ent.ccEmail || null,
          subject,
          body: `Payment reminder for invoice ${ent.invoiceNumber} — ₹${amountFmt}`,
          sentStatus: ok ? MailStatus.SENT : MailStatus.FAILED,
          sentAt: ok ? ent.lastReminderSentAt : null,
          sentBy: null,
          failureReason: ok ? null : failureReason,
        }),
      );
    } catch (e) {
      this.log.warn(`Failed to record email log: ${(e as Error).message}`);
    }

    return ok;
  }

  // ── CSV template ────────────────────────────────────────────────────
  buildCsvTemplate(): string {
    const header = 'invoiceNumber,clientName,clientEmail,ccEmail,amount,invoiceDate,dueDate,notes';
    const sample = 'INV-2024-001,Acme Pvt Ltd,accounts@acme.example,cfo@acme.example,12500.00,2024-12-15,2025-01-14,"Reminder #1"';
    return `${header}\n${sample}\n`;
  }
}
