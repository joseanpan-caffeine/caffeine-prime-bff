import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { SwaggerModule } from '@nestjs/swagger';
import { buildOpenApiDocument, createApp } from './app.factory';

async function bootstrap() {
  const { app, env } = await createApp();
  SwaggerModule.setup('docs', app, buildOpenApiDocument(app));
  await app.listen(env.port);
  const logger = new Logger('Bootstrap');
  logger.log(
    `BFF ouvindo em http://localhost:${env.port}/v1 (adaptadores: ${env.adapters}, banco: ${env.databaseUrl ? 'postgres' : 'memória'})`,
  );
  logger.log(`Swagger em http://localhost:${env.port}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
