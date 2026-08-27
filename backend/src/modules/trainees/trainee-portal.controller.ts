import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { TraineePortalService } from './trainee-portal.service';

@ApiTags('Trainee Portal (بوابة المتدرب)')
@ApiBearerAuth('JWT-auth')
@Controller('trainees')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TraineePortalController {
  constructor(private readonly traineePortalService: TraineePortalService) {}

  @Get('me/training-overview')
  @RequireRoles('trainee', 'platform_owner', 'org_manager')
  @ApiOperation({ summary: 'التخصيص والجداول والبرنامج التدريبي الكامل للمتدرب الحالي' })
  async getTrainingOverview(@CurrentUser() user: IAuthenticatedUser) {
    return this.traineePortalService.getTrainingOverview(user);
  }
}
