import { Body, Controller, Delete, Get, Param, Patch, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { HospitalCapacityService } from './hospital-capacity.service';
import {
  UpdateDepartmentCapacityDto,
  UpdateHospitalTotalCapacityDto,
  UpsertCapacityAllocationDto,
} from './dto/capacity-allocation.dto';
import { CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  ScopeGuard,
  ScopedResource,
} from '../../common/authz';

@ApiTags('Hospital Capacity (سعة المستشفى التفصيلية)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, CapabilityGuard, ScopeGuard)
@Controller('organizations')
export class HospitalCapacityController {
  constructor(private hospitalCapacityService: HospitalCapacityService) {}

  @Get(':id/capacity')
  @RequireCapability(CAPABILITIES.CAPACITY_VIEW)
  @ScopedResource('organization', 'id')
  @ApiOperation({ summary: 'تفصيل الطاقة الاستيعابية الكاملة للمستشفى (كلي + أقسام + تخصصات + مدربين + مشرفين)' })
  async getBreakdown(@Param('id') id: string) {
    return this.hospitalCapacityService.getBreakdown(id);
  }

  @Put(':id/capacity/hospital')
  @RequireCapability(CAPABILITIES.CAPACITY_MANAGE)
  @ScopedResource('organization', 'id')
  @ApiOperation({ summary: 'تحديث الطاقة الاستيعابية الكلية للمستشفى (المستشفى فقط، لا يعدّلها التجمع)' })
  async updateHospitalTotal(
    @Param('id') id: string,
    @Body() dto: UpdateHospitalTotalCapacityDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.hospitalCapacityService.updateHospitalTotalCapacity(id, dto, user);
  }

  @Put(':id/capacity/allocations')
  @RequireCapability(CAPABILITIES.CAPACITY_MANAGE)
  @ScopedResource('organization', 'id')
  @ApiOperation({ summary: 'إضافة/تحديث قاعدة طاقة دقيقة (تخصص / جنس / فترة تدريب / مشرف / مدرب)' })
  async upsertAllocation(
    @Param('id') id: string,
    @Body() dto: UpsertCapacityAllocationDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.hospitalCapacityService.upsertAllocation(id, dto, user);
  }

  @Delete(':id/capacity/allocations/:allocationId')
  @RequireCapability(CAPABILITIES.CAPACITY_MANAGE)
  @ScopedResource('organization', 'id')
  @ApiOperation({ summary: 'حذف قاعدة طاقة دقيقة' })
  async deleteAllocation(
    @Param('id') id: string,
    @Param('allocationId') allocationId: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.hospitalCapacityService.deleteAllocation(id, allocationId, user);
  }

  @Patch('departments/:departmentId/capacity')
  @RequireCapability(CAPABILITIES.CAPACITY_MANAGE)
  @ScopedResource('department', 'departmentId')
  @ApiOperation({ summary: 'تحديث سعة القسم والحدود العليا للمدربين/المشرفين/المتدربين النشطين' })
  async updateDepartmentCapacity(
    @Param('departmentId') departmentId: string,
    @Body() dto: UpdateDepartmentCapacityDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.hospitalCapacityService.updateDepartmentCapacity(departmentId, dto, user);
  }
}
