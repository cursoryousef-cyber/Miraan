import { Controller, ForbiddenException, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { CapabilityGuard, Scope, ScopeContext } from '../../common/authz';
import { NotificationService } from './notification.service';

@ApiTags('Notifications (الإشعارات)')
@Controller('notifications')
@UseGuards(JwtAuthGuard, CapabilityGuard)
@ApiBearerAuth('JWT-auth')
export class NotificationsController {
  constructor(private notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'قائمة الإشعارات الخاصة بالمستخدم في السياق النشط' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'type', required: false, type: String })
  async findAll(
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('type') type?: string,
  ) {
    return this.notificationService.findAll(user.accountId, scope, +page, +limit, type);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'عدد الإشعارات غير المقروءة في السياق النشط' })
  async getUnreadCount(
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
  ) {
    const count = await this.notificationService.getUnreadCount(user.accountId, scope);
    return { data: { count } };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'تحديد إشعار كمقروء' })
  async markAsRead(@Param('id') id: string, @CurrentUser() user: IAuthenticatedUser) {
    // Ownership was previously unchecked: any authenticated caller could mark any
    // notification read by id, including someone else's.
    const owned = await this.notificationService.isOwnedBy(id, user.accountId);
    if (!owned) throw new ForbiddenException('هذا الإشعار لا يخصك');
    return this.notificationService.markAsRead(id);
  }

  @Patch('read-all')
  @ApiOperation({ summary: 'تحديد جميع الإشعارات كمقروءة' })
  async markAllAsRead(@CurrentUser() user: IAuthenticatedUser) {
    const result = await this.notificationService.markAllAsRead(user.accountId);
    return { success: true, data: { updated: result.count } };
  }
}
