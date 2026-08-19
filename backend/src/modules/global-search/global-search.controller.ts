import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard, RolesGuard } from '../../common/guards';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CAPABILITIES, CapabilityGuard, RequireCapability,
} from '../../common/authz';

@ApiTags('Global Search (البحث الموحد على المستوى الوطني)')
@Controller('global-search')
@UseGuards(JwtAuthGuard, RolesGuard, CapabilityGuard)
@ApiBearerAuth('JWT-auth')
export class GlobalSearchController {
  constructor(private prisma: PrismaService) {}

  // Searches across organisations, trainees and requests at once, so it needs a
  // read capability rather than bare authentication — otherwise it is a way to
  // enumerate records the caller could not open directly.
  @Get()
  @RequireCapability(
    CAPABILITIES.ORG_VIEW,
    CAPABILITIES.TRAINEE_VIEW_SCOPE,
    CAPABILITIES.TRAINEE_VIEW_HOSPITAL,
  )
  @ApiOperation({ summary: 'البحث الفوري الموحد في الأشخاص، المتدربين، المستشفيات، والأقسام' })
  async search(@Query('q') query: string) {
    if (!query || query.trim().length < 2) {
      return { results: [] };
    }

    const q = query.trim();

    const [persons, orgs, depts, trainees] = await Promise.all([
      this.prisma.person.findMany({
        where: {
          OR: [
            { nameAr: { contains: q, mode: 'insensitive' } },
            { nameEn: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { nationalId: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
      this.prisma.organization.findMany({
        where: {
          OR: [
            { nameAr: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
      this.prisma.department.findMany({
        where: {
          OR: [
            { nameAr: { contains: q, mode: 'insensitive' } },
            { code: { contains: q, mode: 'insensitive' } },
          ],
        },
        take: 5,
      }),
      this.prisma.traineeProfile.findMany({
        where: {
          OR: [
            { traineeNumber: { contains: q, mode: 'insensitive' } },
            { specialtyAr: { contains: q, mode: 'insensitive' } },
          ],
        },
        include: { person: true, organization: true },
        take: 5,
      }),
    ]);

    const results = [
      ...persons.map((p) => ({ type: 'person', id: p.id, title: p.nameAr, subtitle: p.email || p.nationalId, category: 'أشخاص' })),
      ...orgs.map((o) => ({ type: 'organization', id: o.id, title: o.nameAr, subtitle: `رمز: ${o.code}`, category: 'جهات ومستشفيات' })),
      ...depts.map((d) => ({ type: 'department', id: d.id, title: d.nameAr, subtitle: `رمز: ${d.code}`, category: 'أقسام سريرية' })),
      ...trainees.map((t) => ({ type: 'trainee', id: t.id, title: t.person.nameAr, subtitle: `رقم المتدرب: ${t.traineeNumber}`, category: 'متدربون' })),
    ];

    return { resultsCount: results.length, results };
  }
}
