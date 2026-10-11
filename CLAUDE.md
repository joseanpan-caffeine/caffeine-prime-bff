# CLAUDE.md — BFF do App Prime (Caffeine Army)

Backend-for-frontend do aplicativo do Prime, o clube de assinatura da Caffeine Army. Fica entre o
app (iOS/Android) e a `caffeine-prime-api` (backend das assinaturas), a Shopify (identidade),
a Vindi (cartões/PIX) e os demais serviços. Contexto de negócio, API e regras:
`docs/contexto-prime.md` (leia antes de mexer em qualquer fluxo de assinatura). Rotas e regras
resumidas: `ROUTES.md`. Arquitetura: `docs-arquitetura.md`.

## Invariantes (adaptadas da seção 12 do contexto)

- Código e comentários em português BR; mensagens de erro ao cliente em pt-BR.
- O BFF **NUNCA** chama `/admin`, `/tasks` ou `/webhooks` da caffeine-prime-api. Só os endpoints
  de cliente (`/subscriptions/*`, `/bills/*` de leitura). Qualquer necessidade de backoffice é
  pedida à Tecnologia, não implementada aqui.
- A chave `x-api-key` da Prime API vive só no BFF (Secret Manager / env), nunca no app. Toda
  requisição do app é autenticada pelo usuário (JWT próprio; identidade = `shopifyCustomerId`) e
  o `OwnershipService`/`OwnershipGuard` confere que todo id (assinatura, fatura, cartão, item,
  dispositivo) pertence ao cliente do token. O app nunca envia `shopifyCustomerId`.
- **Nenhum preço, produto, plano, brinde ou desconto fixo em adaptador real**
  (`src/adapters/real/*`): tudo vem da Prime API ou dos metaobjetos da Shopify. O catálogo em
  `src/adapters/fake/fake-state.ts` existe só para o modo `ADAPTERS=fake`.
- O **valor exibido ao cliente é o que a Prime API devolve**; o `PricingService` é só preview
  informativo e o total final vem da resposta do scheduling. Não recalcular desconto por conta
  própria para mostrar ao cliente.
- **Janelas e prazos calculados em `America/Sao_Paulo`** (`src/core/timezone.ts`), nunca no fuso
  do servidor ou do aparelho, com comparação em UTC. Regras oficiais (§6.1) implementadas em
  `src/core/capabilities.service.ts`:
  - edição da caixa e troca de endereço até **D-3** (a Prime API só bloqueia em D-2; seguimos D-3);
  - pausa só com **3 cobranças pagas** (a partir da 4ª), plano Semestral/Anual, crédito disponível,
    pedido até **D-3**; 1 crédito por ciclo pausado; ciclo pausado gera fatura R$ 0,00 e não conta
    para a fidelidade; pausa `Offer` (retenção) não tem rota pública;
  - desfazer a pausa até **D-5** da cobrança do ciclo pausado;
  - cancelamento travado enquanto `remainingCommitmentMonths > 0`; com 0, permitido até a véspera
    da cobrança seguinte; Mensal sempre pode. O BFF **não calcula nem cobra** taxa de
    cancelamento antecipado (§6.4, regra ainda não estruturada).
  - Toda regra nova entra primeiro aqui com teste unitário na borda de 00:00 São Paulo.
- **Nunca guardar o id da assinatura como permanente**: na troca de plano (caso B, §4.3) a Prime
  API cria uma assinatura `future` nova e cancela a atual. Toda rota resolve a "assinatura
  corrente do cliente" (`getByCustomer`) a cada requisição.
- **Idempotência**: mutações aceitam `Idempotency-Key` (`src/common/idempotency.interceptor.ts`)
  e webhooks deduplicam por `(source, external_id)`. Toque duplo ou retry do app não pode gerar
  ação dupla na Prime API/Vindi. Evitar disparar edições em sequência rápida (a atualização de
  desconto na Vindi é destrutiva).
- **Status desconhecido** vindo da Prime API (string livre) vira `active` + `rawStatus`
  (`src/core/subscription-status.ts`), nunca exceção. Campo ausente ou malformado nos metaobjetos
  da Shopify é tratado com segurança, sem derrubar a rota.
- Não supor consistência imediata entre o que o BFF enviou e o que a Vindi cobra (webhooks e
  jobs de divergência levam instantes); invalidar cache e reler.
- Testes de integração só contra ambiente de homologação da Prime API/Vindi: produção cobra
  cartão de verdade. `npm test`, `npm run test:e2e`, `npm run lint` e `npm run build` precisam
  ficar verdes antes de qualquer entrega.
- Logs sem PII sensível (CPF mascarado, e-mail parcial, nunca número de cartão).
- O contrato público (`src/contracts/api.ts`) é a fonte de verdade e é copiado byte a byte para
  `caffeine-prime-app/src/api/contracts.ts`. Mudanças sempre aditivas (campos novos opcionais);
  depois rodar `npm run openapi`.

## Fontes

- `docs/contexto-prime.md` — contexto de negócio (foto de 11/10/2026; confirmar com a Tecnologia
  antes de construir em cima de item marcado [SISTEMA]).
- Swagger da Prime API: `<url-da-api>/api`.
- Repos de referência: `caffeine-prime-api` (backend), `ecommerce-hydrogen` (Área do Assinante web).
- Regras vivas: KB "Tecnologia & Dados — Prime" no Notion.
