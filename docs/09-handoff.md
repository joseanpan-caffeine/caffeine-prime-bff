# Caffeine Army Prime — Passagem para o time de desenvolvimento

Data: 11/10/2026. Autor da POC: Josean (Produto) com Claude. Este documento é o ponto de entrada; os demais estão em `docs/` do repositório `caffeine-prime-bff` e no projeto "APP PRIME" no claude.ai.

## 1. O que existe hoje

Dois repositórios no GitHub (`joseanpan-caffeine`), a transferir para a organização da empresa:

| Repositório | O que é | Estado |
|---|---|---|
| `caffeine-prime-bff` | Backend-for-frontend em NestJS 10 / Node 22. Única porta de entrada do app. Autenticação por usuário (JWT próprio, identidade = `shopifyCustomerId`), regras de negócio, agregação de dados, webhooks, push, rotina, saúde, assistente de IA, consentimentos. | Completo em modo **fake** (adaptadores em memória). 90 testes unitários + 55 e2e. Adaptadores reais (Prime API, Shopify, Vindi, Intelipost, Caffeine X, Expo/FCM) são esqueletos com o endpoint de cada método anotado. |
| `caffeine-prime-app` | App em **Flutter** (decisão da Tecnologia em 09/06: POC Flutter → nativo). Riverpod + go_router + dio, sem codegen. Branch `react-native-poc` guarda a primeira versão em React Native. | Compila (Flutter 3.47), 22 testes, roda no Chrome contra o BFF fake. Não foi testado em aparelho físico ainda. |

Ambos têm `CLAUDE.md` (invariantes para quem usa Claude Code) e `docs/contexto-prime.md` (contexto de negócio).

## 2. Como rodar em 5 minutos

Pré-requisitos: Node 22, Git, Flutter stable (Windows: `instalar-flutter.ps1` na raiz faz tudo).

```bash
# API (BFF) — http://localhost:3333/v1, Swagger em /docs
cd caffeine-prime-bff && cp .env.example .env && npm install && npm run dev

# App no navegador (Chrome, porta 8081, já liberada no CORS do BFF em modo fake)
cd caffeine-prime-app && flutter pub get
flutter run -d chrome --web-port 8081 --dart-define=API_URL=http://localhost:3333/v1 --dart-define=FAKE_AUTH=true
```

Contas de teste (senha `prime123`, todas `@teste.com`): `ativa` (Anual), `janela` (edição bloqueada D-3), `pausada`, `pendente` (fatura + PIX), `agendada`, `cancelada`, `analise` (fraud_review), `mensal`, `semassinatura`, `novata` (não pode pausar ainda), `fim-fidelidade` (pode cancelar).

Scripts Windows na raiz do workspace: `rodar-api.ps1`, `publicar.ps1`; no app: `verificar.ps1` (pub get + analyze + test → `verificacao.txt`), `rodar.ps1`.

## 3. Arquitetura em uma frase

O app só fala com o BFF; o BFF fala com a Prime API (chave `x-api-key` só no servidor), Shopify (login e metaobjects), Vindi (cartões/PIX) e os demais. Toda regra de prazo (D-3, D-5, 4ª cobrança, fidelidade) é calculada no BFF em `America/Sao_Paulo` e enviada ao app como `capabilities` com `allowed/reason/until/closesAt`; o app nunca calcula prazo nem preço. Detalhes: `docs/04-arquitetura-e-requisitos-app.md`.

Contrato público: `caffeine-prime-bff/src/contracts/api.ts` (fonte de verdade) → `openapi.yaml` (`npm run openapi`) → modelos Dart em `caffeine-prime-app/lib/api/models/` (manuais; ao mudar o contrato, atualizar os dois). Mudanças sempre aditivas.

## 4. Como o time assume

1. **Transferir os repositórios** para a organização (GitHub → Settings → Transfer). Histórico e branches vêm junto.
2. **Ler, nesta ordem**: este documento → `CLAUDE.md` de cada repo → `docs/07-revisao-app-x-contexto.md` (divergências e perguntas abertas) → `docs/06-contexto-negocio-prime.md`.
3. **Fase 1 real** (primeira entrega do time): implementar `src/adapters/real/prime-api-subscription.gateway.ts` e `shopify-identity.provider.ts` contra **staging** da Prime API e da Shopify. Cada método já diz qual endpoint chama. Trocar `ADAPTERS=real` no `.env` liga tudo; os testes e2e com fake continuam valendo como regressão.
4. **Fase 2**: `vindi-payment.gateway.ts` (sandbox, plano 75651), `shopify-metaobject-catalog.ts` (planos, brindes, faixas, perfis, "lata válida"), Intelipost.
5. **Publicação**: contas Apple/Google (`docs/08-contas-apple-google-passo-a-passo.md`), Firebase para push (`FIREBASE_SERVICE_ACCOUNT_JSON` + `google-services.json`/`GoogleService-Info.plist`), ícone/splash, política de privacidade, TestFlight / teste interno.
6. **Infra do BFF**: Dockerfile e docker-compose prontos; CI em `.github/workflows/ci.yml`. Sugestão: Cloud Run + Secret Manager + Cloud SQL (Prisma; rodar `prisma migrate` — há schema, sem migrações geradas). Mover `RemindersScheduler` para um worker em produção.

## 5. Decisões já tomadas (não reabrir sem motivo)

- App em Flutter (POC) com BFF separado; versão final nativa é decisão futura da Tecnologia.
- Login = conta Shopify (senha, Google, Apple e link mágico via Multipass). App guarda só tokens do BFF em armazenamento seguro.
- Cartão tokenizado no app com a chave pública da Vindi; só o `gateway_token` vai ao BFF.
- Regras oficiais (D-3, pausa a partir da 4ª cobrança, desfazer até D-5, trava de fidelidade) implementadas no BFF mesmo onde a Prime API é mais permissiva.
- Id da assinatura não é permanente (muda na troca de plano); o BFF resolve a assinatura corrente a cada requisição.
- Consentimento LGPD por versão antes de rotina, dados de saúde e assistente de IA.
- Fonte: Acumin Pro (Adobe) substituída por Archivo até a licença de embutir ser confirmada.

## 6. Perguntas abertas para o Negócio/Tecnologia

Ver `docs/07-revisao-app-x-contexto.md` §5: renovação da fidelidade após o ciclo 12; referência do D-5; créditos por ciclo × por pausa; "Upgrade de Oferta" muda id?; taxa de cancelamento; produtos obrigatórios; governança da pausa Offer; edição de assinatura `future`; existência de staging; nomenclatura classic/economic.

## 7. Pendências de segurança na loja atual (fora do app, mas urgentes)

Descobertas ao mapear o `ecommerce-hydrogen` (`docs/02`): chave `CAFFEINE_X_API_KEY` commitada no `.env.example` (rotacionar); rotas `/api/prime/*` sem verificação de posse da assinatura; webhooks Estoca/Intelipost/Omie sem autenticação; cancelamento via GET.

## 8. Trabalhando com Claude Code daqui em diante

Os dois repositórios têm `CLAUDE.md` com as invariantes e apontam para `docs/contexto-prime.md`. Para continuar o desenvolvimento com Claude: abrir o repo, pedir a tarefa, e exigir que `npm test && npm run test:e2e && npm run lint && npm run build` (BFF) e `flutter analyze && flutter test` (app) fiquem verdes antes de commitar. O projeto "APP PRIME" no claude.ai contém os mesmos documentos e o histórico das decisões; compartilhe o projeto com o time para que as conversas tenham o contexto.

## 9. Índice dos documentos (`caffeine-prime-bff/docs/`)

| Arquivo | Conteúdo |
|---|---|
| `01-prime-api-documentacao.md` | Documentação da `caffeine-prime-api` (regras, modelo, endpoints, jobs, dívidas) |
| `02-mapeamento-loja-hydrogen.md` | Como a loja web fala com a Prime API; endpoints; auth; Vindi; riscos |
| `03-breaking-change-webhooks-estoca.md` | Payload cru dos webhooks Estoca v1/v2 |
| `04-arquitetura-e-requisitos-app.md` | Arquitetura, contrato do BFF, regras, telas, fases |
| `05-status-poc.md` | Linha do tempo do que foi construído |
| `06-contexto-negocio-prime.md` | Contexto de negócio (KB do B2C) |
| `07-revisao-app-x-contexto.md` | Revisão do app contra o contexto; perguntas abertas |
| `08-contas-apple-google-passo-a-passo.md` | Criação das contas de desenvolvedor |
| `09-handoff.md` | Este documento |
| `contexto-prime.md` | Cópia do 06 referenciada pelo `CLAUDE.md` |
