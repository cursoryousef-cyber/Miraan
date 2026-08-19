import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

/**
 * Creating a batch takes the request it derives from, not the batch's own fields.
 * The programme, university, period and headcount are read off the approved
 * request so they cannot be retyped into disagreement with the approval.
 * The optional fields are labelling only.
 */
export class CreateBatchFromRequestDto {
  @ApiProperty({
    description: 'معرف طلب التدريب المعتمد الذي ستُنشأ منه الدفعة',
  })
  @IsUUID('4')
  @IsNotEmpty()
  trainingRequestId!: string;

  @ApiPropertyOptional({
    description: 'رمز الدفعة — يُشتق من رقم الطلب إن تُرك فارغاً',
  })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiPropertyOptional({
    description:
      'اسم الدفعة بالعربية — يُشتق من البرنامج والجامعة إن تُرك فارغاً',
  })
  @IsOptional()
  @IsString()
  nameAr?: string;

  @ApiPropertyOptional({
    description:
      'السنة الأكاديمية — تُشتق من تاريخ بداية التدريب إن تُركت فارغة',
  })
  @IsOptional()
  @IsString()
  academicYear?: string;

  @ApiPropertyOptional({ description: 'ملاحظات' })
  @IsOptional()
  @IsString()
  notes?: string;
}
