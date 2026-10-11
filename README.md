# caffeine-prime-bff

Backend-for-frontend do app **Caffeine Army Prime** (iOS/Android). O app só conhece este serviço; o BFF
encapsula Prime API, Shopify, Vindi, Intelipost, Caffeine X e Expo Push, decide as regras de negócio no
servidor (`capabilities`) e devolve JSON pronto para cada tela.

- Contrato público: `src/contracts/api.ts` (fonte única) e `openapi.yaml` (gerado).
- Além da gestão da assinatura, o BFF cobre as frentes 2 e 5 do contexto (`docs/contexto-prime.md` §2.5):
  consentimentos LGPD, rotina/check-ins com lembretes, agregados de saúde (HealthKit/Health Connect) e o
  assistente Prime IA.
- Rotas, regras e contas fake: `ROUTES.md`.
- Arquitetura e decisões: `docs-arquitetura.md`.

## Como rodar

Requisitos: Node 22+. Não precisa de banco nem de credenciais para o modo padrão.

```bash
npm install
cp .env.example .env        # opcional; os padrões já servem para desenvolvimento
npm run dev                 # http://localhost:3333/v1  |  Swagger: http://localhost:3333/docs
```

Produção/containers:

```bash
npm run build && npm start                     # dist/main.js
docker compose up --build                      # BFF + Postgres (Prisma) na porta 3333
```

Testes e qualidade:

```bash
npm test            # unitários (core: capabilities, pricing, recorrência, timezone, rotina/streaks, sugestões de saúde, prompt do assistente, scheduler)
npm run test:e2e    # supertest com adaptadores fake (contas, 403 de propriedade, PIX via webhook, consentimento, rotina, saúde, assistente…)
npm run lint
npm run openapi     # regenera openapi.yaml a partir dos decorators Swagger
```

### Exemplo rápido

```bash
curl -s localhost:3333/v1/health
TOKEN=$(curl -s -X POST localhost:3333/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"ativa@teste.com","password":"prime123"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s localhost:3333/v1/me/dashboard -H "Authorization: Bearer $TOKEN"
```

## Contas fake (`ADAPTERS=fake`, padrão)

Senha de todas: `prime123`. Datas são relativas ao momento em que o servidor sobe.

| E-mail | Cenário |
|---|---|
| ativa@teste.com | Anual, ativa, 2 créditos de pausa, próxima cobrança em 12 dias, último pedido em trânsito |
| janela@teste.com | Semestral, ativa, próxima cobrança amanhã (janela D-3 fechada → `EDIT_WINDOW_CLOSED` e `PAUSE_WINDOW_CLOSED`) |
| pausada@teste.com | Anual, pausada por 2 ciclos: 1º já faturado em R$ 0,00 (`pausedCycle`), falta 1; 0 créditos |
| pendente@teste.com | Trimestral, ativa com fatura pendente e PIX disponível |
| agendada@teste.com | Anual, ativa com mudança agendada |
| cancelada@teste.com | cancelada há 20 dias (pode reativar) |
| analise@teste.com | `fraud_review` (tudo bloqueado com `UNDER_REVIEW`) |
| mensal@teste.com | Mensal, ativa, sem créditos de pausa |
| semassinatura@teste.com | cliente Shopify sem assinatura |
| novata@teste.com | Anual com 1 cobrança paga: ainda não pode pausar (`MIN_PAID_CYCLES`) |
| fim-fidelidade@teste.com | Anual com fidelidade cumprida: pode cancelar até a véspera da cobrança |

Atalhos do modo fake:

- Login Google/Apple: `idToken` no formato `fake:<email>` (e-mail novo cria o cliente).
- Link mágico: `POST /auth/magic-link` devolve `debugToken` no body (só com `ADAPTERS=fake`).
- Cartões: `gatewayToken` no formato `tok_<bandeira>_<4 últimos>` (ex.: `tok_visa_4242`); `tok_declined_*` é recusado.
- Cupons: `PRIME10` (10%, 3 ciclos), `BEMVINDO30` (30%, 1 ciclo), `ANUAL28` (28% permanente).
- PIX: `POST /me/bills/:id/pay/pix` gera o QR; a fatura só vira `paid` após
  `POST /v1/webhooks/vindi?secret=dev-secret` com `{"event":{"type":"bill_paid","data":{"bill":{"id":"<billId>"}}}}`.
  Cartão (atual/novo) confirma na hora.
- Rastreio: `POST /v1/webhooks/estoca` com `Authorization: Bearer dev-freight-token`, payload v1 ou v2;
  o pedido em trânsito de `ativa@teste.com` tem `external_id` `90017001` e `trackingCode` `48B155B3292C`.

Todas as mutações alteram o estado em memória (pausar → `paused`, agendar → `scheduledChange`, etc.) até o
processo reiniciar.

## Frentes 2 e 5: consentimento, rotina, saúde e Prime IA

- **Consentimento LGPD primeiro**: `GET/PUT /me/consents`. As rotas de rotina, saúde e assistente só respondem
  com o consentimento (`routine_data`, `health_data`, `ai_assistant`) concedido na versão vigente de
  `GET /config → consentVersions`; senão 403 `CONSENT_REQUIRED` com `details.kind`. Flags em `features`.
- **Rotina**: `GET /me/routine` já vem com um plano derivado da caixa; `PUT` edita lembretes/meta/fuso;
  `POST /me/routine/check-ins` é idempotente por item+data; `GET /me/routine/summary` calcula streaks no fuso do
  plano e a previsão de estoque. Regras em `src/core/routine.service.ts` (puro, com testes de borda de fuso).
- **Lembretes**: `RemindersScheduler` (`src/modules/routine/reminders.scheduler.ts`) roda a cada minuto dentro
  do processo HTTP e envia push para itens no horário local do plano ainda não marcados. **Em produção isso deve
  sair para um worker** (Cloud Run Job + Cloud Scheduler ou fila): com mais de uma réplica cada instância
  dispararia o mesmo lembrete, e a deduplicação atual é só em memória. `REMINDERS_ENABLED=false` desliga.
- **Saúde**: o app envia só agregados diários (`POST /me/health/sync`); `GET /me/health/summary` devolve 7 dias e
  sugestões de **uso dos produtos** por regra (`src/core/health-suggestions.ts`), nunca orientação médica.
- **Prime IA**: `POST /me/assistant/messages` (fake: respostas por palavra-chave; real: Anthropic com
  `ANTHROPIC_API_KEY`/`ASSISTANT_MODEL`). O prompt (`src/modules/assistant/system-prompt.ts`) fala pt-BR, usa o
  contexto injetado sem PII, sugere ações só por deep links da allowlist e recusa diagnóstico, prescrição e dose
  acima do rótulo. Limite diário `ASSISTANT_DAILY_MESSAGE_LIMIT` (30) → 429 `ASSISTANT_LIMIT`; 10 mensagens/min.
- **Push**: `POST /me/devices` aceita `pushToken` + `pushProvider` (`expo`|`fcm`|`apns`); `expoPushToken`
  continua aceito como alias deprecado. Em `ADAPTERS=real` o `RoutingPushSender` manda Expo para o Expo e
  FCM/APNs para o `FcmPushSender` (stub até instalar `firebase-admin`).

## Trocar para adaptadores reais

1. `ADAPTERS=real` e as envs listadas em `src/adapters/README.md` (Prime API, Shopify, Vindi, Intelipost, Caffeine X, Expo).
2. Implementar os métodos das classes em `src/adapters/real/` — hoje cada um lança `501` com um comentário
   dizendo o endpoint exato da Prime API/serviço que deve chamar.
3. Opcional: `DATABASE_URL` para persistir sessões, dispositivos, preferências e eventos de webhook no Postgres
   (`npm run prisma:generate` e `npx prisma migrate dev`). Sem `DATABASE_URL`, tudo fica em memória.

Os módulos Nest dependem apenas das portas em `src/ports/`, então nada fora de `src/adapters/` muda.

## Estrutura

```
src/
  contracts/api.ts        contrato público (tipos do app)
  core/                   domínio puro, sem dependências externas
    capabilities.service  regras: janelas D-3/D-5 (America/Sao_Paulo), pausa (4ª cobrança), fidelidade, fatura pendente
    pricing.service       preview: plano × cupom temporário × faixas de itens, arredondamento p/ cima
    recurrence-rules      60 dias: ao menos um item com recurrence null
    routine.service       rotina: plano padrão da caixa, streaks no fuso do plano, meta semanal, estoque
    health-suggestions    regras de sugestão (uso do produto) a partir dos agregados de saúde
  ports/                  interfaces + tokens de injeção (SubscriptionGateway, IdentityProvider, PaymentGateway,
                          CatalogSource, ShippingQuoter, PointsWallet, PushSender, stores)
  adapters/
    adapters.module.ts    escolhe fake|real e memória|Prisma pelas envs
    fake/                 implementações em memória + seed das 9 contas
    real/                 Prime API, Shopify, Vindi, Intelipost, Caffeine X, Expo/FCM, Anthropic (stubs com endpoints)
    prisma/               stores Postgres
  common/                 AuthGuard (JWT), OwnershipGuard (403), Idempotency-Key, throttler, filtro de erros, DTOs
  modules/                auth, me, subscription, payments, shipping, devices, config, webhooks, health,
                          consent, routine (+ reminders.scheduler), health-data, assistant (+ system-prompt)
  app.module.ts / app.factory.ts / main.ts
prisma/schema.prisma      tabelas do BFF (refresh_tokens, devices, notification_preferences, webhook_events, delete_requests,
                          consents, routine_plans, routine_check_ins, health_daily_samples, health_syncs,
                          assistant_threads, assistant_messages)
test/                     e2e (supertest)
scripts/generate-openapi.ts
```

## Segurança (resumo)

- Access token JWT de 15 min (`sub` = shopifyCustomerId); refresh opaco de 30 dias, rotativo, guardado como
  sha256. Reuso de refresh revogado derruba todas as sessões do cliente.
- `OwnershipGuard`/`OwnershipService`: todo `billId`, `paymentProfileId`, `deviceId` e `itemId` da requisição
  é conferido contra o que pertence ao cliente do token; qualquer outro → `403 FORBIDDEN` (sem revelar existência).
- Rate limit: `/auth/*` 5/min, pagamentos 10/min, assistente 10/min, sync de saúde 30/min, demais 300/min
  (desligável com `THROTTLE_DISABLED=true` em testes).
- `ConsentGuard`: rotas das frentes 2/5 exigem consentimento LGPD na versão vigente (403 `CONSENT_REQUIRED`).
- `helmet`, CORS desligado por padrão (`CORS_ORIGINS` para allowlist), `ValidationPipe` com whitelist.
- Webhooks: Vindi valida `?secret=`; Estoca valida Bearer; ambos deduplicam por id em `webhook_events`.
- Erros sempre `{code, message, details?}`; capabilities negadas respondem `403` com `code` = razão.

## Decisões e desvios documentados

- `pixAvailable` é `true` para qualquer fatura pendente (a Prime API permite `createPixCharge`); o campo `pix`
  da fatura só aparece após o app pedir o QR.
- `canChangeAddress` também respeita a janela D-3 (o pedido do ciclo nasce na cobrança).
- `earlyWindow` = `remainingCommitmentMonths > 0` (cancelamento dentro da fidelidade).
- Preview: faixa de itens (`discountTiers`) concorre com o desconto base (plano ou cupom); cupom temporário
  substitui o permanente mesmo que menor; cupom permanente só entra se melhor. Preço unitário final arredondado
  para cima ao centavo.
- Ids desconhecidos em rotas com `:billId`/`:id` devolvem `403` (não `404`) para não revelar existência.
- `Idempotency-Key` é guardada em memória por 10 min (uma réplica). Em Cloud Run com várias instâncias usar Redis.
