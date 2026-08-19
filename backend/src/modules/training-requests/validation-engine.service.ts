import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TRAINEE_ROW_STATUS } from '../../common/status-constants';

export interface ValidationError {
  code: string;
  messageAr: string;
  field?: string;
  severity?: 'error' | 'warning';
}

export interface RowValidationResult {
  rowId: string;
  nationalId: string;
  nameAr: string;
  errors: ValidationError[];
}

/** أنواع المستندات الإلزامية لقبول المتدرب */
const MANDATORY_DOCUMENT_TYPES = [
  'national_id',
  'internship_letter',
  'academic_transcript',
  'medical_examination',
];

/**
 * محرك التحقق لمرحلة مراجعة التجمع الصحي (Stage 2).
 * يفحص كل صف متدرب ضمن الدفعة ويكتب الأخطاء في validationErrors.
 *
 * isDirectRequest — عند تمريرها true (طلب تجمع مباشر)، تُعفى الصفوف من اشتراط
 * universityOrgId لأن التجمع نفسه هو الجهة المُرسِلة ولا توجد جامعة راعية.
 * طلبات الجامعات تستمر في اشتراط universityOrgId صالح.
 */
@Injectable()
export class ValidationEngineService {
  constructor(private prisma: PrismaService) {}

  async validateTrainees(trainingRequestId: string, isDirectRequest = false): Promise<RowValidationResult[]> {
    const rows = await this.prisma.trainingRequestTrainee.findMany({
      where: {
        trainingRequestId,
        status: { notIn: [TRAINEE_ROW_STATUS.MERGED, TRAINEE_ROW_STATUS.SPLIT, TRAINEE_ROW_STATUS.REJECTED] },
      },
      include: {
        documents: true,
        university: { include: { organizationType: true } },
        trainingRequest: {
          select: { sourceOrg: { select: { organizationType: { select: { code: true } } } } },
        },
      },
    });

    const validSpecialties = await this.prisma.lookupTable.findMany({
      where: { category: 'specialty', isActive: true },
      select: { code: true },
    });
    const specialtyCodes = new Set(validSpecialties.map((s) => s.code));

    // تكرار داخل نفس الدفعة
    const nationalIdCounts = this.countBy(rows, (r) => r.nationalId);
    const academicNumberCounts = this.countBy(rows, (r) => r.academicNumber);

    const results: RowValidationResult[] = [];

    for (const row of rows) {
      const errors: ValidationError[] = [];

      // ── تكرار الهوية الوطنية ──
      if ((nationalIdCounts.get(row.nationalId) || 0) > 1) {
        errors.push({
          code: 'duplicate_national_id_in_batch',
          field: 'nationalId',
          messageAr: `رقم الهوية الوطنية (${row.nationalId}) مكرر داخل نفس الدفعة`,
        });
      } else {
        const existingPerson = await this.prisma.person.findUnique({
          where: { nationalId: row.nationalId },
          include: { traineeProfile: true },
        });
        if (existingPerson?.traineeProfile) {
          errors.push({
            code: 'duplicate_national_id_in_system',
            field: 'nationalId',
            messageAr: `رقم الهوية الوطنية (${row.nationalId}) مسجّل مسبقاً لمتدرب في النظام`,
          });
        }
      }

      // ── تكرار الرقم الأكاديمي ──
      if ((academicNumberCounts.get(row.academicNumber) || 0) > 1) {
        errors.push({
          code: 'duplicate_academic_number_in_batch',
          field: 'academicNumber',
          messageAr: `الرقم الأكاديمي (${row.academicNumber}) مكرر داخل نفس الدفعة`,
        });
      } else {
        const existingProfile = await this.prisma.traineeProfile.findUnique({
          where: { traineeNumber: row.academicNumber },
        });
        if (existingProfile) {
          errors.push({
            code: 'duplicate_academic_number_in_system',
            field: 'academicNumber',
            messageAr: `الرقم الأكاديمي (${row.academicNumber}) مستخدم مسبقاً في النظام`,
          });
        }
      }

      // ── المستندات الناقصة ──
      const uploadedTypes = new Set(row.documents.map((d) => d.documentType));
      for (const required of MANDATORY_DOCUMENT_TYPES) {
        if (!uploadedTypes.has(required)) {
          errors.push({
            code: 'missing_document',
            field: required,
            severity: 'warning',
            messageAr: `المستند الإلزامي مفقود: ${this.documentLabel(required)}`,
          });
        }
      }

      // ── الشهادات المنتهية ──
      const now = new Date();
      for (const doc of row.documents) {
        if (doc.hasExpiry && doc.expiryDate && doc.expiryDate < now) {
          errors.push({
            code: 'expired_document',
            field: doc.documentType,
            severity: 'warning',
            messageAr: `${this.documentLabel(doc.documentType)} منتهية الصلاحية بتاريخ ${doc.expiryDate.toISOString().slice(0, 10)}`,
          });
        }
      }

      // ── الجوال والبريد ──
      if (!row.mobile) {
        errors.push({ code: 'missing_mobile', field: 'mobile', severity: 'error', messageAr: 'رقم الجوال مفقود' });
      }
      if (!row.email) {
        errors.push({ code: 'missing_email', field: 'email', severity: 'error', messageAr: 'البريد الإلكتروني مفقود' });
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email.trim())) {
        errors.push({ code: 'invalid_email', field: 'email', severity: 'error', messageAr: 'صيغة البريد الإلكتروني غير صالحة' });
      }

      // ── التخصص ──
      if (!row.specialty) {
        errors.push({ code: 'missing_specialty', field: 'specialty', messageAr: 'التخصص غير محدد' });
      } else if (!specialtyCodes.has(row.specialty)) {
        errors.push({
          code: 'invalid_specialty',
          field: 'specialty',
          messageAr: `التخصص (${row.specialty}) غير معتمد في قائمة التخصصات`,
        });
      }

      // ── التواريخ ──
      if (!row.startDate || !row.endDate) {
        errors.push({ code: 'missing_dates', field: 'startDate', messageAr: 'تواريخ فترة التدريب غير مكتملة' });
      } else if (row.endDate <= row.startDate) {
        errors.push({
          code: 'invalid_dates',
          field: 'endDate',
          messageAr: 'تاريخ نهاية التدريب يجب أن يكون بعد تاريخ البداية',
        });
      }

      // ── تطابق الجنس مع السجل القائم ──
      if (!row.gender) {
        errors.push({ code: 'missing_gender', field: 'gender', messageAr: 'الجنس غير محدد' });
      } else {
        const person = await this.prisma.person.findUnique({
          where: { nationalId: row.nationalId },
          select: { gender: true },
        });
        if (person?.gender && person.gender !== row.gender) {
          errors.push({
            code: 'gender_mismatch',
            field: 'gender',
            messageAr: `الجنس المدخل (${row.gender}) لا يطابق السجل المسجّل في النظام (${person.gender})`,
          });
        }
      }

      // ── الجامعة ──
      // Path B (cluster → hospital) has no sponsoring university row behind it:
      // the university's no-objection letter attached to the request is what
      // authorises the training, so the sponsor-organisation rule applies to
      // university-originated requests only.
      //
      // The rule itself is Miran's, unchanged: the path is derived from the source
      // organisation type. `isDirectRequest` is the explicit flag newer callers
      // pass; it defaults to false, so every existing caller behaves exactly as
      // before and only callers that opt in add the second signal.
      const isDirectClusterRequest =
        isDirectRequest ||
        row.trainingRequest?.sourceOrg?.organizationType?.code === 'cluster';
      if (isDirectClusterRequest) {
        // no sponsor-organisation requirement on this path
      } else if (!row.universityOrgId) {
        errors.push({ code: 'missing_university', field: 'universityOrgId', messageAr: 'الجامعة غير محددة' });
      } else if (row.university?.organizationType?.code !== 'university') {
        errors.push({
          code: 'invalid_university',
          field: 'universityOrgId',
          messageAr: 'الجهة المحددة ليست جامعة معتمدة في النظام',
        });
      }

      results.push({ rowId: row.id, nationalId: row.nationalId, nameAr: row.nameAr, errors });
    }

    await this.persistResults(results, rows);
    return results;
  }

  /** يحفظ الأخطاء ويرفع الصفوف المكررة إلى حالة duplicate_flagged */
  private async persistResults(
    results: RowValidationResult[],
    rows: { id: string; status: string }[],
  ): Promise<void> {
    const statusById = new Map(rows.map((r) => [r.id, r.status]));

    for (const result of results) {
      const hasDuplicate = result.errors.some((e) => e.code.startsWith('duplicate_'));
      const currentStatus = statusById.get(result.rowId);
      const shouldFlag = hasDuplicate && currentStatus === TRAINEE_ROW_STATUS.SUBMITTED;

      await this.prisma.trainingRequestTrainee.update({
        where: { id: result.rowId },
        data: {
          validationErrors: result.errors as unknown as object[],
          ...(shouldFlag ? { status: TRAINEE_ROW_STATUS.DUPLICATE_FLAGGED } : {}),
        },
      });
    }
  }

  private countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
    const counts = new Map<string, number>();
    for (const item of items) {
      const k = key(item);
      counts.set(k, (counts.get(k) || 0) + 1);
    }
    return counts;
  }

  private documentLabel(documentType: string): string {
    const labels: Record<string, string> = {
      national_id: 'الهوية الوطنية',
      internship_letter: 'خطاب الامتياز',
      academic_transcript: 'السجل الأكاديمي',
      medical_examination: 'الفحص الطبي',
      vaccination_record: 'سجل التطعيمات',
      cpr_certificate: 'شهادة الإنعاش القلبي',
      bls: 'شهادة BLS',
      acls: 'شهادة ACLS',
      license: 'الرخصة المهنية',
      additional: 'مرفقات إضافية',
    };
    return labels[documentType] || documentType;
  }
}
