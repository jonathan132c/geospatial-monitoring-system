import { createClient } from 'redis';
import type { CacheAdapter } from '../types/domain';

export class InMemoryCacheAdapter implements CacheAdapter {
  private readonly store = new Map<string, { expiresAt: number; value: unknown }>();

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}

export class RedisCacheAdapter implements CacheAdapter {
  private readonly client;
  private initialized = false;

  constructor(private readonly redisUrl: string) {
    this.client = createClient({ url: this.redisUrl });
  }

  private async init(): Promise<void> {
    if (!this.initialized) {
      await this.client.connect();
      this.initialized = true;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    await this.init();
    const value = await this.client.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.init();
    await this.client.set(key, JSON.stringify(value), { EX: ttlSeconds });
  }
}
