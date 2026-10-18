import type { CacheInterface } from './cacheTypes.js';

export class DisabledCacheAdapter implements CacheInterface {
  readonly enabled = false;
  async get<T>(): Promise<T | null> { return null; }
  async set(): Promise<void> {}
  async remove(): Promise<void> {}
  async invalidateNamespace(): Promise<void> {}
}
