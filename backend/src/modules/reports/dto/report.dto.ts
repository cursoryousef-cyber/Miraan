import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class GenerateReportDto {
  @ApiProperty({ description: 'معرف قالب التقرير (ReportDefinition ID)' })
  @IsUUID('4')
  @IsNotEmpty()
  reportDefinitionId!: string;

  @ApiPropertyOptional({ description: 'الصيغة (pdf, xlsx, csv)', default: 'pdf' })
  @IsOptional()
  @IsString()
  format?: string;

  @ApiPropertyOptional({ description: 'بارامترات الفلترة' })
  @IsOptional()
  @IsObject()
  parameters?: Record<string, unknown>;
}

/**
 * Report definition authoring. The owning organisation is never taken from the
 * client: it is derived from the caller's scope in the service, so a cluster
 * cannot create a template that belongs to another cluster.
 */
export class CreateReportDefinitionDto {
  @ApiProperty({ description: 'رمز القالب — فريد على مستوى المنصة' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'اسم التقرير بالعربية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiPropertyOptional({ description: 'اسم التقرير بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiProperty({
    description:
      'نوع البيانات: incidents, training_requests, trainees, trainers, rotations, schedules',
  })
  @IsString()
  @IsNotEmpty()
  reportType!: string;

  @ApiPropertyOptional({ description: 'الصيغة الافتراضية (pdf, xlsx, csv)' })
  @IsOptional()
  @IsString()
  defaultFormat?: string;
}

export class UpdateReportDefinitionDto {
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
  reportType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  defaultFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
