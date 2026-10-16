export const CACHE_INTERFACE = Symbol('CACHE_INTERFACE');

export interface CacheInterface {
  get<T>(namespace: string, key: string): Promise<T | null>;
  set<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void>;
  remove(namespace: string, key: string): Promise<void>;
  invalidateNamespace(namespace: string): Promise<void>;
}

export type CacheOutcome = 'hit' | 'miss' | 'bypass';
