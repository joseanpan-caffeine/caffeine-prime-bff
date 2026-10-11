import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { join } from 'node:path';
import { AdaptersModuleOptions } from './adapters/adapters.module';
import { AppModule } from './app.module';
import { Env, loadEnv } from './config/env';

/** Cria a aplicação com toda a configuração global (usado pelo main, pelos testes e2e e pelo openapi). */
export async function createApp(
  options: AdaptersModuleOptions = {},
): Promise<{ app: INestApplication; env: Env }> {
  const env = options.env ?? loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(
    AppModule.forRoot({ ...options, env }),
    { logger: env.nodeEnv === 'test' ? false : undefined },
  );

  app.setGlobalPrefix('v1');
  // Imagens etc. em `public/` servidas em /static (fora do prefixo /v1). O app carrega essas
  // imagens de outra origem, então o CORP do helmet precisa ser `cross-origin` para elas.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/static',
    maxAge: '1d',
  });
  // CORS desligado por padrão: o BFF só atende o app nativo. Allowlist via CORS_ORIGINS.
  if (env.corsOrigins.length > 0) {
    app.enableCors({
      origin: env.corsOrigins,
      credentials: true,
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key'],
    });
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  return { app, env };
}

export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Caffeine Prime BFF')
    .setDescription(
      'Backend-for-frontend do app Caffeine Army Prime. Contrato em src/contracts/api.ts.',
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, config);
}
