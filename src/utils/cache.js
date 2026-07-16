import Redis from 'ioredis';

let _redis = null;

function getRedis() {
  if (_redis) return _redis;
  if (!process.env.REDIS_URL) return null;
  _redis = new Redis(process.env.REDIS_URL, {
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  _redis.on('error', () => {});
  return _redis;
}

const DEFAULT_TTL = 300;

export async function cacheGet(key) {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const value = await redis.get(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttl = DEFAULT_TTL) {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.setex(key, ttl, JSON.stringify(value));
  } catch {
    // fallback silencioso
  }
}

export async function cacheDel(pattern) {
  const redis = getRedis();
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    // fallback silencioso
  }
}

// testing only
export function _resetRedis() {
  _redis = null;
}
