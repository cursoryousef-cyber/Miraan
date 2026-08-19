import { Module } from '@nestjs/common';
import { RolesPermissionsController } from './roles-permissions.controller';
import { PrismaModule } from '../../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [RolesPermissionsController],
})
export class RolesPermissionsModule {}
