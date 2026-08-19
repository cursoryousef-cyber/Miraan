import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateAcademicIntakeDto {
  @ApiPropertyOptional({ description: 'معرف البرنامج التدريبي' })
  @IsOptional()
  @IsUUID('4')
  programId?: string;

  @ApiProperty({ description: 'رمز الدفعة الأكاديمية (مثال: INT-2027-NB)' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({
    description: 'اسم الدفعة بالعربية (مثال: دفعة أطباء الامتياز 2027)',
  })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiPropertyOptional({ description: 'اسم الدفعة بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiProperty({ description: 'السنة الأكاديمية (مثال: 2027)' })
  @IsString()
  @IsNotEmpty()
  academicYear!: string;

  @ApiProperty({ description: 'تاريخ بداية التدريب للدفعة' })
  @IsDateString()
  @IsNotEmpty()
  startDate!: string;

  @ApiProperty({ description: 'تاريخ نهاية التدريب للدفعة' })
  @IsDateString()
  @IsNotEmpty()
  endDate!: string;

  @ApiPropertyOptional({
    description: 'الطاقة الاستيعابية للدفعة',
    default: 50,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional({ description: 'معرف منسق الدفعة' })
  @IsOptional()
  @IsUUID('4')
  coordinatorId?: string;

  @ApiPropertyOptional({ description: 'ملاحظات' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateAcademicIntakeDto extends CreateAcademicIntakeDto {}

export class AssignTraineesToIntakeDto {
  @ApiProperty({
    description: 'قائمة معرفات ملفات المتدربين (Trainee Profile IDs)',
  })
  traineeProfileIds!: string[];
}
