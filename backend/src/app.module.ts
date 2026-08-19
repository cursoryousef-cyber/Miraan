import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { PersonsModule } from './modules/persons/persons.module';
import { UserAccountsModule } from './modules/user-accounts/user-accounts.module';
import { OrganizationsModule } from './modules/organizations/organizations.module';
import { PoliciesModule } from './modules/policies/policies.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { StorageModule } from './modules/storage/storage.module';
import { AcademicIntakesModule } from './modules/academic-intakes/academic-intakes.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { ReportsModule } from './modules/reports/reports.module';
import { FeatureFlagsModule } from './modules/feature-flags/feature-flags.module';
import { LicensesModule } from './modules/licenses/licenses.module';
import { SettingsModule } from './modules/settings/settings.module';
import { HealthModule } from './modules/health/health.module';
import { DeclarationsModule } from './modules/declarations/declarations.module';
import { TraineesModule } from './modules/trainees/trainees.module';
import { TrainersModule } from './modules/trainers/trainers.module';
import { RotationsModule } from './modules/rotations/rotations.module';
import { TrainingEventsModule } from './modules/training-events/training-events.module';
import { CallsModule } from './modules/calls/calls.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { OrgMembersModule } from './modules/org-members/org-members.module';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module';
import { GlobalSearchModule } from './modules/global-search/global-search.module';
import { RolesPermissionsModule } from './modules/roles-permissions/roles-permissions.module';
import { LogbookModule } from './modules/logbook/logbook.module';
import { TrainingRequestsModule } from './modules/training-requests/training-requests.module';
import { TraineeDocumentsModule } from './modules/trainee-documents/trainee-documents.module';
import { OperationsModule } from './modules/operations/operations.module';
import { IncidentsModule } from './modules/incidents/incidents.module';
import { OrganizationAssignmentModule } from './modules/organization-assignments/organization-assignment.module';
import { ProgramsModule } from './modules/programs/programs.module';
import { TrainingPlansModule } from './modules/training-plans/training-plans.module';
import { TimelineModule } from './modules/timeline/timeline.module';
import { AuthzModule } from './common/authz/authz.module';

import { SchedulesModule } from './modules/schedules/schedules.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Rate Limiting (100 requests / 60 seconds)
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),

    // Core Infrastructure
    PrismaModule,
    AuthzModule,
    HealthModule,

    // Domain Modules
    AuthModule,
    PersonsModule,
    UserAccountsModule,
    OrganizationsModule,
    PoliciesModule,
    WorkflowsModule,
    StorageModule,
    AcademicIntakesModule,
    IntegrationsModule,
    ReportsModule,
    FeatureFlagsModule,
    LicensesModule,
    OrganizationAssignmentModule,
    ProgramsModule,
    TrainingPlansModule,
    TimelineModule,
    SettingsModule,
    DeclarationsModule,

    // Training Domain (NEW — Production)
    TraineesModule,
    TrainersModule,
    RotationsModule,
    TrainingEventsModule,
    CallsModule,
    NotificationsModule,
    OrgMembersModule,
    SchedulesModule,

    // Observability, Audit, Global Search & Dynamic RBAC & Logbook
    AuditLogsModule,
    GlobalSearchModule,
    RolesPermissionsModule,
    LogbookModule,
    TrainingRequestsModule,
    TraineeDocumentsModule,
    OperationsModule,
    IncidentsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
