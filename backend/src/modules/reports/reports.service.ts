import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateReportDefinitionDto,
  GenerateReportDto,
  UpdateReportDefinitionDto,
} from './dto/report.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';
import { ScopeContextService } from '../../common/authz/scope-context.service';

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private scopeContext: ScopeContextService,
  ) {}

  /**
   * Definitions visible to the caller: the global ones plus any owned by an
   * organisation inside their scope. A cluster manager's own `organizationId` is
   * the cluster, while report definitions are owned by the hospitals beneath it,
   * so matching on that one id alone hid every definition from them.
   */
  async findAllDefinitions(user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    const visibleIds = scope.visibleOrgIds;

    return this.prisma.reportDefinition.findMany({
      where: visibleIds === null
        ? {}
        : { OR: [{ organizationId: null }, { organizationId: { in: visibleIds } }] },
      orderBy: { createdAt: 'desc' },
    });
  }

  async generateReport(dto: GenerateReportDto, user: IAuthenticatedUser) {
    const def = await this.prisma.reportDefinition.findUnique({
      where: { id: dto.reportDefinitionId },
    });

    if (!def || !def.isActive) {
      throw new NotFoundException('قالب التقرير غير موجود أو غير مفعّل');
    }

    const { columns, rows } = await this.buildDataset(def.reportType, user);
    const rowCount = rows.length;
    const generated = await this.prisma.generatedReport.create({
      data: {
        organizationId: user.organizationId,
        reportDefinitionId: def.id,
        generatedById: user.accountId,
        parameters: (dto.parameters || {}) as unknown as Prisma.InputJsonValue,
        format: dto.format || def.defaultFormat,
        status: 'completed',
        completedAt: new Date(),
        rowCount,
      },
    });

    return {
      reportId: generated.id,
      status: generated.status,
      nameAr: def.nameAr,
      reportType: def.reportType,
      format: generated.format,
      generatedAt: generated.createdAt,
      rowCount,
      columns,
      rows,
      message: 'تم توليد التقرير بنجاح',
    };
  }

  async findUserReports(user: IAuthenticatedUser) {
    return this.prisma.generatedReport.findMany({
      where: {
        organizationId: user.organizationId,
        generatedById: user.accountId,
      },
      orderBy: { createdAt: 'desc' },
      include: {
        reportDefinition: true,
      },
    });
  }

  /**
   * Creates a report definition owned by the caller's own organisation.
   *
   * A cluster manager's templates belong to their cluster and are therefore only
   * visible inside it (see findAllDefinitions); platform roles author the global
   * ones, which carry no organisation and are visible to everyone.
   */
  async createDefinition(dto: CreateReportDefinitionDto, user: IAuthenticatedUser) {
    this.assertKnownReportType(dto.reportType);
    const scope = await this.scopeContext.resolve(user);
    const code = dto.code.trim().toUpperCase();

    const clash = await this.prisma.reportDefinition.findUnique({ where: { code } });
    if (clash) throw new ConflictException('رمز القالب مستخدم بالفعل');

    return this.prisma.reportDefinition.create({
      data: {
        // Platform scope (visibleOrgIds === null) authors national templates.
        organizationId: scope.visibleOrgIds === null ? null : user.organizationId,
        code,
        nameAr: dto.nameAr.trim(),
        nameEn: dto.nameEn?.trim() || code,
        reportType: dto.reportType,
        defaultFormat: dto.defaultFormat ?? 'pdf',
        queryTemplate: {},
        isSystem: false,
        isActive: true,
      },
    });
  }

  /**
   * Updates a definition the caller owns. A cluster may not edit another
   * cluster's template, nor the national ones it can only read.
   */
  async updateDefinition(id: string, dto: UpdateReportDefinitionDto, user: IAuthenticatedUser) {
    const def = await this.prisma.reportDefinition.findUnique({ where: { id } });
    if (!def) throw new NotFoundException('قالب التقرير غير موجود');
    if (dto.reportType) this.assertKnownReportType(dto.reportType);

    const scope = await this.scopeContext.resolve(user);
    const isPlatform = scope.visibleOrgIds === null;
    if (!isPlatform && def.organizationId !== user.organizationId) {
      throw new ForbiddenException('هذا القالب خارج نطاق تجمعك');
    }

    return this.prisma.reportDefinition.update({
      where: { id },
      data: {
        ...(dto.nameAr ? { nameAr: dto.nameAr.trim() } : {}),
        ...(dto.nameEn !== undefined ? { nameEn: dto.nameEn } : {}),
        ...(dto.reportType ? { reportType: dto.reportType } : {}),
        ...(dto.defaultFormat ? { defaultFormat: dto.defaultFormat } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
    });
  }

  /** Re-reads the dataset behind an already generated report. */
  async getReportData(id: string, user: IAuthenticatedUser) {
    const report = await this.prisma.generatedReport.findUnique({
      where: { id },
      include: { reportDefinition: true },
    });
    if (!report) throw new NotFoundException('التقرير غير موجود');

    const scope = await this.scopeContext.resolve(user);
    if (scope.visibleOrgIds !== null && !scope.visibleOrgIds.includes(report.organizationId)) {
      throw new ForbiddenException('هذا التقرير خارج نطاق صلاحياتك');
    }

    const { columns, rows } = await this.buildDataset(report.reportDefinition.reportType, user);
    return {
      reportId: report.id,
      nameAr: report.reportDefinition.nameAr,
      reportType: report.reportDefinition.reportType,
      status: report.status,
      generatedAt: report.createdAt,
      rowCount: rows.length,
      columns,
      rows,
    };
  }

  /** The report types the dataset builder knows how to answer. */
  private static readonly REPORT_TYPES = [
    'incidents', 'training_requests', 'trainees', 'trainers', 'rotations', 'schedules',
  ];

  private assertKnownReportType(reportType: string) {
    if (!ReportsService.REPORT_TYPES.includes(this.normalizeType(reportType))) {
      throw new ConflictException(
        `نوع تقرير غير مدعوم: ${reportType}. الأنواع المدعومة: ${ReportsService.REPORT_TYPES.join(', ')}`,
      );
    }
  }

  /** Singular and plural spellings both exist in seeded rows. */
  private normalizeType(reportType: string): string {
    const t = reportType.trim().toLowerCase();
    const alias: Record<string, string> = {
      incident: 'incidents', training_request: 'training_requests',
      trainee: 'trainees', trainer: 'trainers',
      rotation: 'rotations', schedule: 'schedules',
    };
    return alias[t] ?? t;
  }

  /**
   * The actual rows behind a report, restricted to the organisations the caller
   * can see. Every branch reads real records — there is no synthetic data path.
   *
   * Scope comes from ScopeContextService, never from `user.organizationId`
   * directly: a cluster manager sits on the cluster while the records belong to
   * the hospitals beneath it.
   */
  private async buildDataset(
    reportType: string,
    user: IAuthenticatedUser,
  ): Promise<{ columns: Array<{ key: string; label: string }>; rows: Record<string, unknown>[] }> {
    const scope = await this.scopeContext.resolve(user);
    const orgIds = scope.visibleOrgIds;
    const orgWhere = orgIds === null ? {} : { organizationId: { in: orgIds } };
    const take = 500;

    switch (this.normalizeType(reportType)) {
      case 'incidents': {
        const rows = await this.prisma.incident.findMany({
          where: orgWhere, orderBy: { createdAt: 'desc' }, take,
          include: { organization: { select: { nameAr: true } } },
        });
        return {
          columns: [
            { key: 'referenceNumber', label: 'رقم البلاغ' },
            { key: 'titleAr', label: 'العنوان' },
            { key: 'severity', label: 'الخطورة' },
            { key: 'status', label: 'الحالة' },
            { key: 'organization', label: 'الجهة' },
            { key: 'createdAt', label: 'تاريخ البلاغ' },
          ],
          rows: rows.map((r) => ({
            referenceNumber: (r as Record<string, unknown>).referenceNumber ?? r.id.slice(0, 8),
            titleAr: (r as Record<string, unknown>).titleAr ?? '—',
            severity: (r as Record<string, unknown>).severity ?? '—',
            status: r.status,
            organization: r.organization?.nameAr ?? '—',
            createdAt: r.createdAt,
          })),
        };
      }

      case 'training_requests': {
        const rows = await this.prisma.trainingRequest.findMany({
          where: orgIds === null ? {} : { targetOrgId: { in: orgIds } },
          orderBy: { createdAt: 'desc' }, take,
          include: {
            sourceOrg: { select: { nameAr: true } },
            targetOrg: { select: { nameAr: true } },
          },
        });
        return {
          columns: [
            { key: 'requestNumber', label: 'رقم الطلب' },
            { key: 'sourceOrg', label: 'الجهة الموفدة' },
            { key: 'targetOrg', label: 'الجهة المستقبلة' },
            { key: 'studentCount', label: 'عدد المتدربين' },
            { key: 'status', label: 'الحالة' },
            { key: 'createdAt', label: 'تاريخ التقديم' },
          ],
          rows: rows.map((r) => ({
            requestNumber: r.requestNumber,
            sourceOrg: r.sourceOrg?.nameAr ?? '—',
            targetOrg: r.targetOrg?.nameAr ?? '—',
            studentCount: r.studentCount,
            status: r.status,
            createdAt: r.createdAt,
          })),
        };
      }

      case 'trainees': {
        const rows = await this.prisma.traineeProfile.findMany({
          where: orgWhere, orderBy: { createdAt: 'desc' }, take,
          include: {
            person: { select: { nameAr: true, nationalId: true } },
            organization: { select: { nameAr: true } },
          },
        });
        return {
          columns: [
            { key: 'nameAr', label: 'اسم المتدرب' },
            { key: 'nationalId', label: 'رقم الهوية' },
            { key: 'traineeNumber', label: 'الرقم التدريبي' },
            { key: 'specialty', label: 'التخصص' },
            { key: 'status', label: 'الحالة' },
            { key: 'organization', label: 'الجهة' },
          ],
          rows: rows.map((r) => ({
            nameAr: r.person?.nameAr ?? '—',
            nationalId: r.person?.nationalId ?? '—',
            traineeNumber: r.traineeNumber,
            specialty: r.specialtyAr ?? '—',
            status: r.applicationStatus,
            organization: r.organization?.nameAr ?? '—',
          })),
        };
      }

      case 'trainers': {
        const rows = await this.prisma.trainerProfile.findMany({
          where: orgWhere, orderBy: { createdAt: 'desc' }, take,
          include: {
            person: { select: { nameAr: true } },
            organization: { select: { nameAr: true } },
          },
        });
        return {
          columns: [
            { key: 'nameAr', label: 'اسم المدرب' },
            { key: 'specialty', label: 'التخصص' },
            { key: 'status', label: 'الحالة' },
            { key: 'organization', label: 'الجهة' },
          ],
          rows: rows.map((r) => ({
            nameAr: r.person?.nameAr ?? '—',
            specialty: (r as Record<string, unknown>).specialty ?? '—',
            status: (r as Record<string, unknown>).status ?? '—',
            organization: r.organization?.nameAr ?? '—',
          })),
        };
      }

      case 'rotations': {
        const rows = await this.prisma.rotation.findMany({
          where: orgWhere, orderBy: { startDate: 'desc' }, take,
          include: { organization: { select: { nameAr: true } } },
        });
        return {
          columns: [
            { key: 'nameAr', label: 'الروتيشن' },
            { key: 'startDate', label: 'البداية' },
            { key: 'endDate', label: 'النهاية' },
            { key: 'status', label: 'الحالة' },
            { key: 'organization', label: 'الجهة' },
          ],
          rows: rows.map((r) => ({
            nameAr: (r as Record<string, unknown>).nameAr ?? '—',
            startDate: (r as Record<string, unknown>).startDate ?? null,
            endDate: (r as Record<string, unknown>).endDate ?? null,
            status: (r as Record<string, unknown>).status ?? '—',
            organization: r.organization?.nameAr ?? '—',
          })),
        };
      }

      case 'schedules': {
        const rows = await this.prisma.trainingSchedule.findMany({
          where: orgWhere, orderBy: { createdAt: 'desc' }, take,
          include: { organization: { select: { nameAr: true } } },
        });
        return {
          columns: [
            { key: 'titleAr', label: 'الجدول' },
            { key: 'status', label: 'الحالة' },
            { key: 'organization', label: 'الجهة' },
            { key: 'createdAt', label: 'تاريخ الإنشاء' },
          ],
          rows: rows.map((r) => ({
            titleAr: r.titleAr,
            status: r.status,
            organization: r.organization?.nameAr ?? '—',
            createdAt: r.createdAt,
          })),
        };
      }

      default:
        return { columns: [], rows: [] };
    }
  }
}
