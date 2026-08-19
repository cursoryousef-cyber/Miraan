import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class UploadTraineeDocumentDto {
  @ApiProperty({ description: 'رمز نوع المستند من جدول LookupTable (category = document_type)' })
  @IsString()
  @IsNotEmpty()
  documentType!: string;

  @ApiPropertyOptional({ description: 'معرف الملف التدريبي (بعد الاعتماد)' })
  @IsOptional()
  @IsUUID('4')
  traineeProfileId?: string;

  @ApiPropertyOptional({ description: 'معرف صف المتدرب في الدفعة (قبل الاعتماد)' })
  @IsOptional()
  @IsUUID('4')
  trainingRequestTraineeId?: string;

  @ApiPropertyOptional({ description: 'عنوان المستند — يُشتق من نوع المستند إن لم يُحدد' })
  @IsOptional()
  @IsString()
  titleAr?: string;

  @ApiPropertyOptional({ description: 'هل المستند إلزامي' })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;

  @ApiPropertyOptional({ description: 'تاريخ الإصدار' })
  @IsOptional()
  @IsDateString()
  issueDate?: string;

  @ApiPropertyOptional({ description: 'تاريخ انتهاء الصلاحية' })
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class ReviewDocumentDto {
  @ApiProperty({ description: 'نتيجة المراجعة', enum: ['approved', 'rejected', 'pending'] })
  @IsIn(['approved', 'rejected', 'pending'])
  status!: string;

  @ApiPropertyOptional({ description: 'ملاحظة المراجع' })
  @IsOptional()
  @IsString()
  reviewerNote?: string;
}
