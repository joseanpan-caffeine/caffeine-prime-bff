# Status da POC — atualizado 11/10/2026

## O que existe

Dois repositórios construídos nesta sessão, prontos para subir no GitHub pessoal do Josean (depois transferir para a organização da empresa):

### `caffeine-prime-bff` (NestJS 10, Node 22, TypeScript)
- Arquitetura hexagonal: `src/core` (regras puras), `src/ports` (interfaces), `src/adapters/fake` (memória, 9 contas de teste), `src/adapters/real` (stubs com cliente HTTP e o endpoint da Prime API/Shopify/Vindi anotado em cada método), `src/modules` (auth, me, subscription, payments, shipping, devices, config, webhooks, health).
- Seleção por env: `ADAPTERS=fake|real` (padrão fake), `DATABASE_URL` opcional (sem ele, stores em memória).
- Segurança: JWT 15 min + refresh rotativo (hash sha256, reuso revoga a família), `OwnershipGuard` (403 em qualquer id que não seja do cliente), throttling em auth e pagamentos, idempotência, helmet, CORS fechado, filtro de erro `{code,message}`.
- Webhooks Vindi (`?secret=`, dedupe por id de evento) e Estoca (Bearer, payload cru v1/v2).
- Swagger em `/docs`; `npm run openapi` gera `openapi.yaml` (44 paths).
- Testes: 47 unitários + 43 e2e, todos verdes. Validado manualmente: login → dashboard → PIX → webhook `bill_paid` → fatura paga; 403 cross-customer; pausa consome crédito; janela D-2 fecha edição.
- Dockerfile, docker-compose (Postgres), Prisma schema, CI GitHub Actions.

### `caffeine-prime-app` (Expo SDK 57, Expo Router, TypeScript strict)
- Só fala com o BFF (`EXPO_PUBLIC_API_URL`). Cliente HTTP com refresh single-flight, `Idempotency-Key`, react-query.
- Telas: welcome, login (senha/Google/Apple/link mágico), cadastro, deep link do link mágico, Home (dashboard), Minha caixa (edição com preview de preço), Pedidos (+ detalhe com timeline de rastreio), Perfil (dados, cartões, endereço, notificações, privacidade, excluir conta), pausar/pausada, cancelar (com retenção)/cancelada, em análise, sem assinatura, cartões (tokenização Vindi), pagar fatura (PIX QR + copia-e-cola + cartão), endereço (CEP → cotação).
- Design system próprio (tema escuro café/âmbar), fontes da marca com slot para GT Pressura/Rund.
- `typecheck` e `lint` limpos; bundle web e iOS exportam.
- `EXPO_PUBLIC_FAKE_AUTH=1` liga os atalhos de teste (idToken `fake:<email>`, token de cartão falso, debugToken do link mágico).

## Contas de teste (senha `prime123`)
ativa@ (Anual), janela@ (D-2 fechada), pausada@, pendente@ (fatura + PIX), agendada@, cancelada@, analise@ (fraud_review), mensal@, semassinatura@ — todas `@teste.com`.

## Como rodar
```bash
# BFF
cd caffeine-prime-bff && npm install && npm run dev   # http://localhost:3333/v1, /docs
# App
cd caffeine-prime-app && npm install && cp .env.example .env && npx expo start
```

## Desvios registrados
- `POST /auth/magic-link` devolve `debugToken` só em modo fake (não está no contrato tipado; app trata como opcional).
- Ids desconhecidos devolvem 403 (não 404) para não vazar existência.
- `canChangeAddress` também respeita a janela D-2.
- `prisma generate` não rodou no sandbox (proxy); CI faz isso. Stores Prisma só instanciam com `DATABASE_URL`.

## Atualização 11/10
- Repositórios publicados em `github.com/joseanpan-caffeine/caffeine-prime-bff` e `.../caffeine-prime-app`; cópia local em `C:\Users\josea\Documents\caffeine-prime` (scripts `publicar.ps1` = push + npm install, `rodar.ps1` = abre API e app em duas janelas).
- BFF: correção para carregar `.env` e liberar CORS do Expo web em dev (commit d1156e5).
- App: redesign completo com tema CLARO a partir do Figma "Painel do assinante" (commit aa3a879). Tokens em `caffeine-prime-app/DESIGN.md`: fundo #F3F3F3, card escuro #260F0F, primário #F1D98A, dourado #DBA73F, roxo #7B44DA, verde #82C91E. Fonte da marca é Acumin Pro (Adobe) → substituída por Archivo até confirmar licença. Logo "PRIME" em texto até receber SVG.
- Validado pelo Josean no navegador (login, dashboard) em 11/10.

## Atualização 11/10 (tarde): mudança para Flutter + frentes 2 e 5
- **Decisão da Tecnologia: app em Flutter** (POC) → versão final nativa. O app React Native foi preservado no branch `react-native-poc`; o `main` de `caffeine-prime-app` agora é Flutter (commit 91e857f, ~140 arquivos, Riverpod + go_router + dio, sem codegen).
- **BFF** (commit 1b0058f): consentimentos LGPD (`/me/consents`, versões em `/config`), rotina (`/me/routine`, check-ins, summary com streak e previsão de estoque, lembretes), saúde (`/me/health/sync` só agregados diários, `/me/health/summary` com sugestões por regra), assistente (`/me/assistant/*`, adaptador fake + `AnthropicAssistantProvider`, limite diário, disclaimer). 90 unitários + 55 e2e.
- Contrato estendido (aditivo): `pushToken/pushProvider`, `NotificationPreferences.routine`, `AppConfig.consentVersions`, seções Consent/Routine/Health/Assistant, `CatalogProduct.usageHint/dosesPerUnit`.
- **Limitação do ambiente**: pub.dev e o SDK Dart não são alcançáveis daqui; o Flutter é compilado no PC do Josean via `verificar.ps1` → `verificacao.txt` (Claude lê e corrige). Cinco pontos marcados "VERIFICAR na compilação": local notifications, Firebase, pacote health, login social, app_links.
- Scripts na raiz: `rodar-api.ps1` (API), `publicar.ps1` (push + npm install do BFF); no app: `verificar.ps1`, `rodar.ps1` (Chrome, porta 8081).
- Doc 08 com o passo a passo das contas Apple/Google entregue ao time.

## Próximos passos
1. Josean instala Flutter, roda `flutter create … .` e `verificar.ps1`; Claude corrige até analyze/test verdes.
2. Contas Apple/Google (doc 08) → pipeline de build e beta (TestFlight / teste interno).
3. Fase 1 real: receber credenciais de staging e implementar `PrimeApiSubscriptionGateway` e `ShopifyIdentityProvider` (os stubs já dizem qual endpoint cada método chama).
