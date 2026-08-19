import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrganizationHierarchyService {
  constructor(private prisma: PrismaService) {}

  /**
   * Rebuilds hierarchy closure entries for a newly created organization.
   * Self-entry (depth 0) + all entries inherited from parent.
   */
  async addNode(orgId: string, parentId?: string) {
    // 1. Add self-entry
    await this.prisma.organizationHierarchy.create({
      data: {
        ancestorId: orgId,
        descendantId: orgId,
        depth: 0,
      },
    });

    // 2. If parent exists, copy all parent's ancestors with depth + 1
    if (parentId) {
      const parentAncestors = await this.prisma.organizationHierarchy.findMany({
        where: { descendantId: parentId },
      });

      const newEntries = parentAncestors.map((pa) => ({
        ancestorId: pa.ancestorId,
        descendantId: orgId,
        depth: pa.depth + 1,
      }));

      if (newEntries.length > 0) {
        await this.prisma.organizationHierarchy.createMany({
          data: newEntries,
        });
      }
    }
  }

  /**
   * Returns all descendant organization IDs for a given organization.
   */
  async getDescendantIds(orgId: string): Promise<string[]> {
    const rows = await this.prisma.organizationHierarchy.findMany({
      where: { ancestorId: orgId },
      select: { descendantId: true },
    });
    return rows.map((r) => r.descendantId);
  }

  /**
   * Returns all ancestor organization IDs for a given organization.
   */
  async getAncestorIds(orgId: string): Promise<string[]> {
    const rows = await this.prisma.organizationHierarchy.findMany({
      where: { descendantId: orgId },
      select: { ancestorId: true },
    });
    return rows.map((r) => r.ancestorId);
  }
}
