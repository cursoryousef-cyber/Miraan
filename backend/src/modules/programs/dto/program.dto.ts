import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsBoolean, Min, Max, MaxLength } from 'class-validator';

export class CreateProgramDto {
  @ApiProperty({ example: 'NURSING_INTERNSHIP', description: 'رمز البرنامج — فريد على مستوى المنصة' })
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'امتياز التمريض' })
  @IsString()
  @MaxLength(300)
  nameAr: string;

  @ApiPropertyOptional({ example: 'Nursing Internship' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  nameEn?: string;

  @ApiPropertyOptional({ example: 'internship', default: 'internship' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  programType?: string;

  @ApiProperty({ example: 12, description: 'مدة البرنامج بالأشهر' })
  @IsInt()
  @Min(1)
  @Max(120)
  durationMonths: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 1, description: 'ترتيب العرض في الكتالوج' })
  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

export class UpdateProgramDto extends PartialType(CreateProgramDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
