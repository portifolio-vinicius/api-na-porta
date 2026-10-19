import { createHash, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, open, readdir, readFile, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG } from '../config/appConfig.js';
import type { AppConfig } from '../config/appConfig.js';
import type { CacheInterface } from './cacheTypes.js';

const maxEntryBytes = 1_048_576;
const maxDirectoryBytes = 67_108_864;
const maxTtlSeconds = 300;
const maxQueuedWrites = 8;
const maxPruneFiles = 256;
const filePattern = /^[a-f0-9]{64}\.json$/;

interface DirectoryUsage {
  bytes: number;
  files: Map<string, number>;
}

@Injectable()
export class FileCacheAdapter implements CacheInterface {
  private activeReads = 0;
  private queuedWrites = 0;
  private readonly usage = new Map<string, DirectoryUsage>();
  private readonly writeQueues = new Map<string, Promise<void>>();
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async get<T>(namespace: string, key: string): Promise<T | null> {
    if (this.activeReads >= 16) return null;
    this.activeReads += 1;
    try { return await this.readEntry<T>(namespace, key); } finally { this.activeReads -= 1; }
  }

  private async readEntry<T>(namespace: string, key: string): Promise<T | null> {
    const directory = this.namespacePath(namespace);
    const fileName = `${this.digest(key)}.json`;
    const path = join(directory, fileName);
    try {
      const metadata = await lstat(path);
      if (!metadata.isFile() || metadata.size > maxEntryBytes) {
        this.forget(directory, fileName);
        await rm(path, { force: true });
        return null;
      }
      const content = await readFile(path, 'utf8');
      const entry = JSON.parse(content) as { expiresAt?: unknown; value?: unknown };
      if (typeof entry.expiresAt !== 'number' || entry.expiresAt <= Date.now()) {
        this.forget(directory, fileName);
        await rm(path, { force: true });
        return null;
      }
      return entry.value as T;
    } catch (error) {
      if (isEnoent(error)) return null;
      this.forget(directory, fileName);
      await rm(path, { force: true }).catch(() => undefined);
      return null;
    }
  }

  async set<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void> {
    if (this.queuedWrites >= maxQueuedWrites) return;
    this.queuedWrites += 1;
    const directory = this.namespacePath(namespace);
    const previous = this.writeQueues.get(directory) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(() => this.writeEntry(namespace, key, value, ttlSeconds));
    const settled = current.then(() => undefined, () => undefined);
    this.writeQueues.set(directory, settled);
    try {
      await current;
    } finally {
      this.queuedWrites -= 1;
      if (this.writeQueues.get(directory) === settled) this.writeQueues.delete(directory);
    }
  }

  private async writeEntry<T>(namespace: string, key: string, value: T, ttlSeconds: number): Promise<void> {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return;
    const expiresAt = Date.now() + Math.min(ttlSeconds, maxTtlSeconds) * 1000;
    const data = JSON.stringify({ expiresAt, value });
    const bytes = Buffer.byteLength(data, 'utf8');
    if (bytes > maxEntryBytes) return;

    const directory = this.namespacePath(namespace);
    const usage = await this.prepare(directory);
    const fileName = `${this.digest(key)}.json`;
    if (this.projectedBytes(usage, fileName, bytes) > maxDirectoryBytes) {
      await this.prune(directory, usage, fileName, bytes);
      if (this.projectedBytes(usage, fileName, bytes) > maxDirectoryBytes) return;
    }

    const destination = join(directory, fileName);
    const temporary = join(directory, `.${randomUUID()}.tmp`);
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      handle = await open(temporary, 'wx', 0o600);
      await handle.writeFile(data, 'utf8');
      await handle.close();
      handle = undefined;
      await rename(temporary, destination);
      const replacedBytes = usage.files.get(fileName) ?? 0;
      usage.files.set(fileName, bytes);
      usage.bytes += bytes - replacedBytes;
    } catch {
      await handle?.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
      // Accounting can drift after a failed rename. The next write reconciles from the directory.
      this.usage.delete(directory);
    }
  }

  async remove(namespace: string, key: string): Promise<void> {
    const directory = this.namespacePath(namespace);
    const fileName = `${this.digest(key)}.json`;
    this.forget(directory, fileName);
    await rm(join(directory, fileName), { force: true }).catch(() => undefined);
  }

  async invalidateNamespace(namespace: string): Promise<void> {
    const directory = this.namespacePath(namespace);
    this.usage.delete(directory);
    await rm(directory, { recursive: true, force: true }).catch(() => undefined);
  }

  private namespacePath(namespace: string): string {
    return join(this.config.cacheDirectory, this.digest(namespace));
  }

  private digest(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async prepare(directory: string): Promise<DirectoryUsage> {
    const known = this.usage.get(directory);
    if (known) return known;
    await mkdir(directory, { recursive: true, mode: 0o700 });
    await chmod(directory, 0o700);
    const usage = await this.reconcile(directory);
    this.usage.set(directory, usage);
    return usage;
  }

  // One directory walk per process keeps the quota. Repeating lstat on every write dominated list latency.
  private async reconcile(directory: string): Promise<DirectoryUsage> {
    const files = new Map<string, number>();
    let bytes = 0;
    try {
      const names = await readdir(directory);
      for (const name of names) {
        if (!filePattern.test(name)) continue;
        try {
          const size = (await lstat(join(directory, name))).size;
          files.set(name, size);
          bytes += size;
        } catch {
          // Removed concurrently.
        }
      }
    } catch {
      return { bytes: 0, files };
    }
    return { bytes, files };
  }

  private forget(directory: string, fileName: string): void {
    const usage = this.usage.get(directory);
    if (!usage) return;
    const size = usage.files.get(fileName);
    if (size === undefined) return;
    usage.files.delete(fileName);
    usage.bytes -= size;
  }

  private projectedBytes(usage: DirectoryUsage, fileName: string, incomingBytes: number): number {
    return usage.bytes - (usage.files.get(fileName) ?? 0) + incomingBytes;
  }

  private async prune(directory: string, usage: DirectoryUsage, fileName: string, incomingBytes: number): Promise<void> {
    const names = [...usage.files.keys()].filter((name) => name !== fileName).slice(0, maxPruneFiles);
    for (const name of names) {
      if (this.projectedBytes(usage, fileName, incomingBytes) <= maxDirectoryBytes) break;
      const size = usage.files.get(name);
      if (size === undefined) continue;
      usage.files.delete(name);
      usage.bytes -= size;
      await rm(join(directory, name), { force: true }).catch(() => undefined);
    }
  }
}

function isEnoent(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) return false;
  return error.code === 'ENOENT';
}
