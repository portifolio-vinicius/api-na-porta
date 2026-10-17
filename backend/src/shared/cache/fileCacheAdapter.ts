import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readdir, readFile, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/appConfig.js';
import type { AppConfig } from '../config/appConfig.js';
import type { CacheInterface } from './cacheTypes.js';

const maxEntryBytes = 1_048_576;
const maxDirectoryBytes = 67_108_864;
const maxTtlSeconds = 300;
const filePattern = /^[a-f0-9]{64}\.json$/;

@Injectable()
export class FileCacheAdapter implements CacheInterface {
  private activeReads = 0;
  private writing = false;
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async get<T>(namespace: string, key: string): Promise<T | null> {
    if (this.activeReads >= 16) return null;
    this.activeReads += 1;
    try { return await this.readEntry<T>(namespace, key); } finally { this.activeReads -= 1; }
  }

  private async readEntry<T>(namespace: string, key: string): Promise<T | null> {
    const path = this.entryPath(namespace, key);
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.size > maxEntryBytes) {
        await rm(path, { force: true });
        return null;
      }
      const content = await readFile(path, 'utf8');
      const entry = JSON.parse(content) as { expiresAt?: unknown; value?: unknown };
      if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= Date.now()) {
        await rm(path, { force: true });
        return null;
      }
      return entry.value as T;
    } catch {
      await rm(path, { force: true }).catch(() => undefined);
      return null;
    }
  }

  async set<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.writing) return;
    this.writing = true;
    try { await this.writeEntry(namespace, key, value, ttlSeconds); } finally { this.writing = false; }
  }

  private async writeEntry<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return;
    const expiresAt = Date.now() + Math.min(ttlSeconds, maxTtlSeconds) * 1000;
    const data = JSON.stringify({ expiresAt, value });
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes > maxEntryBytes) return;

    const directory = this.namespacePath(namespace);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    if (await this.directorySize(directory) + bytes > maxDirectoryBytes) {
      await this.prune(directory, bytes);
      if (await this.directorySize(directory) + bytes > maxDirectoryBytes) return;
    }

    const destination = this.entryPath(namespace, key);
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(data, 'utf8');
      await handle.close();
      handle = undefined;
      await rename(temporary, destination);
    } catch {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }

  async remove(namespace: string, key: string): Promise<void> {
    await rm(this.entryPath(namespace, key), { force: true }).catch(() => undefined);
  }

  async invalidateNamespace(namespace: string): Promise<void> {
    await rm(this.namespacePath(namespace), { recursive: true, force: true }).catch(() => undefined);
  }

  private namespacePath(namespace: string): string {
    return join(this.config.cacheDirectory, this.digest(namespace));
  }

  private entryPath(namespace: string, key: string): string {
    return join(this.namespacePath(namespace), `${this.digest(key)}.json`);
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async directorySize(directory: string): Promise<number> {
    try {
      const files = await readdir(directory);
      let total = 0;
      for (const name of files) {
        if (!filePattern.test(name)) continue;
        try { total += (await lstat(join(directory, name))).size; } catch { /* removed concurrently */ }
        if (total > maxDirectoryBytes) break;
      }
      return total;
    } catch {
      return 0;
    }
  }

  private async prune(directory: string, neededBytes: number): Promise<void> {
    try {
      const names = (await readdir(directory)).filter((name) => filePattern.test(name)).slice(0, 256);
      let size = await this.directorySize(directory);
      for (const name of names) {
        if (size + neededBytes <= maxDirectoryBytes) break;
        const path = join(directory, name);
        let fileSize = 0;
        try { fileSize = (await stat(path)).size; } catch { continue; }
        await rm(path, { force: true }).catch(() => undefined);
        size -= fileSize;
      }
    } catch {
      // Cache is optional. Failure to reclaim space leaves the request uncached.
    }
  }
}
