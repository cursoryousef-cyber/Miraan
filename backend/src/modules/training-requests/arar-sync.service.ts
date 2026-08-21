import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ArarSyncService {
  private readonly logger = new Logger(ArarSyncService.name);

  constructor(private prisma: PrismaService) {}

  async syncArarDataset() {
    this.logger.log('Starting idempotent transactional sync for Arar Central Hospital dataset...');

    return this.prisma.$transaction(async (tx) => {
      const ARAR_HOSP_ID = '51bd8230-b093-4e9e-8bc2-4eb0661ddb80';
      const CLUSTER_ID = '91e5a67b-88c5-4883-9923-2c756db18b6c';
      const UNIV_ID = '8932ef75-33f1-466a-bc20-091fee910174';

      // ─── 1. TrainingRequests (3) ───────────────────────────────────────────
      const requestsData = [
        {
          id: '359b6583-b184-41f5-9b95-7e996b755c31',
          requestNumber: 'TR-2026-0006',
          sourceOrgId: CLUSTER_ID,
          targetOrgId: ARAR_HOSP_ID,
          programId: 'b05f33aa-35b5-412d-ac47-801e341ac64c',
          status: 'approved',
          studentCount: 4,
          priority: 'normal',
          notes: 'دفعة أطباء امتياز طب وجراحة محالين لمستشفى عرعر المركزي',
          createdAt: new Date('2026-08-16T10:00:00.000Z'),
          trainingStartDate: new Date('2026-09-01T00:00:00.000Z'),
          trainingEndDate: new Date('2027-08-31T23:59:59.000Z'),
        },
        {
          id: '6a9c0fc9-4b90-453c-9dea-1f683c60a597',
          requestNumber: 'TR-TEST-947515',
          sourceOrgId: UNIV_ID,
          targetOrgId: CLUSTER_ID,
          programId: 'c9f5ec8b-fcfe-4591-93fb-4362ed6463de',
          status: 'submitted',
          studentCount: 5,
          priority: 'normal',
          notes: 'طلب تدريب امتياز تمريض محال من الجامعة للتجمع وموزع على عرعر',
          createdAt: new Date('2026-08-17T08:00:00.000Z'),
          trainingStartDate: new Date('2026-09-01T00:00:00.000Z'),
          trainingEndDate: new Date('2027-08-31T23:59:59.000Z'),
        },
        {
          id: '3fecb606-a8b6-40a1-b38a-661e999f909d',
          requestNumber: 'TR-TEST-961323',
          sourceOrgId: UNIV_ID,
          targetOrgId: CLUSTER_ID,
          programId: 'c9f5ec8b-fcfe-4591-93fb-4362ed6463de',
          status: 'submitted',
          studentCount: 1,
          priority: 'normal',
          notes: 'طلب تدريب تكميلي محال لمستشفى عرعر المركزي',
          createdAt: new Date('2026-08-17T09:00:00.000Z'),
          trainingStartDate: new Date('2026-09-01T00:00:00.000Z'),
          trainingEndDate: new Date('2027-08-31T23:59:59.000Z'),
        },
      ];

      for (const req of requestsData) {
        let programId = req.programId;
        if (programId) {
          const prog = await tx.program.findUnique({ where: { id: programId } });
          if (!prog) programId = null as any;
        }

        await tx.trainingRequest.upsert({
          where: { id: req.id },
          create: {
            id: req.id,
            requestNumber: req.requestNumber,
            sourceOrgId: req.sourceOrgId,
            targetOrgId: req.targetOrgId,
            programId: programId,
            status: req.status,
            studentCount: req.studentCount,
            priority: req.priority,
            notes: req.notes,
            createdAt: req.createdAt,
            trainingStartDate: req.trainingStartDate,
            trainingEndDate: req.trainingEndDate,
          },
          update: {
            requestNumber: req.requestNumber,
            sourceOrgId: req.sourceOrgId,
            targetOrgId: req.targetOrgId,
            status: req.status,
            studentCount: req.studentCount,
            trainingStartDate: req.trainingStartDate,
            trainingEndDate: req.trainingEndDate,
          },
        });
      }

      // ─── 2. Persons (9) ───────────────────────────────────────────────────
      const personsData = [
        { id: '7664f92e-6b74-43aa-9128-5fff6774b04c', nationalId: '1098765432', nameAr: 'أحمد علي الشهري', nameEn: 'Ahmed Ali Al-Shehri', email: '441001@trainee.miran.health', phone: '0501111101' },
        { id: 'b29e2293-2fc9-43ec-8803-85000313d232', nationalId: '1098765433', nameAr: 'سارة محمد العتيبي', nameEn: 'Sara Mohammed Al-Otaibi', email: 'trainee.arar@miran.sa', phone: '0501111102' },
        { id: '5eb7473b-d3bc-4535-bf6f-0e6961d63049', nationalId: '1098765434', nameAr: 'فهد خالد الشمري', nameEn: 'Fahad Khalid Al-Shammari', email: '441003@trainee.miran.health', phone: '0501111103' },
        { id: '65f265b4-b3db-47de-9d59-e273f3b393dc', nationalId: '1098765435', nameAr: 'مريم عبد الله الغامدي', nameEn: 'Maryam Abdullah Al-Ghamdi', email: '441004@trainee.miran.health', phone: '0501111104' },
        { id: '35f31f29-e9ef-49cc-a32a-0c2d37c08b3b', nationalId: '1199947515', nameAr: 'متدرب تجريبي 947515', nameEn: 'Test Trainee 947515', email: 'trainee.test.947515@university.edu.sa', phone: '0559947515' },
        { id: '462a0a2d-6191-4af5-abc0-8fa0b76da5ed', nationalId: '1199961323', nameAr: 'متدرب تجريبي 961323', nameEn: 'Test Trainee 961323', email: 'trainee.test.961323@university.edu.sa', phone: '0559961323' },
        { id: '4bd25c8d-0d4a-4f75-9f63-2a0a7ef39dfa', nationalId: '1105998199', nameAr: 'متدرب لايف 059981', nameEn: 'Live Trainee 059981', email: 'live.trainee.059981@test.local', phone: '0550059981' },
        { id: '8980b696-be9c-4589-8af4-76ddd913db04', nationalId: '1108808699', nameAr: 'متدرب لايف 088086', nameEn: 'Live Trainee 088086', email: 'live.trainee.088086@test.local', phone: '0550088086' },
        { id: '1bfee00d-5195-44f2-86fd-ca77470ef6a5', nationalId: '1110113899', nameAr: 'متدرب لايف 101138', nameEn: 'Live Trainee 101138', email: 'live.trainee.101138@test.local', phone: '0550101138' },
      ];

      for (const p of personsData) {
        await tx.person.upsert({
          where: { nationalId: p.nationalId },
          create: {
            id: p.id,
            nationalId: p.nationalId,
            nameAr: p.nameAr,
            nameEn: p.nameEn,
            email: p.email,
            phone: p.phone,
          },
          update: {
            nameAr: p.nameAr,
            nameEn: p.nameEn,
            email: p.email,
            phone: p.phone,
          },
        });
      }

      // ─── 3. UserAccounts (9) ──────────────────────────────────────────────
      const defaultHash = '$2b$10$04t5G/4Z3Y45mB9.x99yKujd.i27rD/tI8uXgR5i7Vq.JjVb4/y9u'; // Dev standard hash
      const accountsData = [
        { id: '7bdfcabb-3e1c-4a84-ad23-cb628375d36b', personId: '7664f92e-6b74-43aa-9128-5fff6774b04c', email: '441001@trainee.miran.health', username: '1098765432' },
        { id: '572d75a7-790f-4b50-ad50-d660cba4ac43', personId: 'b29e2293-2fc9-43ec-8803-85000313d232', email: 'trainee.arar@miran.sa', username: 'trainee_arar' },
        { id: '22ad8e89-31fd-44de-bb2d-be41364ec5da', personId: '5eb7473b-d3bc-4535-bf6f-0e6961d63049', email: '441003@trainee.miran.health', username: '1098765434' },
        { id: 'c6ea94e3-ea40-40ec-a9d5-b172d1e802ef', personId: '65f265b4-b3db-47de-9d59-e273f3b393dc', email: '441004@trainee.miran.health', username: '1098765435' },
        { id: 'f8e3241c-fa4a-4b04-9986-d27b0efff540', personId: '35f31f29-e9ef-49cc-a32a-0c2d37c08b3b', email: 'trainee.test.947515@university.edu.sa', username: '1199947515' },
        { id: '776942f3-60a1-4e7d-ae67-815af8714c98', personId: '462a0a2d-6191-4af5-abc0-8fa0b76da5ed', email: 'trainee.test.961323@university.edu.sa', username: '1199961323' },
        { id: '46be80d2-526d-4fec-81af-3de1a94907cc', personId: '4bd25c8d-0d4a-4f75-9f63-2a0a7ef39dfa', email: 'live.trainee.059981@test.local', username: '1105998199' },
        { id: '3b6a9793-7f97-4684-905a-22794c730302', personId: '8980b696-be9c-4589-8af4-76ddd913db04', email: 'live.trainee.088086@test.local', username: '1108808699' },
        { id: 'd37abea8-2cb6-4f99-83fd-031c8e4dec1d', personId: '1bfee00d-5195-44f2-86fd-ca77470ef6a5', email: 'live.trainee.101138@test.local', username: '1110113899' },
      ];

      for (const acc of accountsData) {
        const existing = await tx.userAccount.findUnique({ where: { email: acc.email } });
        if (!existing) {
          await tx.userAccount.create({
            data: {
              id: acc.id,
              personId: acc.personId,
              email: acc.email,
              username: acc.username,
              passwordHash: defaultHash,
              isActive: true,
              isEmailVerified: true,
              activatedAt: new Date(),
            },
          });
        }
      }

      // ─── 4. TraineeProfiles (9) ───────────────────────────────────────────
      const profilesData = [
        { id: '875b2731-8337-45e4-873a-acbe04d3584c', personId: '7664f92e-6b74-43aa-9128-5fff6774b04c', traineeNumber: '441001', applicationStatus: 'approved', specialtyAr: 'طب بشري عام', level: '1' },
        { id: '067793f3-5172-4911-b031-d53a14eb05ed', personId: 'b29e2293-2fc9-43ec-8803-85000313d232', traineeNumber: 'TR-441002', applicationStatus: 'active', specialtyAr: 'طب بشري عام', level: '1' },
        { id: '8d06995b-f98b-49a0-bab9-e290e48b0b02', personId: '5eb7473b-d3bc-4535-bf6f-0e6961d63049', traineeNumber: '441003', applicationStatus: 'active', specialtyAr: 'طب بشري عام', level: '1' },
        { id: '855cc4c2-4996-4527-a6ae-329381b5279f', personId: '65f265b4-b3db-47de-9d59-e273f3b393dc', traineeNumber: '441004', applicationStatus: 'approved', specialtyAr: 'طب بشري عام', level: '1' },
        { id: '6b048296-a0f1-4f52-815a-da5590af1148', personId: '35f31f29-e9ef-49cc-a32a-0c2d37c08b3b', traineeNumber: 'AC-947515', applicationStatus: 'approved', specialtyAr: 'تمريض عام', level: '1' },
        { id: 'a9efb846-65e8-45e7-8767-7bef70b36008', personId: '462a0a2d-6191-4af5-abc0-8fa0b76da5ed', traineeNumber: 'AC-961323', applicationStatus: 'approved', specialtyAr: 'تمريض عام', level: '1' },
        { id: '9ee216e4-5abe-44fa-b366-225582b83318', personId: '4bd25c8d-0d4a-4f75-9f63-2a0a7ef39dfa', traineeNumber: 'AC-059981', applicationStatus: 'approved', specialtyAr: 'تمريض عام', level: '1' },
        { id: 'd07fcfb6-0771-4c3f-942e-f904a1f8672a', personId: '8980b696-be9c-4589-8af4-76ddd913db04', traineeNumber: 'AC-088086', applicationStatus: 'approved', specialtyAr: 'تمريض عام', level: '1' },
        { id: '84f5003b-a0d9-4a48-9d1e-8b95a28d552a', personId: '1bfee00d-5195-44f2-86fd-ca77470ef6a5', traineeNumber: 'AC-101138', applicationStatus: 'approved', specialtyAr: 'تمريض عام', level: '1' },
      ];

      for (const pr of profilesData) {
        await tx.traineeProfile.upsert({
          where: { id: pr.id },
          create: {
            id: pr.id,
            personId: pr.personId,
            organizationId: ARAR_HOSP_ID,
            traineeNumber: pr.traineeNumber,
            applicationStatus: pr.applicationStatus,
            specialtyAr: pr.specialtyAr,
            level: pr.level,
          },
          update: {
            organizationId: ARAR_HOSP_ID,
            applicationStatus: pr.applicationStatus,
          },
        });
      }

      // ─── 5. TrainingRequestTrainees (10) ──────────────────────────────────
      const DEPT_MED = '76112174-5f5f-4cba-b47a-7d21f94e1c6c';
      const DEPT_SURG = '92aac634-40e4-43a9-9b5a-107555ba441a';
      const TRN_SARIHI = 'fd270a34-e930-45a4-8283-7166b3473363';
      const TRN_FAWAZ = 'f5a63f78-5cd4-4d7d-bccd-b11a8049173c';

      let deptMedId: string | null = DEPT_MED;
      let deptSurgId: string | null = DEPT_SURG;
      const deptMed = await tx.department.findUnique({ where: { id: DEPT_MED } });
      if (!deptMed) {
        const found = await tx.department.findFirst({ where: { organizationId: ARAR_HOSP_ID, nameAr: { contains: 'باطنة' } } });
        deptMedId = found ? found.id : null;
      }
      const deptSurg = await tx.department.findUnique({ where: { id: DEPT_SURG } });
      if (!deptSurg) {
        const found = await tx.department.findFirst({ where: { organizationId: ARAR_HOSP_ID, nameAr: { contains: 'جراحة' } } });
        deptSurgId = found ? found.id : null;
      }

      let trnSarihiId: string | null = TRN_SARIHI;
      let trnFawazId: string | null = TRN_FAWAZ;
      const trnSarihi = await tx.trainerProfile.findUnique({ where: { id: TRN_SARIHI } });
      if (!trnSarihi) {
        const found = await tx.trainerProfile.findFirst({ where: { organizationId: ARAR_HOSP_ID } });
        trnSarihiId = found ? found.id : null;
      }
      const trnFawaz = await tx.trainerProfile.findUnique({ where: { id: TRN_FAWAZ } });
      if (!trnFawaz) {
        trnFawazId = trnSarihiId;
      }

      const trtsData = [
        { id: 'ead706f1-4312-4114-82b9-5a5c84194d3f', trainingRequestId: '359b6583-b184-41f5-9b95-7e996b755c31', nationalId: '1098765432', academicNumber: '441001', nameAr: 'أحمد علي الشهري', status: 'hospital_accepted', personId: '7664f92e-6b74-43aa-9128-5fff6774b04c', profileId: '875b2731-8337-45e4-873a-acbe04d3584c', deptId: deptMedId, trainerId: trnSarihiId, specialty: 'طب بشري عام' },
        { id: 'dfb715eb-13cd-48f1-a643-9d04b0d86596', trainingRequestId: '359b6583-b184-41f5-9b95-7e996b755c31', nationalId: '1098765433', academicNumber: '441002', nameAr: 'سارة محمد العتيبي', status: 'active', personId: 'b29e2293-2fc9-43ec-8803-85000313d232', profileId: '067793f3-5172-4911-b031-d53a14eb05ed', deptId: deptMedId, trainerId: trnSarihiId, specialty: 'طب بشري عام' },
        { id: '0e3e7bd4-1061-461d-9bb4-f1ab12955f31', trainingRequestId: '359b6583-b184-41f5-9b95-7e996b755c31', nationalId: '1098765434', academicNumber: '441003', nameAr: 'فهد خالد الشمري', status: 'active', personId: '5eb7473b-d3bc-4535-bf6f-0e6961d63049', profileId: '8d06995b-f98b-49a0-bab9-e290e48b0b02', deptId: deptMedId, trainerId: trnFawazId, specialty: 'طب بشري عام' },
        { id: 'd40ffea1-9bc2-47db-9b45-80bd92781a30', trainingRequestId: '359b6583-b184-41f5-9b95-7e996b755c31', nationalId: '1098765435', academicNumber: '441004', nameAr: 'مريم عبد الله الغامدي', status: 'hospital_accepted', personId: '65f265b4-b3db-47de-9d59-e273f3b393dc', profileId: '855cc4c2-4996-4527-a6ae-329381b5279f', deptId: deptSurgId, trainerId: trnSarihiId, specialty: 'طب بشري عام' },
        { id: '13f556bf-23b5-4fb4-8a40-0d99be884946', trainingRequestId: '6a9c0fc9-4b90-453c-9dea-1f683c60a597', nationalId: '1199947515', academicNumber: '1199947515', nameAr: 'متدرب تجريبي 947515', status: 'allocated', personId: '35f31f29-e9ef-49cc-a32a-0c2d37c08b3b', profileId: '6b048296-a0f1-4f52-815a-da5590af1148', deptId: deptMedId, trainerId: trnSarihiId, specialty: 'تمريض عام' },
        { id: '8b7a175a-a7d0-4f03-bc39-35f10c0e767c', trainingRequestId: '3fecb606-a8b6-40a1-b38a-661e999f909d', nationalId: '1199961323', academicNumber: '1199961323', nameAr: 'متدرب تجريبي 961323', status: 'allocated', personId: '462a0a2d-6191-4af5-abc0-8fa0b76da5ed', profileId: 'a9efb846-65e8-45e7-8767-7bef70b36008', deptId: deptMedId, trainerId: trnSarihiId, specialty: 'تمريض عام' },
        { id: 'e662e445-ea1b-4699-84bd-0f668210c97e', trainingRequestId: '6a9c0fc9-4b90-453c-9dea-1f683c60a597', nationalId: '1104788699', academicNumber: '1104788699', nameAr: 'متدرب لايف 047886', status: 'hospital_review', personId: null, profileId: null, deptId: null, trainerId: null, specialty: 'تمريض عام' },
        { id: '6ab09606-03dc-4375-8a6b-70c7c2d5fd85', trainingRequestId: '6a9c0fc9-4b90-453c-9dea-1f683c60a597', nationalId: '1105998199', academicNumber: '1105998199', nameAr: 'متدرب لايف 059981', status: 'hospital_accepted', personId: '4bd25c8d-0d4a-4f75-9f63-2a0a7ef39dfa', profileId: '9ee216e4-5abe-44fa-b366-225582b83318', deptId: null, trainerId: null, specialty: 'تمريض عام' },
        { id: '38b1f27c-536f-4555-8892-eab97904193b', trainingRequestId: '6a9c0fc9-4b90-453c-9dea-1f683c60a597', nationalId: '1108808699', academicNumber: '1108808699', nameAr: 'متدرب لايف 088086', status: 'hospital_accepted', personId: '8980b696-be9c-4589-8af4-76ddd913db04', profileId: 'd07fcfb6-0771-4c3f-942e-f904a1f8672a', deptId: null, trainerId: null, specialty: 'تمريض عام' },
        { id: '20398081-bf8a-4638-9898-1fde81b08d10', trainingRequestId: '6a9c0fc9-4b90-453c-9dea-1f683c60a597', nationalId: '1110113899', academicNumber: '1110113899', nameAr: 'متدرب لايف 101138', status: 'hospital_accepted', personId: '1bfee00d-5195-44f2-86fd-ca77470ef6a5', profileId: '84f5003b-a0d9-4a48-9d1e-8b95a28d552a', deptId: null, trainerId: null, specialty: 'تمريض عام' },
      ];

      for (const t of trtsData) {
        await tx.trainingRequestTrainee.upsert({
          where: { id: t.id },
          create: {
            id: t.id,
            trainingRequestId: t.trainingRequestId,
            assignedHospitalId: ARAR_HOSP_ID,
            nationalId: t.nationalId,
            academicNumber: t.academicNumber,
            nameAr: t.nameAr,
            status: t.status,
            personId: t.personId,
            traineeProfileId: t.profileId,
            assignedDepartmentId: t.deptId,
            assignedTrainerProfileId: t.trainerId,
            specialty: t.specialty,
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2027-08-31T23:59:59.000Z'),
          },
          update: {
            assignedHospitalId: ARAR_HOSP_ID,
            status: t.status,
            personId: t.personId,
            traineeProfileId: t.profileId,
            assignedDepartmentId: t.deptId,
            assignedTrainerProfileId: t.trainerId,
            specialty: t.specialty,
          },
        });
      }

      // ─── 6. Rotations (4) ─────────────────────────────────────────────────
      const rotationsData = [
        { id: '99af7c5d-7ca2-4a7e-bca8-00ac1b20e1f5', traineeProfileId: '067793f3-5172-4911-b031-d53a14eb05ed', status: 'active', deptId: deptMedId, trainerId: trnSarihiId, title: 'روتيشن الباطنة السريرية' },
        { id: '0f2b8e16-e5bf-4582-b1d8-105719139ff0', traineeProfileId: '8d06995b-f98b-49a0-bab9-e290e48b0b02', status: 'active', deptId: deptMedId, trainerId: trnFawazId, title: 'روتيشن الباطنة العامة' },
        { id: 'abe8a680-b8aa-492e-a01b-f2fac1e58a57', traineeProfileId: '6b048296-a0f1-4f52-815a-da5590af1148', status: 'scheduled', deptId: deptMedId, trainerId: trnSarihiId, title: 'روتيشن التمريض العام' },
        { id: 'acdd53cb-524e-4a12-8eb8-c606be05b283', traineeProfileId: 'a9efb846-65e8-45e7-8767-7bef70b36008', status: 'scheduled', deptId: deptMedId, trainerId: trnSarihiId, title: 'روتيشن التمريض السريري' },
      ];

      for (const rot of rotationsData) {
        if (!rot.deptId || !rot.trainerId) continue;
        await tx.rotation.upsert({
          where: { id: rot.id },
          create: {
            id: rot.id,
            organizationId: ARAR_HOSP_ID,
            traineeProfileId: rot.traineeProfileId,
            departmentId: rot.deptId,
            trainerProfileId: rot.trainerId,
            status: rot.status,
            startDate: new Date('2026-09-01T00:00:00.000Z'),
            endDate: new Date('2027-08-31T23:59:59.000Z'),
          },
          update: {
            organizationId: ARAR_HOSP_ID,
            status: rot.status,
            departmentId: rot.deptId,
            trainerProfileId: rot.trainerId,
          },
        });
      }

      return {
        success: true,
        message: 'تمت مزامنة بيانات مستشفى عرعر المركزي بنجاح وبشكل متكامل',
        counts: {
          requests: requestsData.length,
          trts: trtsData.length,
          persons: personsData.length,
          profiles: profilesData.length,
          userAccounts: accountsData.length,
          rotations: rotationsData.length,
        },
      };
    });
  }
}
