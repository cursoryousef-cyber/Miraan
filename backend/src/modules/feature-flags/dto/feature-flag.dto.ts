import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class ToggleFeatureFlagDto {
  @ApiProperty({ description: 'معرف الجهة' })
  @IsUUID('4')
  @IsNotEmpty()
  organizationId!: string;

  @ApiProperty({ description: 'رمز الميزة (call_system, workflow_engine, integrations, academic_intakes, reports)' })
  @IsString()
  @IsNotEmpty()
  featureCode!: string;

  @ApiProperty({ description: 'تفعيل أو إيقاف الميزة' })
  @IsBoolean()
  isEnabled!: boolean;

  @ApiPropertyOptional({ description: 'إعدادات خاصة بالميزة' })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}
