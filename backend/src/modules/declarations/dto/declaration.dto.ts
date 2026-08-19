import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateDeclarationDto {
  @ApiProperty({ description: 'نوع الإقرار: joining, academic_affairs, ethics', example: 'academic_affairs' })
  @IsString()
  @IsNotEmpty()
  type: string;

  @ApiProperty({ description: 'عنوان الإقرار بالعربية', example: 'إقرار وتعهد الشؤون الأكاديمية والالتزام المهني' })
  @IsString()
  @IsNotEmpty()
  titleAr: string;

  @ApiPropertyOptional({ description: 'عنوان الإقرار بالإنجليزية' })
  @IsString()
  @IsOptional()
  titleEn?: string;

  @ApiProperty({ description: 'نص ومحتوى الإقرار بالعربية' })
  @IsString()
  @IsNotEmpty()
  contentAr: string;

  @ApiPropertyOptional({ description: 'نص ومحتوى الإقرار بالإنجليزية' })
  @IsString()
  @IsOptional()
  contentEn?: string;

  @ApiPropertyOptional({ description: 'هل الإقرار إجباري؟', default: true })
  @IsBoolean()
  @IsOptional()
  isMandatory?: boolean;
}

export class AcceptDeclarationDto {
  @ApiProperty({ description: 'معرف الإقرار', example: 'uuid' })
  @IsString()
  @IsNotEmpty()
  declarationId: string;

  @ApiProperty({ description: 'رقم إصدار الإقرار الموافق عليه', example: 1 })
  @IsInt()
  version: number;

  @ApiPropertyOptional({ description: 'معلومات الجهاز المستعمل', example: 'iOS 18 / Safari' })
  @IsString()
  @IsOptional()
  deviceInfo?: string;
}
