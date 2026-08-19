import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

export class CreatePolicyDto {
  @ApiProperty({ description: 'رمز السياسة الفريد' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'اسم السياسة بالعربية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiProperty({ description: 'اسم السياسة بالإنجليزية' })
  @IsString()
  @IsNotEmpty()
  nameEn!: string;

  @ApiPropertyOptional({ description: 'وصف السياسة' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'المورد المستهدف (trainee, rotation, evaluation, organization)' })
  @IsString()
  @IsNotEmpty()
  resource!: string;

  @ApiProperty({ description: 'الإجراء المستهدف (create, read, update, delete, approve)' })
  @IsString()
  @IsNotEmpty()
  action!: string;

  @ApiPropertyOptional({ description: 'تأثير السياسة (allow | deny)', default: 'allow' })
  @IsOptional()
  @IsString()
  effect?: string;

  @ApiProperty({ description: 'شروط السياسة بتنسيق JSON' })
  @IsObject()
  conditions!: Record<string, unknown>;
}

export class EvaluatePolicyDto {
  @ApiProperty({ description: 'المورد (Resource)' })
  @IsString()
  @IsNotEmpty()
  resource!: string;

  @ApiProperty({ description: 'الإجراء (Action)' })
  @IsString()
  @IsNotEmpty()
  action!: string;

  @ApiPropertyOptional({ description: 'السياق الإضافي (Context Data)' })
  @IsOptional()
  @IsObject()
  context?: Record<string, unknown>;
}
