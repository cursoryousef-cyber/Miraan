import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com', description: 'البريد الإلكتروني' })
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  email!: string;

  @ApiProperty({ example: '********', description: 'كلمة المرور' })
  @IsString()
  @MinLength(6, { message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' })
  password!: string;

  @ApiPropertyOptional({ description: 'رمز المصادقة الثنائية (إن وجد)' })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}

export class SwitchOrgDto {
  @ApiProperty({ description: 'معرف الجهة المراد الانتقال إليها' })
  @IsString()
  @IsNotEmpty({ message: 'معرف الجهة مطلوب' })
  organizationId!: string;
}

export class RefreshTokenDto {
  @ApiProperty({ description: 'رمز التحديث (Refresh Token)' })
  @IsString()
  @IsNotEmpty({ message: 'رمز التحديث مطلوب' })
  refreshToken!: string;
}

export class ActivateAccountDto {
  @ApiProperty({ description: 'رمز التفعيل المرسل عبر البريد' })
  @IsString()
  @IsNotEmpty({ message: 'رمز التفعيل مطلوب' })
  token!: string;

  @ApiProperty({ description: 'كلمة المرور الجديدة' })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty({ description: 'كلمة المرور الحالية' })
  @IsString()
  @IsNotEmpty({ message: 'كلمة المرور الحالية مطلوبة' })
  currentPassword!: string;

  @ApiProperty({ description: 'كلمة المرور الجديدة' })
  @IsString()
  @MinLength(8, { message: 'كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل' })
  newPassword!: string;
}
