import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateAffiliationDto {
  @ApiProperty({ description: 'معرف الجهة المصدر (مثال: الجامعة)' })
  @IsUUID('4')
  @IsNotEmpty()
  sourceOrgId!: string;

  @ApiProperty({ description: 'معرف الجهة الهدف (مثال: المستشفى)' })
  @IsUUID('4')
  @IsNotEmpty()
  targetOrgId!: string;

  @ApiProperty({ description: 'نوع الاتفاقية (training_agreement, academic_partnership, clinical_rotation, referral)' })
  @IsString()
  @IsNotEmpty()
  affiliationType!: string;

  @ApiPropertyOptional({ description: 'اسم الاتفاقية بالعربية' })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({ description: 'رقم مرجع الاتفاقية' })
  @IsOptional()
  @IsString()
  agreementRef?: string;

  @ApiPropertyOptional({ description: 'تاريخ بداية الاتفاقية' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'تاريخ نهاية الاتفاقية' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'ملاحظات' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAffiliationDto extends CreateAffiliationDto {}
