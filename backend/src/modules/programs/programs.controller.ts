import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { CurrentUser, RequireRoles } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { ProgramsService } from './programs.service';
import { CreateProgramDto, UpdateProgramDto } from './dto/program.dto';

@ApiTags('Training Programs (كتالوج البرامج التدريبية)')
@Controller('programs')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class ProgramsController {
  constructor(private programsService: ProgramsService) {}

  // Every operational party reads the catalog: the university picks a program on a
  // request, the cluster allocates by it, the hospital declares capacity against it.
  @Get()
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_administrator', 'hospital_training_admin', 'trainer',
    'university_administrator', 'academic_affairs', 'academic_supervisor', 'trainee',
  )
  @ApiOperation({ summary: 'كتالوج البرامج التدريبية الوطني' })
  async findAll(
    @Query('includeLegacy') includeLegacy?: string,
    @Query('activeOnly') activeOnly?: string,
  ) {
    return this.programsService.findAll({
      includeLegacy: includeLegacy === 'true',
      activeOnly: activeOnly === 'false' ? false : true,
    });
  }

  @Get(':id')
  @RequireRoles(
    'platform_owner', 'system_admin', 'org_manager',
    'cluster_administrator', 'cluster_manager', 'training_director',
    'hospital_administrator', 'hospital_training_admin', 'trainer',
    'university_administrator', 'academic_affairs', 'academic_supervisor', 'trainee',
  )
  @ApiOperation({ summary: 'تفاصيل برنامج تدريبي' })
  async findOne(@Param('id') id: string) {
    return this.programsService.findOne(id);
  }

  // Catalog authoring belongs to the cluster: the cluster manager owns the
  // training programs their network runs, while platform_owner keeps it as part
  // of platform administration. Entries stay national (organizationId = null),
  // so every sponsoring university reads the same catalog it must pick from.
  @Post()
  @RequireRoles('platform_owner', 'system_admin', 'cluster_manager')
  @ApiOperation({ summary: 'إضافة برنامج للكتالوج الوطني' })
  async create(@Body() dto: CreateProgramDto, @CurrentUser() user: IAuthenticatedUser) {
    return this.programsService.create(dto, user);
  }

  // Also the activate/deactivate path — `isActive` is an UpdateProgramDto field.
  @Patch(':id')
  @RequireRoles('platform_owner', 'system_admin', 'cluster_manager')
  @ApiOperation({ summary: 'تعديل برنامج في الكتالوج' })
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateProgramDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.programsService.update(id, dto, user);
  }

  @Delete(':id')
  @RequireRoles('platform_owner', 'system_admin')
  @ApiOperation({ summary: 'حذف برنامج غير مرتبط بسجلات' })
  async remove(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    return this.programsService.remove(id, user);
  }
}
