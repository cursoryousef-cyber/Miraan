import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateAcademicIntakeDto,
  UpdateAcademicIntakeDto,
  AssignTraineesToIntakeDto,
} from './dto/academic-intake.dto';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class AcademicIntakesService {
  constructor(private prisma: PrismaService) {}

  async findAll(orgId?: string, page = 1, limit = 50, academicYear?: string) {
    const skip = (page - 1) * limit;
    const where: any = {};

    if (orgId) {
      where.OR = [
        { organizationId: orgId },
        { universityOrgId: orgId },
        {
          sourceRequest: {
            OR: [{ sourceOrgId: orgId }, { targetOrgId: orgId }],
          },
        },
        {
          traineeProfiles: {
            some: {
              OR: [
                { organizationId: orgId },
                { rotations: { some: { organizationId: orgId } } },
              ],
            },
          },
        },
        {
          trainingRequests: {
            some: { OR: [{ sourceOrgId: orgId }, { targetOrgId: orgId }] },
          },
        },
      ];
    }

    if (academicYear) where.academicYear = academicYear;

    const [total, rawData] = await Promise.all([
      this.prisma.academicIntake.count({ where }),
      this.prisma.academicIntake.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: {
            select: { id: true, nameAr: true, nameEn: true, code: true },
          },
          program: true,
          coordinator: { include: { person: true } },
          trainingRequests: {
            include: {
              sourceOrg: { select: { id: true, nameAr: true, nameEn: true } },
              targetOrg: { select: { id: true, nameAr: true, nameEn: true } },
            },
          },
          _count: { select: { traineeProfiles: true } },
        },
      }),
    ]);

    const data = await Promise.all(
      rawData.map(async (intake) => {
        const totalTrainees =
          intake._count?.traineeProfiles || intake.capacity || 0;
        const allocatedCount = await this.prisma.traineeProfile.count({
          where: {
            academicIntakeId: intake.id,
            rotations: { some: { status: 'active' } },
          },
        });
        const remainingCount = Math.max(0, totalTrainees - allocatedCount);

        return {
          ...intake,
          requestedCount: totalTrainees,
          allocatedCount,
          remainingCount,
        };
      }),
    );

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const intake = await this.prisma.academicIntake.findUnique({
      where: { id },
      include: {
        program: true,
        coordinator: { include: { person: true } },
        traineeProfiles: {
          include: {
            person: true,
            rotations: { include: { department: true } },
          },
        },
      },
    });

    if (!intake) throw new NotFoundException('الدفعة الأكاديمية غير موجودة');
    return intake;
  }

  /**
   * @deprecated Batches are created from an approved training request only —
   * see AcademicBatchService.createFromApprovedRequest. Retained because the
   * seeds still build historical intakes, and callers are refused explicitly
   * rather than silently producing a batch with no provenance.
   */
  async create(dto: CreateAcademicIntakeDto, user: IAuthenticatedUser) {
    throw new ConflictException(
      'لا يمكن إنشاء دفعة أكاديمية مستقلة — الدفعة تُنشأ من طلب تدريب معتمد عبر ' +
        'POST /academic-intakes/from-request',
    );

    const existing = await this.prisma.academicIntake.findUnique({
      where: { code: dto.code.toUpperCase() },
    });

    if (existing)
      throw new ConflictException(
        `رمز الدفعة الأكاديمية (${dto.code}) مستخدم مسبقاً`,
      );

    return this.prisma.academicIntake.create({
      data: {
        ...dto,
        organizationId: user.organizationId,
        code: dto.code.toUpperCase(),
        startDate: new Date(dto.startDate),
        endDate: new Date(dto.endDate),
        createdById: user.accountId,
      },
      include: { program: true },
    });
  }

  async assignTrainees(id: string, dto: AssignTraineesToIntakeDto) {
    await this.findOne(id);

    await this.prisma.traineeProfile.updateMany({
      where: { id: { in: dto.traineeProfileIds } },
      data: { academicIntakeId: id },
    });

    return { success: true, count: dto.traineeProfileIds.length };
  }

  async update(
    id: string,
    dto: UpdateAcademicIntakeDto,
    user: IAuthenticatedUser,
  ) {
    await this.findOne(id);

    return this.prisma.academicIntake.update({
      where: { id },
      data: {
        ...dto,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        updatedById: user.accountId,
      },
    });
  }
}
