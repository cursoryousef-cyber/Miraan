import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CreateTrainingPlanDto {
  @ApiProperty({ description: 'معرف البرنامج التدريبي من الكتالوج الوطني' })
  @IsUUID('4')
  programId!: string;

  @ApiPropertyOptional({ description: 'الجهة المالكة — يُترك فارغاً للقوالب الوطنية' })
  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  @ApiPropertyOptional({ description: 'رمز القالب داخل البرنامج' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ description: 'اسم القالب بالعربية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: 'السنة التدريبية — مثال 2026' })
  @IsOptional()
  @IsString()
  trainingYear?: string;

  @ApiPropertyOptional({ description: 'وصف الإصدار الأول' })
  @IsOptional()
  @IsString()
  versionLabel?: string;

  @ApiPropertyOptional({ description: 'بداية سريان الإصدار الأول' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class UpdateTrainingPlanDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trainingYear?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateVersionDto {
  @ApiPropertyOptional({ description: 'الإصدار المصدر الذي يُنسخ عنه — الافتراضي أحدث إصدار' })
  @IsOptional()
  @IsUUID('4')
  sourceVersionId?: string;
}

export class PublishVersionDto {
  @ApiPropertyOptional({ description: 'بداية سريان الإصدار' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ description: 'نهاية سريان الإصدار' })
  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @ApiPropertyOptional({ description: 'وصف الإصدار — مثال «الإصدار 2 (2027)»' })
  @IsOptional()
  @IsString()
  label?: string;
}

export class UpsertPlanRotationDto {
  @ApiProperty({ description: 'ترتيب الروتيشن داخل الخطة — يبدأ من 1' })
  @IsInt()
  @Min(1)
  sequenceOrder!: number;

  @ApiProperty({ description: 'رمز القسم — يُحل إلى قسم فعلي في المستشفى عند التفعيل' })
  @IsString()
  @IsNotEmpty()
  departmentCode!: string;

  @ApiProperty({ description: 'اسم القسم بالعربية — يُستخدم كبديل للمطابقة وفي التقارير' })
  @IsString()
  @IsNotEmpty()
  departmentNameAr!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  departmentNameEn?: string;

  @ApiPropertyOptional({ description: 'رمز التخصص من LookupTable' })
  @IsOptional()
  @IsString()
  specialtyCode?: string;

  @ApiProperty({ description: 'مدة الروتيشن بالأسابيع' })
  @IsInt()
  @Min(1)
  durationWeeks!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ description: 'الكفاءات المطلوبة — [{ code, titleAr }]', type: [Object] })
  @IsOptional()
  @IsArray()
  requiredCompetencies?: any[];

  @ApiPropertyOptional({ description: 'الإجراءات المطلوبة — [{ code, titleAr, minCount }]', type: [Object] })
  @IsOptional()
  @IsArray()
  requiredProcedures?: any[];

  @ApiPropertyOptional({ description: 'بنود السجل التدريبي المطلوبة', type: [Object] })
  @IsOptional()
  @IsArray()
  requiredLogbookItems?: any[];

  @ApiPropertyOptional({ description: 'التقييمات المطلوبة — [{ formType, titleAr, timing }]', type: [Object] })
  @IsOptional()
  @IsArray()
  requiredEvaluations?: any[];

  @ApiPropertyOptional({ description: 'الأهداف التعليمية', type: [Object] })
  @IsOptional()
  @IsArray()
  objectives?: any[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
