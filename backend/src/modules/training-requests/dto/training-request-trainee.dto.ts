import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

/** صف متدرب واحد كما يصل من ملف الإكسل أو الإدخال اليدوي */
export class TraineeRowDto {
  @ApiProperty({ description: 'الرقم الأكاديمي' })
  @IsString()
  @IsNotEmpty()
  academicNumber!: string;

  @ApiProperty({ description: 'رقم الهوية الوطنية' })
  @IsString()
  @IsNotEmpty()
  nationalId!: string;

  @ApiProperty({ description: 'الاسم بالعربية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiPropertyOptional({ description: 'الاسم بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: 'الجنس (male / female)' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'معرف الجامعة' })
  @IsOptional()
  @IsUUID('4')
  universityOrgId?: string;

  @ApiPropertyOptional({ description: 'معرف الكلية' })
  @IsOptional()
  @IsUUID('4')
  collegeOrgId?: string;

  @ApiPropertyOptional({
    description:
      'البرنامج التدريبي كما ورد في ملف الإكسل — نص أو رمز يُطابَق مع كتالوج البرامج ومع برنامج الطلب',
  })
  @IsOptional()
  @IsString()
  internshipProgram?: string;

  @ApiPropertyOptional({ description: 'رمز التخصص من جدول LookupTable' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'المعدل التراكمي' })
  @IsOptional()
  @IsNumber()
  gpa?: number;

  @ApiPropertyOptional({ description: 'رقم الجوال' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'البريد الإلكتروني' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'فترة التدريب' })
  @IsOptional()
  @IsString()
  trainingPeriod?: string;

  @ApiPropertyOptional({ description: 'تاريخ البداية' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'تاريخ النهاية' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'الأولوية' })
  @IsOptional()
  @IsString()
  priority?: string;
}

export class ImportTraineesDto {
  @ApiProperty({ description: 'صفوف المتدربين', type: [TraineeRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TraineeRowDto)
  rows!: TraineeRowDto[];
}

export class UpdateTraineeRowDto extends PartialType(TraineeRowDto) {
  @ApiPropertyOptional({ description: 'ملاحظات داخلية للتجمع' })
  @IsOptional()
  @IsString()
  clusterInternalNotes?: string;

  @ApiPropertyOptional({ description: 'ملاحظات رسمية' })
  @IsOptional()
  @IsString()
  officialComments?: string;
}

export class ReturnTraineeDto {
  @ApiProperty({ description: 'سبب الإرجاع' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'ملاحظات رسمية إضافية' })
  @IsOptional()
  @IsString()
  officialComments?: string;

  @ApiPropertyOptional({ description: 'أنواع المستندات المطلوبة' })
  @IsOptional()
  @IsArray()
  requiredDocuments?: string[];

  @ApiPropertyOptional({ description: 'آخر موعد للتعديل' })
  @IsOptional()
  @IsDateString()
  correctionDeadline?: string;
}

export class RejectTraineeDto {
  @ApiProperty({ description: 'سبب الرفض' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class MergeTraineesDto {
  @ApiProperty({ description: 'معرفات الصفوف المكررة التي ستُدمج في الصف الأساسي' })
  @IsArray()
  @IsUUID('4', { each: true })
  duplicateRowIds!: string[];
}

export class SplitTraineeDto {
  @ApiProperty({ description: 'الصفوف الجديدة الناتجة عن التقسيم', type: [TraineeRowDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TraineeRowDto)
  rows!: TraineeRowDto[];
}

// ─── Phase 4: Hospital Review DTOs ──────────────────────────────────────────

export class HospitalRejectDto {
  @ApiProperty({ description: 'سبب الرفض' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'ملاحظات إضافية' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class HospitalReturnDto {
  @ApiProperty({ description: 'سبب الإعادة للتجمع' })
  @IsString()
  @IsNotEmpty()
  reason!: string;

  @ApiPropertyOptional({ description: 'ملاحظات رسمية' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RequestMissingDocsDto {
  @ApiProperty({ description: 'أنواع المستندات المطلوبة من قائمة الأنواع المعتمدة' })
  @IsArray()
  @IsString({ each: true })
  documentTypes!: string[];

  @ApiPropertyOptional({ description: 'ملاحظات للجامعة/المتدرب' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'آخر موعد لتسليم المستندات' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

export class RequestDataCorrectionDto {
  @ApiProperty({ description: 'الحقول التي تحتاج تصحيح (أسماء الحقول)' })
  @IsArray()
  @IsString({ each: true })
  fields!: string[];

  @ApiPropertyOptional({ description: 'توصيف التصحيح المطلوب' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ChangeAssignmentDto {
  @ApiPropertyOptional({ description: 'معرف القسم الجديد' })
  @IsOptional()
  @IsUUID('4')
  departmentId?: string;

  @ApiPropertyOptional({ description: 'معرف ملف المدرب الجديد' })
  @IsOptional()
  @IsUUID('4')
  trainerProfileId?: string;

  @ApiPropertyOptional({ description: 'معرف حساب المشرف الجديد' })
  @IsOptional()
  @IsUUID('4')
  supervisorAccountId?: string;

  @ApiPropertyOptional({ description: 'تاريخ البداية المعدَّل' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'تاريخ النهاية المعدَّل' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ description: 'سبب التعديل' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class PutOnHoldDto {
  @ApiPropertyOptional({ description: 'سبب الإيقاف المؤقت' })
  @IsOptional()
  @IsString()
  notes?: string;
}
