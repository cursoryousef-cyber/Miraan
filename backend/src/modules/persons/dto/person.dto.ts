import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreatePersonDto {
  @ApiProperty({ description: 'الهوية الوطنية / الإقامة' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiProperty({ description: 'الاسم الكامل بالعربية' })
  @IsString()
  @IsNotEmpty({ message: 'الاسم بالعربية مطلوب' })
  nameAr!: string;

  @ApiPropertyOptional({ description: 'الاسم الكامل بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: 'رقم الجوال' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'البريد الإلكتروني الشخصي' })
  @IsOptional()
  @IsEmail({}, { message: 'البريد غير صالح' })
  email?: string;

  @ApiPropertyOptional({ description: 'الجنسية' })
  @IsOptional()
  @IsString()
  nationality?: string;

  @ApiPropertyOptional({ description: 'فصيلة الدم' })
  @IsOptional()
  @IsString()
  bloodType?: string;

  @ApiPropertyOptional({ description: 'اسم طوارئ' })
  @IsOptional()
  @IsString()
  emergencyContactName?: string;

  @ApiPropertyOptional({ description: 'جوال طوارئ' })
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;
}

export class UpdatePersonDto extends CreatePersonDto {}
