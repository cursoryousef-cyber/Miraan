import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notifications/notification.service';
import { ScopeContextService } from '../../common/authz/scope-context.service';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
} from '../../common/authz';

const VALID_STATUSES = ['open', 'under_review', 'resolved', 'closed'];

@ApiTags('Incidents (البلاغات والحوادث)')
@ApiBearerAuth('JWT-auth')
@Controller('incidents')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
export class IncidentsController {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private scopeContextService: ScopeContextService,
  ) {}

  @Get('target-organizations')
  @ApiOperation({ summary: 'استرجاع الجهات المستهدفة المتاحة للبلاغ حسب النطاق' })
  async getTargetOrganizations(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];
    const orgs = await this.prisma.organization.findMany({
      where: {
        id: { in: visibleIds },
        status: 'active',
      },
      select: {
        id: true,
        nameAr: true,
        nameEn: true,
        organizationType: { select: { code: true, nameAr: true } },
      },
    });
    return { data: orgs };
  }

  @Get()
  @RequireCapability(CAPABILITIES.INCIDENT_VIEW)
  @ApiOperation({ summary: 'قائمة البلاغات للمنظمة أو الجهة المستهدفة' })
  async findAll(
    @CurrentUser() user: IAuthenticatedUser,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];
    const where: any = {
      OR: [
        { organizationId: { in: visibleIds } },
        { targetOrganizationId: { in: visibleIds } },
      ],
    };
    if (status) where.status = status;
    if (severity) where.severity = severity;
    const skip = (+page - 1) * +limit;
    const [total, data] = await Promise.all([
      this.prisma.incident.count({ where }),
      this.prisma.incident.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: {
          organization: { select: { id: true, nameAr: true } },
          targetOrganization: { select: { id: true, nameAr: true } },
          reportedBy: { include: { person: true } },
          assignedTo: { include: { person: true } },
          resolvedBy: { include: { person: true } },
          comments: {
            orderBy: { createdAt: 'asc' },
            include: { author: { include: { person: true } } },
          },
        },
      }),
    ]);
    return { data, meta: { total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) } };
  }

  @Get(':id')
  @RequireCapability(CAPABILITIES.INCIDENT_VIEW)
  @ApiOperation({ summary: 'تفاصيل البلاغ' })
  async findOne(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];
    const data = await this.prisma.incident.findFirst({
      where: {
        id,
        OR: [
          { organizationId: { in: visibleIds } },
          { targetOrganizationId: { in: visibleIds } },
        ],
      },
      include: {
        organization: { select: { id: true, nameAr: true } },
        targetOrganization: { select: { id: true, nameAr: true } },
        reportedBy: { include: { person: true } },
        assignedTo: { include: { person: true } },
        resolvedBy: { include: { person: true } },
        comments: {
          orderBy: { createdAt: 'asc' },
          include: { author: { include: { person: true } } },
        },
      },
    });
    if (!data) throw new NotFoundException('البلاغ غير موجود ضمن نطاق الصلاحيات');
    return { data };
  }

  @Post()
  @RequireRoles('trainee', 'trainer', 'hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager')
  @ApiOperation({ summary: 'تقديم بلاغ جديد' })
  async create(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { incidentType: string; description: string; severity?: string; targetOrganizationId?: string; category?: string; evidenceUrls?: string[] },
  ) {
    let targetOrgId = dto.targetOrganizationId || user.organizationId;
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];

    if (dto.targetOrganizationId && !visibleIds.includes(dto.targetOrganizationId)) {
      throw new ForbiddenException('الجهة المستهدفة المختارة خارج نطاق الصلاحيات المتاحة لك');
    }

    const data = await this.prisma.incident.create({
      data: {
        organizationId: user.organizationId,
        targetOrganizationId: targetOrgId,
        reportedById: user.accountId,
        incidentType: dto.incidentType,
        category: dto.category,
        description: dto.description,
        severity: dto.severity ?? 'low',
        status: 'open',
        evidenceUrls: dto.evidenceUrls || [],
      },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'incident.created',
        entityType: 'Incident',
        entityId: data.id,
        newValues: { status: data.status, severity: data.severity, incidentType: data.incidentType, targetOrgId },
      },
    });

    try {
      await this.notificationService.notifyOrgUsers(targetOrgId, 'hospital_training_admin', {
        titleAr: 'بلاغ تشغيلي جديد موجه لجهتكم',
        bodyAr: `${data.incidentType}: ${data.description.slice(0, 100)}`,
        type: 'incident_reported',
        referenceType: 'Incident',
        referenceId: data.id,
        channels: ['in_app', 'email'],
      });
    } catch (error) {
      console.warn('Incident notification error:', error);
    }
    return { success: true, data };
  }

  @Post(':id/comments')
  @RequireRoles('trainee', 'trainer', 'hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'platform_owner')
  @ApiOperation({ summary: 'إضافة تعليق / رد على البلاغ' })
  async addComment(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { comment: string },
  ) {
    if (!dto.comment?.trim()) throw new BadRequestException('نص التعليق مطلوب');
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];
    const incident = await this.prisma.incident.findFirst({
      where: {
        id,
        OR: [
          { organizationId: { in: visibleIds } },
          { targetOrganizationId: { in: visibleIds } },
        ],
      },
    });
    if (!incident) throw new NotFoundException('البلاغ غير موجود أو خارج نطاق الصلاحيات');

    const commentRecord = await this.prisma.incidentComment.create({
      data: {
        incidentId: id,
        authorId: user.accountId,
        comment: dto.comment,
      },
      include: { author: { include: { person: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'incident.commented',
        entityType: 'Incident',
        entityId: id,
        newValues: { comment: dto.comment },
      },
    });

    return { success: true, data: commentRecord };
  }

  @Post(':id/assign')
  @RequireRoles('hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'platform_owner')
  @ApiOperation({ summary: 'تعيين مسؤول لمتابعة البلاغ' })
  async assign(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { assignedToId: string },
  ) {
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];
    const incident = await this.prisma.incident.findFirst({
      where: {
        id,
        OR: [
          { organizationId: { in: visibleIds } },
          { targetOrganizationId: { in: visibleIds } },
        ],
      },
    });
    if (!incident) throw new NotFoundException('البلاغ غير موجود');

    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        assignedToId: dto.assignedToId,
        status: incident.status === 'open' ? 'under_review' : incident.status,
      },
      include: { assignedTo: { include: { person: true } } },
    });

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'incident.assigned',
        entityType: 'Incident',
        entityId: id,
        newValues: { assignedToId: dto.assignedToId },
      },
    });

    return { success: true, data: updated };
  }

  @Post(':id/escalate')
  @RequireRoles('hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'platform_owner')
  @ApiOperation({ summary: 'تصعيد البلاغ للجهة الأعلى (التجمع أو الهيئة الأكاديمية)' })
  async escalate(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { targetOrganizationId: string; reason?: string },
  ) {
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];
    if (!visibleIds.includes(dto.targetOrganizationId)) {
      throw new ForbiddenException('الجهة الصاعد إليها خارج نطاق الصلاحيات');
    }

    const incident = await this.prisma.incident.findFirst({
      where: {
        id,
        OR: [
          { organizationId: { in: visibleIds } },
          { targetOrganizationId: { in: visibleIds } },
        ],
      },
    });
    if (!incident) throw new NotFoundException('البلاغ غير موجود');

    const updated = await this.prisma.incident.update({
      where: { id },
      data: {
        targetOrganizationId: dto.targetOrganizationId,
        escalationLevel: incident.escalationLevel + 1,
        status: 'under_review',
      },
    });

    if (dto.reason) {
      await this.prisma.incidentComment.create({
        data: {
          incidentId: id,
          authorId: user.accountId,
          comment: `[تصعيد البلاغ - المستوى ${updated.escalationLevel}]: ${dto.reason}`,
        },
      });
    }

    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'incident.escalated',
        entityType: 'Incident',
        entityId: id,
        newValues: { escalationLevel: updated.escalationLevel, targetOrganizationId: dto.targetOrganizationId },
      },
    });

    try {
      await this.notificationService.notifyOrgUsers(dto.targetOrganizationId, 'cluster_administrator', {
        titleAr: 'تم تصعيد بلاغ موجه للتجمع / الجهة الأعلى',
        bodyAr: `تم تصعيد البلاغ إلى المستوى ${updated.escalationLevel}`,
        type: 'incident_escalated',
        referenceType: 'Incident',
        referenceId: updated.id,
        channels: ['in_app', 'email'],
      });
    } catch (err) {
      console.warn('Escalation notification failed:', err);
    }

    return { success: true, data: updated };
  }

  @Patch(':id/status')
  @RequireRoles('hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'cluster_manager', 'platform_owner')
  @ApiOperation({ summary: 'تحديث حالة البلاغ' })
  async updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { status: string; resolution?: string },
  ) {
    if (!VALID_STATUSES.includes(dto.status)) {
      throw new BadRequestException(`الحالة غير صحيحة. المتاح: ${VALID_STATUSES.join('، ')}`);
    }
    const scope = await this.scopeContextService.resolve(user);
    const visibleIds = scope.visibleOrgIds || [user.organizationId];
    const existing = await this.prisma.incident.findFirst({
      where: {
        id,
        OR: [
          { organizationId: { in: visibleIds } },
          { targetOrganizationId: { in: visibleIds } },
        ],
      },
    });
    if (!existing) throw new NotFoundException('البلاغ غير موجود ضمن نطاق المنظمة الحالية');

    const isResolved = dto.status === 'resolved' || dto.status === 'closed';
    const data = await this.prisma.incident.update({
      where: { id },
      data: {
        status: dto.status,
        resolution: dto.resolution,
        resolvedById: isResolved ? user.accountId : undefined,
        resolvedAt: isResolved ? new Date() : undefined,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: user.organizationId,
        actorId: user.accountId,
        action: 'incident.status_updated',
        entityType: 'Incident',
        entityId: data.id,
        oldValues: { status: existing.status },
        newValues: { status: data.status, resolution: data.resolution },
      },
    });
    return { success: true, data };
  }

  @Post(':id/resolve')
  @RequireRoles('hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'platform_owner')
  @ApiOperation({ summary: 'حل البلاغ' })
  async resolve(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { resolution: string },
  ) {
    if (!dto.resolution?.trim()) throw new BadRequestException('وصف الحل إلزامي');
    return this.updateStatus(id, user, { status: 'resolved', resolution: dto.resolution });
  }

  @Post(':id/close')
  @RequireRoles('hospital_administrator', 'hospital_training_admin', 'cluster_administrator', 'platform_owner')
  @ApiOperation({ summary: 'إغلاق البلاغ' })
  async close(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: { resolution?: string },
  ) {
    return this.updateStatus(id, user, { status: 'closed', resolution: dto.resolution });
  }
}
