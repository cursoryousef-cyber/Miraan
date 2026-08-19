import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUUID } from 'class-validator';

export class UpdateSettingDto {
  @ApiPropertyOptional({ description: 'معرف الجهة (null للإعدادات العامة)' })
  @IsOptional()
  @IsUUID('4')
  organizationId?: string;

  @ApiProperty({ description: 'مفتاح الإعداد (مثال: call_system.diligence_weights)' })
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ description: 'قيمة الإعداد بتنسيق JSON' })
  @IsObject()
  value!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'وصف الإعداد' })
  @IsOptional()
  @IsString()
  descriptionAr?: string;
}
