import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEY } from '../decorators/feature.decorator';
import { PrismaService } from '../../prisma/prisma.service';
import { IAuthenticatedUser } from '../interfaces';

@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredFeature = this.reflector.getAllAndOverride<string>(
      FEATURE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredFeature) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as IAuthenticatedUser;

    if (!user || !user.organizationId) return true;

    // Platform Owner bypass
    if (user.roles?.includes('platform_owner')) return true;

    const flag = await this.prisma.featureFlag.findUnique({
      where: {
        organizationId_featureCode: {
          organizationId: user.organizationId,
          featureCode: requiredFeature,
        },
      },
    });

    // If flag doesn't exist or is disabled, block access
    if (!flag || !flag.isEnabled) {
      throw new ForbiddenException(
        `الميزة المطلوب استخدامها (${requiredFeature}) غير مفعّلة في باقة هذه الجهة`,
      );
    }

    return true;
  }
}
