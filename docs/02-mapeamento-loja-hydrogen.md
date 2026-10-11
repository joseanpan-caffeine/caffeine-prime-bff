# Mapeamento da loja web (ecommerce-hydrogen-prime) — camada Prime

> Gerado em 10/10/2026 a partir do zip `ecommerce-hydrogen-prime-x-env` (loja Shopify Hydrogen/Remix, deploy em Oxygen). Objetivo: entender como a loja fala com a Prime API para o app mobile reaproveitar a mesma integração.

## Resumo executivo

1. **A Prime API não tem autenticação por cliente.** Toda chamada usa uma única chave de servidor (`x-api-key: CAFFEINE_PRIME_X_API_KEY`) e o cliente é identificado apenas pelo `shopifyCustomerId` numérico ou pelo UUID da assinatura na URL. O navegador nunca chama a Prime API; tudo passa por loaders/actions do Remix.
2. **Consequência para o app:** o app não pode chamar a Prime API diretamente. Precisa de um **BFF** (backend-for-frontend) que guarda a chave, valida o token de cliente Shopify e confere em toda requisição que a assinatura/fatura pertence ao cliente logado.
3. **Identidade = conta Shopify.** Todos os logins (e-mail/senha, Google, link mágico) terminam num `customerAccessToken` da Storefront API. Não existe identidade Prime separada.
4. **Cartão é tokenizado no navegador** direto na Vindi com `PUBLIC_VINDI_API_KEY`; só o `gateway_token` vai ao servidor. O app pode fazer igual.
5. **Falhas de autorização na loja atual** que o BFF deve corrigir: rotas `/api/prime/*` não verificam posse do `subscriptionId`/`billId`; proxies por `shopifyCustomerId` sem login; páginas `prime.$id.*` só checam se há login.

## 1. Autenticação

| Método | Arquivos | Como funciona |
|---|---|---|
| E-mail + senha | `app/routes/api/auth/signIn.tsx`, `app/routes/auth/login.tsx` | Mutation Storefront `customerAccessTokenCreate`. `api/auth/signIn` devolve `{customerAccessToken, expiresAt}` em JSON. |
| Google | `app/services/auth.server.ts`, `app/routes/auth/google/*` | OAuth via `remix-auth-google`, depois Multipass. |
| Multipass | `auth.server.ts` (`loginWithMultipass`) | Servidor chama `SHOPIFY_MULTIPASS_CLOUD_FUNCTION_URL` (GCP) que assina o token; depois `customerAccessTokenCreateWithMultipass`. |
| Link mágico por e-mail | `api/auth/create.multipass.tsx`, `auth/multipass/$token.tsx` | Token Multipass enviado via SendGrid como `${HYDROGEN_DOMAIN}/auth/multipass/${token}`. |
| Token + customerId | `api/auth/multipass.$multipassToken.customerAccessToken.tsx` | Devolve `{customerAccessToken, customerId}`. |

Armazenamento do token: cookie de sessão `customerSession` (httpOnly, 30 dias, domínio `caffeinearmy.com.br`) **e** cookie legível por JS `customerAccessToken` (não httpOnly) — `app/utils/auth.ts`, `app/root.tsx:223-271`. `checkAuthentication()` só testa existência do token. `app/services/session.server.ts` tem segredo hardcoded `'s3cr3tx'`.

Identificação na Prime API: `shopifyCustomerId` (parte numérica do GID), UUID da assinatura, `vindiSubscriptionId` para schedulings. Nenhum token de cliente é repassado.

## 2. Cliente da Prime API

- Base: `env.PRIME_API_URL`; header `x-api-key: env.CAFFEINE_PRIME_X_API_KEY`.
- Wrapper tipado: `app/routes/api/prime/prime-api-request.ts`; maioria usa `fetch` cru.
- `lib/CaffX` é outra API (Caffeine X, carteira de pontos): `CAFFEINE_X_API_URL` + `X-Api-Key`.

### Endpoints usados pela loja (todos server-side)

| Método | Path | Função |
|---|---|---|
| GET | `/subscriptions/customers/{shopifyCustomerId}` | Assinatura atual do cliente |
| GET | `/subscriptions/customers/{id}/lastcanceled` | Última assinatura cancelada |
| GET | `/subscriptions/customers/{id}/bills` | Histórico de faturas com pedido, fulfillment e `trackingUrl` |
| GET | `/subscriptions/customers/{id}/first-bill` | Primeira fatura |
| GET | `/subscriptions/customers/{id}/discount-tracker?startDate=` | Economia dos últimos 12 meses |
| PATCH | `/subscriptions/customers/{id}/updateSubscriptionCustomer` | Sincroniza nome, CPF, telefone, gênero |
| GET | `/subscriptions/{id}` | Detalhe da assinatura |
| GET | `/subscriptions/{id}/verifyPendingBills` | 406 = há fatura pendente |
| GET | `/subscriptions/{id}/shippingAddress` | Endereço de entrega |
| PATCH | `/subscriptions/{id}/updateShippingAddress/{addrId}` | Troca endereço (com cotação Intelipost) |
| GET | `/subscriptions/{id}/bills/{billId}` | Fatura/pedido único |
| POST | `/subscriptions` | Cria assinatura: 201 ok, 202 em análise, 402 pagamento recusado, 422 já assinante |
| POST | `/subscriptions/{id}/create-single-invoice` | Compra avulsa sobre a assinatura |
| POST | `/subscriptions/{id}/scheduling` | Agenda mudança de itens/plano/frequência/desconto/brindes para o próximo ciclo |
| GET | `/subscriptions/schedulings/{vindiSubscriptionId}` | Mudança agendada pendente |
| DELETE | `/subscriptions/schedulings/{scheduleId}` | Desfaz mudança agendada |
| PATCH | `/subscriptions/{id}/product-items/{itemId}/edit-recurrence` | Liga/desliga recorrência de um item |
| PATCH | `/subscriptions/{id}/updateDiscount` | Troca cupom/percentual/ciclos temporários |
| POST | `/subscriptions/{id}/pause` | Pausa `{cycles, pauseType, pauseReason, reason?, listResponse?}` |
| POST | `/subscriptions/{id}/cancelSubscriptionPause` | Retoma assinatura pausada |
| DELETE | `/subscriptions/{id}` | Cancela `{reason, listResponse[]}` |
| POST | `/subscriptions/{id}/reactivate` | Reativa cancelada |
| POST | `/subscriptions/{id}/createPaymentProfile` | Novo cartão |
| PATCH | `/subscriptions/{id}/updatePaymentProfile/{ppId}` | Substitui cartão |
| PATCH | `/subscriptions/{id}/bills/{billId}/updateBillPaymentProfile` | Troca cartão de fatura pendente |
| POST | `/subscriptions/{id}/bills/{billId}/createPixCharge` | Reemite fatura pendente como PIX (201) |
| POST | `/subscriptions/{id}/bills/{billId}/chargeInstantly` | Retenta cobrança no cartão atual |
| GET | `/snapshot/{shopifyCustomerId}` | Snapshot persistido da caixa |
| GET | `/promos/customers/{shopifyCustomerId}` | Promos do cliente |

Não existe endpoint de "pular entrega"; o equivalente é pausa com `cycles` ou edição de um ciclo (`editionScope=next_cycle_only`).

Código morto / URLs quebradas: `http://localhost:3000/...` em `api/vindi/postback.tsx:26` e `services/prime/helpers.ts:10`. Checkout instantâneo em Cloud Run (`prime-instant-checkouts-…run.app`) não é a Prime API.

## 3. Área do assinante (web) → ações

Dashboard: `app/routes/account/prime/($variant).tsx`. Loader busca assinatura, lastcanceled, schedulings, bills, snapshot, promos, carteira Caffeine X e metaobjects Shopify (planos, catálogo, perfis, banners). Redirects: `fraud_review` → `/analise`; sem assinatura → `/account/missing-signature`; cancelada → `/cancelado`.

| Ação | Rota interna | Endpoint Prime |
|---|---|---|
| Editar caixa / plano / sabor / renovar / edição de um ciclo | `POST /api/prime/{id}/edit-signature` | `POST .../scheduling` |
| Oferta de retenção (desconto/upgrade) | `/api/prime/scheduling-subscription` | `POST .../scheduling` |
| Desfazer agendamento | `/api/prime/cancel-scheduling-subscription` | `DELETE /subscriptions/schedulings/{id}` |
| Recorrência de item | `/api/prime/edit-product-recurrence` | `PATCH .../edit-recurrence` |
| Trocar desconto | `/api/prime/update-discount` | `PATCH .../updateDiscount` |
| Pausar | `/api/prime/pause` | `POST .../pause` |
| Retomar | `/api/prime/start` | `POST .../cancelSubscriptionPause` |
| Cancelar (motivos vêm de metaobjects) | `GET /api/prime/cancel-subscription` (muta em GET!) + remove tag `Prime` na Shopify | `DELETE /subscriptions/{id}` |
| Reativar | `/api/prime/reactive-subscription/{id}` + recoloca tag | `POST .../reactivate` |
| Pagar pendente via PIX | `/api/prime/charge/reissue` | `POST .../createPixCharge` |
| Pagar pendente no cartão atual | `/api/prime/charge/reissue-current-card` | `POST .../chargeInstantly` |
| Pagar pendente com cartão novo | `/account/prime/{id}/cobranca/{ppId}?billId=` | `updateBillPaymentProfile` |
| Compra avulsa | `/api/prime/create-single-purchase` → `/assinatura/checkout-prime/{id}` | `POST .../create-single-invoice` |
| Economia acumulada | `/api/prime/get-subscription-discount-tracker/{custId}` | `GET .../discount-tracker` |

- PIX: QR code lido de `bill.charges[]` onde `paymentMethodName==='Pix'` e status `pending` (`qrCodePath`, `qrCodeOriginalPath`).
- Rastreio: `bills[0].order.fulfillment.trackingUrl`.
- Brindes: enviados como `giftItems` no payload de scheduling; regras vêm de metaobjects/coleções Shopify.
- Outras páginas: `/cobranca/(:ppId)` (troca de cartão; grava perfis no metafield `custom.vindi_payment_profiles`), `/endereco-de-entrega` (cotação em `/api/prime/delivery/option`), `/configuracao` (legado), `/pedidos/:billId`, `/cancelado`, `/analise`, `/historico-de-pedidos`, `/clube-de-vantagens` e `/caffeine-x` (liberados para status `active|future|paused`, `app/utils/validPrime.ts`).
- Cadastro: `/assinatura/checkout` e `/assinatura/checkout-prime/:id` → `POST /subscriptions` → `/assinatura/:id/obrigado` ou `/em-processamento` (202).

## 4. Vindi

- Tokenização no navegador: POST em `https://app.vindi.com.br/api/v1/public/payment_profiles` (sandbox fora de prod), header `Authorization: Basic btoa(PUBLIC_VINDI_API_KEY)` (`app/utils/vindiAuth.ts`); resposta `payment_profile.gateway_token`. Código em `migrationComponents/CheckoutPrime/CheckoutPayment.tsx`, `components/PrimeNew/Checkout/CheckoutForm/index.tsx`, rota cobranca. `payment_method_code: 'credit_card'` ou `'credit_card_sem_retentativa'`; `payment_company_code:'elo'` quando aplicável. Existe proxy server-side em `api/vindi/public/payment_profiles.tsx`.
- Servidor: `app/services/vindi/vind.server.ts` (`VINDI_API_KEY`) cria `payment_profile` com `gateway_token` + `vindiCustomerId`; campos (id, holder, validade, first6/last4, bandeira) vão para a Prime API.
- `helpers/VindiHelper.ts`: IDs de produto Vindi hardcoded por handle/ambiente; parsers dos metafields `vindi_customer_id` e `vindi_payment_profiles`.
- PIX é criado pela Prime API, nunca pela loja.
- Webhook `api/vindi/postback.tsx`: valida `?secret=` contra `VINDI_WEBHOOK_SECRET`; trata `bill_created`, `bill_paid`, `bill_canceled`; para faturas de assinatura chama `localhost:3000` (quebrado em prod).

## 5. Outras integrações

- **Estoca**: webhook `api/estoca/webhook.tsx` (sem auth) mapeia status → fulfillment event Shopify; estoque via `ESTOCA_X_API_KEY`/`ESTOCA_WAREHOUSE_ID`. Ver doc "Breaking change webhooks Estoca".
- **Omie**: ERP (pedidos e clientes), fila Cloud Run `omie-queues`; postback sem auth visível.
- **Intelipost**: cotação de frete no checkout e troca de endereço; webhook de rastreio sem auth; cotações falhas vão para `webhook.cool` (sink de debug).
- **HubSpot**: CRM e recuperação de carrinho Prime.
- **ActiveCampaign**: eventos no browser e tags de contato server-side.
- **Mixpanel**, **Insider**: analytics/marketing no browser.
- **Droz**: WhatsApp (recuperação de carrinho e NPS); rota inbound protegida por `DROZ_X_API_KEY`.
- **UpPromote**: afiliados/cupons; afiliado validado vai como `referrer` em `POST /subscriptions` (ver `docs/EXPERT-BIND.md`).
- **Konduto**: antifraude no browser; relacionado aos estados `fraud_review`/202.

## 6. Documentos internos do repositório

- `docs/ajustes-area-assinante.md`: log de ajustes de UI do dashboard; mapa seção → componente.
- `docs/EXPERT-BIND.md`: contrato de `referrer {email, code}` em `POST /subscriptions`, só para Trimestral/Semestral/Anual.
- `FEATURE_CONTRATOS.md`: metafield `custom.contrato_de_desconto` = `{"contract":["SC","MS","KOA","WHEY","CREA"]}` derivado da caixa.
- `FEATURE_TIER_VALIDATION.md`: `getEligibleTierByProductsConfig` devolve códigos ausentes da caixa (candidatos a upsell).
- `SNAPSHOT_CONTRACT_STRATEGY.md`: janela de aquisição 08/03–01/04/2026; snapshot imutável `custom.snapshot_assinatura`; código atual também lê `/snapshot/{id}` da Prime.
- `PR_DESCRIPTION.md`: brindes de retenção Prime Week 2026 (Kit de Sachês, Copo Térmico), nunca enviados no payload.
- `docs/handoffs/SUBSCRIPTION_UNDER_REVIEW.md`: contrato 201/202/402/422 do `POST /subscriptions`.
- `openspec/specs`: 91 specs (pause-cancel-eligibility, one-cycle-edit, prime-pause-signature-flow, shared-subscription-flow-engine, subscription-under-review, gift-rule-*, progressive-discount-rules, prime-order-cashback-*, etc.). 10 changes ativas, 66 arquivadas.

## 7. Modelos de dados (TypeScript na loja)

- `app/services/prime/types.ts`: `Subscription` (id, vindiSubscriptionId, status, startAt, nextBillingAt, shopifyCustomerId, vindiCustomerId, customerEmail, vindiPlanId, frequency, remainingCancelation, checkCancellationEligibility, paymentProfile, shippingAddress, productItems[], discount, currentPeriod, bills[], projectCode), `ProductItem`, `Discount`, `CurrentPeriod`, `PaymentProfile`, `ShippingAddress`, `Bill`. Campos usados mas não tipados: `planIdentificationName`, `earlyRemainingCancellation`, `cancellationBlocked`, `discount.temporary*`, `paymentProfile.cardNumberLastFour/paymentCompanyName/cardExpirationDate`, campos de endereço.
- `app/routes/api/prime/@types/`: `Bill` (com `order.fulfillment.trackingUrl`, `fulfillmentEvents[]`, `shippingLine.deliveryDate`), `SubscriptionPause {cycles, pauseType: Offer|User|Admin, status, pausedAt, startAt, billingAt}`, `CreateSubscriptionSchedulingsDTO {frequency, productItems[], discount, giftItems?, planIdentificationName, reason?}` (+ `promos`, `snapshotAction`, `forceScheduling`), `CancelSubscriptionReason`, `SubscriptionPrice`.
- Status conhecidos: `active`, `future`, `paused`, `canceled`, `fraud_review`. Inadimplente = última fatura `pending` (`app/lib/subscriptionDefaulter.ts`).
- Body de criação de plano: inline em `assinatura/checkout-prime.$id.tsx:996-1105`.

## 8. Segredos e riscos encontrados no repositório

| Arquivo | Achado |
|---|---|
| `.env.example:26` | `CAFFEINE_X_API_KEY` com valor real commitado (`xLxtfm…`). **Rotacionar.** |
| `app/services/Supabase.ts:6` | JWT Supabase (anon) e URL do projeto hardcoded |
| `app/services/session.server.ts:10` | Segredo de sessão `'s3cr3tx'` |
| `app/components/StampedWidget` | pubkey Stamped (pública por design) |

- `customerAccessToken` também vive em cookie legível por JS (o relatório de segurança em `docs/relatorio-seguranca-segredos-client.pdf` não cobre isso).
- Webhooks Estoca, Intelipost e Omie sem autenticação; cancelamento via GET.
- URLs de Cloud Functions/Cloud Run hardcoded; sinks de debug `webhook.cool`.

## 9. Variáveis de ambiente (remix.env.d.ts)

Shopify: `PUBLIC_STORE_DOMAIN`, `PUBLIC_STOREFRONT_API_TOKEN`, `PRIVATE_STOREFRONT_API_TOKEN`, `PUBLIC_STOREFRONT_API_VERSION`, `PUBLIC_STOREFRONT_ID`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_ADMIN_API_KEY`, `SHOPIFY_SHOP_URL`, `SHOPIFY_MULTIPASS_CLOUD_FUNCTION_URL`, `HYDROGEN_DOMAIN`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID/SECRET`.
Prime/Caffeine X: `PRIME_API_URL`, `CAFFEINE_PRIME_X_API_KEY`, `CAFFEINE_X_API_URL`, `CAFFEINE_X_API_KEY`.
Vindi: `VINDI_API_KEY`, `VINDI_WEBHOOK_SECRET`, `PUBLIC_VINDI_API_KEY`.
Logística/ERP: `INTELIPOST_API_KEY`, `OMIE_API_KEY/SECRET`, `ESTOCA_WAREHOUSE_ID`, `ESTOCA_X_API_KEY`, `ESTOCA_TRACKING_BASE_URL`, `GOOGLE_CLOUD_FUNCTION_PUBLISH_NEW_ORDER_URL`.
Marketing/CRM: `HUBSPOT_ACCESS_TOKEN`, `ACTIVE_CAMPAIGN_*`, `SENDGRID_API_URL/KEY`, `DROZ_*`, `MIXPANEL_TOKEN`, `KONDUTO_PUBLIC_KEY`, `UPPROMOTE_API_KEY`, `GA_TRACKING_ID`, `ENVIRONMENT`.

## 10. Implicações para o app Caffeine Army Prime

1. **Login**: usar os mesmos fluxos Shopify (senha ou Multipass para Google/Apple/link mágico), via BFF. O app guarda o `customerAccessToken` no Keychain/Keystore, nunca em cookie/AsyncStorage.
2. **BFF**: resolve o cliente a partir do token (`customer { id }` na Storefront API), extrai o `shopifyCustomerId`, carrega `/subscriptions/customers/{id}` e só permite operar sobre o `subscriptionId` e os `billId`s dessa assinatura. Guarda `CAFFEINE_PRIME_X_API_KEY` e `VINDI_API_KEY` no servidor.
3. **Cartão**: tokenizar no app com `PUBLIC_VINDI_API_KEY` (igual à web) e enviar só o `gateway_token` ao BFF.
4. **Regras de negócio** (janela D-2, créditos de pausa, melhor desconto, elegibilidade de cancelamento) ficam no servidor; o app só reflete o que o BFF permite.
5. **Push**: cobrança recusada, PIX pendente, pedido em trânsito, renovação próxima e mudança agendada.
6. **Conteúdo dinâmico** (planos, catálogo, perfis, motivos de pausa/cancelamento, brindes) vem de metaobjects Shopify; o BFF expõe isso ao app para não hardcodar.
