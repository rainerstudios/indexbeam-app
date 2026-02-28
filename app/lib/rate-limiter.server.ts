import IORedis from "ioredis";

let redis: IORedis | null = null;

function getRedis() {
  if (!redis) {
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    redis = new IORedis(url, {
      maxRetriesPerRequest: null,
      ...(url.startsWith("rediss://") ? { tls: {} } : {}),
    });
  }
  return redis;
}

interface RateLimitConfig {
  maxTokens: number;
  refillRate: number;
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  bing_webmaster: { maxTokens: 5, refillRate: 5 },
  gsc_inspection: { maxTokens: 10, refillRate: 10 },
  gsc_analytics: { maxTokens: 3, refillRate: 3 },
  bing_search: { maxTokens: 3, refillRate: 3 },
  firecrawl: { maxTokens: 1, refillRate: 1 },
  indexnow: { maxTokens: 10, refillRate: 10 },
};

export async function acquireToken(bucketName: string): Promise<boolean> {
  const config = RATE_LIMITS[bucketName];
  if (!config) throw new Error(`Unknown rate limit bucket: ${bucketName}`);

  const r = getRedis();
  const key = `ratelimit:${bucketName}`;
  const now = Date.now();

  const result = (await r.eval(
    `
    local key = KEYS[1]
    local maxTokens = tonumber(ARGV[1])
    local refillRate = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    local data = redis.call('HMGET', key, 'tokens', 'lastRefill')
    local tokens = tonumber(data[1]) or maxTokens
    local lastRefill = tonumber(data[2]) or now

    local elapsed = (now - lastRefill) / 1000
    tokens = math.min(maxTokens, tokens + elapsed * refillRate)

    if tokens >= 1 then
      tokens = tokens - 1
      redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
      redis.call('EXPIRE', key, 60)
      return 1
    else
      redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', now)
      redis.call('EXPIRE', key, 60)
      return 0
    end
    `,
    1,
    key,
    config.maxTokens,
    config.refillRate,
    now
  )) as number;

  return result === 1;
}

export async function waitForToken(
  bucketName: string,
  maxWaitMs: number = 30000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await acquireToken(bucketName)) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Rate limit timeout for ${bucketName} after ${maxWaitMs}ms`);
}
