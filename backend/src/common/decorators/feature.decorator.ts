import { SetMetadata } from '@nestjs/common';

export const FEATURE_KEY = 'feature';
export const RequireFeature = (featureCode: string) =>
  SetMetadata(FEATURE_KEY, featureCode);
