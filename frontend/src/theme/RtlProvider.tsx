import React from 'react';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import { prefixer } from 'stylis';
import rtlPlugin from 'stylis-plugin-rtl';

// Create rtl cache
const cacheRtl = createCache({
  key: 'muirtl',
  stylisPlugins: [prefixer, rtlPlugin],
});

interface RtlProviderProps {
  children: React.ReactNode;
}

export const RtlProvider: React.FC<RtlProviderProps> = ({ children }) => {
  return <CacheProvider value={cacheRtl}>{children}</CacheProvider>;
};
