import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { UserAccountsService } from './user-accounts.service';
import { CreateUserAccountDto, UpdateUserAccountDto, AddUserToOrgDto, AssignRoleDto } from './dto/user-account.dto';
import { CurrentUser, OrgContext, RequirePermissions } from '../../common/decorators';
import { JwtAuthGuard, PermissionsGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

@ApiTags('User Accounts (إدارة حسابات الدخول وتعدد الجهات)')
@ApiBearerAuth('JWT-auth')
// PermissionsGuard was imported here but never registered, which made every
// @RequirePermissions on this controller inert: any authenticated caller — a
// trainee included — reached the whole account directory (passwords hashes,
// refresh tokens and activation tokens included) and the role-assignment
// route. Registering it is what makes those decorators mean anything.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('user-accounts')
export class UserAccountsController {
  constructor(private userAccountsService: UserAccountsService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة حسابات الدخول في الجهة الحالية أو جميع الجهات للمدير العام' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'allOrgs', required: false, type: String })
  @RequirePermissions('view_users')
  async findAll(
    @CurrentUser() currentUser: IAuthenticatedUser,
    @OrgContext() orgId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('search') search?: string,
    @Query('allOrgs') allOrgs?: string,
  ) {
    const isPlatformOwner = currentUser?.roles?.includes('platform_owner');
    const effectiveOrgId = (isPlatformOwner || allOrgs === 'true') ? null : orgId;
    return this.userAccountsService.findAll(effectiveOrgId, +page, +limit, search);
  }

  @Get(':id')
  @ApiOperation({ summary: 'تفاصيل حساب دخول محدد والجهات والأدوار المرتبطة' })
  @RequirePermissions('view_users')
  async findOne(@Param('id') id: string) {
    return this.userAccountsService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: 'إنشاء حساب دخول جديد وترخيصه لجهة' })
  @RequirePermissions('manage_users')
  async create(
    @Body() dto: CreateUserAccountDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.userAccountsService.create(dto, user);
  }

  @Post(':id/organizations')
  @ApiOperation({ summary: 'ربط حساب مستخدم بجهة إضافية (Multi-Org Assignment)' })
  @RequirePermissions('manage_users')
  async addUserToOrg(
    @Param('id') id: string,
    @Body() dto: AddUserToOrgDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.userAccountsService.addUserToOrg(id, dto, user);
  }

  @Post('roles/assign')
  @ApiOperation({ summary: 'تعيين دور للمستخدم في جهة محددة' })
  @RequirePermissions('manage_roles')
  async assignRole(
    @Body() dto: AssignRoleDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.userAccountsService.assignRole(dto, user);
  }

  @Delete(':id/roles/:roleId/organizations/:orgId')
  @ApiOperation({ summary: 'سحب دور من المستخدم في جهة محددة' })
  @RequirePermissions('manage_roles')
  async removeRole(
    @Param('id') id: string,
    @Param('roleId') roleId: string,
    @Param('orgId') orgId: string,
  ) {
    return this.userAccountsService.removeRole(id, roleId, orgId);
  }

  @Patch(':id/toggle-active')
  @ApiOperation({ summary: 'تفعيل أو إيقاف حساب دخول' })
  @RequirePermissions('manage_users')
  async toggleActive(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.userAccountsService.toggleActive(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'تحديث بيانات حساب الدخول' })
  // No PermissionsGuard decorator here by design: this endpoint serves two
  // distinct callers — (a) any user updating their OWN profile, and (b)
  // an administrator with manage_users updating another account.  The guard
  // cannot express this OR logic; the inline check below is the real
  // enforcement gate.  JwtAuthGuard (class-level) still ensures an
  // authenticated session is required.
  async update(
    @Param('id') id: string,
    @Body() dto: UpdateUserAccountDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    const isSelf = user?.accountId === id;
    // Only allow explicit manage_users permission holders to update other
    // accounts.  Previously this check included hardcoded role names
    // (hospital_training_admin etc.), which is fragile and too broad.
    const canManage =
      user?.roles?.includes('platform_owner') ||
      user?.roles?.includes('system_admin') ||
      user?.permissions?.includes('manage_users');
    if (!isSelf && !canManage) {
      throw new ForbiddenException('ليس لديك الصلاحية لتحديث بيانات هذا الحساب');
    }
    return this.userAccountsService.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'حذف/إيقاف حساب الدخول (Soft Delete)' })
  @RequirePermissions('manage_users')
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.userAccountsService.delete(id, user);
  }
}
