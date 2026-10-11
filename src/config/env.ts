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
  const port = num('PORT', 3333);
  return {
    port,
    nodeEnv: str('NODE_ENV', 'development'),
    // URL pública do BFF, usada para montar links absolutos (ex.: imagens em /static).
    publicBaseUrl: str('PUBLIC_BASE_URL', `http://localhost:${port}`).replace(/\/+$/, ''),
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
    firebase: {
      // JSON da service account (string inteira) para o FCM via firebase-admin.
      serviceAccountJson: str('FIREBASE_SERVICE_ACCOUNT_JSON'),
    },
    // Frentes 2 e 5 (docs/contexto-prime.md §2.5): flags do app em GET /config.
    features: {
      routine: bool('FEATURE_ROUTINE', true),
      health: bool('FEATURE_HEALTH', true),
      assistant: bool('FEATURE_ASSISTANT', true),
    },
    /**
     * Versões vigentes dos termos de consentimento (LGPD, §9). Mudar a versão obriga o app a
     * pedir o consentimento de novo: rotas gated exigem `granted` na versão corrente.
     */
    consentVersions: {
      push: str('CONSENT_VERSION_PUSH', '2026-10-11'),
      health_data: str('CONSENT_VERSION_HEALTH_DATA', '2026-10-11'),
      routine_data: str('CONSENT_VERSION_ROUTINE_DATA', '2026-10-11'),
      ai_assistant: str('CONSENT_VERSION_AI_ASSISTANT', '2026-10-11'),
      analytics: str('CONSENT_VERSION_ANALYTICS', '2026-10-11'),
    },
    assistant: {
      model: str('ASSISTANT_MODEL', 'claude-sonnet-4-5'),
      apiKey: str('ANTHROPIC_API_KEY'),
      dailyMessageLimit: num('ASSISTANT_DAILY_MESSAGE_LIMIT', 30),
      maxTokens: num('ASSISTANT_MAX_TOKENS', 700),
    },
    reminders: {
      // Lembretes da rotina (push a cada minuto). Desligado em testes.
      enabled: bool('REMINDERS_ENABLED', str('NODE_ENV') !== 'test'),
    },
    app: {
      minSupportedVersion: str('APP_MIN_SUPPORTED_VERSION', '1.0.0'),
      links: {
        privacy: str('LINK_PRIVACY', 'https://www.caffeinearmy.com.br/politica-de-privacidade'),
        terms: str('LINK_TERMS', 'https://www.caffeinearmy.com.br/termos-de-uso'),
        support: str('LINK_SUPPORT', 'https://www.caffeinearmy.com.br/atendimento'),
        subscribeUrl: str('LINK_SUBSCRIBE', 'https://www.caffeinearmy.com.br/prime'),
        healthPrivacy: str(
          'LINK_HEALTH_PRIVACY',
          'https://www.caffeinearmy.com.br/politica-de-privacidade#saude',
        ),
      },
    },
  };
}

export type Env = ReturnType<typeof loadEnv>;
export const ENV = Symbol('Env');
