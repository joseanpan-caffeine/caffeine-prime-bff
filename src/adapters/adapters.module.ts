import { DynamicModule, Global, Module, Provider } from '@nestjs/common';
import { Env, ENV, loadEnv } from '../config/env';
import {
  ASSISTANT_PROVIDER,
  ASSISTANT_STORE,
  CATALOG_SOURCE,
  CLOCK,
  Clock,
  CONSENT_STORE,
  DELETE_REQUEST_STORE,
  DEVICE_STORE,
  HEALTH_STORE,
  IDENTITY_PROVIDER,
  NOTIFICATION_PREFERENCES_STORE,
  PAYMENT_GATEWAY,
  POINTS_WALLET,
  PUSH_SENDER,
  REFRESH_TOKEN_STORE,
  ROUTINE_STORE,
  SHIPPING_QUOTER,
  SUBSCRIPTION_GATEWAY,
  WEBHOOK_EVENT_STORE,
} from '../ports';
import { FakeAssistantProvider } from './fake/fake-assistant.provider';
import { FakeCatalogSource } from './fake/fake-catalog.source';
import { FakeIdentityProvider } from './fake/fake-identity.provider';
import { FakePaymentGateway } from './fake/fake-payment.gateway';
import { FakePointsWallet } from './fake/fake-points.wallet';
import { FakePushSender } from './fake/fake-push.sender';
import { FakeShippingQuoter } from './fake/fake-shipping.quoter';
import { FakeState } from './fake/fake-state';
import { FakeSubscriptionGateway } from './fake/fake-subscription.gateway';
import {
  MemoryAssistantStore,
  MemoryConsentStore,
  MemoryDeleteRequestStore,
  MemoryDeviceStore,
  MemoryHealthStore,
  MemoryNotificationPreferencesStore,
  MemoryRefreshTokenStore,
  MemoryRoutineStore,
  MemoryWebhookEventStore,
} from './fake/memory-stores';
import {
  PrismaAssistantStore,
  PrismaConsentStore,
  PrismaDeleteRequestStore,
  PrismaDeviceStore,
  PrismaHealthStore,
  PrismaNotificationPreferencesStore,
  PrismaRefreshTokenStore,
  PrismaRoutineStore,
  PrismaWebhookEventStore,
} from './prisma/prisma-stores';
import { PrismaService } from './prisma/prisma.service';
import { AnthropicAssistantProvider } from './real/anthropic-assistant.provider';
import { CaffeineXWallet } from './real/caffeine-x-wallet';
import { ExpoPushSender } from './real/expo-push-sender';
import { FcmPushSender } from './real/fcm-push-sender';
import { RoutingPushSender } from './real/routing-push-sender';
import { IntelipostQuoter } from './real/intelipost-quoter';
import { PrimeApiSubscriptionGateway } from './real/prime-api-subscription.gateway';
import { ShopifyIdentityProvider } from './real/shopify-identity.provider';
import { ShopifyMetaobjectCatalog } from './real/shopify-metaobject-catalog';
import { VindiPaymentGateway } from './real/vindi-payment.gateway';

export interface AdaptersModuleOptions {
  env?: Env;
  /** Relógio injetável (testes). */
  clock?: Clock;
  /** Instante de referência para semear o estado fake. */
  seedNow?: Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/**
 * Único ponto que decide qual implementação de cada porta é usada:
 * - `ADAPTERS=fake` (padrão): tudo em memória, contas de ROUTES.md.
 * - `ADAPTERS=real`: integrações reais (stubs até a fase de conexão).
 * - Stores: Prisma/Postgres se `DATABASE_URL` definido; senão memória.
 * - Assistente (frente 5): fake por palavra-chave em `fake`; Anthropic em `real`.
 */
@Global()
@Module({})
export class AdaptersModule {
  static forRoot(options: AdaptersModuleOptions = {}): DynamicModule {
    const env = options.env ?? loadEnv();
    const clock = options.clock ?? new SystemClock();

    const common: Provider[] = [
      { provide: ENV, useValue: env },
      { provide: CLOCK, useValue: clock },
    ];

    const integrations: Provider[] =
      env.adapters === 'fake'
        ? [
            {
              provide: FakeState,
              useFactory: () => new FakeState(options.seedNow ?? clock.now(), env.publicBaseUrl),
            },
            FakeSubscriptionGateway,
            FakeIdentityProvider,
            FakePaymentGateway,
            FakeCatalogSource,
            FakeShippingQuoter,
            FakePointsWallet,
            FakePushSender,
            FakeAssistantProvider,
            { provide: SUBSCRIPTION_GATEWAY, useExisting: FakeSubscriptionGateway },
            { provide: IDENTITY_PROVIDER, useExisting: FakeIdentityProvider },
            { provide: PAYMENT_GATEWAY, useExisting: FakePaymentGateway },
            { provide: CATALOG_SOURCE, useExisting: FakeCatalogSource },
            { provide: SHIPPING_QUOTER, useExisting: FakeShippingQuoter },
            { provide: POINTS_WALLET, useExisting: FakePointsWallet },
            { provide: PUSH_SENDER, useExisting: FakePushSender },
            { provide: ASSISTANT_PROVIDER, useExisting: FakeAssistantProvider },
          ]
        : [
            ExpoPushSender,
            FcmPushSender,
            { provide: SUBSCRIPTION_GATEWAY, useClass: PrimeApiSubscriptionGateway },
            { provide: IDENTITY_PROVIDER, useClass: ShopifyIdentityProvider },
            { provide: PAYMENT_GATEWAY, useClass: VindiPaymentGateway },
            { provide: CATALOG_SOURCE, useClass: ShopifyMetaobjectCatalog },
            { provide: SHIPPING_QUOTER, useClass: IntelipostQuoter },
            { provide: POINTS_WALLET, useClass: CaffeineXWallet },
            // Push por provedor do token: Expo (RN) ou FCM/APNs (Flutter).
            { provide: PUSH_SENDER, useClass: RoutingPushSender },
            { provide: ASSISTANT_PROVIDER, useClass: AnthropicAssistantProvider },
          ];

    const stores: Provider[] = env.databaseUrl
      ? [
          { provide: PrismaService, useFactory: () => new PrismaService(env.databaseUrl!) },
          { provide: REFRESH_TOKEN_STORE, useClass: PrismaRefreshTokenStore },
          { provide: DEVICE_STORE, useClass: PrismaDeviceStore },
          { provide: NOTIFICATION_PREFERENCES_STORE, useClass: PrismaNotificationPreferencesStore },
          { provide: WEBHOOK_EVENT_STORE, useClass: PrismaWebhookEventStore },
          { provide: DELETE_REQUEST_STORE, useClass: PrismaDeleteRequestStore },
          { provide: CONSENT_STORE, useClass: PrismaConsentStore },
          { provide: ROUTINE_STORE, useClass: PrismaRoutineStore },
          { provide: HEALTH_STORE, useClass: PrismaHealthStore },
          { provide: ASSISTANT_STORE, useClass: PrismaAssistantStore },
        ]
      : [
          { provide: REFRESH_TOKEN_STORE, useClass: MemoryRefreshTokenStore },
          { provide: DEVICE_STORE, useClass: MemoryDeviceStore },
          { provide: NOTIFICATION_PREFERENCES_STORE, useClass: MemoryNotificationPreferencesStore },
          { provide: WEBHOOK_EVENT_STORE, useClass: MemoryWebhookEventStore },
          { provide: DELETE_REQUEST_STORE, useClass: MemoryDeleteRequestStore },
          { provide: CONSENT_STORE, useClass: MemoryConsentStore },
          { provide: ROUTINE_STORE, useClass: MemoryRoutineStore },
          { provide: HEALTH_STORE, useClass: MemoryHealthStore },
          { provide: ASSISTANT_STORE, useClass: MemoryAssistantStore },
        ];

    const providers = [...common, ...integrations, ...stores];
    return {
      module: AdaptersModule,
      providers,
      exports: providers.map((p) => ('provide' in p ? p.provide : p)),
    };
  }
}
