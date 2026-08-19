import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator';

export class CreateUserAccountDto {
  @ApiPropertyOptional({ description: 'معرف الشخص (Person ID) المرتبط' })
  @IsOptional()
  @ValidateIf((o) => !!o.personId && o.personId.trim().length > 0)
  @IsUUID('4', { message: 'معرف الشخص غير صالح' })
  personId?: string;

  @ApiPropertyOptional({ description: 'الهوية الوطنية' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ description: 'الاسم بالعربية' })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ description: 'الاسم بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: 'رقم الجوال' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiProperty({ description: 'البريد الإلكتروني للحساب' })
  @IsEmail({}, { message: 'البريد الإلكتروني غير صالح' })
  @IsNotEmpty({ message: 'البريد الإلكتروني مطلوب' })
  email!: string;

  @ApiPropertyOptional({ description: 'اسم المستخدم (اختياري)' })
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ description: 'كلمة المرور (إذا تم تعيينها مباشرة)' })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل' })
  password?: string;

  @ApiPropertyOptional({ description: 'معرف الجهة التابع لها الحساب' })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'معرف المستشفى التابع له الحساب' })
  @IsOptional()
  @IsString()
  hospitalId?: string;

  @ApiPropertyOptional({ description: 'رمز الدور المطلوب تعيينه للمستخدم في هذه الجهة' })
  @IsOptional()
  @IsString()
  roleCode?: string;
}

export class UpdateUserAccountDto {
  @ApiPropertyOptional({ description: 'الاسم بالعربية' })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ description: 'الاسم بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: 'البريد الإلكتروني' })
  @IsOptional()
  @IsEmail({}, { message: 'البريد غير صالح' })
  email?: string;

  @ApiPropertyOptional({ description: 'الهوية الوطنية' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ description: 'رقم الجوال' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'معرف الجهة' })
  @IsOptional()
  @IsString()
  organizationId?: string;

  @ApiPropertyOptional({ description: 'معرف المستشفى' })
  @IsOptional()
  @IsString()
  hospitalId?: string;

  @ApiPropertyOptional({ description: 'رمز الدور' })
  @IsOptional()
  @IsString()
  roleCode?: string;

  @ApiPropertyOptional({ description: 'كلمة المرور' })
  @IsOptional()
  @IsString()
  password?: string;
}

export class AddUserToOrgDto {
  @ApiProperty({ description: 'معرف الجهة' })
  @IsUUID('4', { message: 'معرف الجهة غير صالح' })
  @IsNotEmpty({ message: 'معرف الجهة مطلوب' })
  organizationId!: string;

  @ApiPropertyOptional({ description: 'رمز الدور في هذه الجهة' })
  @IsOptional()
  @IsString()
  roleCode?: string;

  @ApiPropertyOptional({ description: 'هل هي الجهة الرئيسية للمستخدم؟' })
  @IsOptional()
  isPrimary?: boolean;
}

export class AssignRoleDto {
  @ApiProperty({ description: 'معرف حساب المستخدم' })
  @IsUUID('4')
  @IsNotEmpty()
  userAccountId!: string;

  @ApiProperty({ description: 'معرف الجهة' })
  @IsUUID('4')
  @IsNotEmpty()
  organizationId!: string;

  @ApiProperty({ description: 'معرف الدور' })
  @IsUUID('4')
  @IsNotEmpty()
  roleId!: string;
}
