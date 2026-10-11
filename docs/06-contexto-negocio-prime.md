# Prime: contexto para o projeto do aplicativo mobile

> Documento de passagem para quem vai tocar o aplicativo do Prime usando o Claude Code.
> Montado em **11/10/2026** a partir da base de conhecimento (KB) do B2C no Notion: páginas de Tecnologia & Dados do Prime, Decisões e Aprendizados, Dia a dia, atas, Macros de atendimento e o backlog "Projetos Prime".
>
> **Datas das fotos (importante):** o comportamento do backend vem de uma documentação gerada do código em **09/06/2026** (branch main da `caffeine-prime-api`). O plano de dívidas técnicas é de **25/08/2026**. O backlog foi lido em **11/10/2026**. O que mudou depois disso não está aqui. Antes de construir em cima de qualquer item, confirme no código ou com a Tecnologia.

---

## 0. Como usar este documento com o Claude Code

1. Copie este arquivo para o repositório do app como `docs/contexto-prime.md`.
2. No `CLAUDE.md` do repo, aponte para ele (há uma sugestão de `CLAUDE.md` na seção 12).
3. Peça à Tecnologia acesso de leitura aos dois repositórios, `caffeine-prime-api` (backend) e `ecommerce-hydrogen` (loja e Área do Assinante). Com eles abertos, o Claude Code confere no código o que este documento descreve. O Swagger do backend fica em `/api`.
4. Ao longo do texto há duas marcações. Quando você vir **[REGRA]**, é a regra oficial de negócio. Quando vir **[SISTEMA]**, é o que o código faz. Nem sempre as duas coincidem (seção 6), e o app precisa saber qual das duas está seguindo.

---

## 1. O Prime em um minuto

- **O que é:** o clube de assinatura da Caffeine Army (grupo de wellness: marcas Caffeine Army/SuperCoffee, Sublyme/Morning Shot, Koala e a linha Labs de whey e creatina). Foi lançado oficialmente em set/2021, e a primeira assinatura registrada é de 09/02/2021.
- **Tamanho:** base ativa de **43.137 assinaturas** (42.985 CPFs distintos), medida em 18/09/2026. A base cresceu cerca de 5 vezes entre jan/2024 e ago/2026. O Prime fatura em torno de R$ 9 milhões por mês (jul/2026: R$ 9,01 mi).
- **Como funciona:** o assinante monta uma "caixa" com produtos (latas, sachês, potes) e recebe todo mês. A **cobrança é sempre mensal**, no cartão, sem comprometer o limite. O plano escolhido define só a **fidelidade** (o tempo mínimo de permanência), não a frequência da entrega:
  - Anual: 12 meses de fidelidade. Cerca de 95% da base está nele.
  - Semestral: 6 meses.
  - Trimestral: 3 meses.
  - Mensal: legado, sem fidelidade, só 7 assinaturas ativas.
- **Benefícios:** desconto na caixa, que é de **15% fixo** fora de campanha e de **20% em campanhas** (aquisição ou renovação), por tempo limitado. Também há frete grátis, o programa de pontos **Caffeine Army X** (exclusivo do assinante desde 01/12/2024), o **Clube de Vantagens** (parceiros), brindes e sabores exclusivos.
- **Mix da base (abr/2026):** 95% das assinaturas têm SuperCoffee, 14% Morning Shot, 7,4% Koala e 4,3% Labs.
- **Quem assina:** público majoritariamente feminino (83,7%), de 31 a 45 anos (59%). O motivo nº 1 para assinar é a **praticidade** (47 a 51%), à frente do desconto (29 a 37%). Os perfis por motivação são Disposição para Treinar (43%), Bem-Estar no Dia a Dia (21%), Foco no Trabalho (12%) e Jejum Intermitente (9%). Cerca de 90% já consumia SuperCoffee antes de assinar.
- **Calendário:** 1 a 2 campanhas por mês. As maiores são a **Prime Week (outubro)** e a Black Friday (novembro). Toda campanha muda oferta, brinde e desconto, e isso é configurado por CMS, sem deploy (seção 7).
- **Time:** o Prime tem duas frentes, Aquisição e Retenção, com uma célula de CX. O atendimento é feito por Zendesk, Droz (WhatsApp) e IA (Cloud Humans).

---

## 2. O projeto do aplicativo: o que já foi decidido

### 2.1 Decisão de arquitetura (09/06/2026, registrada em "Decisões e Aprendizados", status "em observação")

- **A versão final será nativa e separada por plataforma: Android em Kotlin e iOS em Swift.** A Tecnologia deu três motivos. O público do Prime é exigente com experiência. Um código único (Flutter, React Native) tende a apresentar bugs em uma das plataformas e limita recursos nativos, como o Face ID. E aplicativos de porte parecido mantêm um app por plataforma.
- **Antes da versão final vem uma POC em Flutter**, com a gestão da assinatura e um módulo de engajamento, testada em beta com usuários selecionados. O objetivo é **medir se o engajamento justifica** o investimento no nativo.
- A Tecnologia avisou que **migrar de Flutter para nativo é um desenvolvimento diferente**, não uma etapa seguinte do mesmo trabalho, e que o time não tem experiência com essa migração.
- O time já fez POCs em Flutter antes, por exemplo a aplicação dos Experts (executável Windows + APK Android).
- **Ficaram em aberto:** o modelo de contratação do desenvolvimento mobile (a preferência declarada é um dev alocado no time, não agência, por problemas anteriores com agência; a Cubus Tecnologia foi citada como referência) e a reposição de quem cuidava de UX/UI.

### 2.2 Princípios de arquitetura combinados na mesma reunião

- **Uma API única serve todos os fronts** (web, mobile, desktop). Os dados da assinatura, o Caffeine Army X e a IA entram por ela.
- **O banco central continua sendo a fonte.** Nada mora só no app, e cache serve apenas para desempenho.
- **Parte das funções pode continuar na web**, com o app redirecionando para lá (o exemplo citado foi a troca de cartão no Spotify), porque o usuário é o mesmo.
- **Push notification não vem da API:** é desenvolvimento mobile.

### 2.3 Por que mobile: dados de acesso à Área do Assinante (Clarity, jun/2025 em diante)

- **75% das sessões são mobile.** Das sessões mobile, 63% são iOS e 13% Android, e no navegador o Safari lidera.
- **O Android não pode ficar de fora:** a fatia cresce com a base, e quem ficasse sem app viraria demanda de atendimento.
- O uso hoje é **reativo**: a pessoa entra para resolver algo pontual e sai. A sessão é curta, e não dá para separar engajamento de quem rola a página procurando pausa ou cancelamento.

### 2.4 O que o assinante valoriza (pesquisa 2025, ~3 mil respondentes, e entrevistas)

- A funcionalidade mais citada é a **troca de sabor** (2.350 menções). Em seguida vêm programa de pontos, alteração de quantidade, Clube de Vantagens e histórico de pedidos.
- As reclamações se concentram no **programa de pontos** (custo do resgate, limitação, falta de itens), não na gestão da assinatura.
- Pedidos das entrevistas:
  - Alerta para lembrar da troca de sabor e do resgate de pontos antes do prazo.
  - Reconhecimento pelo tempo de casa.
  - IA para dúvidas de nutrição (parte dos entrevistados já usa o ChatGPT por fora).
- Todos os entrevistados usam relógio e app de exercício.
- Esquecer de tomar o produto faz lata acumular, e lata acumulada leva à pausa.
- Pesquisa de experiência de mai/2025: a pausa é pouco usada (62,5% conhecem, 16,3% já usaram), e a maior fonte de atrito são brindes que somem (20,5% dos comentários).
- Aprendizado de 19/09/2026: quem recebe Koala ou Morning Shot de brinde sem explicação de uso não consome. Há a ideia de explicar para que serve cada produto na Área do Assinante, inclusive na edição da caixa.

### 2.5 As frentes de funcionalidade propostas (nenhuma priorizada ainda)

1. **Central de Gestão da Assinatura:** premissa de que tudo o que existe na web esteja no app (próxima entrega, próxima cobrança, editar caixa, alertas por push).
2. **Hub de Hábitos e Suplementação:** check-in diário, lembretes, streaks e metas, no espírito dos bots de check-in da campanha Summer. É a frente que muda o uso de reativo para ativo e justifica o download.
3. **Programa de Pontos e Benefícios:** extrato, simulação de resgate, catálogo de recompensas, alerta de vencimento e onboarding do primeiro resgate. Depende da pesquisa em curso sobre o próprio programa.
4. **Clusterização de Clientes:** faixas Bronze, Silver, Gold e Black por tempo e engajamento, com funções desbloqueadas por faixa.
5. **Prime IA:** assistente de produto, recomendação por objetivo e rotina de suplementação. O que as pessoas perguntarem vira insumo de pesquisa.
6. **Atendimento e Logística:** rastreio por API dentro do app, gestão de reenvio e push em cada etapa, do faturamento à entrega. Isso tira peso do WhatsApp, que custa por mensagem e hoje avisa só duas etapas.

O benchmark de 20 apps de bem-estar mostrou cinco recorrências: onboarding por objetivo, tracking de exercício, diário de check-in, criador de metas e tracking de consumo (água, calorias).

### 2.6 Linha do tempo e status

- **09/06/2026:** reunião da POC com a Tecnologia; mapa de funcionalidades alinhado (deck Figma "Mapeamento de Funcionalidades — Área do Assinante 2026").
- **12/06/2026:** entrevistas com assinantes pausadas para consolidar. O KR do OKR estava em 40% contra meta de 100% em junho.
- **07/08/2026:** a pesquisa foi retomada. A quantitativa foi validada com Marketing, e o **time de Estratégia assumiu a etapa de proposta de valor** do Prime. Stack, infra iOS/Android e as integrações com a API do Prime e com a versão web foram alinhadas com a Tecnologia.
- **OKR B2C do ciclo:** "MVP do Aplicativo Prime com dados reais".
- **No backlog técnico "Projetos Prime" (164 itens lidos em 11/10/2026) não existe nenhuma task de app mobile.** Tudo o que existe está no nível de pesquisa e decisão.

### 2.7 Quem é quem (pela ata de 09/06/2026)

- **Vitor Montassier:** Gerente do Prime. Dono do produto e da priorização das funcionalidades.
- **Brenda Leal:** Coordenadora de Retenção e CX do Prime. Responsável pelas pesquisas com assinantes.
- **Murilo Vicente e Tércio:** Tecnologia. Murilo ficou de avaliar estrutura de dados e APIs para as funcionalidades e de buscar referências de fornecedores mobile.
- **Amanda Borges:** Gerente de E-commerce, Marketplace e Growth.
- **Time de Estratégia:** conduz a proposta de valor desde 07/08/2026.

---

## 3. Como o sistema do Prime é por dentro

### 3.1 Repositórios e peças

- **`caffeine-prime-api`:** o backend das assinaturas. É com ele que o app vai conversar.
- **`ecommerce-hydrogen`:** o front da loja em **Shopify Hydrogen**. Inclui a LP do Prime (`/caffeine-prime`) e a **Área do Assinante** (`/account/prime`, acessível em `www.caffeinearmy.com.br/account/prime` e `app.caffeinearmy.com.br/account/prime`). É a "versão web" que o app vai espelhar. Há docs internas em `docs/`.
- **Loja Shopify:** `caffeinearmy`.
- **Order Bridge API:** serviço interno que leva os pedidos ao ERP (SAP).
- **Caffeine Backoffice:** estoque de brindes.

### 3.2 Stack do backend

- NestJS 9 (Node.js, TypeScript), MySQL via Prisma 5, filas Bull (Redis) com Bull Board.
- Crons com `@nestjs/schedule`, declarados **dentro dos controllers HTTP**, no mesmo processo da API (dívida conhecida).
- Observabilidade: Sentry, New Relic, Winston e notificações operacionais no Slack.
- Camadas: `src/domain` (modelos, interfaces, casos de uso), `src/application` (casos de uso, consumidores de fila, serviços) e `src/infrastructure` (controllers, repositórios Prisma, adaptadores de integração, autenticação).

### 3.3 O conceito central: duas fontes de verdade

- **A Vindi (gateway de recorrência) é a fonte de verdade da cobrança:** assinatura, fatura, cobrança e cartão.
- **O MySQL guarda uma cópia espelhada e enriquecida:** produtos, endereços, pedidos, brindes, pausas.
- Boa parte da complexidade vem de manter os dois sincronizados, por webhooks e jobs de divergência. Um job diário à 1h compara banco e Vindi para as assinaturas com cobrança em 4 dias (o "D+4") e alerta no Slack.
- **Consequência para o app:** depois de uma ação (editar caixa, trocar cartão), o estado pode levar alguns instantes para refletir. Não suponha consistência imediata entre o que o app enviou e o que a Vindi cobra.

### 3.4 As integrações externas

- **Vindi:** recorrência, faturas, cobranças, cartões, descontos, reembolso. Adquirente REDE; antifraude **ClearSale** via Vindi.
- **Shopify / Hydrogen:** **identidade do cliente.** O `shopifyCustomerId` é a identidade primária do ecossistema.
- **Intelipost:** cotação de frete (feita no front), data de entrega e webhook de rastreio.
- **SAP** via Order Bridge: o ERP atual, desde 01/08/2025. O **Omie** é legado, ainda presente no código por variável de ambiente.
- **SendGrid:** e-mails transacionais.
- **HubSpot:** CRM (propriedades `contact__prm__*`).
- **ActiveCampaign:** eventos de marketing.
- **Caffeine X:** programa de pontos.
- **Cloud Humans:** IA de atendimento, só leitura.
- **Droz:** WhatsApp (recobrança, rastreio).
- **Triple Whale:** atribuição, só no 1º ciclo pago.
- **Inovyo:** NPS.
- **Insider:** CDP, com eventos de mudança de caixa desde 17/03/2026.
- **VWO:** testes A/B no site.
- **Clarity e GA4:** comportamento.

### 3.5 Crons e filas (o que roda sozinho)

- **00:00:** PIX vencido é recobrado no cartão; assinaturas `future` são sincronizadas com a Vindi.
- **01:00:** verificação de divergências D+4.
- **08:00 e 14:00:** reintegração de pedidos pendentes no ERP.
- **Semanal:** inadimplentes sincronizados com o HubSpot.
- **Filas:** retentativa de cobrança, cancelamento por ClearSale, cancelamento de inadimplentes, PIX para cartão, atualização de preço de itens, tracking no HubSpot e export em Excel.

---

## 4. A API do Prime: o que o app vai consumir

### 4.1 Autenticação hoje [SISTEMA] (atenção)

Hoje há três estratégias, todas por chave fixa no header:

- `x-api-key`: chave **geral**, usada pelo front da loja **e pelo admin**.
- `cloud-humans-x-api-key`: Cloud Humans, só leitura.
- `X-API-KEY` (chave Droz): WhatsApp.

Os webhooks (`/webhooks/*`) e as tarefas operacionais (`/tasks/*`) **não têm autenticação** no código. Isso já está registrado como dívida.

> ⚠️ **Ponto crítico para um app (leitura minha, não do KB):** uma chave fixa embutida num binário de app pode ser extraída por qualquer pessoa. Se a mesma `x-api-key` dá acesso ao `/admin`, embuti-la no app expõe a base inteira. O app precisa de **autenticação por usuário**, provavelmente pelo login de cliente da Shopify, já que `shopifyCustomerId` é a identidade. Também precisa de uma camada no servidor (um BFF ou um guard novo na API) que só deixe cada pessoa ver e mexer na própria assinatura. Esta é a **primeira decisão técnica a fechar com a Tecnologia**. Hoje o KB não documenta como a Área do Assinante web autentica o cliente antes de chamar a API.

### 4.2 Endpoints de cliente (`/subscriptions`), os que interessam ao app

- **Assinatura:**
  - Criar assinatura: `POST /`.
  - Detalhe: `GET /:id`.
  - Assinatura corrente do cliente, por `shopifyCustomerId` ou e-mail.
  - Última assinatura cancelada.
- **Faturas:** faturas e histórico de desconto, detalhe de fatura, pendências.
- **Edição e troca de plano (agendamento):**
  - Criar: `POST /:id/scheduling`.
  - Consultar e atualizar.
  - Cancelar: `DELETE /schedulings/:id`.
- **Cartões:** criar perfil de pagamento, atualizar, trocar o cartão de uma fatura.
- **Cadastro:** endereço de entrega, desconto, dados cadastrais.
- **Reemissão de cobrança:** PIX (`createPixCharge`), cobrança imediata, nova cobrança por perfil.
- **Pausa:** `POST /:id/pause`, e cancelamento da pausa.
- **Brindes:** adicionar, remover, consultar benefícios.
- **Pedido avulso:** `POST /:id/create-single-invoice`.
- **Recorrência de 60 dias:** editar por item, remover item.
- **Cancelar e reativar:** `DELETE /:id` e `POST /:id/reactivate`.

Os demais grupos são `/admin` (backoffice, **nunca** para o app), `/webhooks`, `/bills`, `/promos`, `/cloud-humans`, `/droz`, `/tasks` e `/api/healthz`.

### 4.3 Fluxos que o app vai disparar [SISTEMA]

**Edição de caixa e troca de plano.** Tudo passa por `POST /subscriptions/:id/scheduling`, e há dois casos:

- **Caso A, mesma fidelidade e mesmo cupom** (troca de sabor, quantidade, tamanho): remove e recria os itens no banco e na Vindi com o melhor desconto, registra um agendamento já `Finished` e manda e-mail. **73% das edições são deste tipo.**
- **Caso B, mudou o plano ou o cupom:** cria uma **assinatura nova** com status `future`, que começa na próxima cobrança, e **cancela a atual** com um motivo automático ("Upgrade de Plano", "Upgrade de Oferta" ou "Troca de lata e/ou sabor"). Por isso 83% dos "cancelamentos" no banco são migração, não saída de cliente.
  - Cancelar esse agendamento reativa a original e apaga a futura.
  - **No app, isso significa que o `id` da assinatura do cliente pode mudar depois de uma troca de plano.** Sempre busque a "assinatura corrente do cliente", nunca guarde o id como permanente.

**Cancelamento.** Cancela na Vindi (e aborta se a Vindi falhar), atualiza o banco, grava o questionário de motivo, manda e-mail e avisa Caffeine X (para estorno de pontos de brindes resgatados) e HubSpot.

**Reativação.** Reativa na Vindi e restaura status e próxima cobrança.

**Pedido avulso.** Cria uma fatura avulsa na Vindi, cobrada no cartão informado, com `billType = 'single'` e código `PM-{vindiBillId}`.

**Ciclo de renovação** (o app só lê, mas precisa entender). Tudo chega por webhook da Vindi:

- `bill_created` (novo ciclo): **cancela faturas pendentes anteriores** e gera o pedido do ciclo.
- `bill_paid`: incrementa o contador de ciclos pagos, decrementa a fidelidade restante (ao chegar a 0, renova), aprova a primeira cobrança que estava em antifraude, recalcula descontos, integra ao ERP e dá pontos.
- `charge_rejected`: e-mail de "pendente de pagamento".

**Logística (webhook Intelipost).** Os códigos de status são 8 = pronto para envio, 12 = em trânsito, 16 = saiu para entrega, 14 = entregue e 7 = falha. Hoje a Área do Assinante **não integra rastreio**: redireciona para um link externo. Rastreio dentro do app (frente 6) é trabalho novo.

### 4.4 E-mails e eventos que já existem

- **E-mails (SendGrid, remetente `prime@caffeinearmy.com.br`):** confirmação, em análise, reprovada, cancelada, edição, fatura paga, pendente, PIX, renovação próxima, pausa criada/retomada/cancelada, troca de recorrência, pronto para envio/em trânsito/entregue e avulso.
- **Eventos do Caffeine X:** `ORDER_PAID`, `ANNUAL_SUBSCRIPTION_CREATED`, `RENEW_ANNUAL_SUBSCRIPTION`, `SUBSCRIPTION_CANCELED`, `SUBSCRIPTION_REACTIVATED`, `SUBSCRIPTION_REFERENCE_CREATED` (indicação), `SUBSCRIPTION_PAUSED`, `SUBSCRIPTION_RESUMED`, `CREATE_PRIME_EARLY_TRANSACTION_AMOUNT`.
- **Eventos do ActiveCampaign:** "Prime - Finalizou compra", "Pago", "Assinatura Pendente", "Cancelado", "Reativado".
- **Para pensar no push:** esses mesmos momentos (fatura paga, pendente, pronto para envio, entregue, renovação próxima, pausa) são os gatilhos naturais das notificações do app. Hoje eles disparam e-mail no backend. Para virar push, alguém precisa emitir um evento que o serviço de push consuma (trabalho novo de backend).

---

## 5. Modelo de dados e estados da assinatura

### 5.1 Entidades principais (Prisma/MySQL)

- **`Subscription`:** o centro do modelo. **Não existe entidade Customer:** nome, e-mail, CPF e telefone ficam dentro da assinatura (e em snapshot na fatura).
- **`Bill`** (fatura), **`Charge`** (cobrança: tentativas, método, QR Code PIX) e **`BillPaymentProfile`** (snapshot do cartão por fatura).
- **`Order` / `OrderItem`:** o pedido nasce da fatura do ciclo.
- **`ProductItem`:** a caixa atual. É sobrescrita a cada mudança, **sem histórico**.
- **`GiftItem`** (brinde), **`SubscriptionScheduling`** (troca agendada), **`SubscriptionPause`**, **`SubscriptionCancelReason`** (pesquisa de cancelamento), **`ShippingAddress`**, **`Discount`** e **`Metafield`**.
- **`Promo` / `PromoItem` / `UserPromo`:** descontos por produto.

### 5.2 Campos com semântica escondida

- **`status`:** é uma **string livre**, não um enum. Valores: `active`, `future`, `fraud_review`, `paused`, `canceled`.
- **`frequency`:** Mensal, Trimestral, Semestral, Anual. Define **fidelidade**, não cadência.
- **`projectCode`:** **o nome engana.** É o contador de ciclos pagos (há task para renomear para algo como `paidCyclesCount`).
- **`remainingCancelation`:** meses de fidelidade que faltam. É o que a Área do Assinante usa para travar o cancelamento.
- **`pauseCredit` / `remainingPauseCycles`:** créditos de pausa e ciclos pausados restantes.
- **`shopifyCustomerId`:** a identidade do cliente.
- **`vindiSubscriptionId`:** o vínculo com a Vindi.
- **`referenceCode`:** código de indicação (member-get-member).
- **`origin = 'scheduling'`:** a assinatura nasceu de troca de plano. É apagado depois do 1º ciclo.
- **`metadata`:** JSON livre; `source_name` é usado para atribuição.
- **Campos legados, ignorar:** `earlyRemainingCancellation` (campanha antiga) e `vendor` (sem uso).

### 5.3 Ciclo de vida

```
future ──(1ª cobrança / sync diário)──► active
fraud_review ──(antifraude aprova)──► active
fraud_review ──(ClearSale rejeita)──► canceled
active ──(pausa)──► paused ──(fim da pausa)──► active
active ──(cliente, admin, Vindi, inadimplência, troca de plano)──► canceled
canceled ──(reativa)──► active | future
```

- **Unicidade:** um `shopifyCustomerId` só pode ter **uma** assinatura viva (`active`, `future`, `fraud_review` ou `paused`). Uma criação duplicada volta com **422**, e um pagamento recusado na criação volta com **402**.
- **Em pausa, a Vindi continua gerando fatura todo mês, com valor zero** (100% de desconto). No app, uma "fatura de R$ 0" durante a pausa é esperada, não é erro.
- **Fatura `pending`:** quando nasce a fatura de um novo ciclo, as pendentes anteriores são canceladas. Não há histórico de episódios de inadimplência.

---

## 6. Regras de negócio que o app precisa respeitar

### 6.1 Regras que hoje vivem SÓ no front-end [REGRA, aplicada só no front]

Nenhuma destas é validada pela API, e todas usam **a data e hora local do aparelho do usuário**. **O app terá de reimplementar cada uma**, ou, melhor, levá-las para a API (task TE-01 do plano):

- **Edição de caixa** (sabor, quantidade, tamanho, itens) só até **D-3** da próxima cobrança. O backend só bloqueia em **D-2** [SISTEMA]. Se o app chamar a API direto em D-2, a edição passa, contra a regra.
- **Pausa** só depois de **3 cobranças pagas**, ou seja, a partir da 4ª. Isso fica no front por decisão deliberada, para dar flexibilidade ao time.
- **Pedido de pausa** até **D-3** da próxima cobrança. **Desfazer a pausa** até **D-5**.
- **Trava de cancelamento por fidelidade:** o botão de cancelar fica bloqueado até o fim da fidelidade (usa `remainingCancelation`). A janela abre depois do pagamento do último ciclo da fidelidade e vai até o dia anterior à cobrança seguinte. Sem cancelar, renova. **22% da saída do plano Anual acontece exatamente no ciclo 12** (demanda represada).
- **Produtos obrigatórios × adicionais na caixa:** a regra vive no front e pode variar. **Não há lista oficial** (lacuna LC-03), então pergunte ao Negócio.

> Para o app: use **o fuso de São Paulo**, não o do aparelho, ao calcular D-3 e D-5. O backend tem um problema conhecido de fuso: `subHours(date, 3)` está espalhado no código, sem padronização em UTC.

### 6.2 Regras do sistema alinhadas com a regra oficial [=]

- **Preço:** o preço é a soma dos itens ativos, cada um com seu desconto aplicado na Vindi. **Os preços do SuperCoffee estão fixos no código** (dívida). Nunca fixe preço no app: leia da API ou da Shopify.
- **Melhor desconto por item:** para cada produto vence o maior desconto absoluto entre o da assinatura e o de uma promo elegível (no empate, vale o da assinatura). Promos com `revalidate` são removidas se não vierem na edição.
- **Pausa:** créditos por plano (Anual 2, Semestral 1, Trimestral e Mensal 0), renovados a cada novo período de fidelidade. Cada pausa pula exatamente 1 ciclo, e o ciclo pausado não conta para a fidelidade. A pausa **Offer** (de retenção, oferecida pelo CS) ignora a elegibilidade e não consome crédito.
- **Recorrência de 60 dias:** há itens que alternam on/off a cada ciclo pago, e o item off não entra na cobrança nem no pedido. A assinatura precisa ter pelo menos um item de recorrência normal.
- **Itens temporários:** duram N ciclos e, ao expirar, entra o substituto. O modal do botão flutuante pode adicionar item **por 1 ciclo só** (`one_cycle_ativo`).
- **Brindes:** `active` significa pendente de envio. O brinde entra no próximo pedido e vira `inactive`. Brindes resgatados no Caffeine X carregam o id do programa, para estorno no cancelamento.
- **Antifraude:** a 1ª cobrança passa por análise da ClearSale. O pedido só é liberado quando a fatura fica paga.
- **Inadimplência:** inadimplente **não recebe produto**. Há recobrança no cartão e em outros cartões do cliente; o PIX vencido é recobrado no cartão. **Cancelamento automático após 90 dias** sem cobrança paga, hoje manual por lista, com automação em andamento.
- **Frete:** **sempre grátis para o assinante.** Na aquisição, a assinatura só é aprovada se o frete custar menos de R$ 35, ou, a partir de R$ 35, se ficar abaixo de 15% do valor da assinatura com desconto. Na troca de endereço da base o teto é R$ 50. O prazo informado é o da transportadora + 1 dia (se o pedido for depois do meio-dia) + 2 dias de segurança.
- **Caffeine X (pontos):**
  - Contratar o Anual gera pontos, e a renovação do Anual gera de novo.
  - Upgrade de Trimestral ou Semestral para Anual gera pontos; Trimestral para Semestral não.
  - **Todo pedido pago devolve o valor pago em pontos**, arredondado para cima.

### 6.3 Divergências conhecidas [≠]: diga qual das duas você está seguindo

- **Desconto efetivo:** o código usa "o temporário vence enquanto existir"; a regra oficial manda usar **o maior** entre o permanente e o temporário. Na prática quase sempre coincidem: só 2 assinaturas em 152 mil têm o permanente maior. Para **mostrar valor no app, siga o que a API devolve**, porque é o que será cobrado.
- **Janela de edição:** D-2 no backend × D-3 pela regra (ver 6.1).
- **Renovação da fidelidade** (divergência que encontrei ao montar este documento, **a confirmar com o Negócio**): o KB técnico diz que, ao zerar, a fidelidade **volta ao topo** e renova um novo período. Já o texto padrão do atendimento (Macros Prime) diz ao assinante que a renovação acontece "**sem gerar uma nova fidelidade**". Antes de exibir "sua fidelidade termina em X" no app, alinhe qual vale.
- **Ciclo de cobrança:** o sistema fala em cobrança "mensal". O atendimento explica que o ciclo é **de 30 dias** e que, por isso, não há data fixa no mês: duas cobranças podem cair na mesma fatura do cartão. O app deve mostrar a **data da próxima cobrança** que a API devolve (`nextBillingAt`), não calcular "todo dia X".

### 6.4 Regras contratuais e de atendimento (Macros Prime / Termos de Serviço)

- **Taxa de cancelamento antecipado:** 10% sobre as mensalidades previstas no contrato, com quatro isenções previstas nos Termos de Serviço. Hoje a aplicação é **caso a caso** pelo CS (lacuna LC-01). Exceções que o CS já concede: gravidez, motivo de saúde, mudança de país. Quando cobrada, a taxa vira uma fatura avulsa na Vindi. **O app não deve calcular nem cobrar a taxa sozinho** até a regra ser estruturada (TE-07 + NE-01).
- **Caixa já entregue não tem troca nem devolução** (é personalizada), exceto por defeito ou avaria. Nesse caso há reenvio avulso, coleta ou acareação com a transportadora (prazo de até 5 dias úteis).
- **Análise fiscal** em algumas regiões pode reter o pedido até 5 dias úteis antes do envio.
- **Pedidos avulsos do e-commerce não são atendidos pelo CS do Prime:** são outro canal.

---

## 7. CMS: o que muda sem deploy (e o app precisa ler)

A LP e a Área do Assinante web são controladas por **metaobjetos da Shopify** (Shopify Admin → Configurações → Dados personalizados → Metaobjetos). Campanhas e segmentação **não passam por deploy**. Para o app acompanhar campanhas sem nova versão nas lojas, ele precisa ler os mesmos metaobjetos (Storefront API) ou receber deles via backend.

- **`prime_page_variant`:** as variantes da LP, uma por campanha (`/caffeine-prime/<variant_id>`). Só as listadas em `active-variants` ficam acessíveis; a `padrao` é a variante padrão e **nunca** deve ser apagada.
- **`prime_planos_listagem`:** os planos que aparecem no checkout (`status = active`), com brindes de aquisição e brindes de edição. **O mapeamento variante → listagem de planos está fixo no código.**
- **`prime_gift_band`:** brindes por faixa de latas (1, 2, 3+), por produto âncora e por família. A retenção usa a entrada `retencao`.
- **`prime_faixa_de_desconto`:** desconto progressivo nos complementos quando há um produto âncora na caixa. É lido sem cache, então o efeito é imediato.
- **`prime_special_collections`:** coleções inteiras com % de desconto por N ciclos.
- **Perfis do assinante (`profile-config`):** cada assinante é classificado num perfil, testando a lista `active_profiles` em ordem (produtos que tem ou não tem, tempo de assinatura, faixa de ticket). O primeiro que casa vence; sem match, vale o `perfil-00`.
  - O perfil controla **o que a pessoa vê no painel**: banners, sugestões, botão "turbine", botão flutuante com modal, onboarding, promos ativas e regra de brinde.
  - Os pacotes `Profile00` a `Profile06` estão definidos no código do front.
  - **A Clusterização da frente 4 do app conversa diretamente com este mecanismo:** não crie um segundo sistema de segmentação sem decidir com o time.
- **"Lata válida":** para supercoffee, morning-shot, koala e protein, só conta como lata o produto cujo handle contém `economic-size` ou `classic-size`. Isso vale para perfis e faixas de brinde.
- **Armadilhas que viram incidente silencioso:**
  - Booleanos são texto e precisam ser `true`/`false` minúsculos.
  - Valor de campo controlado digitado errado desliga a mecânica sem erro.
  - Item sem campo obrigatório "escondido" (imagem, ícone, label) é descartado.
  - Há limites de itens por lista: 20 variantes ativas, 10 slides, 50 packs, 50 itens de FAQ, 20 perfis, 20 banners.
  - **12 handles protegidos** nunca podem ser renomeados: `padrao`, `active-variants`, `profile-config`, `banners-ativos`, `listagem-de-categorias`, `faq-prime`, `retencao`, `packs-prime`, `packs-prime-brinde`, `prime-gift-band-apwowjzd`, `prime-planos-listagem-mzlb1ebw`, `prime-planos-listagem-experts`.
  - O app deve tratar campo ausente ou malformado **com segurança**, sem quebrar a tela.
- **Não há histórico** do que estava configurado em cada período (lacuna LC-10).
- **Catálogo de produtos:** há uma base no Notion, "Catálogo de produtos Prime", com 48 SKUs por **handle da Shopify** (ex.: `supercoffee-pacoca-com-chocolate-branco-economic-size`, `morning-shot-limao-stick`, `koala-sleep-chocolate-economic-size`, `whey-baunilha-420g`, `creatina-250g`), com família, formato e volume dos últimos 12 meses.
  - Os formatos são lata classic-size (220 g), economic-size (380 g), sachê/stick e pote.
  - Há pelo menos um handle com erro de cadastro (`supercoffee-lingua-de-gato-economic-size`, que duplica o `-chocolate-`).
  - **Não fixe a lista de produtos no app:** leia da Shopify.

---

## 8. Riscos e pegadinhas para quem constrói um app em cima desse backend

As dívidas registradas no plano técnico de 25/08/2026 que mais afetam um app:

1. **Chave de API compartilhada** em vez de autenticação por usuário (seção 4.1). Isso bloqueia o app e deve ser resolvido antes de tudo.
2. **Regras só no front** (D-3, D-5, elegibilidade de pausa, trava de fidelidade). Com dois fronts (web e app), a regra duplicada vai divergir. A recomendação é levá-las para a API (TE-01).
3. **Webhooks e `/tasks` sem autenticação, e idempotência parcial** (sem eliminação formal de eventos duplicados). Um toque duplo no app ou um retry de rede pode gerar ação dupla. **Proteja o botão no app** e, se possível, peça idempotência na API.
4. **Atualização de desconto na Vindi é destrutiva:** apaga tudo e recria. Se falhar no meio, a assinatura fica sem desconto (é por isso que existe o job D+4). Evite disparar edições em sequência rápida.
5. **Status como string livre**, sem enum. Trate valores desconhecidos com um estado genérico, sem quebrar o app.
6. **Lógica de criação de pedido em três lugares** e cálculo do "melhor desconto" em cerca de 7 pontos. O valor exibido pode variar levemente entre telas, então use sempre o valor que a API devolve.
7. **Fuso manual** (`subHours(date, 3)`): datas podem vir deslocadas. Valide com casos perto da meia-noite.
8. **O `id` da assinatura muda** na troca de plano (Caso B, seção 4.3).
9. **A Vindi é forte demais no domínio:** qualquer função nova de pagamento (Pix automático, por exemplo) passa por ela.
10. **Crons no mesmo processo da API:** um pico de uso do app pode competir com as rotinas.
11. **Deploy, ambientes (existe staging?) e infra do backend não estão documentados.** Pergunte à Tecnologia **antes** de apontar o app para qualquer URL. Teste sempre fora de produção: a API cobra cartão de verdade na Vindi.

---

## 9. Dados e medição (regras do time de Dados / Esiquele)

O OKR pede "MVP com dados reais", e a POC existe para **medir engajamento**. O que você precisa saber:

- **O BigQuery** (projeto `caffeine-business-intelligence`) é a fonte única da verdade para números. O dataset `banco_prime` é **réplica do MySQL do Prime**. As tabelas principais são `assinaturas_prime`, `faturas_prime`, `pedidos_prime`, `itens_prime`, `itens_assinatura_prime`, `pausas_prime`, `razao_cancelamento_prime` e `agendamento_assinaturas_prime`.
- **O que a aplicação sabe e o BigQuery não tem:**
  - Fidelidade restante e créditos de pausa (task TE-04).
  - Data real de pagamento (`Charge.paid_at`, task DA-04).
  - Todo o sistema de promos.
  - O histórico da caixa: só o Insider vê movimentação, e só desde 17/03/2026.
  - A configuração do CMS de cada período e o perfil atribuído a cada assinante.
- **Uso do app não está em lugar nenhum:** é preciso instrumentar do zero (Firebase, Amplitude ou similar), com a decisão de onde os eventos vão parar. Para cruzar uso do app com retenção, o evento precisa carregar uma chave que exista no BigQuery: o **`shopifyCustomerId`** (`assinaturas_prime.id_shopify`) e/ou o CPF.
- **Regras para qualquer métrica de sucesso do app:**
  - **Churn não é contar `status = 'canceled'`.** 83% dos cancelamentos registrados são migração interna (troca de plano). Contar cru superestima o churn em **6 vezes**. Use o "Modelo de churn do Prime" no KB.
  - `pedidos_prime` tem pedidos pagos, cancelados e pendentes, então **filtre `status = 'paid'`**.
  - Cliente se conta **por CPF** (só dígitos, dos dois lados do join), não por e-mail.
  - Declare sempre a **unidade** (assinatura, CPF ou e-mail) e o **recorte** (período; bruto × líquido).
  - "Cliente novo" tem **três definições** (nova assinatura, cliente novo Prime, cliente novo B2C). Nomeie qual usa.
- **Desenho sugerido para medir a POC** (leitura minha): comparar quem usa o app beta com um grupo parecido que não usa (mesmo plano, tempo de casa e perfil), olhando taxa de pausa, churn real, ticket e uso de troca de sabor. Peça a query ao time de Dados com essas regras.
- **Dado pessoal:** a base tem nome, CPF, e-mail e telefone. Aplique LGPD no app (mínimo necessário, consentimento para push e para dados de saúde e hábito na frente 2).

---

## 10. O que está em andamento e toca a Área do Assinante (backlog "Projetos Prime", 11/10/2026)

O app vai precisar ter paridade com estas mudanças. Converse com o time antes de reimplementar.

**Em andamento ou prestes a começar:**

- Prime <> MGM (indicação), em andamento.
- Ativação de desconto sampling no checkout Prime, em andamento.
- Fluxo de ajuste de endereço.
- Pausa + Cancelamento.
- Pesquisa pós-assinatura.
- Automação dos inadimplentes de mais de 90 dias.
- Automatizar a baixa manual de estorno.
- Sampling Trial.
- Adição de porta-cartão.

**Em design:** Classificação de atendimento na área do assinante; Prime — Controle de Estoque.

**No backlog, relevantes para o app:**

- Alteração de e-mail e telefone na área do assinante.
- O usuário poder excluir cartões cadastrados.
- Atualização de status do pedido com base no Intelipost.
- Cashback na assinatura.
- Desconto por produto com resgate de pontos no X.
- Reestruturação do contador de resgate no X.
- Abertura de pop-up com Termo de Assinatura.
- Integrar mensagens do WhatsApp com HubSpot.

**Já existentes ou concluídos na área do assinante** (para paridade): histórico de pedidos, reenvio de caixa, edição de endereço, redesign de perfil, menu e tela de inadimplente, Stepper de Rotina, "1-click upgrade" (adicionar item à caixa), CTA de cancelamento, desconto progressivo por variante, Login no Checkout e Cashback Ecomm → Prime.

**O status vivo** de cada item está no Notion, na base "Projetos Prime". Quem a opera é o PM 06, agente de produto no Slack.

---

## 11. O que não está documentado (pergunte, não suponha)

- **Arquitetura do código do front** (rotas, componentes, estado, build, deploy) da Área do Assinante: **não documentada**.
- **Deploy, ambientes e infraestrutura do backend:** não documentados (a doc só lista variáveis de ambiente por integração).
- **Como a Área do Assinante web autentica o cliente** antes de chamar a API.
- **Qualquer mudança no código depois de 09/06/2026.**
- **Lista de produtos obrigatórios × adicionais na caixa** (LC-03, dono: Negócio).
- **Critérios de aplicação da taxa de cancelamento** (LC-01, dono: Head do Prime).
- **Governança da pausa Offer** (quem oferta, com que limite) (LC-05).
- **Regra de renovação da fidelidade** (divergência da seção 6.3).
- **Priorização das 6 frentes do app, modelo de contratação mobile e prazo do MVP:** em aberto. O prazo de "dezembro" para o MVP em Flutter aparece só num resumo automático de reunião e **não foi confirmado**.

---

## 12. Sugestão de `CLAUDE.md` inicial para o repositório do app

```markdown
# CLAUDE.md — App Prime (Caffeine Army)

Aplicativo do Prime, o clube de assinatura da Caffeine Army. Contexto de negócio, API e regras: `docs/contexto-prime.md` (leia antes de mexer em fluxo de assinatura).

## Invariantes
- UI em português BR.
- O app NUNCA fala com `/admin`, `/tasks` ou `/webhooks` da caffeine-prime-api.
- Nenhuma chave de API compartilhada embutida no binário. Toda chamada é autenticada pelo usuário logado (identidade = shopifyCustomerId).
- Nenhum preço, produto, plano, brinde ou desconto fixo no código: tudo vem da API ou dos metaobjetos da Shopify.
- O valor exibido ao cliente é o que a API devolve; o app não recalcula desconto.
- Prazos (edição até D-3, pausa até D-3, desfazer pausa até D-5, pausa só a partir da 4ª cobrança paga, trava de cancelamento por fidelidade) calculados no fuso America/Sao_Paulo, nunca no do aparelho — enquanto não estiverem na API.
- Nunca guardar o id da assinatura como permanente: após troca de plano ele muda. Sempre buscar a assinatura corrente do cliente.
- Toda ação que escreve (editar caixa, pausar, cancelar, trocar cartão) é protegida contra toque duplo e retry.
- Status desconhecido vindo da API vira estado genérico, nunca crash.
- Testes só contra ambiente de homologação: a API cobra cartão de verdade na Vindi.
- Evento de analytics carrega shopifyCustomerId para cruzar com o BigQuery; dado de saúde/hábito só com consentimento.

## Fontes
- Swagger da API: `<url-da-api>/api`
- Repos de referência: caffeine-prime-api (backend), ecommerce-hydrogen (Área do Assinante web)
- Regras vivas: KB "Tecnologia & Dados — Prime" no Notion
```

---

## 13. Fontes (no Notion, KB do B2C)

- **Tecnologia & Dados — Prime:** Visão da stack; API do Prime; Modelo de dados da aplicação; Front-end e CMS; Regras de sistema × regra de negócio; Dívidas técnicas e backlog (25/08/2026); Lacunas declaradas; Marcos temporais; Métricas e SQL canônico; Catálogo de produtos Prime.
- **Decisões e Aprendizados:** "Aplicativo do Prime: versão final em nativo separado (Kotlin e Swift), com POC em Flutter antes para medir engajamento" (09/06/2026); aprendizado sobre brindes sem contexto de uso (19/09/2026).
- **Dia a dia:** "Entrevistas da POC do Aplicativo Prime são pausadas…" (12/06/2026); "Pesquisa do MVP do Aplicativo Prime é retomada…" (07/08/2026).
- **Atas:** "Transcrição refinada — Reunião POC APP Prime 09/06".
- **Contexto por Canal — Prime** e **Contexto Geral do Negócio** (KB).
- **Macros Prime** (textos padrão do atendimento).
- **Base "Projetos Prime"** (backlog técnico, lida em 11/10/2026).
