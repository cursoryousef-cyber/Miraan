import { CAPABILITIES as C, capabilitiesForRoles } from './capabilities';

/**
 * عزل شخصية المتدرب.
 *
 * العميل يختار مساحة العمل باختبار الصلاحيات بترتيب ثابت، والمتدرب يصل إلى
 * آخر الترتيب لأنه لا يحمل أي صلاحية تُصعّده. هذه التأكيدات تثبّت ذلك: أي
 * صلاحية تُمنح للمتدرب لاحقًا وتقع في أحد البوابات السابقة ستكسر اختبارًا هنا
 * بدل أن تنقله بصمت إلى مساحة المدرب أو المستشفى أو التجمع.
 */
describe('عزل شخصية المتدرب', () => {
  const trainee = new Set(capabilitiesForRoles(['trainee']));

  // 1
  it('لا يحمل أي صلاحية تفتح مساحة التجمع', () => {
    for (const cap of [C.ALLOCATION_CLUSTER_AUTO, C.ALLOCATION_CLUSTER_MANUAL, C.ALLOCATION_CLUSTER_REASSIGN]) {
      expect(trainee.has(cap)).toBe(false);
    }
  });

  // 2
  it('لا يحمل أي صلاحية تفتح مساحة التدريب بالمستشفى', () => {
    for (const cap of [C.TRAINEE_VIEW_HOSPITAL, C.DEPARTMENT_MANAGE, C.ALLOCATION_HOSPITAL_ASSIGN]) {
      expect(trainee.has(cap)).toBe(false);
    }
  });

  // 3
  it('لا يحمل صلاحية المدرب على المتدربين المسندين', () => {
    expect(trainee.has(C.TRAINEE_VIEW_ASSIGNED)).toBe(false);
  });

  // 4
  it('لا يعتمد سجلات ولا يرسل تقييمات — هذان فعلا المدرب', () => {
    expect(trainee.has(C.LOGBOOK_APPROVE)).toBe(false);
    expect(trainee.has(C.EVALUATION_SUBMIT)).toBe(false);
  });

  // 5
  it('لا يحمل org.view ولا org_member.manage، وهما بوابتا الإدارة', () => {
    expect(trainee.has(C.ORG_VIEW)).toBe(false);
    expect(trainee.has(C.ORG_MEMBER_MANAGE)).toBe(false);
  });

  // 6
  it('يحمل ما يحتاجه فعلًا: عرض نفسه، وتقديم السجل وقراءته، وعرض الجدول', () => {
    expect(trainee.has(C.SELF_VIEW)).toBe(true);
    expect(trainee.has(C.LOGBOOK_SUBMIT)).toBe(true);
    expect(trainee.has(C.LOGBOOK_VIEW)).toBe(true);
    expect(trainee.has(C.SCHEDULE_VIEW)).toBe(true);
  });

  // 7
  it('لا يحمل صلاحية إنشاء طلب تدريب — تلك للجامعة', () => {
    expect(trainee.has(C.TRAINING_REQUEST_CREATE)).toBe(false);
  });

  // 8
  it('لا يحمل صلاحية الإشراف الأكاديمي على المتدربين المبتعثين', () => {
    expect(trainee.has(C.TRAINEE_VIEW_SPONSORED)).toBe(false);
  });

  // 9
  it('مجموعة صلاحياته لا تتقاطع مع أي بوابة تسبق المتدرب في الترتيب', () => {
    const gates = [
      C.ORG_VIEW, C.ORG_MEMBER_MANAGE,
      C.ALLOCATION_CLUSTER_AUTO, C.ALLOCATION_CLUSTER_MANUAL, C.ALLOCATION_CLUSTER_REASSIGN,
      C.TRAINING_REQUEST_CREATE, C.TRAINEE_VIEW_ASSIGNED,
      C.TRAINEE_VIEW_HOSPITAL, C.DEPARTMENT_MANAGE, C.ALLOCATION_HOSPITAL_ASSIGN,
      C.INCIDENT_MANAGE, C.TRAINEE_VIEW_SPONSORED,
    ];
    expect(gates.filter((g) => trainee.has(g))).toEqual([]);
  });

  // 10
  it('صلاحيات المدرب والمستشفى والتجمع لم تتأثر', () => {
    expect(new Set(capabilitiesForRoles(['trainer'])).has(C.TRAINEE_VIEW_ASSIGNED)).toBe(true);
    expect(new Set(capabilitiesForRoles(['hospital_training_admin'])).has(C.TRAINEE_VIEW_HOSPITAL)).toBe(true);
    expect(new Set(capabilitiesForRoles(['cluster_manager'])).has(C.ALLOCATION_CLUSTER_AUTO)).toBe(true);
  });
});
