/**
 * Leitura centralizada das variáveis de ambiente, com padrões seguros para desenvolvimento.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export type AdaptersMode = 'fake' | 'real';

/**
 * Carrega um arquivo .env simples (KEY=VALUE) sem dependência externa.
 * Variáveis já definidas no ambiente têm prioridade sobre o arquivo.
 */
function loadDotEnv(file = resolve(process.cwd(), '.env')): void {
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

function str(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}
function num(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && process.env[name] !== undefined && process.env[name] !== ''
    ? v
    : fallback;
}
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes'].includes(v.toLowerCase());
}

export function loadEnv() {
  const adapters: AdaptersMode = str('ADAPTERS', 'fake') === 'real' ? 'real' : 'fake';
  const isFake = adapters === 'fake';
  return {
    port: num('PORT', 3333),
    nodeEnv: str('NODE_ENV', 'development'),
    adapters,
    isFake,
    // Em desenvolvimento (adaptadores fake) o Expo web local é liberado por padrão.
    corsOrigins: str(
      'CORS_ORIGINS',
      isFake ? 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:19006' : '',
    )
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    throttleDisabled: bool('THROTTLE_DISABLED', false),
    databaseUrl: str('DATABASE_URL') || undefined,
    jwt: {
      secret: str('JWT_SECRET', isFake ? 'dev-jwt-secret-change-me' : ''),
      accessTtlSeconds: num('ACCESS_TOKEN_TTL_SECONDS', 15 * 60),
      refreshTtlDays: num('REFRESH_TOKEN_TTL_DAYS', 30),
    },
    webhooks: {
      vindiSecret: str('VINDI_WEBHOOK_SECRET', isFake ? 'dev-secret' : ''),
      freightToken: str('FREIGHT_SERVICE_ACCESS_TOKEN', isFake ? 'dev-freight-token' : ''),
    },
    vindi: {
      publicKey: str('VINDI_PUBLIC_KEY', isFake ? 'pk_fake_vindi_public_key' : ''),
      apiUrl: str('VINDI_API_URL', 'https://sandbox-app.vindi.com.br/api/v1'),
      sandbox: bool('VINDI_SANDBOX', true),
      apiKey: str('VINDI_API_KEY'),
    },
    primeApi: { url: str('PRIME_API_URL'), apiKey: str('CAFFEINE_PRIME_X_API_KEY') },
    shopify: {
      storeDomain: str('SHOPIFY_STORE_DOMAIN'),
      storefrontToken: str('SHOPIFY_STOREFRONT_TOKEN'),
      adminToken: str('SHOPIFY_ADMIN_ACCESS_TOKEN'),
      multipassUrl: str('SHOPIFY_MULTIPASS_CLOUD_FUNCTION_URL'),
      multipassSecret: str('SHOPIFY_MULTIPASS_SECRET'),
      googleClientId: str('GOOGLE_CLIENT_ID'),
      appleClientId: str('APPLE_CLIENT_ID'),
      sendgridApiKey: str('SENDGRID_API_KEY'),
      magicLinkBaseUrl: str('MAGIC_LINK_BASE_URL', 'caffeineprime://auth/magic'),
    },
    intelipost: {
      url: str('INTELIPOST_API_URL', 'https://api.intelipost.com.br/api/v1'),
      apiKey: str('INTELIPOST_API_KEY'),
    },
    caffeineX: { url: str('CAFFEINE_X_BASE_URL'), apiKey: str('CAFFEINE_X_API_KEY') },
    expo: {
      url: str('EXPO_PUSH_URL', 'https://exp.host/--/api/v2/push/send'),
      accessToken: str('EXPO_ACCESS_TOKEN'),
    },
    app: {
      minSupportedVersion: str('APP_MIN_SUPPORTED_VERSION', '1.0.0'),
      links: {
        privacy: str('LINK_PRIVACY', 'https://www.caffeinearmy.com.br/politica-de-privacidade'),
        terms: str('LINK_TERMS', 'https://www.caffeinearmy.com.br/termos-de-uso'),
        support: str('LINK_SUPPORT', 'https://www.caffeinearmy.com.br/atendimento'),
        subscribeUrl: str('LINK_SUBSCRIBE', 'https://www.caffeinearmy.com.br/prime'),
      },
    },
  };
}

export type Env = ReturnType<typeof loadEnv>;
export const ENV = Symbol('Env');
