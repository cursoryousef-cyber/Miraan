import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class UpsertCapacityAllocationDto {
  @ApiProperty({ enum: ['hospital', 'department', 'specialty', 'trainer', 'supervisor', 'program'] })
  @IsIn(['hospital', 'department', 'specialty', 'trainer', 'supervisor', 'program'])
  scopeType!: string;

  @ApiPropertyOptional({ description: 'معرف القسم/المدرب/المشرف حسب scopeType — فارغ لسعة المستشفى الكلية' })
  @IsOptional()
  @IsString()
  scopeId?: string;

  @ApiPropertyOptional({
    description:
      'معرف البرنامج التدريبي — إلزامي مع scopeType=program، واختياري مع department/trainer لتقسيم مقاعد البرنامج',
  })
  @IsOptional()
  @IsUUID()
  programId?: string;

  @ApiPropertyOptional({ description: 'رمز التخصص من LookupTable — فارغ لعدم التقييد بتخصص' })
  @IsOptional()
  @IsString()
  specialtyCode?: string;

  @ApiPropertyOptional({ description: "'male' | 'female' — فارغ لعدم التقييد بالجنس" })
  @IsOptional()
  @IsIn(['male', 'female', ''])
  gender?: string;

  @ApiPropertyOptional({ description: 'فترة التدريب (عادة السنة الأكاديمية) — فارغ لعدم التقييد' })
  @IsOptional()
  @IsString()
  trainingPeriod?: string;

  @ApiProperty({ description: 'إجمالي المقاعد' })
  @IsInt()
  @Min(0)
  totalCapacity!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateDepartmentCapacityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  capacity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxTrainers?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxSupervisors?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  maxActiveInterns?: number;
}

export class UpdateHospitalTotalCapacityDto {
  @ApiProperty({ description: 'إجمالي الطاقة الاستيعابية للمستشفى' })
  @IsInt()
  @Min(0)
  capacity!: number;
}
