import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export enum OrgLifecycleStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

export class CreateOrganizationDto {
  @ApiProperty({ description: 'معرف نوع الجهة (OrganizationType ID)' })
  @IsUUID('4', { message: 'معرف نوع الجهة غير صالح' })
  @IsNotEmpty({ message: 'نوع الجهة مطلوب' })
  organizationTypeId!: string;

  @ApiPropertyOptional({ description: 'معرف الجهة الأم (في الشجرة التنظيمية)' })
  @IsOptional()
  @IsUUID('4')
  parentId?: string;

  @ApiProperty({ description: 'رمز الجهة الفريد (مثال: NB-CLUSTER, HOSP-01)' })
  @IsString()
  @IsNotEmpty({ message: 'رمز الجهة مطلوب' })
  code!: string;

  @ApiProperty({ description: 'اسم الجهة بالعربية' })
  @IsString()
  @IsNotEmpty({ message: 'اسم الجهة بالعربية مطلوب' })
  nameAr!: string;

  @ApiPropertyOptional({ description: 'اسم الجهة بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: 'حالة دورت الحياة', enum: OrgLifecycleStatus })
  @IsOptional()
  @IsEnum(OrgLifecycleStatus)
  status?: OrgLifecycleStatus;

  @ApiPropertyOptional({ description: 'المدينة بالعربية' })
  @IsOptional()
  @IsString()
  cityAr?: string;

  @ApiPropertyOptional({ description: 'المدينة بالإنجليزية' })
  @IsOptional()
  @IsString()
  cityEn?: string;

  @ApiPropertyOptional({ description: 'المنطقة بالعربية' })
  @IsOptional()
  @IsString()
  regionAr?: string;

  @ApiPropertyOptional({ description: 'المنطقة بالإنجليزية' })
  @IsOptional()
  @IsString()
  regionEn?: string;

  @ApiPropertyOptional({ description: 'البريد الإلكتروني للجهة' })
  @IsOptional()
  @IsEmail({}, { message: 'البريد غير صالح' })
  contactEmail?: string;

  @ApiPropertyOptional({ description: 'هاتف التواصل' })
  @IsOptional()
  @IsString()
  contactPhone?: string;
}

/**
 * PATCH /organizations/:id is a partial update, and this must model that.
 *
 * Extending CreateOrganizationDto directly carried its required fields onto
 * the update, so `organizationTypeId`, `code` and `nameAr` were all mandatory
 * on every edit: a caller sending `{ nameAr }` to rename an organisation was
 * refused with "نوع الجهة مطلوب / رمز الجهة مطلوب" — verified against staging,
 * which answered 400 to exactly that body. Any client that does not resend the
 * whole entity cannot rename an organisation at all, and a client that does
 * resend it risks writing back a stale copy of every other field.
 *
 * PartialType keeps the same validation rules and applies them only to the
 * fields actually present. The service already spreads the DTO, so an absent
 * field is simply not written.
 */
export class UpdateOrganizationDto extends PartialType(CreateOrganizationDto) {}

export class ProvisionOrgWizardDto {
  @ApiProperty({ description: 'بيانات الجهة المراد إنشاؤها' })
  organization!: CreateOrganizationDto;

  @ApiProperty({ description: 'الاسم الكامل لمدير الجهة الجديد' })
  @IsString()
  @IsNotEmpty({ message: 'اسم مدير الجهة مطلوب' })
  adminNameAr!: string;

  @ApiProperty({ description: 'البريد الإلكتروني لمدير الجهة' })
  @IsEmail({}, { message: 'البريد غير صالح' })
  @IsNotEmpty({ message: 'بريد مدير الجهة مطلوب' })
  adminEmail!: string;

  @ApiPropertyOptional({ description: 'الهوية الوطنية لمدير الجهة' })
  @IsOptional()
  @IsString()
  adminNationalId?: string;

  @ApiPropertyOptional({ description: 'جوال مدير الجهة' })
  @IsOptional()
  @IsString()
  adminPhone?: string;
}
