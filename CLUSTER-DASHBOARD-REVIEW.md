# شاشة إدارة التجمع الصحي — تقرير المراجعة الشاملة
## Cluster Dashboard Comprehensive Review — Final Report

النطاق: كل شاشة وكل زر مرتبط بلوحة التجمع الصحي — **ClusterDashboard → Affiliations → AcademicIntakes → ClusterTrainees → Organizations**.
التحقق الكامل: Frontend → API → Controller → Service → Prisma → Scope/RBAC → DB → React Query، لكل حالة Loading/Empty/Error/Retry/Search/Filters/Details/Actions/Status/DB persistence. **كل زر اختُبر Runtime فعلياً** على الخادم الحي (port 10000) بحساب `cluster@miran.health` (cluster_manager).

---

## ROOT CAUSE

ثلاثة عيوب جوهرية جعلت أزرار شاشات التجمع إمّا «ميتة» أو تعرض بيانات خاطئة، وعيبان عرضيان:

1. **فقدان صامت للتوزيع (Assign) — أشدّها خطورة.** `UpdateTrainingRequestDto.allocations` كانت من النوع `any[]` **بدون** `@Type`. مع الـ `ValidationPipe` العام (`whitelist: true`، `transform: true`) يقوم class-transformer بتجريد كل كائن متداخل `{hospitalId, seats}` إلى `[[]]`. النتيجة: زر **توزيع** في شاشة الطلبات ينقل الطلب إلى `auto_allocated` لكن **يسقط أرقام المقاعد تماماً** من قاعدة البيانات. (أُكّد بالفعل: `allocations` في DB = `[[]]`).
2. **التوزيع الذكي لا يرى المستشفيات الهدف.** كل من fallback الـ `autoAllocate` و `allocationEngine.fetchHospitalCandidates` يستعلم بـ `parentId = targetOrgId`. لكن تدفق الإنشاء يضع `targetOrgId` = **المستشفى نفسه** لطلبات التجمع المباشرة (سطر `const targetOrgId = isClusterReq && dto.targetHospitalId ? dto.targetHospitalId : dto.targetOrgId;`). فكان `parentId: <مستشفى>` يطابق صفراً → «لا توجد مستشفيات مفعّلة تابعة للتجمع الصحي لتوزيع الطلاب عليها» — زر **Auto Allocate** يفشل دائماً لطلبات التجمع المنشأة محلياً.
3. **دليل الجهات يعرض عمود السعة المهجور.** `Organizations.tsx` يقرأ `organizations.capacity` (العمود الذي أُهمل وأصبح `0` لأن السعة تُدار على صفوف الأقسام عبر `CapacityService`). فيظهر «السعة 0 / متاح 0» لكل مستشفى بينما مؤشرات الـ KPIs فوقها تعرض القيم الصحيحة من `statistics`.
4. **عرضي:** `?type=hospital` على `/organizations` — الـ backend لا يعرف `type` (يعرف `typeId` فقط) فيرجع كل الجهات بما فيها التجمع نفسه، في قائمة المستشفيات المتاحة في الدفعات الأكاديمية.
5. **عرضي (ملاحظة نطاق، لم تُعالج):** `/organizations/tree` يرجع الشجرة الوطنية كاملة لأي دور عبر capability `org.view` بلا تصفية scope — لا يؤثر على لوحة التجمع (لا تستدعي tree) وتغييره تغيير سلوك RBAC/platform-wide خارج نطاق المهمة.

---

## FILES CHANGED

### Backend (3 ملفات)
| الملف | التغيير |
|---|---|
| `backend/src/modules/training-requests/dto/training-request.dto.ts` | إضافة `AllocationInputDto` + ربط `allocations` به عبر `@Type(() => AllocationInputDto)` + `@ValidateNested({ each: true })` — **إصلاح فقدان التوزيع**. |
| `backend/src/modules/training-requests/training-requests.service.ts` | fallback التوزيع الذكي: `OR: [{ id: targetOrgId }, { parentId: targetOrgId }]` بدل `parentId` فقط. |
| `backend/src/modules/training-requests/allocation-engine.service.ts` | `fetchHospitalCandidates`: نفس مجموعة «مستشفى أو تجمع» (`OR: [{id}, {parentId}]`). |

### Frontend (5 ملفات)
| الملف | التغيير |
|---|---|
| `frontend/src/pages/dashboards/ClusterDashboard.tsx` | مصدر السعة من `/organizations/hospitals-cards` (CapacityService) بدل عمود `capacity` المهجور؛ تصحيح فلاتر `pending` (`submitted|under_cluster_review|resubmitted`) و `awaitingAllocation` (`auto_allocated|manually_reallocated|allocated|hospital_returned_to_cluster`)؛ حالات تحميل للرسم البياني ولوحات الضغط. |
| `frontend/src/pages/Affiliations.tsx` | حذف الحالة الوهمية `under_review`؛ تصحيح عدّادات submitted/allocated/rejected إلى حالات الطلب الحقيقية. |
| `frontend/src/pages/AcademicIntakes.tsx` | إزالة `cluster_approved` (حالة صف لا حالة طلب) من شرط الطلبات المعتمدة؛ تصفية قائمة المستشفيات إلى `code === 'hospital'` (بدل `?type=` الصامت). |
| `frontend/src/pages/ClusterTrainees.tsx` | شارة حالة ديناميكية من `applicationStatus` الحقيقي بدل «موزع ومعتمد» الثابت؛ قيم fallback `'—'` بدل نصوص مخترعة؛ حجب زر الاستيراد لغير `CLUSTER_ROLES`. |
| `frontend/src/pages/Organizations.tsx` | دمج بطاقات المستشفيات (`hospitals-cards`) في الشجرة/البطاقات/الجدول/التفاصيل حتى يتفق الدليل مع الـ KPIs (سعة 95/مشغول 1 بدل 0/0). |

> ملاحظة: لا جديد في الحالة، ولا تغيير في RBAC/Capabilities، ولا Mock Data — كل التغييرات تقرأ مصدر حقيقة واحداً (`CapacityService` + آلة الحالة + الـ capabilities الموجودة).

---

## FEATURES IMPLEMENTED

| الميزة | قبل | بعد |
|---|---|---|
| تعيين المقاعد (Assign → PATCH) | الطلب ينتقل لـ `auto_allocated` لكن `allocations=[[]]` — المقاعد تضيع | التوزيع يُخزَّن كاملاً (hospitalId/seats/hospitalName) في DB ✓ |
| التوزيع الذكي لطلبات التجمع المحلية | يفشل دائماً «لا توجد مستشفيات مفعّلة» | يوزّع على المستشفى الهدف مباشرة (2 مقعد → برج الشمال) ✓ |
| لوحة التجمع KPIs | سعة من عمود مهجور | 3 مستشفيات / 95 / 1 مشغول / 94 متاح / 1% من `statistics` الموحّد ✓ |
| دليل الجهات (شجرة/بطاقات/جدول) | سعة 0 لكل مستشفى | سعة/إشغال حقيقية من CapacityService ✓ |
| قائمة المستشفيات في الدفعات الأكاديمية | تعرض التجمع ضمن «المستشفيات» | مستشفيات فقط ✓ |
| حالة المتدرب في ClusterTrainees | شارة ثابتة «موزع ومعتمد» كاذبة | شارة من `applicationStatus` الحقيقي ✓ |
| أزرار RBAC | زر الاستيراد يظهر لـ cluster_manager فيفشل 403 | مخفيّ (يظهر لـ CLUSTER_ROLES فقط) ✓ |

---

## BACKEND CHANGES

1. **`training-request.dto.ts`** — أُضيف `AllocationInputDto` (hospitalId مطلوب + hospitalName/hospitalCode/seats/departmentId اختيارية) وربط `UpdateTrainingRequestDto.allocations` به. الشرح في الكود: «Declared as its own class (not `any[]`) because the global ValidationPipe runs with `whitelist: true`: an untyped `any[]` gets its nested objects stripped to empty, silently dropping the seats on assign.»
2. **`training-requests.service.ts`** (fallback auto-allocate) — `where: { status:'active', deletedAt:null, OR:[{id:targetOrgId},{parentId:targetOrgId}] }` مع تعليق يشرح أن `targetOrgId` مستشفى في طلبات التجمع المحلية وأن النمط يطابق `getHospitalCardsMetrics`.
3. **`allocation-engine.service.ts`** (`fetchHospitalCandidates`) — نفس `OR` مع الحفاظ على قيد `onlyHospitalId`.

التغييرات كلها **إضافية/إصلاحية** ولا تمس آلة الحالة ولا الـ RBAC ولا بنية الجداول.

---

## FRONTEND CHANGES

- **ClusterDashboard.tsx**: `hospitals` من `hospitalCards`؛ `pending`/`awaitingAllocation` بحالات حقيقية فقط؛ `cardsLoading` للرسم ولوحات الضغط.
- **Affiliations.tsx**: حذف `under_review` من `statusMap`؛ تصحيح عدّادات الحالة؛ تعليقات تشرح أن `auto_allocated` هو الانتقال الصحيح من `submitted` وأن `allocated` تركة لا تُستخدم.
- **AcademicIntakes.tsx**: شرط المعتمدين = `approved` فقط (لا `cluster_approved`)؛ المستشفيات تُصفَّى بـ `organizationType?.code === 'hospital'`.
- **ClusterTrainees.tsx**: `statusChip` ديناميكي؛ fallback `'—'`؛ الاستيراد بحسب `hasAnyRole(['cluster_administrator','training_director','platform_owner'])`.
- **Organizations.tsx**: استعلام `hospitals-cards` + `capByOrg` ودمجه في الشجرة والبطاقات والجدول وديالوج التفاصيل.

---

## RUNTIME TEST

بيئة حية: `localhost:10000`، تسجيل دخول `cluster@miran.health` (cluster_manager، orgId=cb45aa50-8859-4e54-b32e-3903a7c28241). كل استدعاء أُرسل فعلياً ونتيجته أدناه:

| الزر / الشاشة | الاستدعاء | النتيجة الفعلية |
|---|---|---|
| لوحة: KPIs | `GET /organizations/statistics?organizationId=<cluster>` | 4 جهات / 3 مستشفيات / سعة 95 / 1 مشغول / 94 متاح / إشغال 1% |
| لوحة: إشغال المستشفيات | `GET /organizations/hospitals-cards` | 3 مستشفيات (برج 95/1، رفحاء 0، طريف 0) |
| لوحة: الأعمال المعلقة | `GET /training-requests` | 4 طلبات (3 approved + 1 returned) — الفلاتر تصحّ |
| لوحة: الخط الزمني | `GET /timeline/dashboard?scope=cluster` | traineeCount=1، بيانات جاهزة |
| الشؤون: التفاصيل | `GET /training-requests/:id` + `/trainees` | 200، الطلب + صفوفه |
| الشؤون: توزيع (Assign) | `PATCH /training-requests/:id {status:auto_allocated, allocations}` | **قبل الإصلاح: allocations=[[ ]]**، **بعد: {seats:5,hospitalId,hospitalName,hospitalCode} محفوظة في DB** ✓ |
| الشؤون: اعتماد | `POST /training-requests/:id/approve` | `auto_allocated` → `approved` («تمت الموافقة النهائية وتوثيق التوزيع») |
| الشؤون: رفض | `POST /training-requests/:id/reject` | **403** لـ cluster_manager (صحيح — الزر مخفيّ لدوره) |
| الشؤون: إعادة للجامعة | `POST /training-requests/:id/return-to-university` | **400** guard آلة الحالة («من returned_to_university إلى returned_to_university غير مسموح — المسموح: resubmitted») |
| الدفعات: إنشاء طلب | `POST /training-requests` | أنشأ TR-2026-0004 (submitted) |
| الدفعات: توزيع ذكي | `POST /training-requests/:id/auto-allocate` | **بعد الإصلاح**: «2 متدرب مُوزَّع» على برج الشمال (سعة 95، متاح 94) ✓ |
| الدفعات: اعتماد | `POST /training-requests/:id/approve` | TR-2026-0004 → approved |
| الدفعات: إنشاء دفعة | `POST /academic-intakes/from-request` | أنشأ BATCH-TR-2026-0002 مرتبطاً بالطلب |
| الدفعات: تفاصيل/أصل الدفعة | `GET /academic-intakes/:id` + `/provenance` | 200، بيانات الدفعة |
| المتدربون: القائمة | `GET /trainees/incoming` | 1 متدرب (active) |
| المتدربون: استيراد | `POST /training-requests/:id/trainees/import` | **403** لـ cluster_manager (صحيح — الزر مخفيّ) |
| المتدربون: إعادة توزيع | `POST /trainees/reallocate` | 409 «مُسند بالفعل لنفس المستشفى» + 409 «المستشفى لم يُعلن سعة» (الحراس يعملون)؛ المسار الموجب تحقّق في المهمة السابقة (Rotation + إشعار) |
| الجهات: القائمة | `GET /organizations` | 4 جهات — `capacity` المهجور = 0 (أُصلح عرضياً في الواجهة) |
| الجهات: الشجرة | `GET /organizations/tree` | 200 (جذران: HEALTH-HOLDING + NBU-UNIVERSITY) — ملاحظة نطاق دون معالجة |

> **تحفّظ أمانة:** اختباراتي Runtime أحرزت تقدم حقيقي لحالة البيانات: TR-2026-0002 و TR-2026-0004 أصبحا `approved` (كانا submitted/أنشئ للاختبار)، ولا يوجد حالياً طلب `submitted` — لذا ستعرض اللوحة «الطلبات الواردة 0 / بانتظار التوزيع 0» حتى يُنشأ طلب جديد. هذا انعكاس حقيقي وليس خطأ عرض.

---

## BUILD

| الفحص | النتيجة |
|---|---|
| `backend: npx tsc -p tsconfig.build.json` | PASS (بعد DTO fix و auto-allocate fix) |
| `frontend: npx tsc -b` | PASS |
| `frontend: npm run build` | PASS (✓ built in ~8s) |
| تشغيل backend على 10000 | PASS (Nest started، كل الـ routes mapped) |

**لم أتوقف عند Build PASS** — كل زر أعلاه تحقّق Runtime على الخادم الحي مع فحص الكتابة في قاعدة البيانات.

---

## MISSING BACKEND DOMAIN

- **لا يوجد Missing Backend Domain**: كل زر في الشاشات الخمس له endpoint حقيقي مُختبَر (200 أو حراسة صحيحة 400/403/409). لا Mock Data، لا localStorage كقاعدة بيانات، لا Status جديد، لا تغيير RBAC.
- **ملاحظات خارج نطاق المهمة (رُصدت ولم تُعالج):**
  1. `under_review` لا يزال يُستخدم حرفياً في `PlatformDashboard` / `UniversityDashboard` (حالة غير موجودة — ينبغي `under_cluster_review`/`submitted`).
  2. حروف `'returned'` / `'accepted'` في شاشات نطاق المستشفى (`AcceptanceChain` / `HospitalReview`) — خارج نطاق التجمع.
  3. `/organizations/tree` يعرض الشجرة الوطنية كاملة لأي دور مع `org.view` بلا تصفية scope — مسألة نطاق platform-wide.
  4. حقل `capacity` المهجور في `/organizations` قائمة — الواجهة تتجاوزه الآن عبر `hospitals-cards`؛ يمكن مستقبلاً إزالته من الـ service.
