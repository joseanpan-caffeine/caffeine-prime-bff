# Caffeine Army Prime — Arquitetura e requisitos do app (v1)

> Decisões tomadas em 10/10/2026. Base: docs 01 (Prime API), 02 (loja Hydrogen) e 03 (webhooks Estoca).

## 1. Decisões

| Tema | Decisão |
|---|---|
| Escopo v1 | Tudo que a Prime API já permite (ver §8) |
| Backend do app | **BFF** como serviço novo, separado da Prime API |
| Login | E-mail/senha Shopify, Google, Apple e link mágico (os três últimos via Multipass) |
| App | React Native + Expo (um código para iOS e Android), TypeScript |
| Fonte dos dados de assinatura | Prime API atual, sem alteração. O BFF a encapsula; quando a Prime API for reescrita, só o BFF muda |
| Código da Prime API | Sem acesso por enquanto; contratos tirados do doc 01 e do uso real na loja (doc 02) |

## 2. Visão geral

```
┌──────────────┐  HTTPS + JWT do BFF   ┌──────────────┐  x-api-key   ┌──────────────┐
│  App Expo    │ ───────────────────▶ │     BFF      │ ───────────▶ │  Prime API   │──▶ Vindi, Omie,
│ iOS/Android  │ ◀─────────────────── │ (Cloud Run)  │              │  (NestJS)    │    Intelipost…
└──────┬───────┘   JSON pronto p/ tela └──┬───┬───┬───┘              └──────────────┘
       │                                  │   │   │
       │ tokenização do cartão            │   │   └──▶ Shopify Storefront (login, customer)
       ▼ (chave pública, só gateway_token)│   │        Shopify Admin (metaobjects: planos,
┌──────────────┐                          │   │        catálogo, brindes, motivos)
│    Vindi     │                          │   └──────▶ Caffeine X (pontos)
│ public API   │                          ▼
└──────────────┘                   ┌──────────────┐     ┌──────────────┐
                                   │  Postgres    │     │ Expo Push /  │
                                   │ (dados só do │     │ FCM + APNs   │
                                   │  app)        │     └──────────────┘
                                   └──────────────┘
Webhooks (Vindi, Prime, Estoca) ──▶ BFF /webhooks/* ──▶ push + invalidação de cache
```

Princípios:
1. O app só conhece o BFF. Nenhuma chave de terceiro no app, exceto a chave **pública** da Vindi.
2. O BFF nunca confia em IDs vindos do app: resolve o cliente pelo token e só opera na assinatura dele.
3. Regras de negócio (D-2, créditos de pausa, elegibilidade de cancelamento, melhor desconto) são decididas no servidor; o app recebe `allowed: false, reason: "..."` e exibe.
4. Uma chamada por tela: o BFF agrega as 6–7 fontes que o dashboard da loja consulta e devolve um JSON pronto.

## 3. Stack

| Camada | Escolha | Motivo |
|---|---|---|
| App | Expo SDK (React Native), TypeScript, Expo Router, TanStack Query, Zustand, `expo-secure-store` | Um código, OTA updates (EAS Update), ecossistema maduro |
| BFF | Node 22 + NestJS (mesmo framework da Prime API, facilita a equipe) | Alternativa leve: Hono. NestJS traz validação, Swagger, guards prontos |
| Hospedagem BFF | Google Cloud Run (a empresa já usa Cloud Functions/Cloud Run) | Escala a zero, deploy por container |
| Banco do BFF | Postgres (Cloud SQL ou Supabase) + Prisma | Só dados do app: dispositivos/push, sessões, preferências, eventos de webhook processados, cache |
| Cache | Redis (Memorystore) ou cache em Postgres | Dashboard por cliente (TTL 60 s), metaobjects (TTL 10 min) |
| Push | Expo Push Service (abstrai FCM e APNs) | Simples; migrável para FCM/APNs direto se precisar |
| Observabilidade | Sentry (app e BFF), logs estruturados no Cloud Logging, alertas Slack | Mesmo padrão da Prime API |
| CI/CD | GitHub Actions: lint, testes, build do BFF → Cloud Run; EAS Build/Submit para lojas | |
| Ambientes | `staging` (Prime API staging, Vindi sandbox, plano 75651) e `production` | O app tem build separado por ambiente |

## 4. Autenticação

### 4.1 Fluxos

| Método | No app | No BFF |
|---|---|---|
| E-mail/senha | Tela de login | `POST /auth/login` → Storefront `customerAccessTokenCreate` |
| Google | `expo-auth-session` obtém `id_token` do Google | `POST /auth/google` → valida `id_token` → chama a Cloud Function Multipass (`SHOPIFY_MULTIPASS_CLOUD_FUNCTION_URL`) com nome/e-mail → `customerAccessTokenCreateWithMultipass` |
| Apple | `expo-apple-authentication` obtém `identityToken` | `POST /auth/apple` → valida JWT da Apple → mesmo caminho Multipass. Apple só envia nome/e-mail no primeiro login: salvar no BFF |
| Link mágico | Tela "enviar link" + deep link `caffeineprime://auth/magic/{token}` (Universal Link) | `POST /auth/magic-link` envia e-mail via SendGrid com link; `POST /auth/magic-link/exchange` troca o token Multipass por `customerAccessToken` |

Todos terminam com um `customerAccessToken` da Shopify. O BFF então:
1. Consulta `customer { id email firstName }` na Storefront API.
2. Extrai o `shopifyCustomerId` numérico.
3. Emite **seus próprios tokens**: access JWT (15 min, contém `sub = shopifyCustomerId`) e refresh token opaco (30 dias, rotativo, guardado com hash no Postgres, vinculado ao dispositivo).
4. Guarda o `customerAccessToken` da Shopify criptografado no servidor, associado à sessão, para chamadas futuras à Storefront (pedidos Shopify, dados do cliente).

No app: tokens em `expo-secure-store` (Keychain/Keystore). Nunca em AsyncStorage. Logout revoga o refresh token no servidor e apaga o token de push do dispositivo.

### 4.2 Autorização (o ponto que a loja não faz)
Guard em toda rota `/me/*`:
- Carrega `GET /subscriptions/customers/{shopifyCustomerId}` (com cache curto) → obtém `subscription.id`, `vindiSubscriptionId` e a lista de `billId`s.
- Qualquer `subscriptionId`, `billId`, `scheduleId`, `paymentProfileId` ou `shippingAddressId` da requisição que não pertença a essa assinatura → `403`.
- O app nunca envia `shopifyCustomerId`; o BFF usa o do token.

## 5. Contrato do BFF (v1)

Prefixo `/v1`. Respostas em JSON, erros no formato `{code, message, details?}`. Ações mutáveis aceitam header `Idempotency-Key`.

### Auth
| Rota | Função |
|---|---|
| `POST /auth/login` | e-mail/senha |
| `POST /auth/google`, `POST /auth/apple` | login social |
| `POST /auth/magic-link`, `POST /auth/magic-link/exchange` | link mágico |
| `POST /auth/refresh`, `POST /auth/logout` | sessão |
| `POST /auth/register` | cadastro (nome, e-mail, senha, CPF, telefone, nascimento), espelha `auth/register` da loja |

### Conta e assinatura
| Rota | Prime API por trás | Observações |
|---|---|---|
| `GET /me` | Storefront `customer` + `/subscriptions/customers/{id}` | perfil + status resumido |
| `GET /me/dashboard` | subscription, lastcanceled, `schedulings/{vindiSubId}`, `bills`, `snapshot`, `promos`, carteira Caffeine X, metaobjects | **uma chamada**; inclui `capabilities` (ver §6) |
| `GET /me/subscription` | `/subscriptions/{id}` | detalhe |
| `PATCH /me/profile` | `updateSubscriptionCustomer` + Storefront `customerUpdate` | nome, CPF, telefone, gênero |
| `GET /me/catalog` | metaobjects Shopify (planos, produtos, faixas de desconto, perfis) | para a tela de edição da caixa |
| `POST /me/subscription/preview` | cálculo local (pricing) | preço da caixa antes de confirmar; replica a regra do melhor desconto |
| `POST /me/subscription/scheduling` | `POST /subscriptions/{id}/scheduling` | editar itens/plano/frequência/brindes; `editionScope: next_cycle_only` opcional |
| `DELETE /me/subscription/scheduling` | `DELETE /subscriptions/schedulings/{scheduleId}` | desfazer |
| `PATCH /me/subscription/items/{itemId}/recurrence` | `edit-recurrence` | 60 dias on/off; valida "pelo menos um item normal" |
| `PATCH /me/subscription/discount` | `updateDiscount` | cupom |
| `POST /me/subscription/pause` | `/pause` | `{cycles, reason, listResponse}`; `pauseType` sempre `User` (Offer só via fluxo de retenção interno) |
| `POST /me/subscription/resume` | `/cancelSubscriptionPause` | |
| `POST /me/subscription/cancel` | `DELETE /subscriptions/{id}` + remove tag `Prime` na Shopify Admin | motivos vêm de metaobject; corrige o cancelamento via GET da loja |
| `POST /me/subscription/reactivate` | `/reactivate` + tag | |
| `GET /me/subscription/cancel-reasons`, `/pause-reasons` | metaobjects | listas dinâmicas |

### Pagamento
| Rota | Prime API | Observações |
|---|---|---|
| `GET /payments/vindi-config` | — | devolve `publicKey` e URL (sandbox/prod) para o app tokenizar |
| `POST /me/payment-profile` | Vindi `payment_profiles` (gateway_token → perfil) + `createPaymentProfile` / `updatePaymentProfile/{pp}` + metafield `custom.vindi_payment_profiles` | corpo: `{gatewayToken, paymentCompanyCode?}`. O app envia só o token |
| `DELETE /me/payment-profile/{ppId}` | Vindi delete | só perfis do próprio cliente |
| `GET /me/bills`, `GET /me/bills/{billId}` | `/bills`, `/bills/{billId}` | histórico com rastreio |
| `POST /me/bills/{billId}/pay/pix` | `createPixCharge` | devolve `qrCode`, `copiaECola`, `expiresAt` |
| `POST /me/bills/{billId}/pay/current-card` | `chargeInstantly` | |
| `POST /me/bills/{billId}/pay/new-card` | `updateBillPaymentProfile` + `chargeInstantly` | `{gatewayToken}` |

### Entrega e compras
| Rota | Prime API | Observações |
|---|---|---|
| `GET /me/shipping-address` | `/shippingAddress` | |
| `POST /me/shipping-address/quote` | Intelipost (via lógica da loja `delivery/option`) | cotação antes de salvar |
| `PATCH /me/shipping-address` | `updateShippingAddress/{addrId}` | inclui campos da cotação |
| `GET /me/tracking` | `bills[0].order.fulfillment` | status + eventos + `trackingUrl` |
| `POST /me/single-purchase` | `create-single-invoice` | compra avulsa |
| `GET /me/savings` | `discount-tracker` | economia 12 meses |
| `GET /me/wallet` | Caffeine X | pontos |

### Dispositivo e push
| Rota | Função |
|---|---|
| `POST /me/devices` | registra `expoPushToken`, plataforma, versão do app |
| `DELETE /me/devices/{id}` | |
| `GET /me/notification-preferences`, `PATCH ...` | |
| `GET /config` | versão mínima suportada, feature flags, URLs de política |

### Webhooks (entrada, sem sessão de usuário)
| Rota | Origem | Auth |
|---|---|---|
| `POST /webhooks/vindi` | `bill_created`, `bill_paid`, `charge_rejected`, `bill_canceled` | segredo em query + validação de IP/assinatura |
| `POST /webhooks/prime` | eventos da Prime API, se existirem (pausa processada, agendamento aplicado) | Bearer |
| `POST /webhooks/estoca` | status de rastreio (payload cru v1/v2, ver doc 03) | Bearer `FREIGHT_SERVICE_ACCESS_TOKEN` |

Cada evento recebido é gravado em `webhook_events (source, external_id, received_at, processed_at)`; evento repetido é ignorado (idempotência, ponto 5 do doc 01 §11).

## 6. Regras de negócio no servidor → `capabilities`

O `GET /me/dashboard` devolve um bloco calculado pelo BFF; o app não reimplementa regra nenhuma.

```json
"capabilities": {
  "canEdit":      {"allowed": false, "reason": "EDIT_WINDOW_CLOSED", "until": "2026-10-13T00:00:00-03:00"},
  "canPause":     {"allowed": true,  "creditsLeft": 1, "maxCycles": 2},
  "canResume":    {"allowed": false},
  "canCancel":    {"allowed": true,  "remainingCommitmentMonths": 4, "earlyWindow": false},
  "canReactivate":{"allowed": false},
  "hasPendingBill": true,
  "pendingBill":  {"id": "...", "amount": 216.9, "pixAvailable": true}
}
```

Regras aplicadas (doc 01 §4):
- **Edição**: bloqueada entre D-2 e `nextBillingAt` (§4.14). O BFF calcula em America/Sao_Paulo e armazena/compara em UTC (resolve ponto 1 do §11).
- **Pausa**: só `active`, frequência Semestral/Anual, `pauseCredit > 0`; créditos Anual=2, Semestral=1 (§4.5). Em assinatura pausada: exibir data de retomada (`SubscriptionPause.startAt`).
- **Fidelidade**: `remainingCancelation` e `earlyRemainingCancellation` exibidos como "X meses restantes"; cancelamento segue `checkCancellationEligibility`/`cancellationBlocked` da API.
- **60 dias**: nunca permitir todos os itens com `status = on` (§4.6).
- **Preview de preço**: desconto temporário vence o permanente; promo por produto vence se o valor absoluto for maior, empate = desconto do plano; arredondar para cima ao centavo (§4.3–4.4). O preview é informativo; o valor final vem da Prime API na resposta do scheduling.
- **PIX pendente**: QR em `bill.charges[]` com `paymentMethodName = Pix` e status `pending`; lembrar que PIX vencido vira cobrança no cartão à meia-noite (§4.11), então o app mostra o prazo.
- **Status**: `active`, `future`, `paused`, `canceled`, `fraud_review`; `fraud_review` abre tela "em análise" sem ações.

## 7. Segurança

- Chaves `CAFFEINE_PRIME_X_API_KEY`, `VINDI_API_KEY`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SENDGRID_API_KEY` só no Secret Manager do BFF.
- App: certificate pinning opcional na v1 (avaliar custo de rotação); `expo-secure-store` para tokens; detecção de jailbreak/root só informativa.
- Rate limit por IP e por conta em `/auth/*` (5/min) e em pagamentos (10/min). Bloqueio progressivo após falhas de login.
- Webhooks com validação de origem e idempotência; nenhum endpoint muta via GET.
- Logs sem PII sensível (mascarar CPF, e-mail parcial, nunca cartão). Somente `first6/last4` de cartão trafegam.
- LGPD: tela de privacidade, exclusão de conta no app (exigência Apple/Google) → `POST /me/delete-request` abre chamado e anonimiza dados do BFF; dados na Shopify/Prime seguem processo da empresa.
- Headers: HSTS, sem CORS aberto (BFF só atende o app; se o site também usar, allowlist).
- Ações pendentes na loja, fora do app mas urgentes: rotacionar `CAFFEINE_X_API_KEY` commitada; adicionar verificação de posse em `/api/prime/*`; autenticar webhooks Estoca/Intelipost/Omie (doc 02 §8).

## 8. Telas da v1

| Grupo | Telas |
|---|---|
| Entrada | Splash, Onboarding, Login (senha / Google / Apple / link mágico), Cadastro, Sem assinatura (CTA para assinar no site via WebView ou deep link) |
| Home | Dashboard: status, próxima cobrança/entrega, caixa atual, fatura pendente em destaque, mudança agendada, economia acumulada, pontos |
| Caixa | Editar caixa (catálogo, sabores, quantidades, faixas de desconto), Trocar plano, Brindes, Preview de preço, Confirmação, Desfazer agendamento, Recorrência 60 dias |
| Pausa/Cancelamento | Pausar (ciclos, motivo), Pausada (data de retomada, retomar), Cancelar (motivos + fluxo de retenção), Cancelada (reativar) |
| Pagamento | Cartões (listar, adicionar via formulário tokenizado, remover), Fatura pendente (PIX com QR/copia-e-cola, cartão atual, cartão novo) |
| Pedidos | Histórico, Detalhe do pedido, Rastreio com eventos |
| Entrega | Endereço (CEP → cotação → salvar) |
| Extras | Compra avulsa, Caffeine X (pontos), Perfil (dados, notificações, privacidade, excluir conta), Em análise (fraud_review) |

Push da v1: cobrança recusada, PIX pendente/prestes a vencer, pedido enviado/em trânsito/entregue, renovação em 3 dias (fim da janela de edição), pausa chegando ao fim, mudança agendada aplicada.

## 9. Estrutura dos repositórios

```
caffeine-prime-bff/           caffeine-prime-app/
  src/                          app/            (Expo Router: rotas = telas)
    auth/                       src/
    subscription/                 api/          (cliente HTTP gerado do OpenAPI do BFF)
    payments/                     features/     (dashboard, box, pause, payments, orders…)
    shipping/                     components/
    notifications/                theme/        (fontes GT Pressura, Rund, IBM Plex — já na loja)
    webhooks/                     lib/          (auth, secure store, push)
    integrations/               eas.json
      prime-api/ shopify/       app.config.ts
      vindi/ caffeine-x/
    pricing/                  
  prisma/
  openapi.yaml  ← contrato único; gera tipos para o app
```

## 10. Fases de entrega

| Fase | Entrega | Critério de pronto |
|---|---|---|
| 0 | Acessos e contas (ver §11); repositórios; CI; staging da Prime API acessível do BFF | BFF em staging responde `GET /config` |
| 1 | Auth completa (4 métodos) + `GET /me/dashboard` + app com login e home somente leitura | Assinante real de staging vê sua assinatura no app |
| 2 | Pagamento: cartões, fatura pendente (PIX/cartão), push de cobrança | Fatura de teste paga pelo app |
| 3 | Caixa: catálogo, edição, plano, brindes, preview, agendamento/desfazer, 60 dias | Agendamento criado pelo app aparece na loja |
| 4 | Pausa, cancelamento com retenção, reativação; endereço; rastreio; histórico; compra avulsa | Paridade com a área do assinante na web |
| 5 | Polimento, acessibilidade, analytics (Mixpanel), beta TestFlight/Internal Testing | 20 assinantes beta sem erro crítico por 2 semanas |
| 6 | Publicação nas lojas | Aprovado na App Store e Play |

## 11. O que falta receber (fase 0)

| Item | Para quê | Bloqueia |
|---|---|---|
| `PRIME_API_URL` e `CAFFEINE_PRIME_X_API_KEY` de **staging** | BFF chamar a API | Fase 1 |
| `PUBLIC_VINDI_API_KEY` (sandbox e prod) e `VINDI_API_KEY` sandbox | tokenização e perfis | Fase 2 |
| Storefront API token, domínio da loja, Admin token com escopo `read_metaobjects`, `write_customers` | login, catálogo, tag Prime | Fase 1 |
| URL da Cloud Function Multipass e segredo Multipass (ou acesso para criar uma nova) | Google/Apple/link mágico | Fase 1 |
| Conta Apple Developer e Google Play Console no CNPJ; Sign in with Apple configurado; `GOOGLE_CLIENT_ID` para iOS/Android | builds e login social | Fase 1 (login), Fase 5 (lojas) |
| Projeto GCP (Cloud Run, Secret Manager, Cloud SQL) ou escolha por Supabase | hospedar o BFF | Fase 0 |
| Identidade visual (logo, paleta, uso das fontes GT Pressura / Rund / IBM Plex / VC Henrietta) | telas | Fase 1 |
| Conta SendGrid (template do link mágico) | link mágico | Fase 1 |
| Acesso ao repositório `caffeine-prime-api` (quando possível) | confirmar contratos e webhooks | Fases 2–4 |
| Política de privacidade publicada e processo de exclusão de conta | lojas exigem | Fase 5 |
