import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import {
  CAPABILITIES,
  CapabilityGuard,
  RequireCapability,
  Scope,
  ScopeContext,
} from '../../common/authz';
import { CreateEventInput, TrainingEventsService } from './training-events.service';

/**
 * Unified training events. Authorisation is deliberately thin here: the route
 * establishes that the caller may run training operations at all, and the
 * service decides who they may actually address — because that answer depends
 * on the caller's scope and assignments, not on a role name.
 */
@ApiTags('Training Events (الفعاليات والنداءات التدريبية)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, CapabilityGuard)
@Controller('training-events')
export class TrainingEventsController {
  constructor(private eventsService: TrainingEventsService) {}

  // Literal routes before parameterised ones so they are not captured as ids.

  @Get('mine')
  @ApiOperation({ summary: 'الفعاليات الموجَّهة إليّ' })
  async findMine(@CurrentUser() user: IAuthenticatedUser) {
    return this.eventsService.findMine(user);
  }

  @Get('audience-options')
  @RequireCapability(CAPABILITIES.TRAINING_OPERATE)
  @ApiOperation({ summary: 'المدربون والمتدربون الذين يجوز للمرسِل مخاطبتهم' })
  async audienceOptions(
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
  ) {
    return this.eventsService.audienceOptions(user, scope);
  }

  @Get()
  @RequireCapability(CAPABILITIES.TRAINING_OPERATE)
  @ApiOperation({ summary: 'الفعاليات ضمن نطاق الجهة' })
  async findForScope(@Scope() scope: ScopeContext) {
    return this.eventsService.findForScope(scope);
  }

  @Get(':id')
  @RequireCapability(CAPABILITIES.TRAINING_OPERATE)
  @ApiOperation({ summary: 'تفاصيل الفعالية وسجل المستلمين ضمن نطاق المستدعي' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
  ) {
    return this.eventsService.findOneDetailed(id, user, scope);
  }

  @Post()
  @RequireCapability(CAPABILITIES.TRAINING_OPERATE)
  @ApiOperation({ summary: 'إنشاء فعالية تدريبية وإرسالها للمستلمين ضمن النطاق' })
  async create(
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
    @Body() dto: CreateEventInput,
  ) {
    return this.eventsService.create(user, scope, dto);
  }

  // Recipient actions. No capability is required to answer an event addressed
  // to you: holding the recipient row is the authorisation, and the service
  // resolves that row from the session rather than from anything sent.
  @Post(':id/respond/:action')
  @ApiOperation({
    summary: 'استجابة المستلم — acknowledge | accept | decline | attend | arrive | complete',
  })
  async respond(
    @Param('id') eventId: string,
    @Param('action') action: string,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    return this.eventsService.respond(eventId, user, action);
  }

  @Post(':id/recipients/:recipientId/confirm')
  @RequireCapability(CAPABILITIES.TRAINING_OPERATE)
  @ApiOperation({ summary: 'تأكيد حضور/وصول مستلم — للمخوَّل وحده، لا للمستلم نفسه' })
  async confirm(
    @Param('id') eventId: string,
    @Param('recipientId') recipientId: string,
    @CurrentUser() user: IAuthenticatedUser,
    @Scope() scope: ScopeContext,
  ) {
    return this.eventsService.confirmAttendance(eventId, recipientId, user, scope);
  }
}
