import {
  Award, GraduationCap, LayoutDashboard, Network, Stethoscope, UserCog, Users,
  Building2, ClipboardList, FolderGit2, FileSpreadsheet, BookOpen, AlertTriangle,
  Shield, Key, Activity, GitMerge, Settings, FileSignature, BellRing, UsersRound,
  Route, PhoneCall, Send, Inbox, CheckSquare, RotateCcw, Megaphone, CalendarDays,
  ArrowRightLeft,
} from 'lucide-react';

/**
 * Role identity.
 *
 * Six canonical roles are supported:
 *   1. cluster_manager       → مدير تدريب التجمع
 *   2. hospital_training_admin → مدير تدريب المستشفى
 *   3. trainer               → المدرب السريري
 *   4. trainee               → المتدرب
 *   5. academic_supervisor   → المشرف الأكاديمي
 *   6. system_admin / platform_owner → مسؤول النظام
 *
 * training_supervisor and department_head are NOT roles and are not mapped here.
 */

export interface NavItem {
  name: string;
  path: string;
  icon: any;
  requires?: string[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export interface RoleIdentity {
  key: string;
  label: string;
  eyebrow: string;
  tagline: string;
  icon: any;
  accent: string;
  accentSoft: string;
  landing: string;
  nav: NavSection[];
}

// ── مدير المستشفى الإداري (non-training) ─────────────────────────────────
// Not a training identity and deliberately not a dashboard: hospital training
// belongs to hospital_training_admin alone. This maps the role to the
// non-training pages it is already authorised for, so it never lands on — or is
// labelled as — a trainee console.
const HOSPITAL_ADMIN_NAV: NavSection[] = [
  {
    title: 'إدارة المستشفى',
    items: [
      { name: 'أعضاء الجهة', path: '/org-members', icon: UsersRound },
      { name: 'البلاغات والحوادث', path: '/incidents', icon: AlertTriangle },
      { name: 'التقارير', path: '/reports', icon: FileSpreadsheet, requires: ['report.view'] },
    ],
  },
];

// ── 1. مسؤول النظام (System Admin / Platform Owner) ──────────────────────
const PLATFORM_NAV: NavSection[] = [
  {
    title: 'الحوكمة الوطنية',
    items: [
      { name: 'مركز التحكم الوطني', path: '/', icon: LayoutDashboard },
      { name: 'الجهات والتجمعات', path: '/organizations', icon: Building2 },
    ],
  },
  {
    title: 'الهوية والصلاحيات',
    items: [
      { name: 'المستخدمون والحسابات', path: '/users', icon: Users },
      { name: 'الأدوار والصلاحيات', path: '/roles-management', icon: Key },
      { name: 'سجلات التدقيق', path: '/audit-logs', icon: Shield },
    ],
  },
  {
    title: 'تشغيل المنصة',
    items: [
      { name: 'سلامة الخدمات', path: '/health-monitor', icon: Activity },
      { name: 'محرك سير العمل', path: '/workflows', icon: GitMerge },
      { name: 'السياسات', path: '/policies', icon: FileSignature },
      { name: 'التكاملات', path: '/integrations', icon: GitMerge },
      { name: 'الإعدادات', path: '/settings', icon: Settings },
    ],
  },
];

// ── 2. مدير تدريب التجمع ─────────────────────────────────────────────────
const CLUSTER_NAV: NavSection[] = [
  {
    title: 'دورة التدريب',
    items: [
      { name: 'لوحة التجمع', path: '/', icon: Network },
      { name: 'النداءات والفعاليات', path: '/training-events', icon: Megaphone, requires: ['training.operate'] },
      {
        name: 'الطلبات الواردة', path: '/affiliations?tab=incoming', icon: FolderGit2,
        requires: ['training_request.review'],
      },
      {
        name: 'الطلبات المرسلة للمستشفيات', path: '/affiliations?tab=sent', icon: Send,
        requires: ['training_request.review'],
      },
      {
        name: 'الدفعات الأكاديمية', path: '/intakes', icon: ClipboardList,
        requires: ['academic_batch.manage'],
      },
      {
        name: 'توزيع المتدربين', path: '/cluster-trainees', icon: GraduationCap,
        requires: ['allocation.cluster.auto', 'allocation.cluster.manual'],
      },
    ],
  },
  {
    title: 'الشبكة والسعة',
    items: [
      { name: 'المستشفيات والسعة', path: '/organizations', icon: Building2, requires: ['capacity.view'] },
      { name: 'كتالوج البرامج التدريبية', path: '/programs', icon: BookOpen },
    ],
  },
  {
    title: 'المتابعة',
    items: [
      { name: 'البلاغات والحوادث', path: '/incidents', icon: AlertTriangle, requires: ['incident.view'] },
      { name: 'التقارير', path: '/reports', icon: FileSpreadsheet, requires: ['report.view'] },
    ],
  },
];

// ── 3. مدير تدريب المستشفى ───────────────────────────────────────────────
const HOSPITAL_TRAINING_NAV: NavSection[] = [
  {
    title: 'العمليات التدريبية',
    items: [
      { name: 'لوحة التدريب بالمستشفى', path: '/', icon: Stethoscope },
      { name: 'النداءات والفعاليات', path: '/training-events', icon: Megaphone, requires: ['training.operate'] },
      { name: 'مساحة عمل المستشفى', path: '/hospital', icon: Stethoscope, requires: ['training.operate'] },
      // Shifts are sessions inside a schedule (ScheduleBuilder authors shiftType),
      // so the schedules section is also the shifts surface — the label says so.
      { name: 'الجداول التدريبية والشفتات', path: '/hospital?tab=schedules', icon: LayoutDashboard, requires: ['schedule.view'] },
      { name: 'أعضاء الجهة', path: '/org-members', icon: UsersRound, requires: ['org_member.view'] },
    ],
  },
  {
    title: 'الطلبات والمتدربون',
    items: [
      {
        name: 'طلبات التدريب الواردة', path: '/hospital?tab=requests', icon: Inbox,
        requires: ['trainee.view.hospital'],
      },
      {
        name: 'المتدربون والتوزيع', path: '/hospital?tab=trainers', icon: UsersRound,
        requires: ['trainee.view.hospital'],
      },
    ],
  },
  {
    title: 'الأقسام والمدربون',
    items: [
      {
        name: 'الأقسام والسعة', path: '/hospital?tab=capacity', icon: ClipboardList,
        requires: ['capacity.manage'],
      },
      {
        name: 'بطاقات المدربين', path: '/hospital?tab=trainers', icon: UsersRound,
        requires: ['trainer.manage'],
      },
      {
        name: 'إعادة إسناد المدربين', path: '/hospital?tab=reassignment', icon: ArrowRightLeft,
        requires: ['trainer.manage'],
      },
    ],
  },
  {
    title: 'المتابعة والتقييم',
    items: [
      { name: 'السجل السريري', path: '/logbook', icon: BookOpen, requires: ['logbook.view'] },
      // The evaluation-forms section already exists in the workspace; only the
      // sidebar entry was missing.
      { name: 'التقييمات', path: '/hospital?tab=eval-forms', icon: CheckSquare, requires: ['training.operate'] },
      { name: 'التخرج والاعتماد', path: '/hospital?tab=graduation', icon: GraduationCap },
      { name: 'البلاغات', path: '/incidents', icon: AlertTriangle, requires: ['incident.view'] },
      { name: 'التقارير', path: '/reports', icon: FileSpreadsheet, requires: ['report.view'] },
    ],
  },
];

// ── 4. المدرب السريري ────────────────────────────────────────────────────
const TRAINER_NAV: NavSection[] = [
  {
    title: 'يومي',
    items: [
      { name: 'لوحة المدرب', path: '/', icon: UserCog },
      { name: 'فعاليات متدربيّ', path: '/training-events', icon: Megaphone, requires: ['training.operate'] },
      { name: 'الفعاليات الواردة', path: '/my-training-events', icon: Inbox },
      // Labelled «متدربيّ» this pointed at /org-members, which is the
      // organisation staff directory — it returned all 12 members of the
      // hospital including the administrator, the academic supervisor and the
      // other trainer. Presenting that as "my trainees" is the org-members
      // substitution the trainee list must never rely on. The trainer's actual
      // assigned trainees come from /operations/trainer/assigned-interns and
      // are listed on the trainer dashboard; this entry now says what the
      // screen it opens really is. Read access here is unchanged and every
      // write on it already answers 403 to a trainer.
      { name: 'أعضاء الجهة', path: '/org-members', icon: UsersRound },
      { name: 'جدولي والشفتات', path: '/schedules', icon: CalendarDays, requires: ['schedule.view'] },
      { name: 'سلسلة القبول', path: '/acceptance-chain', icon: CheckSquare },
      // /calls was reachable only from a dashboard quick action, so the screen
      // that launches and runs M-CALL had no entry in the trainer's own nav.
      { name: 'نداءات M-CALL', path: '/calls', icon: Megaphone },
      { name: 'النداءات والإشعارات', path: '/notifications', icon: BellRing },
    ],
  },
  {
    title: 'التوثيق',
    items: [
      { name: 'السجل السريري', path: '/logbook', icon: BookOpen },
      { name: 'البلاغات', path: '/incidents', icon: AlertTriangle },
    ],
  },
];

// ── 5. المتدرب ───────────────────────────────────────────────────────────
const TRAINEE_NAV: NavSection[] = [
  {
    title: 'رحلتي التدريبية',
    items: [
      { name: 'لوحتي', path: '/', icon: Route },
      { name: 'الفعاليات التدريبية', path: '/my-training-events', icon: Megaphone },
      // The trainee answers M-CALL (ack / on-way / arrived) on this screen; it
      // had no nav entry, so an incoming call alert had nowhere to be opened.
      { name: 'نداءات M-CALL', path: '/calls', icon: Megaphone },
      { name: 'جدولي والشفتات', path: '/schedules', icon: CalendarDays, requires: ['schedule.view'] },
      { name: 'السجل السريري', path: '/logbook', icon: BookOpen },
      { name: 'النداءات والإشعارات', path: '/notifications', icon: BellRing },
    ],
  },
  {
    title: 'مستنداتي',
    items: [
      { name: 'الإقرارات والبطاقة', path: '/declarations', icon: FileSignature },
      { name: 'البلاغات', path: '/incidents', icon: BellRing },
    ],
  },
];

// ── 6. المشرف الأكاديمي ──────────────────────────────────────────────────
const ACADEMIC_NAV: NavSection[] = [
  {
    title: 'الاعتماد الأكاديمي',
    items: [
      { name: 'لوحة الإشراف الأكاديمي', path: '/', icon: Award },
      { name: 'إدارة التخرج', path: '/graduation', icon: GraduationCap },
      { name: 'السجل السريري', path: '/logbook', icon: BookOpen },
    ],
  },
  {
    title: 'التقارير',
    items: [
      { name: 'التقارير والنتائج', path: '/reports', icon: FileSpreadsheet },
      { name: 'الدفعات الأكاديمية', path: '/intakes', icon: ClipboardList },
    ],
  },
];

// ── University (kept for sending side of workflow) ────────────────────────
const UNIVERSITY_NAV: NavSection[] = [
  {
    title: 'الإيفاد',
    items: [
      { name: 'لوحة الجامعة', path: '/', icon: GraduationCap },
      {
        name: 'طلبات التدريب', path: '/affiliations', icon: FolderGit2,
        requires: ['training_request.create', 'training_request.view'],
      },
      { name: 'الدفعات الأكاديمية', path: '/intakes', icon: ClipboardList },
    ],
  },
  {
    title: 'المتابعة',
    items: [
      { name: 'التصحيحات المُعادة', path: '/corrections', icon: RotateCcw },
      { name: 'أعضاء الجامعة', path: '/org-members', icon: UsersRound },
    ],
  },
];

const IDENTITIES: Record<string, RoleIdentity> = {
  platform: {
    key: 'platform', label: 'مسؤول النظام', eyebrow: 'SYSTEM ADMINISTRATION',
    tagline: 'حوكمة الجهات والتجمعات على مستوى المملكة',
    icon: LayoutDashboard, accent: '#0F766E', accentSoft: '#F0FDFA',
    landing: '/', nav: PLATFORM_NAV,
  },
  cluster: {
    key: 'cluster', label: 'مدير تدريب التجمع', eyebrow: 'CLUSTER TRAINING MANAGER',
    tagline: 'إدارة طلبات الجهات التابعة وإحالتها للمستشفيات',
    icon: Network, accent: '#0284C7', accentSoft: '#F0F9FF',
    landing: '/', nav: CLUSTER_NAV,
  },
  hospitalTraining: {
    key: 'hospitalTraining', label: 'مدير تدريب المستشفى',
    eyebrow: 'HOSPITAL TRAINING MANAGER',
    tagline: 'استقبال الطلبات، إسناد المدربين، خطة التدريب والجدول',
    icon: Stethoscope, accent: '#7C3AED', accentSoft: '#F5F3FF',
    landing: '/', nav: HOSPITAL_TRAINING_NAV,
  },
  trainer: {
    key: 'trainer', label: 'مدرب سريري', eyebrow: 'CLINICAL TRAINER',
    tagline: 'متابعة المتدربين المسندين وتوثيق التدريب',
    icon: UserCog, accent: '#059669', accentSoft: '#ECFDF5',
    landing: '/', nav: TRAINER_NAV,
  },
  hospitalAdmin: {
    key: 'hospitalAdmin', label: 'مدير المستشفى (إداري)',
    eyebrow: 'HOSPITAL ADMINISTRATION',
    tagline: 'إدارة أعضاء الجهة والبلاغات — بدون صلاحيات تدريبية',
    icon: Building2, accent: '#475569', accentSoft: '#F8FAFC',
    landing: '/org-members', nav: HOSPITAL_ADMIN_NAV,
  },
  trainee: {
    key: 'trainee', label: 'طبيب امتياز', eyebrow: 'MY TRAINING JOURNEY',
    tagline: 'رحلتك التدريبية وتقدمك نحو التخرج',
    icon: Route, accent: '#0D9488', accentSoft: '#F0FDFA',
    landing: '/', nav: TRAINEE_NAV,
  },
  academic: {
    key: 'academic', label: 'المشرف الأكاديمي', eyebrow: 'ACADEMIC SUPERVISION',
    tagline: 'مراجعة واعتماد نتائج البرامج التدريبية',
    icon: Award, accent: '#9333EA', accentSoft: '#FAF5FF',
    landing: '/', nav: ACADEMIC_NAV,
  },
  university: {
    key: 'university', label: 'منسق الجامعة', eyebrow: 'UNIVERSITY SPONSOR',
    tagline: 'إيفاد المتدربين ومتابعة مسارهم التدريبي',
    icon: GraduationCap, accent: '#B45309', accentSoft: '#FFFBEB',
    landing: '/', nav: UNIVERSITY_NAV,
  },
};

/**
 * Maps a backend role code onto its console identity.
 *
 * Unrecognised codes fall through to the trainee identity, which is the
 * narrowest console — an unknown role must never land on a wider one.
 */
export function roleIdentity(role?: string | null): RoleIdentity {
  switch (role) {
    case 'platform_owner':
    case 'system_admin':
    case 'holding_administrator':
    case 'org_manager':
      return IDENTITIES.platform;

    case 'cluster_administrator':
    case 'cluster_manager':
    case 'training_director':
      return IDENTITIES.cluster;

    case 'hospital_training_admin':
      return IDENTITIES.hospitalTraining;

    // Non-training hospital administration. Kept out of the training identities
    // above, and never resolved to the trainee console.
    case 'hospital_administrator':
      return IDENTITIES.hospitalAdmin;

    case 'academic_supervisor':
      return IDENTITIES.academic;

    case 'university_administrator':
    case 'academic_affairs':
      return IDENTITIES.university;

    case 'trainer':
      return IDENTITIES.trainer;

    case 'trainee':
    default:
      return IDENTITIES.trainee;
  }
}

export { PhoneCall, Users };
