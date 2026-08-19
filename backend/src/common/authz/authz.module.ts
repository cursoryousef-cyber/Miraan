import { Global, Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ScopeContextService } from './scope-context.service';
import { CapabilityGuard } from './capability.guard';
import { ScopeGuard } from './scope.guard';

/**
 * Global so that any controller can list CapabilityGuard/ScopeGuard in
 * @UseGuards without each feature module having to import the authz plumbing.
 * Authorisation should be uniformly available, not something a module can forget
 * to wire up.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [ScopeContextService, CapabilityGuard, ScopeGuard],
  exports: [ScopeContextService, CapabilityGuard, ScopeGuard],
})
export class AuthzModule {}
