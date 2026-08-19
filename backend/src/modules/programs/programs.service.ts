import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../../common/interfaces';
import { CreateProgramDto, UpdateProgramDto } from './dto/program.dto';

/**
 * The national Training Program catalog.
 *
 * A catalog program has no owning organization (`organizationId IS NULL`) and is
 * managed centrally. Rows that still carry an organization are legacy org-scoped
 * programs kept for backward compatibility; they are readable but are not part of
 * the catalog.
 */
@Injectable()
export class ProgramsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Lists programs. Defaults to the national catalog; `includeLegacy` also returns
   * org-scoped rows so existing screens that referenced them keep working.
   */
  async findAll(opts: { includeLegacy?: boolean; activeOnly?: boolean } = {}) {
    const data = await this.prisma.program.findMany({
      where: {
        deletedAt: null,
        ...(opts.includeLegacy ? {} : { organizationId: null }),
        ...(opts.activeOnly === false ? {} : { isActive: true }),
      },
      orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    });
    return { data };
  }

  async findOne(id: string) {
    const program = await this.prisma.program.findFirst({
      where: { id, deletedAt: null },
    });
    if (!program) throw new NotFoundException('البرنامج التدريبي غير موجود');
    return program;
  }

  async create(dto: CreateProgramDto, user?: IAuthenticatedUser) {
    const code = dto.code.trim().toUpperCase();
    await this.assertUnique(code, dto.nameAr.trim());

    return this.prisma.program.create({
      data: {
        organizationId: null, // catalog entries are national
        code,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim(),
        programType: dto.programType ?? 'internship',
        durationMonths: dto.durationMonths,
        description: dto.description,
        sortOrder: dto.sortOrder ?? 0,
        createdById: user?.accountId,
      },
    });
  }

  async update(id: string, dto: UpdateProgramDto, user?: IAuthenticatedUser) {
    await this.findOne(id);
    const code = dto.code?.trim().toUpperCase();
    const nameAr = dto.nameAr?.trim();
    if (code || nameAr) await this.assertUnique(code, nameAr, id);

    return this.prisma.program.update({
      where: { id },
      data: {
        ...(code ? { code } : {}),
        ...(nameAr ? { nameAr } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.programType ? { programType: dto.programType } : {}),
        ...(dto.durationMonths !== undefined ? { durationMonths: dto.durationMonths } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedById: user?.accountId,
      },
    });
  }

  /**
   * Soft-deletes a program. Refused while trainees, requests, rotations or intakes
   * still reference it, so history can never be orphaned.
   */
  async remove(id: string, user?: IAuthenticatedUser) {
    await this.findOne(id);

    const [trainees, requests, rotations, intakes] = await Promise.all([
      this.prisma.traineeProfile.count({ where: { programId: id } }),
      this.prisma.trainingRequest.count({ where: { programId: id } }),
      this.prisma.rotation.count({ where: { programId: id } }),
      this.prisma.academicIntake.count({ where: { programId: id } }),
    ]);
    const inUse = trainees + requests + rotations + intakes;
    if (inUse > 0) {
      throw new ConflictException(
        `لا يمكن حذف البرنامج لارتباطه بسجلات قائمة (متدربون: ${trainees}، طلبات: ${requests}، تنقلات: ${rotations}، دفعات: ${intakes})`,
      );
    }

    // `code` is uniquely indexed at the database level, which does not know about
    // soft deletes. Archive the code on the way out so the same code can be used
    // again later; the original stays readable in the suffix.
    const program = await this.findOne(id);
    const archivedCode = `${program.code}__DELETED_${Date.now()}`.slice(0, 50);

    return this.prisma.program.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user?.accountId,
        isActive: false,
        code: archivedCode,
      },
    });
  }

  /** Programs are centrally managed: neither code nor Arabic name may repeat. */
  private async assertUnique(code?: string, nameAr?: string, exceptId?: string) {
    const clash = await this.prisma.program.findFirst({
      where: {
        deletedAt: null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
        OR: [...(code ? [{ code }] : []), ...(nameAr ? [{ nameAr }] : [])],
      },
      select: { code: true, nameAr: true },
    });
    if (clash) {
      throw new ConflictException(
        clash.code === code
          ? `رمز البرنامج (${code}) مستخدم مسبقاً`
          : `اسم البرنامج (${nameAr}) مستخدم مسبقاً`,
      );
    }
  }
}
