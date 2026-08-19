import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * POST /logbook/entries.
 *
 * The handler previously typed its body as an inline object literal. A type
 * literal leaves no metadata at runtime, so the global ValidationPipe skipped
 * the payload entirely: `whitelist` stripped nothing, `forbidNonWhitelisted`
 * caught nothing, and the only feedback a malformed request got was whichever
 * hand-written `BadRequestException` it happened to trip first — or a Prisma
 * error further in. Declaring the shape as a class restores both the stripping
 * and the field-level messages.
 */
export class CreateLogEntryDto {
  /** Required when a trainer logs on a trainee's behalf; derived for a trainee. */
  @ApiPropertyOptional({ description: 'معرّف ملف المتدرب — إلزامي عند التسجيل من حساب مدرب' })
  @IsOptional()
  @IsUUID('4', { message: 'معرّف ملف المتدرب غير صالح' })
  traineeProfileId?: string;

  @ApiProperty({ description: 'التشخيص أو وصف الحالة السريرية' })
  @IsString({ message: 'التشخيص أو وصف الحالة إلزامي' })
  @MinLength(1, { message: 'التشخيص أو وصف الحالة إلزامي' })
  diagnosis!: string;

  @ApiPropertyOptional({ description: 'معرّف الإجراء الطبي من الكتالوج' })
  @IsOptional()
  @IsString()
  procedureId?: string;

  @ApiPropertyOptional({ description: 'عمر المريض' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'عمر المريض يجب أن يكون رقماً صحيحاً' })
  @Min(0, { message: 'عمر المريض يجب أن يكون رقماً موجباً' })
  @Max(130, { message: 'عمر المريض غير منطقي' })
  patientAge?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  patientGender?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialtyAr?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  complexity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  participationLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  evidenceUrls?: string[];
}
