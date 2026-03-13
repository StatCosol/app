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
    const emp = await this.empRepo.findOne({
      where: { id: employeeId, clientId: user.clientId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    // If user has a branchId (branch-level user), restrict to their branch only
    if (user.branchId && emp.branchId !== user.branchId) {
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

    // Validate total share percent <= 100
    const sum = dto.nominees.reduce((t, n) => t + Number(n.sharePct ?? 0), 0);
    if (sum > 100.01) {
      throw new BadRequestException('Total share percent cannot exceed 100');
    }

    // Upsert: find existing nomination for this employee + type
    let nom = await this.nomRepo.findOne({
      where: { employeeId: emp.id, nominationType: dto.nominationType },
    });

    if (!nom) {
      nom = this.nomRepo.create({
        employeeId: emp.id,
        nominationType: dto.nominationType,
        declarationDate: dto.declarationDate || null,
        witnessName: dto.witnessName || null,
        witnessAddress: dto.witnessAddress || null,
      });
      nom = await this.nomRepo.save(nom);
    } else {
      nom.declarationDate = dto.declarationDate || nom.declarationDate;
      nom.witnessName = dto.witnessName || nom.witnessName;
      nom.witnessAddress = dto.witnessAddress || nom.witnessAddress;
      await this.nomRepo.save(nom);
      // Clear old nominees so we can replace with new set
      await this.memRepo.delete({ nominationId: nom.id });
    }

    // Insert new nominees
    const members = dto.nominees.map((n) =>
      this.memRepo.create({
        nominationId: nom.id,
        memberName: n.memberName,
        relationship: n.relationship || null,
        dateOfBirth: n.dateOfBirth || null,
        sharePct: String(n.sharePct ?? '0'),
        address: n.address || null,
        guardianName: n.guardianName || null,
        isMinor: n.isMinor ?? false,
      }),
    );
    await this.memRepo.save(members);

    return { ok: true, nominationId: nom.id };
  }

  // ── Get Nomination ─────────────────────────────────────────
  async getNomination(
    user: UserCtx,
    employeeId: string,
    nominationType: string,
  ) {
    const emp = await this.ensureEmployeeScope(user, employeeId);

    const nom = await this.nomRepo.findOne({
      where: { employeeId: emp.id, nominationType: nominationType as any },
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

    const result: any[] = [];
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
        nominationType: dto.formType as any,
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
      doc.text(
        `Employee Name: ${emp.firstName ?? ''}${emp.lastName ? ' ' + emp.lastName : ''}`.trim(),
      );
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
