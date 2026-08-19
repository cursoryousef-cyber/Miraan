import { Module } from '@nestjs/common';
import { TrainersController } from './trainers.controller';
import { TrainerReassignmentService } from './trainer-reassignment.service';
import { TrainerLeaveService } from './trainer-leave.service';
import { TrainerQualificationService } from './trainer-qualification.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { OrganizationsModule } from '../organizations/organizations.module';
// POST /trainers creates the trainer's login through the same account service
// every other account goes through, rather than a second creation path.
import { UserAccountsModule } from '../user-accounts/user-accounts.module';

@Module({
  imports: [PrismaModule, NotificationsModule, OrganizationsModule, UserAccountsModule],
  controllers: [TrainersController],
  providers: [TrainerReassignmentService, TrainerLeaveService, TrainerQualificationService],
  exports: [TrainerReassignmentService, TrainerLeaveService, TrainerQualificationService],
})
export class TrainersModule {}
