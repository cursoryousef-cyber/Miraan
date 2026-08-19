import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePersonDto, UpdatePersonDto } from './dto/person.dto';
import { IAuthenticatedUser } from '../../common/interfaces';

@Injectable()
export class PersonsService {
  constructor(private prisma: PrismaService) {}

  async findAll(page = 1, limit = 20, search?: string) {
    const skip = (page - 1) * limit;
    const where: Record<string, unknown> = { deletedAt: null };

    if (search) {
      where.OR = [
        { nameAr: { contains: search, mode: 'insensitive' } },
        { nameEn: { contains: search, mode: 'insensitive' } },
        { nationalId: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
      ];
    }

    const [total, data] = await Promise.all([
      this.prisma.person.count({ where }),
      this.prisma.person.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          userAccounts: {
            select: { id: true, email: true, isActive: true, createdAt: true },
          },
          traineeProfile: true,
          trainerProfile: true,
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
    const person = await this.prisma.person.findFirst({
      where: { id, deletedAt: null },
      include: {
        userAccounts: {
          include: {
            organizations: {
              include: { organization: true },
            },
            userRoles: {
              include: { role: true, organization: true },
            },
          },
        },
        traineeProfile: { include: { organization: true } },
        trainerProfile: { include: { organization: true, department: true } },
      },
    });

    if (!person) {
      throw new NotFoundException('الشخص غير موجود');
    }

    return person;
  }

  async create(dto: CreatePersonDto, user?: IAuthenticatedUser) {
    return this.prisma.person.create({
      data: {
        ...dto,
        createdById: user?.accountId,
      },
    });
  }

  async update(id: string, dto: UpdatePersonDto, user?: IAuthenticatedUser) {
    await this.findOne(id);

    return this.prisma.person.update({
      where: { id },
      data: {
        ...dto,
        updatedById: user?.accountId,
      },
    });
  }

  async softDelete(id: string, user?: IAuthenticatedUser) {
    await this.findOne(id);

    return this.prisma.person.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user?.accountId,
      },
    });
  }
}
