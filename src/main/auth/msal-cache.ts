import type { ICachePlugin, TokenCacheContext } from '@azure/msal-node'
import { readSecure, writeSecure } from '../secure-store'

const CACHE_NAME = 'msal-token-cache'

export const msalCachePlugin: ICachePlugin = {
  async beforeCacheAccess(context: TokenCacheContext): Promise<void> {
    const cached = await readSecure(CACHE_NAME)
    if (cached !== null) {
      context.tokenCache.deserialize(cached)
    }
  },
  async afterCacheAccess(context: TokenCacheContext): Promise<void> {
    if (context.cacheHasChanged) {
      await writeSecure(CACHE_NAME, context.tokenCache.serialize())
    }
  }
}
