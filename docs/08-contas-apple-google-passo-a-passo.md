# Contas de desenvolvedor: Apple App Store e Google Play (passo a passo para o time)

Objetivo: ter as duas contas **no CNPJ da empresa** (nunca no CPF de uma pessoa), com acesso para quem vai publicar o app Caffeine Army Prime. Prazo realista: Apple 3 a 10 dias úteis (verificação da empresa); Google 1 a 3 dias. Comece as duas hoje, em paralelo.

Informações sobre taxas e políticas podem mudar; confirme nos sites oficiais no momento do cadastro.

---

## A. Apple Developer Program (iOS)

### Pré-requisitos (juntar antes de começar)
1. **D-U-N-S Number** da empresa. É um identificador gratuito da Dun & Bradstreet que a Apple exige para pessoa jurídica. Verifique se a empresa já tem em `https://developer.apple.com/enroll/duns-lookup/`. Se não tiver, solicite ali mesmo (gratuito, leva até 5 dias úteis). O nome e endereço precisam bater com o CNPJ.
2. **Apple ID corporativo** para ser o titular da conta: um e-mail da empresa (ex.: `apps@caffeinearmy.com.br`), com autenticação de dois fatores ativada num iPhone ou Mac da empresa. Não use o Apple ID pessoal de ninguém.
3. **Representante legal** (ou alguém com autorização formal para assinar contratos pela empresa): a Apple pode ligar ou pedir documento.
4. **Site institucional** da empresa com o domínio do e-mail acima.
5. Cartão corporativo para a anuidade (99 USD/ano).

### Passos
1. Entre em `https://developer.apple.com/programs/enroll/` com o Apple ID corporativo.
2. Escolha tipo de entidade **Organization** (não Individual).
3. Preencha: nome legal da empresa (igual ao D-U-N-S), D-U-N-S, endereço, telefone, site, e os dados da pessoa responsável.
4. Aceite o contrato e pague a anuidade.
5. Aguarde a verificação. A Apple pode enviar e-mail pedindo confirmação do responsável legal ou documentos; responda pelo mesmo e-mail corporativo.
6. Quando aprovada, acesse `https://appstoreconnect.apple.com` → **Users and Access** e convide:
   - a pessoa de Tecnologia que vai publicar, com papel **Admin**;
   - quem vai gerenciar a loja (textos, screenshots), com papel **App Manager**.
7. Em **Agreements, Tax, and Banking**, aceite o **Paid Applications Agreement** mesmo sem vendas no app (evita bloqueio futuro) e preencha dados bancários/fiscais se pedir.
8. Crie o registro do app em App Store Connect → **My Apps → +**:
   - Nome: Caffeine Army Prime
   - Bundle ID: `com.caffeinearmy.prime` (criado antes em `developer.apple.com → Certificates, Identifiers & Profiles → Identifiers`)
   - SKU: `caffeine-prime-ios`
9. Ative **Sign in with Apple** no Identifier do app (Capabilities), necessário porque o app oferece login Google.
10. Crie uma **API Key do App Store Connect** (Users and Access → Integrations → App Store Connect API, acesso *App Manager*) e guarde o `.p8`, o Key ID e o Issuer ID: é o que o pipeline de build (EAS/CI) usa para enviar o app ao TestFlight sem senha de pessoa.

### Depois disso, o que o desenvolvimento precisa receber
- Acesso Admin no App Store Connect.
- Team ID (aparece em `developer.apple.com → Membership`).
- A API Key (`.p8`, Key ID, Issuer ID).

---

## B. Google Play Console (Android)

### Pré-requisitos
1. **Conta Google corporativa** titular (ex.: `apps@caffeinearmy.com.br`, no Google Workspace da empresa, se houver).
2. **CNPJ, endereço e telefone** da empresa; e-mail e telefone que o Google vai verificar.
3. Cartão para a taxa única de registro (25 USD).
4. Para contas de organização o Google pede um **D-U-N-S** também (mesmo da Apple).

### Passos
1. Entre em `https://play.google.com/console/signup` com a conta corporativa.
2. Escolha **Organization** (empresa), não conta pessoal.
3. Preencha os dados da empresa e do contato de desenvolvedor (esse e-mail e telefone aparecem publicamente na loja; use os genéricos da empresa).
4. Pague a taxa e conclua a **verificação de identidade da organização** (D-U-N-S, documento da empresa, confirmação do e-mail e telefone).
5. Em **Users and permissions**, convide a pessoa de Tecnologia como **Admin** e quem cuida da loja com permissões de gerenciar ficha e releases.
6. Crie o app: **Create app** → nome "Caffeine Army Prime", app, gratuito, idioma pt-BR.
7. Em **Setup → API access**, vincule um projeto Google Cloud e crie uma **conta de serviço** com permissão de release no app; baixe o JSON. É o que o pipeline usa para enviar builds.
8. Preencha, nas próximas semanas, o que o Google exige antes do primeiro release: política de privacidade (URL pública), questionário de segurança de dados, classificação de conteúdo, público-alvo, declaração de anúncios.
9. Ative o **teste interno** (Internal testing) e cadastre a lista de e-mails dos assinantes beta.

Observação: contas novas de pessoa física precisam de 12 testadores por 14 dias antes de publicar; contas de organização não têm essa exigência, outro motivo para usar o CNPJ.

### Depois disso, o que o desenvolvimento precisa receber
- Acesso Admin no Play Console.
- O JSON da conta de serviço.
- Confirmação do package name: `com.caffeinearmy.prime`.

---

## C. Itens que as duas lojas vão cobrar e que não são do time de Tecnologia

| Item | Responsável sugerido | Observação |
|---|---|---|
| Política de privacidade publicada numa URL do site, cobrindo o app, push e (futuramente) dados de saúde | Jurídico + Marketing | Obrigatória antes do primeiro build de teste externo |
| Fluxo de exclusão de conta dentro do app e uma URL explicando | Produto + Tecnologia | Apple e Google exigem |
| Textos e screenshots da ficha do app | Marketing | Pode ser feito depois do beta |
| Identidade visual para ícone (1024×1024) e splash | Design | Hoje há placeholder |
| Decisão sobre dados de saúde (HealthKit/Health Connect) | Produto + Jurídico | Cada permissão precisa de justificativa escrita na revisão |
| Google Cloud: `GOOGLE_CLIENT_ID` para iOS e Android (login Google) | Tecnologia | Projeto Google Cloud do app |

## D. Depois das contas: o que eu faço
Configuro o pipeline (build assinado, envio ao TestFlight e ao teste interno do Play), o ícone e splash, Sign in with Apple, e o primeiro build para 10 a 20 assinantes beta.
