/**
 * Gera `openapi.yaml` a partir dos decorators Swagger, sem subir o servidor HTTP.
 * Uso: npm run openapi
 */
import 'reflect-metadata';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stringify } from 'yaml';
import { buildOpenApiDocument, createApp } from '../src/app.factory';
import { loadEnv } from '../src/config/env';

async function main() {
  process.env.ADAPTERS = process.env.ADAPTERS ?? 'fake';
  const env = { ...loadEnv(), nodeEnv: 'test' };
  const { app } = await createApp({ env });
  await app.init();
  const doc = buildOpenApiDocument(app);
  const out = resolve(__dirname, '..', 'openapi.yaml');
  writeFileSync(out, stringify(doc), 'utf8');
  await app.close();
  // eslint-disable-next-line no-console
  console.log(`openapi.yaml gerado em ${out} (${Object.keys(doc.paths).length} rotas)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
