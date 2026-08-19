import { Module, Global } from '@nestjs/common';
import { FeatureFlagsService } from './feature-flags.service';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureGuard } from '../../common/guards/feature.guard';

@Global()
@Module({
  controllers: [FeatureFlagsController],
  providers: [FeatureFlagsService, FeatureGuard],
  exports: [FeatureFlagsService, FeatureGuard],
})
export class FeatureFlagsModule {}
