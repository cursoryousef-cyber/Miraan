import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty, IsOptional, IsString, IsUUID, IsNumber, IsArray, IsDateString,
  IsInt, IsBoolean, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * One rotation row of an inline, request-specific training plan — the WHAT/WHEN
 * a university proposes when no national curriculum template exists yet for the
 * program. Reused verbatim as a `TrainingPlanRotation` once persisted; this DTO
 * only carries what a person can reasonably type, not internal plan fields.
 */
export class RotationInputDto {
  @ApiProperty({ description: 'اسم القسم/الروتيشن بالعربية (مثال: الباطنة)' })
  @IsString()
  @IsNotEmpty()
  departmentNameAr!: string;

  @ApiPropertyOptional({
    description: 'رمز القسم — يُشتق تلقائياً من الاسم إن تُرك فارغاً',
  })
  @IsOptional()
  @IsString()
  departmentCode?: string;

  @ApiProperty({ description: 'مدة الروتيشن بالأسابيع' })
  @IsInt()
  @Min(1)
  durationWeeks!: number;

  @ApiPropertyOptional({ description: 'إلزامي أم اختياري — افتراضياً إلزامي' })
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}

/**
 * One hospital allocation row on a training request — how many seats go to
 * which hospital. Declared as its own class (not `any[]`) because the global
 * ValidationPipe runs with `whitelist: true`: an untyped `any[]` gets its
 * nested objects stripped to empty, silently dropping the seats on assign.
 */
export class AllocationInputDto {
  @ApiProperty({ description: 'معرّف المستشفى المستهدف' })
  @IsString()
  @IsNotEmpty()
  hospitalId!: string;

  @ApiPropertyOptional({ description: 'اسم المستشفى' })
  @IsOptional()
  @IsString()
  hospitalName?: string;

  @ApiPropertyOptional({ description: 'رمز المستشفى' })
  @IsOptional()
  @IsString()
  hospitalCode?: string;

  @ApiPropertyOptional({ description: 'عدد المقاعد الموزعة' })
  @IsOptional()
  @IsNumber()
  seats?: number;

  @ApiPropertyOptional({ description: 'القسم المستهدف (اختياري)' })
  @IsOptional()
  @IsString()
  departmentId?: string;
}

/**
 * One trainee proposed alongside the request itself, so a university can submit
 * the request and its roster in a single call. Reuses exactly the same shape and
 * the same validated write path as the standalone
 * `POST /training-requests/:id/trainees/import` endpoint — see
 * `TrainingRequestsService.create()`, which maps these onto `TraineeRowDto` and
 * hands them to `TrainingRequestTraineesService.importTrainees()` rather than
 * writing rows itself. There is one validated way to create a trainee row; this
 * is a convenience entry point onto it, not a second one.
 */
export class CandidateTraineeInputDto {
  @ApiProperty({ description: 'الرقم الأكاديمي للمتدرب (الرقم الجامعي)' })
  @IsString()
  @IsNotEmpty()
  academicNumber!: string;

  @ApiProperty({ description: 'رقم الهوية الوطنية أو الإقامة' })
  @IsString()
  @IsNotEmpty()
  nationalId!: string;

  @ApiProperty({ description: 'الاسم الكامل بالعربية' })
  @IsString()
  @IsNotEmpty()
  nameAr!: string;

  @ApiPropertyOptional({ description: 'الاسم الكامل بالإنجليزية' })
  @IsOptional()
  @IsString()
  nameEn?: string;

  @ApiPropertyOptional({ description: 'الجنس (male/female)' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ description: 'التخصص — يرث تخصص الطلب إن تُرك فارغاً' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({ description: 'البريد الإلكتروني' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'رقم الجوال' })
  @IsOptional()
  @IsString()
  mobile?: string;

  @ApiPropertyOptional({ description: 'تاريخ بداية تدريب المتدرب — يرث تاريخ الطلب إن تُرك فارغاً' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'تاريخ نهاية تدريب المتدرب — يرث تاريخ الطلب إن تُرك فارغاً' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class CreateTrainingRequestDto {
  @ApiPropertyOptional({ description: 'نوع الطلب (university_request, cluster_request)' })
  @IsOptional()
  @IsString()
  requestType?: string;

  @ApiPropertyOptional({ description: 'معرف المستشفى المستهدف في حال طلب التجمع المباشر' })
  @IsOptional()
  @IsUUID('4')
  targetHospitalId?: string;

  @ApiPropertyOptional({ description: 'رابط خطاب التجمع الرسمي المرفق' })
  @IsOptional()
  @IsString()
  clusterLetterUrl?: string;

  @ApiPropertyOptional({ description: 'روابط المرفقات المسموحة بالطلب' })
  @IsOptional()
  @IsArray()
  attachmentUrls?: string[];

  @ApiProperty({ description: 'معرف الجهة الهدف (التجمع الصحي)' })
  @IsUUID('4')
  @IsNotEmpty()
  targetOrgId!: string;

  @ApiPropertyOptional({ description: 'معرف البرنامج الأكاديمي' })
  @IsOptional()
  @IsUUID('4')
  programId?: string;

  @ApiPropertyOptional({ description: 'رمز التخصص من جدول التخصصات — تخصص الدفعة' })
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional({
    description:
      'مدة البرنامج بالأشهر كما تراها الجامعة — معلوماتي فقط. مصدر الحقيقة الملزم هو ' +
      'Program.durationMonths من الكتالوج؛ هذا الحقل لا يغيّر أي تحقق ولا يُكتب في أي جدول.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  durationMonths?: number;

  @ApiPropertyOptional({
    description: 'قالب الخطة التدريبية المختار — يُثبَّت إصداره النشط وقت التقديم',
  })
  @IsOptional()
  @IsUUID('4')
  trainingPlanId?: string;

  @ApiPropertyOptional({
    description: 'إصدار خطة محدد — يُترك فارغاً ليُختار الإصدار النشط تلقائياً',
  })
  @IsOptional()
  @IsUUID('4')
  trainingPlanVersionId?: string;

  @ApiPropertyOptional({ description: 'تاريخ بداية التدريب' })
  @IsOptional()
  @IsDateString()
  trainingStartDate?: string;

  @ApiPropertyOptional({ description: 'تاريخ نهاية التدريب' })
  @IsOptional()
  @IsDateString()
  trainingEndDate?: string;

  @ApiPropertyOptional({ description: 'تاريخ التخرج المتوقع' })
  @IsOptional()
  @IsDateString()
  expectedGraduationDate?: string;

  @ApiPropertyOptional({ description: 'معرف الدفعة الأكاديمية' })
  @IsOptional()
  @IsUUID('4')
  academicIntakeId?: string;

  @ApiProperty({ description: 'عدد متدربي الامتياز المطلوبين' })
  @IsNumber()
  @IsNotEmpty()
  studentCount!: number;

  @ApiPropertyOptional({ description: 'درجة الأولوية (normal, high, urgent)' })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({ description: 'ملاحظات الجامعة' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description:
      'روتيشنات خطة مخصصة للطلب — تُستخدم فقط عند عدم اختيار trainingPlanId من الكتالوج. ' +
      'تُنشئ خطة وإصداراً خاصين بهذا الطلب (WHAT/WHEN)، منفصلين عن مكان/من يشرف على المتدرب.',
    type: [RotationInputDto],
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RotationInputDto)
  rotations?: RotationInputDto[];

  @ApiPropertyOptional({
    description:
      'قائمة المتدربين المرفقة مع الطلب — بديل عن استدعاء منفصل لـ ' +
      '/training-requests/:id/trainees/import بعد الإنشاء. تخضع لنفس التحقق تماماً.',
    type: [CandidateTraineeInputDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CandidateTraineeInputDto)
  trainees?: CandidateTraineeInputDto[];
}

/**
 * Pre-submission check. Carries the same fields as creation minus the target
 * cluster, so the university can validate and preview a batch before committing.
 */
export class PreviewTrainingRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  programId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specialty?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  trainingPlanId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  trainingPlanVersionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  trainingStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  trainingEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expectedGraduationDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  studentCount?: number;

  @ApiPropertyOptional({ type: [RotationInputDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RotationInputDto)
  rotations?: RotationInputDto[];
}

export class UpdateTrainingRequestDto {
  @ApiPropertyOptional({ description: 'حالة الطلب (submitted, reviewed, approved, allocated, rejected)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'ملاحظات مدير التجمع' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'قائمة مستشفيات التوزيع والمقاعد' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllocationInputDto)
  allocations?: AllocationInputDto[];
}
