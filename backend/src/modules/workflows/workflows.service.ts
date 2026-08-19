import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateWorkflowDefDto, StartWorkflowDto, ExecuteWorkflowActionDto } from './dto/workflow.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { Prisma } from '@prisma/client';

@Injectable()
export class WorkflowsService {
  constructor(private prisma: PrismaService) {}

  // Definitions
  async findAllDefinitions(orgId?: string) {
    return this.prisma.workflowDefinition.findMany({
      where: orgId ? { OR: [{ organizationId: null }, { organizationId: orgId }] } : {},
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDefinition(dto: CreateWorkflowDefDto, user?: IAuthenticatedUser) {
    return this.prisma.workflowDefinition.create({
      data: {
        code: dto.code,
        nameAr: dto.nameAr,
        nameEn: dto.nameEn,
        entityType: dto.entityType,
        steps: dto.steps as unknown as Prisma.InputJsonValue,
        transitions: dto.transitions as unknown as Prisma.InputJsonValue,
        organizationId: user?.organizationId || null,
        createdById: user?.accountId,
      },
    });
  }

  // Instances
  async startWorkflow(dto: StartWorkflowDto, user: IAuthenticatedUser) {
    const def = await this.prisma.workflowDefinition.findUnique({
      where: { id: dto.workflowDefinitionId },
    });

    if (!def || !def.isActive) {
      throw new NotFoundException('تعريف سير العمل غير موجود أو معطل');
    }

    const steps = (def.steps as unknown as Array<{ code: string; order: number }>) || [];
    const firstStep = steps.sort((a, b) => a.order - b.order)[0]?.code || 'start';

    return this.prisma.workflowInstance.create({
      data: {
        organizationId: user.organizationId,
        workflowDefinitionId: def.id,
        entityType: dto.entityType,
        entityId: dto.entityId,
        currentStep: firstStep,
        status: 'in_progress',
        metadata: (dto.metadata || {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async executeAction(instanceId: string, dto: ExecuteWorkflowActionDto, user: IAuthenticatedUser) {
    const instance = await this.prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: { workflowDefinition: true },
    });

    if (!instance || instance.status !== 'in_progress') {
      throw new BadRequestException('سير العمل غير موجود أو منتهي');
    }

    const transitions = (instance.workflowDefinition.transitions as unknown as Array<{
      from: string;
      to: string;
      action: string;
    }>) || [];

    const transition = transitions.find(
      (t) => t.from === instance.currentStep && t.action === dto.action,
    );

    if (!transition) {
      throw new BadRequestException(
        `الإجراء (${dto.action}) غير متاح في الخطوة الحالية (${instance.currentStep})`,
      );
    }

    const nextStep = transition.to;
    const isCompleted = nextStep === 'approved' || nextStep === 'completed' || nextStep === 'card_issued';
    const isRejected = nextStep === 'rejected' || nextStep === 'cancelled';

    let newStatus = 'in_progress';
    if (isCompleted) newStatus = 'completed';
    if (isRejected) newStatus = 'rejected';

    return this.prisma.$transaction(async (tx) => {
      // 1. Record Action
      await tx.workflowAction.create({
        data: {
          workflowInstanceId: instance.id,
          fromStep: instance.currentStep,
          toStep: nextStep,
          action: dto.action,
          performedById: user.accountId,
          comment: dto.comment,
          metadata: (dto.metadata || {}) as unknown as Prisma.InputJsonValue,
        },
      });

      // 2. Update Instance state
      const updated = await tx.workflowInstance.update({
        where: { id: instance.id },
        data: {
          currentStep: nextStep,
          status: newStatus,
          completedAt: newStatus !== 'in_progress' ? new Date() : null,
        },
      });

      return updated;
    });
  }

  async getInstanceHistory(instanceId: string) {
    return this.prisma.workflowInstance.findUnique({
      where: { id: instanceId },
      include: {
        workflowDefinition: true,
        actions: {
          orderBy: { performedAt: 'asc' },
          include: {
            performedBy: {
              include: { person: true },
            },
          },
        },
      },
    });
  }
}
