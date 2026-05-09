import { SetMetadata } from '@nestjs/common';

export const CACHE_CONTROL_KEY = 'cache-control';

/**
 * Decorator to set Cache-Control header on a GET endpoint.
 * @param maxAge seconds for `max-age` directive (default 60)
 * @param scope  'public' | 'private' (default 'private')
 */
export const CacheControl = (
  maxAge = 60,
  scope: 'public' | 'private' = 'private',
) => SetMetadata(CACHE_CONTROL_KEY, { maxAge, scope });
