import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsObject, IsOptional, IsString, IsUrl } from 'class-validator';

export class CreateIntegrationConfigDto {
  @ApiProperty({ description: 'رمز التكـامل الفريد (مثال: scfhs_api, nafis_hub)' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ description: 'اسم التكامل بالعربية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiProperty({ description: 'اسم التكامل بالإنجليزية' })
  @IsString()
  @IsNotEmpty()
  nameEn!: string;

  @ApiProperty({ description: 'نوع الاتصال (rest_api, soap, webhook, sftp)' })
  @IsString()
  @IsNotEmpty()
  integrationType!: string;

  @ApiPropertyOptional({ description: 'الرابط الرئيسي (Base URL)' })
  @IsOptional()
  @IsString()
  baseUrl?: string;

  @ApiPropertyOptional({ description: 'نوع المصادقة (api_key, oauth2, basic, certificate)' })
  @IsOptional()
  @IsString()
  authType?: string;

  @ApiPropertyOptional({ description: 'البيانات الحساسة والمفاتيح' })
  @IsOptional()
  @IsObject()
  credentials?: Record<string, unknown>;
}

export class CreateWebhookSubDto {
  @ApiProperty({ description: 'الحدث المستهدف (مثال: trainee.approved, card.issued, rotation.completed)' })
  @IsString()
  @IsNotEmpty()
  event!: string;

  @ApiProperty({ description: 'رابط استلام الـ Webhook (Target URL)' })
  @IsUrl({}, { message: 'الرابط غير صالح' })
  @IsNotEmpty()
  targetUrl!: string;

  @ApiPropertyOptional({ description: 'مفتاح توقيع HMAC لتوثيق الرسائل' })
  @IsOptional()
  @IsString()
  secret?: string;
}
