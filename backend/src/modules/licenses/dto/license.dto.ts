import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpdateLicenseDto {
  @ApiProperty({ description: 'معرف الجهة' })
  @IsUUID('4')
  @IsNotEmpty()
  organizationId!: string;

  @ApiProperty({ description: 'باقة الترخيص (basic, standard, enterprise, unlimited)' })
  @IsString()
  @IsNotEmpty()
  plan!: string;

  @ApiProperty({ description: 'الحد الأقصى لعدد المستخدمين الإداريين والمدربين' })
  @IsInt()
  @Min(1)
  maxUsers!: number;

  @ApiProperty({ description: 'الحد الأقصى لعدد المتدربين' })
  @IsInt()
  @Min(1)
  maxTrainees!: number;

  @ApiProperty({ description: 'المساحة التخزينية بالجيجابايت (GB)' })
  @IsInt()
  @Min(1)
  maxStorageGb!: number;

  @ApiPropertyOptional({ description: 'قائمة الميزات المتاحة في هذه الباقة' })
  @IsOptional()
  @IsArray()
  features?: string[];

  @ApiProperty({ description: 'تاريخ بداية الترخيص' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ description: 'تاريخ نهاية الترخيص' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ description: 'حالة الترخيص (trial, active, expired, suspended)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'التجديد التلقائي' })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
