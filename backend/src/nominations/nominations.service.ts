import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as path from 'path';
import * as fs from 'fs';
import PDFDocument from 'pdfkit';

import { EmployeeEntity } from '../employees/entities/employee.entity';
import { EmployeeNominationEntity } from '../employees/entities/employee-nomination.entity';
import { EmployeeNominationMemberEntity } from '../employees/entities/employee-nomination-member.entity';
import { EmployeeGeneratedFormEntity } from '../employees/entities/employee-generated-form.entity';

type UserCtx = {
  userId: string;
  clientId: string;
  roleCode: string;
  branchId?: string | null;
  branchIds?: string[];
  branchScoped?: boolean;
};

@Injectable()
export class NominationsService {
  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly empRepo: Repository<EmployeeEntity>,
    @InjectRepository(EmployeeNominationEntity)
    private readonly nomRepo: Repository<EmployeeNominationEntity>,
    @InjectRepository(EmployeeNominationMemberEntity)
    private readonly memRepo: Repository<EmployeeNominationMemberEntity>,
    @InjectRepository(EmployeeGeneratedFormEntity)
    private readonly formRepo: Repository<EmployeeGeneratedFormEntity>,
  ) {}

  // ── Scope enforcement ──────────────────────────────────────
  private async ensureEmployeeScope(
    user: UserCtx,
    employeeId: string,
  ): Promise<EmployeeEntity> {
    if (!user.clientId)
      throw new ForbiddenException('Client scope is required');
    const branchIds = user.branchIds ?? (user.branchId ? [user.branchId] : []);
    const branchScoped =
      user.branchScoped || !!user.branchId || branchIds.length > 0;
    if (branchScoped && !branchIds.length)
      throw new ForbiddenException('Branch scope is required');
    const emp = await this.empRepo.findOne({
      where: { id: employeeId, clientId: user.clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // Preserve every assigned branch; an empty branch-user scope is denied above.
    if (branchScoped && (!emp.branchId || !branchIds.includes(emp.branchId))) {
      throw new ForbiddenException('Employee does not belong to your branch');
    }
    return emp;
  }

  // ── Save Nomination (upsert) ───────────────────────────────
  async saveNomination(
    user: UserCtx,
    dto: {
      employeeId: string;
      nominationType: 'PF' | 'ESI' | 'GRATUITY' | 'INSURANCE' | 'SALARY';
      declarationDate?: string;
      witnessName?: string;
      witnessAddress?: string;
      nominees: {
        memberName: string;
        relationship?: string;
        dateOfBirth?: string;
        sharePct?: string;
        address?: string;
        guardianName?: string;
        isMinor?: boolean;
      }[];
    },
  ) {
    const emp = await this.ensureEmployeeScope(user, dto.employeeId);

    if (!dto.nominees?.length) {
      throw new BadRequestException('At least one nominee is required');
    }

    // Validate before opening a transaction or replacing any stored nominees.
    let totalHundredths = 0;
    for (const nominee of dto.nominees) {
      const share = String(nominee.sharePct ?? '0').trim();
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(share) ||
        !Number.isFinite(Number(share)) ||
        Number(share) > 100
      ) {
        throw new BadRequestException(
          'Each nominee share must be between 0 and 100 with at most two decimals',
        );
      }
      if (!nominee.memberName?.trim())
        throw new BadRequestException('Nominee name is required');
      totalHundredths += Math.round(Number(share) * 100);
    }
    if (totalHundredths > 10000)
      throw new BadRequestException('Total share percent cannot exceed 100');

    return this.nomRepo.manager.transaction(async (manager) => {
      // Serialize even the first save, when there is no nomination row to lock yet.
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`nomination:${emp.id}:${dto.nominationType}`],
      );
      const nomRepo = manager.getRepository(EmployeeNominationEntity);
      const memRepo = manager.getRepository(EmployeeNominationMemberEntity);
      let nom = await nomRepo.findOne({
        where: { employeeId: emp.id, nominationType: dto.nominationType },
      });
      if (nom && ['SUBMITTED', 'APPROVED'].includes(nom.status)) {
        throw new BadRequestException(
          'Submitted or approved nominations cannot be edited',
        );
      }
      if (!nom)
        nom = nomRepo.create({
          employeeId: emp.id,
          nominationType: dto.nominationType,
        });
      Object.assign(nom, {
        clientId: emp.clientId,
        branchId: emp.branchId,
        status: 'DRAFT',
        submittedAt: null,
        approvedAt: null,
        approvedByUserId: null,
        rejectionReason: null,
        declarationDate: dto.declarationDate || nom.declarationDate || null,
        witnessName: dto.witnessName || nom.witnessName || null,
        witnessAddress: dto.witnessAddress || nom.witnessAddress || null,
      });
      nom = await nomRepo.save(nom);
      await memRepo.delete({ nominationId: nom.id });
      await memRepo.save(
        dto.nominees.map((n) =>
          memRepo.create({
            nominationId: nom.id,
            memberName: n.memberName.trim(),
            relationship: n.relationship || null,
            dateOfBirth: n.dateOfBirth || null,
            sharePct: String(n.sharePct ?? '0').trim(),
            address: n.address || null,
            guardianName: n.guardianName || null,
            isMinor: n.isMinor ?? false,
          }),
        ),
      );
      return { ok: true, nominationId: nom.id };
    });
  }

  // ── Get Nomination ─────────────────────────────────────────
  async getNomination(
    user: UserCtx,
    employeeId: string,
    nominationType: string,
  ) {
    const emp = await this.ensureEmployeeScope(user, employeeId);

    const nom = await this.nomRepo.findOne({
      where: {
        employeeId: emp.id,
        nominationType:
          nominationType as EmployeeNominationEntity['nominationType'],
      },
    });
    if (!nom) return { employeeId, nominationType, nominees: [] };

    const members = await this.memRepo.find({
      where: { nominationId: nom.id },
      order: { createdAt: 'ASC' },
    });
    return { ...nom, nominees: members };
  }

  // ── List All Nominations for Employee ──────────────────────
  async listNominations(user: UserCtx, employeeId: string) {
    const emp = await this.ensureEmployeeScope(user, employeeId);

    const nominations = await this.nomRepo.find({
      where: { employeeId: emp.id },
      order: { createdAt: 'DESC' },
    });

    const result: Array<Record<string, unknown>> = [];
    for (const nom of nominations) {
      const members = await this.memRepo.find({
        where: { nominationId: nom.id },
        order: { createdAt: 'ASC' },
      });
      result.push({ ...nom, nominees: members });
    }
    return result;
  }

  // ── List Generated Forms ───────────────────────────────────
  async listForms(user: UserCtx, employeeId: string) {
    const emp = await this.ensureEmployeeScope(user, employeeId);
    return this.formRepo.find({
      where: { employeeId: emp.id, clientId: user.clientId },
      order: { createdAt: 'DESC' },
    });
  }

  // ── Generate PDF Form ──────────────────────────────────────
  async generateForm(
    user: UserCtx,
    dto: { employeeId: string; formType: string },
  ) {
    const emp = await this.ensureEmployeeScope(user, dto.employeeId);

    const nom = await this.nomRepo.findOne({
      where: {
        employeeId: emp.id,
        nominationType:
          dto.formType as EmployeeNominationEntity['nominationType'],
      },
    });
    if (!nom) {
      throw new BadRequestException(
        'Nomination data not found. Save nomination first.',
      );
    }

    const nominees = await this.memRepo.find({
      where: { nominationId: nom.id },
      order: { createdAt: 'ASC' },
    });

    // Versioning: increment from last generated form of same type
    const last = await this.formRepo.findOne({
      where: {
        employeeId: emp.id,
        formType: dto.formType,
        clientId: user.clientId,
      },
      order: { version: 'DESC' },
    });
    const nextVersion = (last?.version ?? 0) + 1;

    // Prepare output directory
    const outDir = path.join(
      process.cwd(),
      'uploads',
      'employees',
      'nominations',
      user.clientId,
    );
    fs.mkdirSync(outDir, { recursive: true });

    const fileName = `${dto.formType}_${emp.employeeCode}_v${nextVersion}.pdf`;
    const filePath = path.join(outDir, fileName);

    // Generate PDF
    await this.createPdf({ filePath, emp, type: dto.formType, nominees, nom });

    const stats = fs.statSync(filePath);

    // Save record
    const rec = this.formRepo.create({
      clientId: user.clientId,
      employeeId: emp.id,
      branchId: emp.branchId,
      formType: dto.formType,
      version: nextVersion,
      fileName,
      filePath,
      fileSize: String(stats.size),
      status: 'DRAFT',
      generatedBy: user.userId,
    });
    const saved = await this.formRepo.save(rec);

    return {
      ok: true,
      formId: saved.id,
      fileName: saved.fileName,
      version: nextVersion,
    };
  }

  // ── PDF Generation ─────────────────────────────────────────
  private createPdf(params: {
    filePath: string;
    emp: EmployeeEntity;
    type: string;
    nominees: EmployeeNominationMemberEntity[];
    nom: EmployeeNominationEntity;
  }): Promise<void> {
    const { filePath, emp, type, nominees, nom } = params;

    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 40 });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      // Title
      doc.fontSize(16).text(`${type} NOMINATION FORM`, { align: 'center' });
      doc.moveDown();

      // Employee details
      doc.fontSize(11).text(`Employee Code: ${emp.employeeCode}`);
      doc.text(`Employee Name: ${emp.name ?? ''}`);
      doc.text(`Designation: ${emp.designation ?? ''}`);
      doc.text(`State: ${emp.stateCode ?? ''}`);
      doc.text(`Date of Joining: ${emp.dateOfJoining ?? ''}`);
      doc.text(`UAN: ${emp.uan ?? ''}`);
      doc.text(`ESIC: ${emp.esic ?? ''}`);
      doc.moveDown();

      if (nom.declarationDate) {
        doc.text(`Declaration Date: ${nom.declarationDate}`);
      }
      doc.moveDown();

      // Nominees
      doc.fontSize(12).text('Nominees:', { underline: true });
      doc.moveDown(0.5);

      nominees.forEach((n, idx) => {
        doc
          .fontSize(11)
          .text(
            `${idx + 1}. ${n.memberName} | Relation: ${n.relationship ?? ''} | DOB: ${n.dateOfBirth ?? ''} | Share: ${n.sharePct}%`,
          );
        if (n.address) doc.text(`   Address: ${n.address}`);
        if (n.isMinor && n.guardianName) {
          doc.text(`   Guardian (minor): ${n.guardianName}`);
        }
        doc.moveDown(0.25);
      });

      doc.moveDown();

      // Witness
      if (nom.witnessName) {
        doc.text(`Witness: ${nom.witnessName}`);
        if (nom.witnessAddress)
          doc.text(`Witness Address: ${nom.witnessAddress}`);
        doc.moveDown();
      }

      // Declaration
      doc.text('Declaration:', { underline: true });
      doc
        .fontSize(10)
        .text(
          'I hereby nominate the above person(s) to receive the benefits as applicable.',
        );
      doc.moveDown(2);

      doc.text('Employee Signature: ______________________');
      doc.text('Date: ______________________');
      doc.moveDown();
      doc.text('Employer/Authorised Signatory: ______________________');

      doc.end();

      stream.on('finish', () => resolve());
      stream.on('error', (e) => reject(e));
    });
  }
}
