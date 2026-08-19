import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateWorkflowDefDto {
  @ApiProperty({ description: 'رمز سير العمل الفريد' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'اسم سير العمل بالعربية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiProperty({ description: 'اسم سير العمل بالإنجليزية' })
  @IsString()
  @IsNotEmpty()
  nameEn!: string;

  @ApiProperty({ description: 'نوع الكيان (trainee_application, card_issuance, rotation_request)' })
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @ApiProperty({ description: 'خطوات سير العمل JSON Array' })
  @IsArray()
  steps!: Record<string, unknown>[];

  @ApiProperty({ description: 'انتقالات الحالات JSON Array' })
  @IsArray()
  transitions!: Record<string, unknown>[];
}

export class StartWorkflowDto {
  @ApiProperty({ description: 'معرف تعريف سير العمل' })
  @IsUUID('4')
  @IsNotEmpty()
  workflowDefinitionId!: string;

  @ApiProperty({ description: 'نوع الكيان' })
  @IsString()
  @IsNotEmpty()
  entityType!: string;

  @ApiProperty({ description: 'معرف الكيان المستهدف (الطلب، البطاقة، الروتيشن)' })
  @IsUUID('4')
  @IsNotEmpty()
  entityId!: string;

  @ApiPropertyOptional({ description: 'بيانات إضافية' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class ExecuteWorkflowActionDto {
  @ApiProperty({ description: 'الإجراء المطلوب (approve, reject, return, escalate)' })
  @IsString()
  @IsNotEmpty()
  action!: string;

  @ApiPropertyOptional({ description: 'تعليق/سبب الإجراء' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'بيانات إضافية' })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
