# Revisão do app à luz do contexto de negócio (11/10/2026)

Base: `docs/06-contexto-negocio-prime.md` (KB do B2C, Notion). Esta revisão separa o que foi **corrigido no código**, o que **conflita com decisões já registradas** e o que **só o Negócio/Tecnologia pode responder**.

## 1. Alerta principal: a decisão de tecnologia do app

A ata de 09/06/2026 registra: **POC em Flutter → versão final nativa (Kotlin + Swift)**. A POC construída aqui usa **React Native (Expo)**. Isso não invalida o trabalho, mas precisa ser decidido explicitamente antes de avançar:

| Peça | Afetada pela decisão? |
|---|---|
| BFF (regras, auth por usuário, contratos, webhooks, push) | **Não.** Serve qualquer front: Flutter, Kotlin, Swift ou RN. É a parte que resolve a "primeira decisão técnica" do doc (§4.1). |
| Design system extraído do Figma (`DESIGN.md`, tokens, assets) | **Não.** Vale para qualquer tecnologia. |
| Telas em React Native | **Sim.** Se a POC tiver que ser Flutter, as telas são reescritas (o contrato OpenAPI do BFF gera o cliente Dart automaticamente). |

Argumentos para levar à Tecnologia: (a) o doc diz que o objetivo da POC é **medir engajamento**, não escolher stack; (b) a migração "POC → nativo" é reescrita de qualquer forma, seja de Flutter ou de RN; (c) RN com Expo cobre Face ID/biometria, push e deep links via módulos nativos. Se a Tecnologia mantiver Flutter, o custo é reescrever a camada de telas; o restante segue.

**Ação:** levar esta tabela ao Murilo/Tércio e ao Vitor e registrar a decisão.

## 2. Regras de negócio: o que foi corrigido no BFF

| Regra (§6.1/6.2) | Antes | Agora |
|---|---|---|
| Janela de edição | D-2 (como o backend) | **D-3** [REGRA], em America/Sao_Paulo; divergência com a API documentada no código |
| Pausa: mínimo de cobranças | não exigia | **a partir da 4ª cobrança paga** (`MIN_PAID_CYCLES`) |
| Pedido de pausa | sem janela | **até D-3** (`PAUSE_WINDOW_CLOSED`) |
| Desfazer pausa | sempre | **até D-5** (`RESUME_WINDOW_CLOSED`) |
| Cancelamento na fidelidade | permitido (só avisava) | **bloqueado até `remainingCancelation = 0`**; depois, liberado até o dia anterior à cobrança (`COMMITMENT_ACTIVE`, `CANCEL_WINDOW_CLOSED`) |
| Pausa Offer (retenção) | não existia | não consome crédito e ignora elegibilidade; só por caminho interno |
| Ciclo pausado | — | gera fatura de **R$ 0** (esperado), não conta para fidelidade; app mostra "Ciclo pausado" |
| Troca de plano (Caso B) | id fixo | **id da assinatura muda**; BFF sempre resolve a assinatura corrente do cliente; teste e2e cobre |
| Status desconhecido | — | normalizado + `rawStatus`; app mostra badge neutro, nunca quebra |
| Próximas cobranças | datas calculadas "mensais" | só `nextBillingAt` é confirmada; demais marcadas como **Previsão**; texto "ciclo de 30 dias, não dia fixo" |
| Prazos no app | app calculava | app **não calcula mais**: usa `closesAt`/`until` que o BFF envia |

Já estava alinhado: créditos de pausa por plano (2/1/0/0), melhor desconto por item, recorrência 60 dias com ≥1 item normal, idempotência nas mutações (toque duplo/retry), PIX vencido → cartão, valor exibido = valor da API.

## 3. Princípios de arquitetura da ata (§2.2) × o que foi construído

- **"Uma API única serve todos os fronts"**: o BFF é uma fachada dessa API para o app, não uma segunda fonte de dados. Nada mora só no app. Compatível, desde que a Tecnologia concorde que o BFF é um serviço separado (alternativa: virar um módulo `/app/*` dentro da própria Prime API; a mudança é só de hospedagem).
- **"Push não vem da API: é desenvolvimento mobile"**: parcialmente. O envio é do app (Expo/FCM/APNs), mas o **gatilho** precisa vir do backend (fatura paga, pendente, em trânsito, renovação próxima, pausa). O BFF já recebe webhooks Vindi/Estoca e dispara push; falta a Prime API emitir os eventos que hoje viram só e-mail (§4.4). Trabalho novo de backend a combinar.
- **"Parte das funções pode continuar na web"**: o app tem troca de cartão nativa (tokenização Vindi no app). Se preferirem o modelo Spotify (abrir a web), basta trocar a tela por um link; a decisão é de produto.

## 4. CMS e catálogo (§7)

- O app **não fixa** produto, plano, brinde ou desconto; tudo vem do BFF. No modo real, o adaptador `ShopifyMetaobjectCatalog` deve ler `prime_planos_listagem`, `prime_gift_band`, `prime_faixa_de_desconto`, `prime_special_collections` e `profile-config`, e tratar campo ausente/malformado sem quebrar (já previsto nos stubs).
- **Perfis (`profile-config`)** são o mecanismo de segmentação existente: a frente "Clusterização" do app deve reutilizá-lo, não criar outro.
- **"Lata válida"** (`economic-size` / `classic-size` no handle) precisa entrar na regra de brindes/perfis do BFF quando o catálogo real for ligado.
- Atenção: o doc diz classic-size = 220 g e economic-size = 380 g; a documentação da API (§4.12) chama "Classic (380g)" e "Economic (220g×2)". **Confirmar a nomenclatura.**

## 5. Perguntas abertas (ninguém no código pode decidir)

1. **Renovação da fidelidade**: KB técnico diz que volta ao topo; macro do CS diz "sem gerar nova fidelidade". Define se `COMMITMENT_ACTIVE` reaparece após o ciclo 12. Hoje o app diz só "Fidelidade cumprida".
2. **Data de referência do D-5** para desfazer pausa (usamos a cobrança do ciclo pausado).
3. **Créditos por ciclo × por pausa**: implementamos 1 crédito por ciclo pausado; Semestral (1 crédito) fica limitado a 1 ciclo.
4. **Caso B por troca de cupom** ("Upgrade de Oferta"): id muda também? Implementamos só para troca de plano.
5. **Taxa de cancelamento antecipado (10%)**: app não calcula nem cobra (LC-01). Mostrar aviso genérico "pode haver taxa" ou nada?
6. **Produtos obrigatórios × adicionais** (LC-03): sem lista oficial; a edição da caixa hoje só exige ≥1 item de recorrência normal.
7. **Pausa Offer**: quem oferta e com que limite (LC-05).
8. **Assinatura `future`** (após troca de plano): pode editar antes da primeira cobrança? Hoje bloqueada.
9. **Ambientes**: existe staging da Prime API e da Vindi sandbox? Sem isso, não há como testar a fase 1 real sem cobrar cartão de verdade (§8.11).

## 6. Itens do contexto que entram no roadmap do app

- **Medição** (§9): instrumentar eventos com `shopifyCustomerId` (Firebase/Amplitude) desde a POC; churn ≠ `status = canceled` (83% é migração). O BFF já tem `shopifyCustomerId` em toda sessão; falta escolher a ferramenta.
- **LGPD**: consentimento para push e para dados de hábito (frente 2). O app já tem preferências de notificação e exclusão de conta; falta a tela de consentimento.
- **Rastreio por API** (frente 6): o BFF já expõe `/me/tracking` com eventos; a web hoje só manda para link externo. Depende de Intelipost/Estoca enviarem eventos ao BFF (webhooks já implementados: Estoca v1/v2; mapear códigos Intelipost 8/12/16/14/7).
- **Troca de sabor** é a função mais pedida (2.350 menções): está na tela da caixa, mas merece atalho na Home e lembrete por push antes do D-3.
- **Explicar para que serve cada produto** (aprendizado 19/09): adicionar descrição de uso no card do produto e nos brindes (vem dos metaobjects).
- **Frete grátis sempre; teto de R$ 50 na troca de endereço da base**: o BFF deve recusar cotação acima do teto quando o adaptador Intelipost real existir.
- **Backlog já em andamento** com que o app precisa ter paridade: ajuste de endereço, pausa + cancelamento, exclusão de cartões, alteração de e-mail/telefone, status do pedido via Intelipost.

## 7. Contas de teste novas

`novata@teste.com` (Anual, 1 cobrança paga: ainda não pode pausar) e `fim-fidelidade@teste.com` (Anual, fidelidade cumprida: pode cancelar). Senha `prime123`.
