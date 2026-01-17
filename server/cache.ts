import Redis from 'ioredis';

export interface CacheService {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * In-memory cache implementation (single instance only)
 */
class InMemoryCache implements CacheService {
  private cache: Map<string, { value: string; expires?: number }> = new Map();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  async get(key: string): Promise<string | null> {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check if expired
    if (entry.expires && Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    // LRU: remove oldest entry if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, {
      value,
      expires: ttlMs ? Date.now() + ttlMs : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }
}

/**
 * Redis cache implementation (shared across instances)
 */
class RedisCache implements CacheService {
  private redis: Redis;

  constructor(redisUrl: string) {
    this.redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
    });

    this.redis.on('error', (err) => {
      console.error('Redis cache error:', err.message);
    });

    this.redis.on('connect', () => {
      console.log('Redis cache connected');
    });
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key: string, value: string, ttlMs?: number): Promise<void> {
    try {
      if (ttlMs) {
        const ttlSeconds = Math.ceil(ttlMs / 1000);
        await this.redis.setex(key, ttlSeconds, value);
      } else {
        await this.redis.set(key, value);
      }
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.redis.flushdb();
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}

/**
 * Factory function to create appropriate cache service
 */
export function createCacheService(): CacheService {
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    console.log('Using Redis for distributed caching');
    return new RedisCache(redisUrl);
  }

  console.log('Using in-memory cache (single instance only, not suitable for horizontal scaling)');
  return new InMemoryCache(100);
}

export { RedisCache, InMemoryCache };
