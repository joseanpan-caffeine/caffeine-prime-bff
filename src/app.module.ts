import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import { AdaptersModule, AdaptersModuleOptions } from './adapters/adapters.module';
import { AuthGuard } from './common/auth.guard';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { IdempotencyInterceptor } from './common/idempotency.interceptor';
import { OwnershipGuard } from './common/ownership.guard';
import { OwnershipService } from './common/ownership.service';
import { AppThrottlerGuard } from './common/throttler.guard';
import { Env, loadEnv } from './config/env';
import { CapabilitiesService } from './core/capabilities.service';
import { PricingService } from './core/pricing.service';
import { AuthModule } from './modules/auth/auth.module';
import { ConfigModule } from './modules/config/config.module';
import { DevicesModule } from './modules/devices/devices.module';
import { HealthModule } from './modules/health/health.module';
import { MeModule } from './modules/me/me.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { ShippingModule } from './modules/shipping/shipping.module';
import { SubscriptionModule } from './modules/subscription/subscription.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { Global, DynamicModule } from '@nestjs/common';

/** Serviços de domínio e utilitários transversais disponíveis em todos os módulos. */
@Global()
@Module({
  providers: [CapabilitiesService, PricingService, OwnershipService],
  exports: [CapabilitiesService, PricingService, OwnershipService],
})
export class CoreModule {}

@Module({})
export class AppModule {
  static forRoot(options: AdaptersModuleOptions = {}): DynamicModule {
    const env: Env = options.env ?? loadEnv();
    if (!env.jwt.secret) throw new Error('JWT_SECRET é obrigatório quando ADAPTERS=real');
    return {
      module: AppModule,
      imports: [
        AdaptersModule.forRoot({ ...options, env }),
        CoreModule,
        JwtModule.register({ global: true, secret: env.jwt.secret }),
        // Limite padrão generoso; /auth/* (5/min) e pagamentos (10/min) sobrescrevem via @Throttle.
        ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 300 }]),
        HealthModule,
        ConfigModule,
        AuthModule,
        MeModule,
        SubscriptionModule,
        PaymentsModule,
        ShippingModule,
        DevicesModule,
        WebhooksModule,
      ],
      providers: [
        { provide: APP_FILTER, useClass: HttpExceptionFilter },
        // Ordem importa: rate limit → autenticação → propriedade do recurso.
        { provide: APP_GUARD, useClass: AppThrottlerGuard },
        { provide: APP_GUARD, useClass: AuthGuard },
        { provide: APP_GUARD, useClass: OwnershipGuard },
        { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
      ],
    };
  }
}
