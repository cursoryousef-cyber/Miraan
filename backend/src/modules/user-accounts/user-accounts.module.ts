import { Module } from '@nestjs/common';
import { UserAccountsService } from './user-accounts.service';
import { UserAccountsController } from './user-accounts.controller';

@Module({
  controllers: [UserAccountsController],
  providers: [UserAccountsService],
  exports: [UserAccountsService],
})
export class UserAccountsModule {}
