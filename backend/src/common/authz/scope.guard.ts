// ============================================================================
// ScopeGuard — resource-level authorisation.
//
// CapabilityGuard answers "may this session do this kind of thing". ScopeGuard
// answers "may it do it to *this record*". Without the second question a user
// with a legitimate capability can read or edit any row in the federation by
// guessing an id, which is exactly what GET /training-requests/:id allowed.
//
// The guard loads only the ownership columns it needs, so the cost is one narrow
// indexed lookup per request.
// ============================================================================

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ScopeContext, ScopeContextService } from './scope-context.service';
import { SCOPED_RESOURCE_KEY, ScopedResourceSpec } from './authz.decorators';

/** The shape ScopeGuard needs off the request — CapabilityGuard attaches `scope`. */
interface ScopedRequest {
  scope?: ScopeContext;
  params?: Record<string, string | undefined>;
  scopedResourceOrgIds?: string[];
}

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
    private scopeContext: ScopeContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const spec = this.reflector.getAllAndOverride<ScopedResourceSpec>(
      SCOPED_RESOURCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!spec) return true;

    const request = context.switchToHttp().getRequest<ScopedRequest>();
    const ctx = request.scope;
    // Platform sessions carry a null visibility list, meaning unrestricted.
    if (!ctx || ctx.visibleOrgIds === null) return true;

    const id = request.params?.[spec.param];
    if (!id) return true;

    const owningOrgIds = await this.owningOrgIds(spec.kind, id);
    if (owningOrgIds === null) {
      throw new NotFoundException('السجل المطلوب غير موجود');
    }

    // A record is in scope if any organisation it belongs to is visible. Training
    // requests legitimately have two owners (sending university, receiving
    // cluster) and both sides must be able to open their own request.
    const inScope = owningOrgIds.some((orgId) =>
      ctx.visibleOrgIds!.includes(orgId),
    );
    if (!inScope) {
      this.scopeContext.assertOrgInScope(ctx, null); // throws the standard 403
    }

    request.scopedResourceOrgIds = owningOrgIds;
    return true;
  }

  /** Organisations that own a record, or null when it does not exist. */
  private async owningOrgIds(
    kind: ScopedResourceSpec['kind'],
    id: string,
  ): Promise<string[] | null> {
    if (!id || typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return null;
    }
    switch (kind) {
      case 'trainingRequest': {
        const r = await this.prisma.trainingRequest.findUnique({
          where: { id },
          select: {
            sourceOrgId: true,
            targetOrgId: true,
            // The legacy per-hospital acceptance chain (accept-hospital-director,
            // accept-supervisor, accept-trainer, reject, return-to-cluster) is
            // reachable by hospital/trainer/supervisor roles, whose visibility
            // is the hospital itself — never the sending university or the
            // owning cluster. Without also owning the hospital(s) actually
            // assigned on this request's rows, every one of those callers would
            // 403 on their own request.
            trainees: { select: { assignedHospitalId: true }, distinct: ['assignedHospitalId'] },
          },
        });
        if (!r) return null;
        const hospitalIds = r.trainees.map((t) => t.assignedHospitalId).filter((o): o is string => !!o);
        return [r.sourceOrgId, r.targetOrgId, ...hospitalIds];
      }
      case 'trainingRequestTrainee': {
        const r = await this.prisma.trainingRequestTrainee.findUnique({
          where: { id },
          select: {
            assignedHospitalId: true,
            universityOrgId: true,
            trainingRequest: {
              select: { sourceOrgId: true, targetOrgId: true },
            },
          },
        });
        if (!r) return null;
        return [
          r.trainingRequest?.sourceOrgId,
          r.trainingRequest?.targetOrgId,
          r.assignedHospitalId,
          r.universityOrgId,
        ].filter((o): o is string => !!o);
      }
      case 'organization': {
        const r = await this.prisma.organization.findUnique({
          where: { id },
          select: { id: true },
        });
        return r ? [r.id] : null;
      }
      case 'department': {
        const r = await this.prisma.department.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return r ? [r.organizationId] : null;
      }
      case 'academicIntake': {
        const r = await this.prisma.academicIntake.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return r ? [r.organizationId] : null;
      }
      case 'traineeAllocation': {
        const r = await this.prisma.traineeAllocation.findUnique({
          where: { id },
          select: { clusterOrgId: true, hospitalId: true },
        });
        return r
          ? [r.clusterOrgId, r.hospitalId].filter((o): o is string => !!o)
          : null;
      }
      case 'trainerProfile': {
        const r = await this.prisma.trainerProfile.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return r ? [r.organizationId] : null;
      }
      case 'rotation': {
        const r = await this.prisma.rotation.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return r ? [r.organizationId] : null;
      }
      case 'attendance': {
        const r = await this.prisma.attendance.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return r ? [r.organizationId] : null;
      }
      case 'task': {
        const r = await this.prisma.task.findUnique({
          where: { id },
          select: { organizationId: true },
        });
        return r ? [r.organizationId] : null;
      }
      default:
        return null;
    }
  }
}
