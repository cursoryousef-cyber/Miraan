import { Body, Controller, Get, Post, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { DeclarationsService } from './declarations.service';
import { CreateDeclarationDto, AcceptDeclarationDto } from './dto/declaration.dto';
import { JwtAuthGuard } from '../../common/guards';
import { CurrentUser } from '../../common/decorators';
import { IAuthenticatedUser } from '../../common/interfaces';
import { ScopeContextService } from '../../common/authz';

@ApiTags('Declarations & Compliance (الإقرارات والتعهدات الوطنية)')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('declarations')
export class DeclarationsController {
  constructor(
    private readonly service: DeclarationsService,
    private readonly scopeContext: ScopeContextService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'إنشاء إقرار وتعهد جديد (الشؤون الأكاديمية)' })
  async create(
    @Body() dto: CreateDeclarationDto,
    @CurrentUser() user: IAuthenticatedUser,
  ) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.createDeclaration(scope.organizationId, dto, user.accountId);
  }

  @Get()
  @ApiOperation({ summary: 'استرجاع كافة الإقرارات المتاحة للجهة' })
  async getByOrg(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.getDeclarationsByOrg(scope.organizationId);
  }

  @Get('pending')
  @ApiOperation({ summary: 'استرجاع الإقرارات المطلوبة والمعلقة للمستخدم الحالي' })
  async getPending(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.getPendingDeclarationsForUser(user.accountId, scope.organizationId);
  }

  @Post('accept')
  @ApiOperation({ summary: 'الموافقة والتوقيع الرقمي على إقرار وتعهد' })
  async accept(
    @Body() dto: AcceptDeclarationDto,
    @CurrentUser() user: IAuthenticatedUser,
    @Req() req: any,
  ) {
    const scope = await this.scopeContext.resolve(user);
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    return this.service.acceptDeclaration(user.accountId, scope.organizationId, dto, ip);
  }

  @Get('statistics')
  @ApiOperation({ summary: 'استرجاع إحصائيات الموافقة ونسبة انضباط الإقرارات' })
  async getStatistics(@CurrentUser() user: IAuthenticatedUser) {
    const scope = await this.scopeContext.resolve(user);
    return this.service.getAcceptanceStatistics(scope.organizationId);
  }
}
