import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateUserAccountDto, UpdateUserAccountDto, AddUserToOrgDto, AssignRoleDto } from './dto/user-account.dto';
import { IAuthenticatedUser } from '../../common/interfaces';
import { membershipWhere } from '../organization-assignments/organization-assignment.service';
import { roleScope } from '../../common/role-scope';

@Injectable()
export class UserAccountsService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.migrateDeprecatedRoles();
    } catch (e) {
      console.warn('[UserAccountsService] Role migration warning:', e);
    }
  }

  private async migrateDeprecatedRoles() {
    const canonicalRoles = [
      { code: 'platform_owner', nameAr: 'مالك المنصة الإلكترونية', nameEn: 'Platform Owner' },
      { code: 'cluster_manager', nameAr: 'مدير تدريب التجمع', nameEn: 'Cluster Training Manager' },
      { code: 'hospital_training_admin', nameAr: 'مدير تدريب المستشفى', nameEn: 'Hospital Training Manager' },
      { code: 'university_administrator', nameAr: 'مسؤول الجامعة الموفدة', nameEn: 'University Administrator' },
      { code: 'academic_supervisor', nameAr: 'المشرف الأكاديمي', nameEn: 'Academic Supervisor' },
      { code: 'trainer', nameAr: 'المدرب السريري', nameEn: 'Clinical Trainer' },
      { code: 'trainee', nameAr: 'المتدرب', nameEn: 'Trainee' },
    ];

    for (const r of canonicalRoles) {
      await this.prisma.role.upsert({
        where: { code: r.code },
        update: { nameAr: r.nameAr, nameEn: r.nameEn },
        create: { code: r.code, nameAr: r.nameAr, nameEn: r.nameEn },
      });
    }

    const allRoles = await this.prisma.role.findMany();
    const roleIdByCode = new Map(allRoles.map((r) => [r.code, r.id]));

    const legacyMap: [string, string][] = [
      ['system_admin', 'platform_owner'],
      ['cluster_administrator', 'cluster_manager'],
      ['hospitalAdmin', 'hospital_training_admin'],
      ['academic_affairs', 'academic_supervisor'],
    ];

    for (const [legacyCode, targetCode] of legacyMap) {
      const legacyId = roleIdByCode.get(legacyCode);
      const targetId = roleIdByCode.get(targetCode);
      if (!legacyId || !targetId || legacyId === targetId) continue;

      const userRoles = await this.prisma.userRole.findMany({
        where: { roleId: legacyId },
      });

      for (const ur of userRoles) {
        const existing = await this.prisma.userRole.findUnique({
          where: {
            userAccountId_roleId_organizationId: {
              userAccountId: ur.userAccountId,
              roleId: targetId,
              organizationId: ur.organizationId,
            },
          },
        });
        const compoundKey = {
          userAccountId_roleId_organizationId: {
            userAccountId: ur.userAccountId,
            roleId: ur.roleId,
            organizationId: ur.organizationId,
          },
        };

        if (existing) {
          await this.prisma.userRole.delete({ where: compoundKey }).catch(() => null);
        } else {
          await this.prisma.userRole
            .update({
              where: compoundKey,
              data: { roleId: targetId },
            })
            .catch(() => null);
        }
      }
    }
  }

  async findAll(organizationId: string | null, page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      deletedAt: null,
    };

    if (organizationId && organizationId !== 'all' && organizationId !== 'global') {
      where.AND = [membershipWhere(organizationId)];
    }

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { person: { nameAr: { contains: search, mode: 'insensitive' } } },
        { person: { nationalId: { contains: search } } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.userAccount.count({ where }),
      this.prisma.userAccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          person: true,
          organizations: {
            // The organisation type is what lets a caller tell the hospital
            // assignment apart from the parent organisation one; without it
            // every assignment looks identical.
            include: {
              organization: {
                include: { organizationType: true, parent: { select: { id: true, nameAr: true } } },
              },
            },
          },
          userRoles: {
            ...(organizationId && organizationId !== 'all' && organizationId !== 'global' ? { where: { organizationId } } : {}),
            include: { role: true, organization: { include: { organizationType: true } } },
          },
        },
      }),
    ]);

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const account = await this.prisma.userAccount.findFirst({
      where: { id, deletedAt: null },
      include: {
        person: true,
        organizations: {
          include: {
            organization: {
              include: { organizationType: true, parent: { select: { id: true, nameAr: true } } },
            },
          },
        },
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: { include: { permission: true } },
              },
            },
            organization: { include: { organizationType: true, parent: { select: { id: true, nameAr: true, code: true } } } },
          },
        },
        userPermissions: {
          include: { permission: true, organization: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('حساب المستخدم غير موجود');
    }

    return account;
  }

  /**
   * Validates the account's scope against what its role actually needs.
   *
   * Three rules, all previously unenforced: a hospital role must name a
   * hospital, that hospital must belong to the organisation it was created
   * under, and a platform role is not narrowed by any organisation. Without
   * this a trainer could exist with no hospital, or a hospital administrator
   * could be attached to a hospital in a different cluster.
   */
  private async resolveScope(input: {
    roleCode?: string;
    organizationId?: string;
    hospitalId?: string;
  }): Promise<{ organizationId: string | null; hospitalId: string | null; scopeKind: string }> {
    const rule = roleScope(input.roleCode);

    if (rule.kind === 'platform') {
      // Platform roles are federation-wide; an organisation may still be
      // recorded for provenance but never limits what they can see.
      return {
        organizationId: input.organizationId ?? null,
        hospitalId: null,
        scopeKind: rule.kind,
      };
    }

    if (rule.requiresOrganization && !input.organizationId) {
      throw new BadRequestException(
        `الدور "${input.roleCode}" يتطلب تحديد الجهة (${rule.labelAr})`,
      );
    }

    const organization = input.organizationId
      ? await this.prisma.organization.findFirst({
          where: { id: input.organizationId, deletedAt: null },
          select: { id: true, parentId: true, organizationType: { select: { code: true } } },
        })
      : null;
    if (input.organizationId && !organization) {
      throw new NotFoundException('الجهة غير موجودة');
    }

    if (!rule.requiresHospital) {
      return { organizationId: input.organizationId ?? null, hospitalId: null, scopeKind: rule.kind };
    }

    // A hospital role may be created either by naming the hospital explicitly,
    // or by selecting the hospital itself as the organisation.
    const hospitalId =
      input.hospitalId ??
      (organization?.organizationType?.code === 'hospital' ? organization.id : undefined);

    if (!hospitalId) {
      throw new BadRequestException(
        `الدور "${input.roleCode}" يتطلب تحديد المستشفى (${rule.labelAr})`,
      );
    }

    const hospital = await this.prisma.organization.findFirst({
      where: { id: hospitalId, deletedAt: null },
      select: { id: true, parentId: true, organizationType: { select: { code: true } } },
    });
    if (!hospital) throw new NotFoundException('المستشفى غير موجود');
    if (hospital.organizationType?.code !== 'hospital') {
      throw new BadRequestException('الجهة المختارة كمستشفى ليست من نوع مستشفى');
    }

    // Cascading: the hospital must sit under the chosen organisation, unless the
    // hospital *is* the chosen organisation.
    const parentOrgId = input.organizationId ?? hospital.parentId;
    if (parentOrgId && hospital.id !== parentOrgId && hospital.parentId !== parentOrgId) {
      throw new BadRequestException('المستشفى المحدد لا يتبع الجهة المختارة');
    }

    return { organizationId: parentOrgId ?? hospital.parentId, hospitalId: hospital.id, scopeKind: rule.kind };
  }

  async create(dto: CreateUserAccountDto, user?: IAuthenticatedUser) {
    const emailInput = dto.email.trim().toLowerCase();
    const cleanOrgId = dto.organizationId?.trim() || undefined;
    const cleanHospId = dto.hospitalId?.trim() || undefined;
    const cleanNatId = dto.nationalId?.trim() || undefined;

    // Check if email is already taken by an active (non-deleted) account
    const existing = await this.prisma.userAccount.findFirst({
      where: { email: emailInput, deletedAt: null },
    });
    if (existing) {
      throw new ConflictException('البريد الإلكتروني مسجل بحساب آخر مسبقاً');
    }

    const scope = await this.resolveScope({
      roleCode: dto.roleCode,
      organizationId: cleanOrgId,
      hospitalId: cleanHospId,
    });

    let personId = dto.personId?.trim() || undefined;

    if (!personId) {
      let person = cleanNatId
        ? await this.prisma.person.findUnique({ where: { nationalId: cleanNatId } })
        : null;

      if (!person) {
        person = await this.prisma.person.findFirst({
          where: { email: emailInput },
        });
      }

      if (person) {
        const hasAccount = await this.prisma.userAccount.findFirst({
          where: { personId: person.id, deletedAt: null },
        });
        if (hasAccount) {
          throw new ConflictException('يوجد حساب دخول مفعّل مرتبط برقم الهوية أو الشخص مسبقاً');
        }
      } else {
        person = await this.prisma.person.create({
          data: {
            nationalId: dto.nationalId || null,
            nameAr: dto.nameAr || dto.email.split('@')[0],
            nameEn: dto.nameEn || null,
            email: dto.email.toLowerCase(),
            phone: dto.phone || null,
          },
        });
      }
      personId = person.id;
    } else {
      const person = await this.prisma.person.findUnique({
        where: { id: personId },
      });
      if (!person) {
        throw new NotFoundException('الشخص غير موجود');
      }
    }

    // Hash password if provided, or generate activation token
    let passwordHash = '';
    let activationToken: string | null = null;

    if (dto.password) {
      passwordHash = await bcrypt.hash(dto.password, 10);
    } else {
      activationToken = uuidv4();
      passwordHash = await bcrypt.hash(uuidv4(), 10);
    }

    // The account's home scope: its hospital when the role is hospital-scoped,
    // otherwise its organisation. Both come from `resolveScope`, so they are
    // guaranteed to be consistent with each other and with the role.
    const primaryOrgId = scope.hospitalId ?? scope.organizationId;
    if (!primaryOrgId) {
      throw new BadRequestException('تعذّر تحديد نطاق الحساب — يجب تحديد الجهة أو المستشفى');
    }

    if (dto.roleCode && dto.roleCode === 'hospital_training_admin') {
      const targetHospitalId = scope.hospitalId || primaryOrgId;
      const existingAdmin = await this.prisma.userRole.findFirst({
        where: {
          organizationId: targetHospitalId,
          role: { code: 'hospital_training_admin' },
          userAccount: { deletedAt: null, isActive: true },
        },
        select: { userAccount: { select: { email: true } } },
      });
      if (existingAdmin) {
        throw new BadRequestException(
          `يوجد بالفعل مسؤول تدريب مفعّل لهذا المستشفى (${existingAdmin.userAccount.email}) — يقتصر المستشفى الواحد على حساب إدارة تدريب واحد فقط`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.userAccount.create({
        data: {
          personId,
          email: dto.email.toLowerCase(),
          username: dto.username || dto.email.toLowerCase(),
          passwordHash,
          activationToken,
          isEmailVerified: !!dto.password,
          createdById: user?.accountId,
        },
      });

      // Add primary organization / hospital assignment
      await tx.userOrganization.create({
        data: {
          userAccountId: account.id,
          organizationId: primaryOrgId,
          isPrimary: true,
        },
      });
      await tx.organizationAssignment.create({
        data: {
          userAccountId: account.id,
          organizationId: primaryOrgId,
          isPrimary: true,
          isActive: true,
          assignmentType: 'permanent',
          sourceType: 'user_organization',
          createdById: user?.accountId,
        },
      });

      // A hospital-scoped account also belongs to the parent organisation, so
      // cluster-level screens still see them. Secondary, never primary.
      if (scope.hospitalId && scope.organizationId && scope.hospitalId !== scope.organizationId) {
        await tx.userOrganization.create({
          data: {
            userAccountId: account.id,
            organizationId: scope.organizationId,
            isPrimary: false,
          },
        });
        await tx.organizationAssignment.create({
          data: {
            userAccountId: account.id,
            organizationId: scope.organizationId,
            isPrimary: false,
            isActive: true,
            assignmentType: 'permanent',
            sourceType: 'user_organization',
            createdById: user?.accountId,
          },
        });
      }

      // Assign role if specified
      if (dto.roleCode) {
        const role = await tx.role.findUnique({
          where: { code: dto.roleCode },
        });
        if (role) {
          await tx.userRole.create({
            data: {
              userAccountId: account.id,
              roleId: role.id,
              organizationId: primaryOrgId,
              assignedById: user?.accountId,
            },
          });
        }
      }

      return {
        account,
        activationToken,
        activationLink: activationToken
          ? `${process.env.FRONTEND_URL || 'http://localhost:5173'}/activate?token=${activationToken}`
          : null,
      };
    });
  }

  async addUserToOrg(accountId: string, dto: AddUserToOrgDto, user?: IAuthenticatedUser) {
    const account = await this.findOne(accountId);

    // Membership check reads OrganizationAssignment, falling back to the legacy
    // row so an account that predates the migration is still detected.
    const existingAssignment = await this.prisma.organizationAssignment.findFirst({
      where: {
        userAccountId: accountId,
        organizationId: dto.organizationId,
        sourceType: { in: ['user_organization', 'user_role', 'manual'] },
      },
      select: { id: true },
    });
    const existingOrg = existingAssignment
      ?? (await this.prisma.userOrganization.findUnique({
        where: {
          userAccountId_organizationId: {
            userAccountId: accountId,
            organizationId: dto.organizationId,
          },
        },
      }));

    if (existingOrg) {
      throw new BadRequestException('المستخدم مرتبط بهذه الجهة مسبقاً');
    }

    return this.prisma.$transaction(async (tx) => {
      const userOrg = await tx.userOrganization.create({
        data: {
          userAccountId: accountId,
          organizationId: dto.organizationId,
          isPrimary: !!dto.isPrimary,
        },
      });
      if (dto.isPrimary) {
        // Only one assignment per user may be primary.
        await tx.organizationAssignment.updateMany({
          where: { userAccountId: accountId, isPrimary: true, isActive: true },
          data: { isPrimary: false },
        });
      }
      await tx.organizationAssignment.create({
        data: {
          userAccountId: accountId,
          organizationId: dto.organizationId,
          isPrimary: !!dto.isPrimary,
          isActive: true,
          assignmentType: 'permanent',
          sourceType: 'user_organization',
          createdById: user?.accountId,
        },
      });

      if (dto.roleCode) {
        const role = await tx.role.findUnique({ where: { code: dto.roleCode } });
        if (role) {
          await tx.userRole.create({
            data: {
              userAccountId: accountId,
              roleId: role.id,
              organizationId: dto.organizationId,
              assignedById: user?.accountId,
            },
          });
        }
      }

      return userOrg;
    });
  }

  async assignRole(dto: AssignRoleDto, user?: IAuthenticatedUser) {
    const existing = await this.prisma.userRole.findUnique({
      where: {
        userAccountId_roleId_organizationId: {
          userAccountId: dto.userAccountId,
          roleId: dto.roleId,
          organizationId: dto.organizationId,
        },
      },
    });

    if (existing) {
      return existing;
    }

    return this.prisma.userRole.create({
      data: {
        userAccountId: dto.userAccountId,
        roleId: dto.roleId,
        organizationId: dto.organizationId,
        assignedById: user?.accountId,
      },
    });
  }

  async removeRole(userAccountId: string, roleId: string, organizationId: string) {
    return this.prisma.userRole.delete({
      where: {
        userAccountId_roleId_organizationId: {
          userAccountId,
          roleId,
          organizationId,
        },
      },
    });
  }

  async toggleActive(id: string, user?: IAuthenticatedUser) {
    const account = await this.findOne(id);
    return this.prisma.userAccount.update({
      where: { id },
      data: {
        isActive: !account.isActive,
        updatedById: user?.accountId,
      },
    });
  }

  async update(id: string, dto: UpdateUserAccountDto, user?: IAuthenticatedUser) {
    const account = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.nameAr || dto.nameEn || dto.nationalId || dto.phone) {
        await tx.person.update({
          where: { id: account.personId },
          data: {
            ...(dto.nameAr ? { nameAr: dto.nameAr } : {}),
            ...(dto.nameEn ? { nameEn: dto.nameEn } : {}),
            ...(dto.nationalId ? { nationalId: dto.nationalId } : {}),
            ...(dto.phone ? { phone: dto.phone } : {}),
          },
        });
      }

      let passwordHash: string | undefined;
      if (dto.password && dto.password.trim().length > 0) {
        passwordHash = await bcrypt.hash(dto.password, 10);
      }

      const targetOrgId = dto.hospitalId || dto.organizationId;
      if (dto.roleCode || targetOrgId) {
        const roleCodeToUse = dto.roleCode || account.userRoles?.[0]?.role?.code;
        const orgIdToUse = targetOrgId || account.userRoles?.[0]?.organizationId;
        if (roleCodeToUse && orgIdToUse) {
          const role = await tx.role.findUnique({ where: { code: roleCodeToUse } });
          if (role) {
            // Delete old role for account if replacing
            if (account.userRoles?.[0]) {
              await tx.userRole.deleteMany({ where: { userAccountId: id } });
            }
            await tx.userRole.create({
              data: {
                userAccountId: id,
                roleId: role.id,
                organizationId: orgIdToUse,
                assignedById: user?.accountId,
              },
            }).catch(() => null);
          }
        }
      }

      return tx.userAccount.update({
        where: { id },
        data: {
          ...(dto.email ? { email: dto.email } : {}),
          ...(passwordHash ? { passwordHash } : {}),
          updatedById: user?.accountId,
        },
        include: { person: true, userRoles: { include: { role: true, organization: true } } },
      });
    });
  }

  async delete(id: string, user?: IAuthenticatedUser) {
    return this.prisma.userAccount.update({
      where: { id },
      data: {
        isActive: false,
        deletedAt: new Date(),
        updatedById: user?.accountId,
      },
    });
  }
}
