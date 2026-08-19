import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { TraineeDocumentsService } from './trainee-documents.service';
import { ReviewDocumentDto, UploadTraineeDocumentDto } from './dto/trainee-document.dto';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
} from '../../common/authz';

@ApiTags('Trainee Documents (مرفقات المتدربين)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@Controller('trainee-documents')
export class TraineeDocumentsController {
  constructor(private traineeDocumentsService: TraineeDocumentsService) {}

  @Get('types')
  @ApiOperation({ summary: 'أنواع المستندات المعتمدة' })
  async getAllowedTypes() {
    return this.traineeDocumentsService.getAllowedTypes();
  }

  @Post('upload')
  @RequireRoles(
    'university_administrator',
    'academic_affairs',
    'cluster_administrator', 'cluster_manager',
    'training_director',
    'hospital_training_admin',
    'trainee',
    'platform_owner',
  )
  @ApiOperation({ summary: 'رفع مستند للمتدرب (قبل أو بعد الاعتماد)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadTraineeDocumentDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.traineeDocumentsService.upload(file, dto, user);
  }

  @Get()
  @RequireCapability(
    CAPABILITIES.TRAINEE_VIEW_SCOPE, CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
    CAPABILITIES.TRAINEE_VIEW_SPONSORED, CAPABILITIES.SELF_VIEW,
  )
  @ApiOperation({ summary: 'مستندات متدرب محدد' })
  @ApiQuery({ name: 'traineeProfileId', required: false })
  @ApiQuery({ name: 'trainingRequestTraineeId', required: false })
  async findAll(
    @Query('traineeProfileId') traineeProfileId?: string,
    @Query('trainingRequestTraineeId') trainingRequestTraineeId?: string,
  ) {
    return this.traineeDocumentsService.findAll(traineeProfileId, trainingRequestTraineeId);
  }

  @Post(':id/review')
  @RequireRoles(
    'cluster_administrator', 'cluster_manager',
    'training_director',
    'hospital_training_admin',
    'academic_affairs',
    'platform_owner',
  )
  @ApiOperation({ summary: 'مراجعة مستند (قبول / رفض)' })
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewDocumentDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.traineeDocumentsService.review(id, dto, user);
  }
}
