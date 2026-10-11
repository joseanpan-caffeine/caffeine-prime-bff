# Adaptadores

Seleção pela env `ADAPTERS`:

| Valor | Efeito |
|---|---|
| `fake` (padrão) | Tudo em memória, 9 contas de `ROUTES.md`, senha `prime123`. Nenhuma env de integração é necessária. |
| `real` | Classes em `real/` (hoje stubs que lançam `501 NotImplemented` com o endpoint que irão chamar). |

Stores do BFF (sessões, dispositivos, preferências, eventos de webhook, pedidos de exclusão):
`DATABASE_URL` definido → Prisma/Postgres (`prisma/`); ausente → memória (`fake/memory-stores.ts`).

## Variáveis por adaptador real

| Adaptador (porta) | Env | Observações |
|---|---|---|
| `PrimeApiSubscriptionGateway` (`SubscriptionGateway`) | `PRIME_API_URL`, `CAFFEINE_PRIME_X_API_KEY` | header `x-api-key`; endpoints listados nos comentários de cada método |
| `ShopifyIdentityProvider` (`IdentityProvider`) | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_STOREFRONT_TOKEN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_MULTIPASS_CLOUD_FUNCTION_URL`, `SHOPIFY_MULTIPASS_SECRET`, `GOOGLE_CLIENT_ID`, `APPLE_CLIENT_ID`, `SENDGRID_API_KEY`, `MAGIC_LINK_BASE_URL` | login/senha via Storefront; Google/Apple/link mágico via Multipass; e-mail do link mágico via SendGrid |
| `VindiPaymentGateway` (`PaymentGateway`) | `VINDI_API_URL`, `VINDI_API_KEY`, `VINDI_PUBLIC_KEY`, `VINDI_SANDBOX`, `PRIME_API_URL`, `CAFFEINE_PRIME_X_API_KEY` | `VINDI_PUBLIC_KEY` é a única chave que chega ao app (`GET /payments/vindi-config`) |
| `ShopifyMetaobjectCatalog` (`CatalogSource`) | `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN` | escopo `read_metaobjects`; cache sugerido 10 min |
| `IntelipostQuoter` (`ShippingQuoter`) | `INTELIPOST_API_URL`, `INTELIPOST_API_KEY` | header `api-key` |
| `CaffeineXWallet` (`PointsWallet`) | `CAFFEINE_X_BASE_URL`, `CAFFEINE_X_API_KEY` | header `x-api-key` |
| `ExpoPushSender` (`PushSender`) | `EXPO_PUSH_URL`, `EXPO_ACCESS_TOKEN` | token opcional (Bearer) |
| Stores Prisma | `DATABASE_URL` | `npm run prisma:generate` após mudar o schema; `npx prisma migrate dev` para criar as tabelas |

Envs transversais (independem do adaptador): `JWT_SECRET`, `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`,
`VINDI_WEBHOOK_SECRET`, `FREIGHT_SERVICE_ACCESS_TOKEN`, `CORS_ORIGINS`, `THROTTLE_DISABLED`, `PORT`, `PUBLIC_BASE_URL`.
Veja `.env.example` para os padrões.

## Arquivos estáticos e imagens do catálogo fake

A pasta `public/` é servida em `/static` (fora do prefixo `/v1`), ex.: `public/products/whey.png` →
`${PUBLIC_BASE_URL}/static/products/whey.png`. O catálogo fake monta os `imageUrl` com `PUBLIC_BASE_URL`
(padrão `http://localhost:${PORT}`); ao testar em dispositivo físico/emulador defina o IP da máquina
(ex.: `PUBLIC_BASE_URL=http://192.168.0.10:3333`). Produtos sem imagem local ficam sem `imageUrl`
e o app exibe um placeholder — não há URLs de CDN inventadas.

## Como conectar um adaptador real

1. Implementar os métodos da classe em `real/` (cada um já indica o endpoint da Prime API/serviço).
2. Mapear a resposta externa para os tipos de `src/contracts/api.ts` (o resto do BFF não muda).
3. Rodar com `ADAPTERS=real` e as envs acima. Os testes e2e continuam rodando com `fake`.
