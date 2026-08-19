import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto, SwitchOrgDto, RefreshTokenDto, ActivateAccountDto, ChangePasswordDto } from './dto/auth.dto';
import { Public, CurrentUser } from '../../common/decorators';
import { JwtAuthGuard } from '../../common/guards';
import { IAuthenticatedUser } from '../../common/interfaces';

@ApiTags('Auth (المصادقة والتسجيل)')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تسجيل الدخول إلى منصة مِران' })
  @ApiResponse({ status: 200, description: 'تم تسجيل الدخول بنجاح وتوفير رمز JWT وتفاصيل المستخدم والجهات' })
  @ApiResponse({ status: 401, description: 'بيانات الدخول غير صحيحة' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Get('me')
  @ApiOperation({ summary: 'جلب بيانات الملف الشخصي وسياق الجلسة الحالية' })
  async getProfile(@CurrentUser() user: IAuthenticatedUser) {
    return this.authService.getProfile(user);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('switch-org')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تبديل سياق الجهة للمستخدم الحالي (Multi-Tenant Context Switch)' })
  @ApiResponse({ status: 200, description: 'تم إصدار رمز JWT جديد بسياق الجهة المحددة' })
  async switchOrg(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: SwitchOrgDto,
  ) {
    return this.authService.switchOrganization(user, dto);
  }

  @Public()
  @Post('refresh-token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تحديث رمز الجلسة (Refresh Token)' })
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  @Public()
  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تفعيل حساب جديد وتعيين كلمة المرور' })
  async activateAccount(@Body() dto: ActivateAccountDto) {
    return this.authService.activateAccount(dto);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'تغيير كلمة المرور للمستخدم الحالي' })
  async changePassword(
    @CurrentUser() user: IAuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user, dto);
  }
}
