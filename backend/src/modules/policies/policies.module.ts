import { Module, Global } from '@nestjs/common';
import { PoliciesService } from './policies.service';
import { PolicyEvaluatorService } from './policy-evaluator.service';
import { PoliciesController } from './policies.controller';

@Global()
@Module({
  controllers: [PoliciesController],
  providers: [PoliciesService, PolicyEvaluatorService],
  exports: [PoliciesService, PolicyEvaluatorService],
})
export class PoliciesModule {}
