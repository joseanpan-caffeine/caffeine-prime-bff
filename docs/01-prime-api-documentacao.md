# Documentação do Sistema de Assinaturas — Caffeine Prime API

> Fonte: PDF enviado em 10/10/2026 (gerado a partir do código em 09/06/2026, branch main do caffeine-prime-api). Texto extraído automaticamente; tabelas podem ter perdido alinhamento.

Documentação do Sistema de Assinaturas —
Caffeine Prime API
Objetivo deste documento: registrar de forma completa as regras de negócio, fluxos,
integrações e modelo de dados da aplicação atual ( caffeine-prime-api ), para servir de
referência na construção da nova aplicação de assinaturas.
Gerado a partir da leitura do código-fonte em 09/06/2026 (branch main ).

Índice
1. Visão Geral
2. Modelo de Dados
3. Ciclo de Vida da Assinatura
4. Regras de Negócio
5. Fluxos Principais
6. Integrações Externas
7. Jobs, Crons e Filas
8. API — Endpoints e Autenticação
9. E-mails Transacionais
10. Eventos e Tracking
11. Pontos de Atenção para a Nova Aplicação

1. Visão Geral
O que o sistema faz
API de gestão de assinaturas do Caffeine Army Prime (clube de assinatura de Super Coffee e produtos
relacionados). Responsabilidades:
Criar, editar, pausar, cancelar e reativar assinaturas recorrentes.
Orquestrar a cobrança recorrente via Vindi (gateway de pagamento/recorrência).
Gerar pedidos a cada ciclo pago e integrá-los ao ERP (Omie) ou ao serviço interno Order Bridge.
Gerenciar descontos do plano, cupons temporários e promoções por produto (promos).

Acompanhar logística/rastreio via Intelipost e notificar o cliente.
Sincronizar dados de CRM/marketing (HubSpot, ActiveCampaign) e programa de pontos
(Caffeine X).
Enviar e-mails transacionais via SendGrid.

Stack técnica atual
Item

Tecnologia

Framework

NestJS 9 (Node.js, TypeScript)

Banco

MySQL via Prisma 5

Filas

Bull (Redis) + Bull Board

Agendamento

@nestjs/schedule (crons declarados em controllers)

Observabilidade

Sentry, New Relic, Winston (logs), Slack (notificações)

Documentação

Swagger em /api

Arquitetura
Organização em três camadas (clean-architecture aproximada):
src/domain — modelos, repositórios (interfaces), use cases de domínio, serviços (ex.:
PromoService ).
src/application — use cases de aplicação, consumers de fila, constantes, serviços
(analytics, suporte).
src/infrastructure — controllers HTTP, repositórios Prisma, adapters/serviços de
integração externa, estratégias de autenticação.
Fonte de verdade dual: a Vindi é a fonte de verdade de cobrança (assinatura, fatura, cobrança, perfil de
pagamento), e o MySQL local mantém uma cópia espelhada e enriquecida (produtos, endereços,
pedidos, brindes, pausas etc.). Boa parte da complexidade do sistema vem de manter os dois lados
sincronizados (webhooks + jobs de divergência).

2. Modelo de Dados
Entidades principais (Prisma/MySQL)
Subscription (assinatura)

Centro do modelo. Campos relevantes:
Campo

Significado

status

active , future , fraud_review , paused , canceled
(string livre, espelha status Vindi + estados próprios)

frequency

Enum Mensal , Trimestral , Semestral , Anual — define a
fidelidade, não a cadência de cobrança (cobrança é sempre mensal
na Vindi)

customerName/Email/Do
cumentNumber/Phone/Ge
nder

Dados do cliente desnormalizados (não existe tabela Customer )

shopifyCustomerId

ID do cliente na Shopify (identidade primária do cliente no
ecossistema)

vindiCustomerId ,
vindiSubscriptionId ,
vindiPlanId

Vínculos com a Vindi ( vindiSubscriptionId é único)

omieCustomerId

Vínculo com o ERP Omie

projectCode

Contador de ciclos pagos da assinatura (incrementado a cada
fatura paga)

remainingCancelation

Meses restantes de fidelidade (ver §4.2)

earlyRemainingCancell
ation

Contador alternativo de fidelidade antecipada (decrementado em
paralelo)

nextBillingAt

Próxima cobrança (espelho da Vindi)

startAt , cancelAt ,
cancellationReason

Datas de início/cancelamento e motivo

origin

'scheduling' quando a assinatura nasceu de um agendamento
de troca de plano; limpo após o primeiro ciclo

referenceCode

Código de indicação (member-get-member, gera evento no
Caffeine X para plano Anual)

migratedAt

Preenchido quando migrada da Pagar.me (assinaturas legadas)

remainingPauseCycles

Ciclos restantes de pausa quando status = paused

pauseCredit

Créditos de pausa disponíveis (ver §4.5)

planIdentificationNam
e

Nome comercial do plano exibido ao cliente

vendor

Vendedor/canal (atribuição de venda)

metadata

JSON livre (ex.: source_name para atribuição de origem)

Relações 1-1: PaymentProfile (→ BillingAddress ), ShippingAddress , Discount ,
Period .
Relações 1-N: Bill , ProductItem , GiftItem , SubscriptionScheduling ,
SubscriptionPause , SubscriptionCancelReason , Metafield .
PaymentProfile / BillPaymentProfile
Cartão de crédito tokenizado na Vindi ( vindiPaymentProfileId ) com dados de exibição (holder,
bandeira, 6 primeiros/4 últimos dígitos, validade). BillPaymentProfile é um snapshot do cartão
usado em cada fatura (histórico).
ShippingAddress
Endereço de entrega da assinatura + dados da cotação de frete congelada: intelipostQuoteId ,
deliveryMethodName , estimateBusinessDays , shippingPrice ,
fixedDeliveryMethodName (trava o método de entrega).
Discount (desconto da assinatura)
code + percentage : desconto permanente do plano.
temporaryCode + temporaryPercentage + temporaryCycles : desconto temporário
(cupom de oferta) que vale por N ciclos; quando os ciclos zeram, volta ao desconto permanente
(ver §4.3).
Period
Espelho do período corrente da Vindi: cycle , startAt , endAt , billingAt , vindiPeriodId .
Bill / Charge
Bill : fatura. vindiBillId (único), status ( pending / paid / canceled ), amount ,
integrationCode (UUID usado como código do pedido nas integrações Omie/Intelipost),
billType ( null = recorrente, 'single' = pedido avulso), dados de NF ( invoiceNumber ,
invoiceKey ), snapshot de dados do cliente.
Charge : cobrança da fatura. vindiChargeId , status , attemptCount ,
nextAttempt , método ( credit_card / pix ), QR Code PIX ( qrCodePath ), nsu , paidAt ,
bandeira.
ProductItem / SubstituteProductItem

Item da assinatura (produto recorrente), com snapshot completo do produto (título, handle, SKU, preço,
dimensões/peso para frete, vindiProductId , omieProductId , imagem) e o desconto aplicado
por item ( discountPercentage , discountAmount , absoluteDiscountAmount ).
status ( on / off ): controla recorrência de 60 dias (ver §4.6).
cycles : item temporário que dura N ciclos; ao expirar pode ser trocado pelo
SubstituteProductItem (ver §4.7).
GiftItem (brinde)
Brinde ativo na assinatura. status active / inactive — brindes ativos entram no próximo
pedido e são inativados após inclusão. caffeineXOrderId quando o brinde veio de resgate de
pontos; inventoryItemId para baixa de estoque no Backoffice.
SubscriptionScheduling (+ DiscountScheduling, ProductItemScheduling,
SubstituteProductItemScheduling)
Agendamento de troca de plano/itens (ver §5.3). status : Scheduled , Canceled , Finished ,
Failed . newVindiSubscriptionId aponta para a assinatura futura criada na Vindi.
cancellationBlocked impede o cliente de cancelar o agendamento.
SubscriptionPause
Registro de pausa: cycles , pauseType ( Offer / User / Admin ), status
( paused / processed ), pausedAt , startAt (data de retomada), billingAt , pauseReason .
SubscriptionCancelReason
Pesquisa de cancelamento: reason , title , response (respostas do questionário).
Order / OrderItem / OrderShippingAddress / ShippingLine / Fulfillment / FulfillmentEvent
Pedido gerado por fatura (1-1 com Bill ):
Order : subtotalPrice , discountPrice , totalPrice , discountCode ,
discountPercentage , tags (ex.: processado ), integrationStatus
( pending / processed ).
OrderItem : itens consolidados (quantidade agregada por handle), flag gift .
OrderShippingAddress : snapshot do endereço no momento do pedido.
ShippingLine : transportadora, deliveryCode (código Omie), deliveryDate calculada
via Intelipost, preço do frete.

Fulfillment + FulfillmentEvent : rastreio ( trackingUrl ) e eventos de status
logístico.
Promo / PromoItem / UserPromo
Promoções por produto (ver §4.4):
Promo : code (único), cycles (duração em ciclos), discountAmount ou
discountPercentage , expiresAt , revalidate (se true , a promo precisa ser
reenviada a cada edição de assinatura, senão é removida).
PromoItem : handles/IDs Shopify dos produtos elegíveis.
UserPromo : associação usuário (shopifyCustomerId) × promo, com ciclos restantes próprios
(único por userId+promoId ).
Metafield / MetafieldDefinition
Sistema genérico de metadados (tipos: text, text_list, boolean, json, date, number) anexáveis a order
ou subscription . Usos reais:
omie_order_number / omie_order_id — IDs do pedido no Omie.
omie_order_integration_error_log — log de erro de integração (JSON).
omie_order_body — payload enviado ao Omie.
subscription_pagarme_migrated — flag de migração.
caffeine_x_early_earn_transaction — pontos antecipados creditados.

3. Ciclo de Vida da Assinatura
Estados
┌─────────────┐
(agendamento)

│

future

│──(sync diário/1ª cobrança)──┐

┌────────►└─────────────┘

▼

│

┌─────────────┐

┌──────────┴─────┐
│

fraud_review

(antifraude aprova/1º pgto)

│

active

│

│──────────────────────────────────────► └──┬───┬───┬──┘

└──────────┬─────┘

│

│

│

(pausa)

│

│

│

▼

▼

│

│

▼

┌──────────┐

┌──────────┐

│

│ (ClearSale rejeita)
(cancela)

┌──────────┐
│ canceled │◄────────────────────────────│

paused

│◄──┘

│

canceled │
└──────────┘

(cancela)

└────┬─────┘

└────┬─────┘
│ (fim da pausa)

│

▼

▼

(reativa)
active
active/future
active — assinatura cobrando normalmente.
future — assinatura criada com startAt futuro (típico de agendamento de troca de plano).
Sincronizada diariamente com a Vindi até virar active .
fraud_review — primeira cobrança em análise antifraude (ClearSale via Vindi). O pedido só é
liberado quando vira paid ; se rejeitada, cancela com motivo "Rejeitado pela ClearSale".
paused — pausa temporária por N ciclos. Durante a pausa, as faturas mensais continuam sendo
geradas pela Vindi com 100% de desconto (valor zero); a cada fatura gerada o contador
remainingPauseCycles decrementa até retomar.
canceled — cancelada (pelo cliente, admin, Vindi, inadimplência, ClearSale ou troca de plano).

Regra de unicidade
Um cliente ( shopifyCustomerId ) só pode ter uma assinatura nos status active , future ,
fraud_review ou paused . A criação é rejeitada (422) se já existir.

4. Regras de Negócio
4.1 Planos, frequência e cobrança
A cobrança é sempre mensal. Existe um único plano na Vindi ( vindiPlanId : produção
374233 , staging 75651 ) e todas as assinaturas usam esse plano com ciclo mensal.
A frequency ( Mensal , Trimestral , Semestral , Anual ) define o período de
fidelidade e dá nome ao plano comercial. PeriodicityEnum : Trimestral = 3, Semestral = 6,
Anual = 12, Mensal = -1 (sem fidelidade).
O preço da assinatura é a soma dos ProductItems ativos, cada um com seu desconto
individual aplicado na Vindi (desconto percentual por product_item ).

Método de pagamento na criação: credit_card_sem_retentativa por padrão (permite
análise ClearSale sem retentativa automática). Após o primeiro pagamento confirmado, o
método é trocado para credit_card (com retentativa) via updatePaymentMethodCode .
Também há pagamento via PIX (cobranças avulsas/reemissão).

4.2 Fidelidade (remainingCancelation)
remainingCancelation inicia com o valor da periodicidade (ex.: Anual = 12) e decrementa a
cada ciclo pago.
Quando chega a 0 e o ciclo é pago, renova automaticamente: volta para
PeriodicityEnum[frequency] - 1 e, se Anual, dispara o evento
RENEW_ANNUAL_SUBSCRIPTION ao Caffeine X (pontos de renovação).
Quando remainingCancelation === 0 , o cliente recebe o e-mail "Sua assinatura será
renovada em breve".
earlyRemainingCancellation (quando não nulo e > 0) decrementa em paralelo — usado
para janela de cancelamento antecipado.
Mensal tem remainingCancelation = -1 (nunca entra na lógica de fidelidade).
Na troca de plano agendada, a fidelidade é herdada se o cupom não mudou (ou se o novo cupom é
ADICIONEEGANHE ); caso contrário, reinicia com a periodicidade do novo plano.

4.3 Descontos do plano (Discount)
Desconto permanente ( code + percentage ) aplicado a todos os itens.
Desconto temporário ( temporaryCode + temporaryPercentage + temporaryCycles ):
prevalece sobre o permanente enquanto houver ciclos. Em cada ciclo pago,
temporaryCycles decrementa; ao chegar a 0:
1. Os campos temporários são zerados no banco.
2. Os descontos de todos os itens são recalculados com o percentual permanente
(considerando promos, ver abaixo).
3. Os descontos são reescritos na Vindi ( updateDiscounts : apaga todos os discounts da
assinatura na Vindi e recria item a item).
Cálculo do valor com desconto sempre usa temporaryPercentage || percentage (o
temporário vence).
handleProductDiscountByHandle(handle, price, pct) existe como ponto de
extensão para regras de desconto por produto, mas atualmente é um passthrough (retorna o
percentual sem alteração).

4.4 Promos (descontos por produto)

Sistema paralelo de promoções aplicáveis a produtos específicos:
O cliente acumula UserPromo s (associadas por código via associatePromoToUser ).
Regra do melhor desconto: para cada produto, compara-se o desconto da assinatura ( price ×
percentage ) com o desconto de cada promo elegível (valor fixo discountAmount ou
percentual). Vence o maior valor absoluto; em empate, vence o desconto da assinatura.
O resultado define os campos do ProductItem : discountAmount (se promo por valor),
discountPercentage , absoluteDiscountAmount (valor final em R$, arredondado para
cima ao centavo — roundUpToCents ).
A cada ciclo pago (assinatura não pausada): UserPromo.cycles decrementa; ao chegar a 1, a
UserPromo é deletada.
Revalidação ( Promo.revalidate = true ): ao editar a assinatura, promos com
revalidate=true que não vierem no payload da edição são removidas do usuário. Promos
sem revalidate são mantidas/transferidas para a assinatura futura.

4.5 Pausa de assinatura
Créditos de pausa por frequência ( SubscriptionPauseCredits ): Anual = 2, Semestral = 1,
Trimestral = 0, Mensal = 0.
Créditos são resetados no início de cada novo período de fidelidade (quando
remainingCancelation volta ao topo).
Cliente ( pauseType: User ) só pode pausar se: status active , frequência Semestral ou
Anual, e pauseCredit > 0 . pauseType: Offer (oferta de retenção) ignora essas
restrições. Admin segue as mesmas regras de User.
Mecânica da pausa ( cycles = nº de ciclos pausados):
1. Aplica 100% de desconto em todos os itens na Vindi (a fatura do período pausado sai
zerada).
2. Cria SubscriptionPause com startAt (data de retomada = nextBillingAt +
(cycles-1) meses ) e billingAt (= startAt + 1 mês ).
3. Assinatura vira paused , remainingPauseCycles = cycles , pauseCredit -=
1.
4. Envia e-mail de pausa e evento SUBSCRIPTION_PAUSED ao Caffeine X.
Retomada automática: a cada bill_created da Vindi com assinatura pausada, decrementa
remainingPauseCycles . No último ciclo: restaura os descontos reais na Vindi, marca a
pausa como processed , volta a active , envia e-mail de retomada e evento
SUBSCRIPTION_RESUMED .
Cancelar pausa: restaura descontos, deleta o registro de pausa, devolve o crédito
( pauseCredit += 1 ), volta a active .

4.6 Recorrência de 60 dias (switch de produto)
ProductItem.status : null = item normal (todo ciclo); 'on' = ativo neste ciclo; 'off' =
inativo neste ciclo.
Itens com status não-nulo alternam a cada ciclo pago ( on → off → on ...), entrando no
pedido a cada 2 meses. A alternância é replicada na Vindi (adiciona/remove product_item +
desconto).
Regra de validação: pelo menos um item da assinatura deve ser "não-60-dias" (não pode ter todos
os itens com status = on ). Vale na criação, na edição de recorrência e no registro de ciclo
pago.
Itens off não entram no subtotal, no pedido nem na cobrança do ciclo corrente.

4.7 Itens temporários com substituto (cycles)
ProductItem.cycles = N : o item dura N ciclos. A cada ciclo pago decrementa; quando
chega a 1:
Se houver SubstituteProductItem : o substituto é adicionado à assinatura (banco +
Vindi, com o melhor desconto vigente) e o item original é removido.
O item original é removido da Vindi e deletado do banco.

4.8 Brindes (GiftItems)
Brindes active entram como OrderItem (flag gift , desconto 100% no e-mail/exibição) no
próximo pedido gerado e são marcados inactive em seguida.
Brindes com inventoryItemId geram baixa de estoque no Caffeine Backoffice
( availableDelta: -1 , origin prime ).
Brindes resgatados com pontos têm caffeineXOrderId ; no cancelamento da assinatura,
esses IDs são enviados ao Caffeine X (estorno/auditoria de pontos).
Se a assinatura for future originada de agendamento, o brinde é adicionado tanto na futura
quanto na assinatura original do agendamento.

4.9 Análise antifraude (fraud_review / ClearSale)
Na criação, se a fatura Vindi ficar pending com charge fraud_review , a assinatura nasce
com status fraud_review e o cliente recebe o e-mail "assinatura em análise".
Quando a fatura é paga (aprovada), a assinatura vira active , recebe o e-mail de confirmação de
pedido e o método de pagamento muda para credit_card .
Job manual/recorrente cancelSubscriptionsFromRejectedBillsByClearSale :
busca faturas pendentes do método "cartão sem retentativa" cuja última transação foi

rejected e cancela as assinaturas com motivo "Rejeitado pela ClearSale" (e-mail específico de
reprovação).
Caso especial na criação: assinatura active + fatura pending + transação rejected (sem
ser credit_card ) → cancela imediatamente na Vindi e retorna 402 Payment Required.

4.10 Inadimplência e retentativa
charge_rejected (webhook Vindi): envia e-mail "Assinatura pendente de pagamento" com
link da fatura + evento de tracking "Prime - Assinatura Pendente".
createNewChargeFromPendingCharges (manual): varre cobranças pending de cartão
na Vindi (fora da janela de 2 dias da última transação) e tenta cobrar novamente; pode iterar por
outros perfis de pagamento do cliente até obter paid / fraud_review .
notify-overdue-bill-hubspot (webhook HubSpot): dispara fluxo de conversa de
cobrança no Droz (chatbot/WhatsApp).
Cancelamento por inadimplência é manual por lista de e-mails
( cancelDelinquentSubscriptions ), motivo "Rejeitado por inadimplência".
syncDefaultersToHubspot (cron semanal): marca no HubSpot assinaturas ativas com
faturas pendentes.
Ao criar uma nova fatura de ciclo, as faturas pending anteriores da assinatura são canceladas
na Vindi (evita cobrança dupla).

4.11 PIX expirado → cartão (cron diário à meia-noite)
Busca na Vindi faturas PIX vencidas ( due_at <= hoje , pending , de assinatura). Para cada uma
sem charge paga: cancela a charge PIX, troca o perfil de pagamento da fatura para o cartão da
assinatura e recobra no cartão.

4.12 Tabela de preços Super Coffee (hardcoded)
Usada pelo job de atualização de preço ( updateProductItemsPrice ), que migra assinaturas
antigas para o preço novo e recalcula descontos:
Produto

Preço antigo

Preço novo

Super Coffee Classic (380g)

139,80

144,90

Super Coffee Economic (220g×2 / maior)

209,80

216,90

Língua de Gato / Lajotinha Classic

149,80

154,90

Língua de Gato / Lajotinha Economic

219,80

226,90

Produto

Preço antigo

Preço novo

To Go (não-Língua de Gato)

—

40,65

To Go Língua de Gato

—

44,25

Após atualizar preços no banco, os itens são resetados na Vindi (limpa e recria product_items +
descontos), exceto se a assinatura estiver pausada.

4.13 Frete
O frete é cotado na Intelipost no frontend; a assinatura guarda a cotação congelada
( intelipostQuoteId , método, prazo, preço).
Nos e-mails, o frete é sempre exibido como "Grátis".
A cada pedido, a data prevista de entrega é recalculada ( calculateDeliveryDate com retry
exponencial 3×).
Mapeamento método → código de transportadora Omie ( OmieDeliveryCodes ): Total Express,
Braspress Standard, Loggi Standard, Correios Sedex, Correios PAC, Frota Interna Expresso, Total
Express CDE.
fixedDeliveryMethodName permite o admin travar o método de entrega de uma assinatura.

4.14 Janela de bloqueio de edição
Edições de assinatura (agendamento de troca de itens/plano) são bloqueadas (403) quando a data
atual está entre D-2 e o dia da cobrança ( nextBillingAt ), para evitar conflito com a geração da
fatura.

5. Fluxos Principais
5.1 Criação de assinatura ( POST /subscriptions )
Origem: checkout da loja (Shopify Hydrogen). Payload inclui cliente (já criado na Vindi e na Shopify),
itens, desconto, cupons (promoCodes), endereço com cotação de frete, perfil de pagamento, brindes,
metadata.
1. Valida unicidade — rejeita se cliente já tem assinatura
active/future/fraud_review/paused .
2. Resolve descontos por item (desconto do plano × promos — melhor desconto vence).
3. Cria assinatura na Vindi (plano único, itens com pricing flat + desconto percentual por item,
método credit_card_sem_retentativa por padrão).

4. Guarda de pagamento rejeitado: se Vindi retornar transação rejeitada → cancela na Vindi e
responde 402.
5. Persiste no banco: Subscription (status da Vindi ou fraud_review ), ProductItems (com
descontos calculados), PaymentProfile + BillingAddress, ShippingAddress, Discount, Period,
GiftItems.
6. Associa promos ao usuário e marca como resgatadas.
7. Se status active / fraud_review :
Cria Bill + Charge + BillPaymentProfile locais.
Cria o pedido (Order, OrderItems consolidados + brindes, OrderShippingAddress,
ShippingLine com data de entrega Intelipost).
Sem perfil de pagamento (caso raro): envia e-mail "Atualize seu cartão".
Tracking ActiveCampaign "Prime - Finalizou compra" + contato HubSpot.
Baixa estoque de brindes no Backoffice.
8. Se a fatura já nasceu paga:
RegisterCyclePaidSubscription (ver 5.2.1).
Integra o pedido (Order Bridge ou Omie, conforme INTEGRATOR_SERVICE_NAME ).
Troca método para credit_card .
Eventos Caffeine X: ORDER_PAID (sempre), SUBSCRIPTION_REFERENCE_CREATED
(se tem código de indicação e é Anual), ANNUAL_SUBSCRIPTION_CREATED (se Anual).
HubSpot: payment_status paid + cria pedido no pipeline.
E-mail de confirmação (assinaturas migradas têm templates próprios pago/pendente).

5.2 Ciclo de renovação (webhook Vindi)
POST /webhooks/vindi — eventos tratados: subscription_canceled , bill_created ,
bill_paid , bill_canceled , charge_rejected .
bill_created (novo ciclo)
Ignora a fatura do ciclo 1 de assinatura ativa/fraud_review (já tratada na criação).
Se assinatura pausada → fluxo de retomada de pausa (§4.5).
Se a fatura já existe localmente → idempotência, retorna.
Caso normal:
1. Cancela faturas pendentes anteriores na Vindi.
2. Cria Bill + Charge + BillPaymentProfile (cria PaymentProfile local a partir da fatura se não
existir).
3. RenewSubscription: atualiza status e nextBillingAt locais com a Vindi; atualiza/cria
Period.
4. Cria o pedido do ciclo (mesma lógica de criação: itens ativos, brindes, endereço, frete).

5. Se a assinatura veio de agendamento ( origin = 'scheduling' ): marca o scheduling
como Finished e limpa o origin.
6. Se a fatura já está paga → bloco "ciclo pago" (abaixo). Se pendente → HubSpot
payment_status pending; se a transação foi rejeitada, e-mail de pendência.
bill_paid (pagamento confirmado)
1. Atualiza Bill/Charge locais; cria o pedido se ainda não existir.
2. Bloco "ciclo pago" ( RegisterCyclePaidSubscriptionUseCase ):
projectCode += 1 (contador de ciclos).
1º ciclo: dispara analytics Triple Whale (assinatura + pedido com source_name do metadata).
Fidelidade: decrementa remainingCancelation (renova ao chegar em 0; Anual ganha
pontos de renovação); decrementa earlyRemainingCancellation ; reseta
pauseCredit no início de novo período.
fraud_review → active (com e-mail de confirmação + troca para credit_card).
Alterna itens 60 dias (on/off, replicando na Vindi).
Decrementa promos do usuário e recalcula o melhor desconto por item; salva nos
ProductItems.
Reescreve todos os descontos na Vindi ( updateDiscounts ).
HubSpot: status + meses até renovação; e-mail de renovação se
remainingCancelation == 0 .
Processa itens com cycles /substituto (§4.7).
3. Ciclo 1: troca método de pagamento para credit_card . Ciclo > 1: envia e-mail "Sua assinatura
foi paga".
4. Atualiza deliveryDate da ShippingLine e integra o pedido (Order Bridge/Omie).
5. Decrementa desconto temporário ( HandleDiscount , §4.3).
6. Evento Caffeine X ORDER_PAID ; casos de agendamento para Anual disparam
ANNUAL_SUBSCRIPTION_CREATED quando plano ou cupom mudou.
7. Ajusta nextBillingAt local a partir da fatura, tracking "Prime - Pago", HubSpot paid + pedido
HubSpot.
subscription_canceled
Cancela a assinatura local (se ainda não cancelada) com motivo "Assinatura cancelada pela Vindi" +
evento Caffeine X.

5.3 Edição de assinatura / Agendamento ( POST
/subscriptions/:id/scheduling )

Toda edição de itens, plano ou cupom passa pelo CreateSubscriptionSchedulingUseCase .
Bloqueada na janela D-2 (§4.14).
Caso A — mesma frequência e mesmo cupom (edição simples de itens):
1. Remove todos os itens da assinatura na Vindi e do banco.
2. Revalida promos ( revalidate=true ausentes do payload são removidas; novas do payload
são associadas).
3. Recria os itens (banco + Vindi) com o melhor desconto por item.
4. Registra um scheduling já Finished (auditoria) e envia e-mail "Você realizou uma alteração no
seu plano".
Caso B — mudou frequência ou cupom (ou forceScheduling ): troca de plano agendada
1. Valida que o cliente não tem outra assinatura ativa/futura (409).
2. Copia perfil de pagamento, endereços da assinatura atual.
3. Cria uma assinatura future na Vindi e no banco com startAt = nextBillingAt da atual
(método credit_card ), herdando promos não-revalidáveis + novas, fidelidade conforme regra
do §4.2, brindes atuais + novos.
4. Cancela a assinatura atual (Vindi + banco) com motivo automático: Upgrade de Plano
(mudou frequência), Upgrade de Oferta (mudou cupom) ou Troca de lata e/ou
sabor (com rollback local se o cancelamento na Vindi falhar).
5. Cria SubscriptionScheduling Scheduled apontando para a nova assinatura
( newVindiSubscriptionId ), com itens/desconto agendados e cancellationBlocked
opcional.
6. E-mail "Você agendou uma alteração no seu plano"; baixa de estoque de brindes; HubSpot loyalty
date se cupom mudou.
Conclusão do agendamento: quando a assinatura futura gera sua primeira fatura ( bill_created ), o
scheduling vira Finished e o origin é limpo (ver 5.2).
Cancelamento do agendamento ( DELETE /subscriptions/schedulings/:id ): marca
Canceled , reativa a assinatura original na Vindi e no banco ( active ou future conforme
startAt ), deleta a assinatura futura criada e devolve estoque de brindes.

5.4 Cancelamento e reativação
Cancelar ( DELETE /subscriptions/:id ):
1. Cancela na Vindi (aborta se falhar).
2. Atualiza local: canceled , cancelAt = agora (UTC-3) , nextBillingAt = null ,
motivo.

3. Persiste o questionário de cancelamento ( SubscriptionCancelReason ).
4. E-mail de cancelamento; evento Caffeine X SUBSCRIPTION_CANCELED (com
caffeineXOrderIds dos brindes resgatados); tracking "Prime - Cancelado"; HubSpot (data,
status, motivo).
Reativar ( POST /subscriptions/:id/reactivate ):
Reativa na Vindi ( /reactivate ), restaura status/nextBillingAt locais, limpa cancelamento, evento
SUBSCRIPTION_REACTIVATED , tracking "Prime - Reativado", HubSpot.

5.5 Pedido avulso (Single Invoice)
POST /subscriptions/:id/create-single-invoice — venda pontual para assinante (ex.:
adicionar produto fora da recorrência):
1. Valida que o shopifyCustomerId confere com a assinatura.
2. Cria fatura avulsa na Vindi (bill sem assinatura) cobrando no cartão informado.
3. Cria Bill local com billType: 'single' e integrationCode = 'PM{vindiBillId}' , Charge, Order (sem desconto), OrderItems, endereço e frete.
4. Pagamento/cancelamento chegam pelo webhook Vindi como fatura sem subscription →
ProcessSingleInvoicePayment atualiza status e dispara o fluxo de e-mails específicos
(pago, em trânsito, entregue — templates SINGLE_INVOICE_*).
5. No fluxo logístico, faturas single não recebem o e-mail de "pronto para envio".

5.6 Logística e rastreio (webhook Intelipost)
POST /webhooks/intelipost — recebe mudanças de microstatus do volume. Códigos
relevantes:
Código Intelipost

Status interno

8

ready_for_shipping

12

in_transit

16

out_for_delivery

14

delivered

7

failure
Localiza a fatura pelo order_number = Bill.integrationCode .
Cria Fulfillment (com trackingUrl ) na primeira ocorrência e registra
FulfillmentEvent s.

Para ready_for_shipping , in_transit (apenas o primeiro) e delivered : envia e-mail
ao cliente e enfileira atualização do rastreio no pedido HubSpot.

5.7 Integração de pedidos (ERP)
Controlada por INTEGRATOR_SERVICE_NAME :
order-bridge (atual): envia o pedido à Order Bridge API (serviço interno, com autenticação
própria). Webhook order-integration-status confirma order.processed → tag
processado + integrationStatus = processed . Cron 8h/14h reintegra pendentes.
omie (legado): monta o payload do pedido Omie (cenários de imposto, parcelas, transportadora
via OmieDeliveryCodes , local de estoque) e envia. Webhook /webhooks/omie :
VendaProduto.Incluida → grava omie_order_number / omie_order_id como
metafields.
Erro ( faultstring ) → grava omie_order_integration_error_log ; trata o caso
"Pedido já cadastrado" extraindo os IDs por regex.
Endpoints de reintegração manuais ( reintegrateOrders ,
reintegrateOrdersPaid , listNonIntegratedOrders* ).

5.8 Verificação de divergências (D+4)
Cron diário (1h): seleciona assinaturas active com cobrança em 4 dias e compara, em lotes de 50, os
itens/descontos do banco vs. Vindi. Divergências detectadas: missing_in_vindi ,
missing_in_db , discount_mismatch . Notifica via Slack para correção manual antes da
cobrança.

6. Integrações Externas
Serviço

Papel

Autenticação/Config

Vindi

Gateway de recorrência: assinaturas, faturas, cobranças,
perfis de pagamento, descontos, product_items,
períodos, reembolso/reativação

VINDI_BASE_URL ,
VINDI_API_KEY

Shopify /
Hydrogen

Identidade do cliente ( shopifyCustomerId ),
storefront ( HYDROGEN_STORE_URL para links em emails), Admin API

SHOPIFY_API_KEY
/SECRET/HOST_NA
ME

Intelipost

Cotação de frete (frontend), cálculo de data de entrega,
webhook de rastreio

INTELIPOST_API
_KEY

Serviço

Papel

Autenticação/Config

Omie

ERP — criação de pedidos de venda, NF

via Backoffice /
payload próprio

Order Bridge
API

Serviço interno de integração de pedidos (substituindo
integração direta Omie)

ORDER_BRIDGE_AP
I_URL + auth
adapter

SendGrid

E-mails transacionais (template dinâmico único +
versões)

SENDGRID_API_UR
L/KEY

HubSpot

CRM: contatos (propriedades contact__prm__* :
status, plano, datas, motivo de cancelamento,
payment_status, meses até renovação), pedidos no
pipeline (stage TRACKING_STAGE = 208028553 ),
tracking URL

HUBSPOT_ACCESS_
TOKEN

ActiveCampaign

Event tracking de marketing (eventos "Prime - *")

ACTIVE_CAMPAIGN
_KEY/ACTID

Caffeine X

Programa de pontos/fidelidade. Regras: contratação de
plano Anual gera pontos (missão); renovação Anual gera
pontos N vezes; upgrade Tri/Sem → Anual gera pontos
(Tri→Sem não gera); todo pedido pago devolve o valor
pago (arredondado p/ cima) em pontos

CAFFEINE_X_BASE
_URL/API_KEY

Caffeine
Backoffice

Baixa/devolução de estoque de brindes; envio a Omie

PRIME_CAFFEINE_
BACKOFFICE_SEND
_TO_OMIE_URL

Cloud Humans

IA de atendimento — endpoints read-only de
assinatura/pedidos por e-mail

header cloudhumans-x-apikey

Droz

Chatbot/WhatsApp — conector de recobrança (gera nova
cobrança a partir de fatura + CPF) e consulta de rastreio
por e-mail; fluxo de fatura vencida

header X-API-KEY
( DROZ_X_API_KEY ),
DROZ_CONVERSATI
ON_API_*

Triple Whale

Analytics de e-commerce (registro de assinatura e
pedido no 1º ciclo pago)

adapter próprio

Inovyo

Pesquisa/NPS

INOVYO_API_*

Slack

Notificações operacionais (divergências)

webhook

Sentry / New
Relic

Erros e APM

SENTRY_DNS ,
NEW_RELIC_*

Publicação de novos pedidos (legado)

GOOGLE_CLOUD_FU
NCTION_PUBLISH_
NEW_ORDER_URL

Google Cloud
Function

7. Jobs, Crons e Filas
Crons (declarados em TasksController — todos também expostos
como endpoints manuais)
Agenda

Tarefa

O que faz

Diário
00:00

changeExpiredPixToCreditCar
dPaymentProfile

PIX vencido → recobra no cartão (§4.11)

Diário
00:00

syncFutureSubscriptions

Sincroniza assinaturas future com a Vindi;
ativa quando a Vindi ativar

Diário
01:00

getDivergences

Verificação de divergências D+4 (§5.8)

08:00 e
14:00

reintegratePendingOrders

Reintegra pedidos pendentes na Order Bridge

Semanal

syncDefaultersToHubspot

Sincroniza inadimplentes com HubSpot

Filas Bull
Fila

Processos

TaskJob

create-new-charge-from-pending-bill (retentativa de cobrança,
iterando perfis de pagamento), cancel-subscription-by-clearsale ,
cancel-delinquent-subscriptions , change-expired-bill-pixto-credit-card , sync-future-subscriptions

SyncFutureSu
bscriptionJo
b

Sincronização individual de assinatura futura

SyncDefaulte
rsToHubspotJ
ob

Atualização de inadimplente no HubSpot

GetDivergenc
esJob

Comparação banco × Vindi em lote (50)

UpdateProduc
tItemsPriceJ
ob

Atualização de preço de itens (§4.12)

UpdateHubspo
tOrderTracki
ngJob

Atualiza tracking URL no pedido HubSpot

Fila
GetAdminSubs
criptionsEma
ilJob /
Format... /
Send...

Processos

Pipeline de export de assinaturas (Excel) por e-mail para admins

Tarefas manuais relevantes (endpoint /tasks/* )
cancelSubscriptionsFromRejectedBillsByClearSale — cancelamento em massa
por antifraude.
cancelDelinquentSubscriptions — cancelamento por inadimplência (lista de e-mails).
createNewChargeFromPendingCharges / chargeNowOnPendingBills /
charges/:id/chargeNowOnPaymentProfiles — recobrança.
updateBillingTriggerDay — realinha o dia de cobrança na Vindi com o fim do período.
createOrderFromBill / createBillFromVindiBill — reprocessamento manual de
fatura/pedido (recuperação de falhas de webhook).
instantiateShippingLineFromBill ,
orders/:orderId/instantiateOrderShippingAddress — reconstrução de dados de
pedido.
resendOrderPaidCaffeineXEvent , createEarlyEarnTransactionToCaffeineX —
reenvio de eventos de pontos.
includeRedeemedGiftItems , includeMorningShotGiftItemToSubscriptions —
inclusão de brindes em massa (campanhas).
associatePromosToUser — associação manual de promos.
resetProductItemsFromSubscription/:id — ressincroniza itens/descontos na Vindi a
partir do banco.
sendRenewEmails — reenvio do e-mail de renovação.
fixKitSmartLife — correção pontual de dados de campanha (exemplo de "fix" hardcoded).

8. API — Endpoints e Autenticação
Autenticação
Estratégia
x-api-key

Header
x-api-key

Chave
CAFFEINE_PRIME_X_A
PI_KEY

Usada por
Frontend/loja,
admin, etc.

Estratégia

Header

Chave

Usada por

cloud-humans-xapi-key

cloud-humans-xapi-key

CLOUD_HUMANS_X_AP
I_KEY

Cloud Humans

droz-x-api-key

X-API-KEY

DROZ_X_API_KEY

Droz

Webhooks ( /webhooks/* ) e tasks não têm guard de autenticação no código (ver §11).

/subscriptions (cliente — app/loja)
Método/Rota

Função

POST /

Criar assinatura

GET /:id

Detalhe da assinatura
(com relações)

GET /customers/:shopifyCustomerIdOrCustomerEmail

Assinatura corrente
do cliente

GET /customers/:id/lastcanceled

Última assinatura
cancelada

GET /customers/:id/bills / first-bill / discount-tracker

Faturas e histórico
de desconto

GET /:id/bills/:billId

Detalhe da fatura

GET /:id/shippingAddress / verifyPendingBills

Endereço /
pendências

GET /vindiSubscription/:vindiSubscriptionId

Busca por ID Vindi

POST /:id/scheduling + GET
/schedulings/:vindiSubscriptionsId + DELETE
/schedulings/:id + PATCH
/:id/updateSubscriptionScheduling

Edição/agendamento
de plano

POST /:id/createPaymentProfile / PATCH
/:id/updatePaymentProfile/:paymentProfileId / PATCH
/:id/bills/:billId/updateBillPaymentProfile

Cartões

PATCH /:id/updateShippingAddress/:shippingAddressId

Endereço

PATCH /:id/updateDiscount / PATCH
/customers/:id/updateSubscriptionCustomer

Desconto / dados
cadastrais

POST /:id/bills/:billId/createPixCharge /
chargeInstantly / POST
/charges/:vindiChargeId/createCharge

Reemissão de
cobrança
(PIX/cartão)

POST /:id/pause / POST /:id/cancelSubscriptionPause

Pausa

Método/Rota

Função

POST /:id/addGiftItem / DELETE /:id/giftItem/:giftId /
POST /get-gifts-benefits

Brindes/benefícios

POST /:id/create-single-invoice

Pedido avulso

PATCH /:id/product-items/:itemId/edit-recurrence /
DELETE /product-items/:id

Recorrência 60d /
remoção de item

DELETE /:id / POST /:id/reactivate

Cancelar / reativar

/admin (backoffice)
Listagem/paginação de assinaturas (filtros), assinaturas sem cartão, faturas, agendamentos,
metafields, criação manual de pedido a partir de fatura Vindi, envio a Omie, alteração de
nextBillingAt , edição de assinatura/itens/endereço/método de entrega, export Excel por e-mail
(job), exclusão de order items, cancelamento administrativo, verificação de status Prime de cliente.

/webhooks
vindi , omie , intelipost , caffeine-x (pontos antecipados), notify-overdue-billhubspot (→ Droz), order-integration-status .

Outros
/bills (busca, detalhes, anexar NF), /promos (CRUD + userPromos), /cloud-humans , /droz ,
/tasks (operacional), /api/healthz .

9. E-mails Transacionais
Todos via SendGrid, remetente prime@caffeinearmy.com.br (com BCC para o próprio endereço),
template dinâmico único ( d-d789bbcc452a432396ff60c3245aa299 ) + versão por tipo:
Evento

Template (versão)

Assinatura confirmada (1º pedido)

SUBSCRIPTION_CONFIRM

Assinatura em análise
(antifraude)

SUBSCRIPTION_REVIEW

Assinatura reprovada (ClearSale)

SUBSCRIPTION_REJECTED

Evento

Template (versão)

Assinatura cancelada

SUBSCRIPTION_CANCELED

Edição de plano
(imediata/agendada)

SUBSCRIPTION_EDIT / SUBSCRIPTION_SCHEDULE

Fatura paga (ciclo ≥ 2)

BILL_PAID

Fatura pendente / cobrança
rejeitada

BILL_PENDING

Cobrança PIX

BILL_PIX_PAYMENT

Cartão pendente de cadastro

SUBSCRIPTION_PAYMENT_PROFILE_PENDING

Renovação próxima (fidelidade
zerou)

RENEW_SUBSCRIPTION

Pausa criada / retomada / pausa
cancelada

SUBSCRIPTION_PAUSED / SUBSCRIPTION_RESUME /
SUBSCRIPTION_PAUSE_CANCELED

Troca de recorrência de produto
(30↔60d)

SWITCH_PRODUCT_RECURRENCE

Pedido pronto p/ envio / em
trânsito / entregue

ORDER_READY_FOR_SHIPPING / ORDER_IN_TRANSIT /
ORDER_DELIVERED

Pedido avulso: pago / em trânsito
/ entregue

SINGLE_INVOICE_*

Conteúdo típico: nome do cliente, ID da assinatura Vindi, itens (título sem "380g/220g", formato, preço,
imagem; brindes a R$ 0), subtotal/desconto/total, frete "Grátis", endereços, prazo de entrega, links para
HYDROGEN_STORE_URL/account/prime .

10. Eventos e Tracking
ActiveCampaign (event tracking por e-mail do cliente)
Prime - Finalizou compra , Prime - Pago , Prime - Assinatura Pendente , Prime
- Cancelado , Prime - Reativado .

Caffeine X (eventos de pontos)
ANNUAL_SUBSCRIPTION_CREATED , RENEW_ANNUAL_SUBSCRIPTION , ORDER_PAID ,
CREATE_PRIME_EARLY_TRANSACTION_AMOUNT , SUBSCRIPTION_CANCELED ,
SUBSCRIPTION_REACTIVATED , SUBSCRIPTION_REFERENCE_CREATED ,

SUBSCRIPTION_PAUSED , SUBSCRIPTION_RESUMED . Webhook de retorno
early_prime_amount_created marca metafield na assinatura.

HubSpot (propriedades de contato contact__prm__* )
last_signature_date , subscription_plan , subscription_status ,
payment_status , months_until_renewal , cancellation_date ,
cancellation_reason , loyalty_acceptance_date + criação de pedido (deal) por fatura paga
e atualização de tracking URL.

Triple Whale
Registro de assinatura e pedido apenas no primeiro ciclo pago, com source_name extraído do
metadata da assinatura.

11. Pontos de Atenção para a Nova Aplicação
Aprendizados e dívidas do sistema atual que a nova aplicação deve endereçar:
1. Timezone manual: o código aplica subHours(date, 3) em dezenas de pontos para converter
para UTC-3. Padronizar armazenamento em UTC e conversão na borda.
2. Sem entidade Customer: dados do cliente ficam desnormalizados na Subscription e na Bill.
Avaliar entidade própria.
3. Lógica de pedido triplicada: handleOrderCreation existe em 3 lugares
(CreateSubscription, WebhooksController, TasksController) com pequenas variações — risco
constante de divergência. Centralizar.
4. Webhooks sem autenticação/verificação de assinatura e endpoints /tasks e /webhooks
sem guard. Proteger na nova app.
5. Idempotência parcial: baseada em "fatura já existe?"; sem dedupe formal de eventos de webhook.
Considerar tabela de eventos processados.
6. Cálculo de desconto espalhado: o "melhor desconto" (plano × promo × handle) é recalculado em ~7
pontos diferentes (criação, ciclo pago, edição, pausa, expiração de cupom, toggle 60d, reset).
Extrair para um único serviço de pricing.
7. handleProductDiscountByHandle é um no-op hoje (passthrough) mas é chamado em todo
lugar — confirmar se a regra por produto morreu ou voltará.
8. Preços hardcoded ( superCoffeePrices , baseSuperCoffeePrices , kit Smart Life,
Morning Shot) e jobs "fix" pontuais no código. A nova app deve ter catálogo/preço dinâmico.

9. updateDiscounts na Vindi é destrutivo: apaga todos os discounts e recria; se falhar no meio,
deixa a assinatura sem desconto (motivo da existência do job de divergências D+4). Buscar
operação transacional/diferencial.
10. Console.log de debug em produção em fluxos críticos (promos, descontos). Padronizar no logger
estruturado.
11. Status como strings livres espelhando a Vindi ( subscription.status , bill.status ) sem
enum no schema — tipar na nova app.
12. Cancelamento de pendentes ao criar fatura nova (handleCancelVindiPendingBills) é regra
implícita importante — documentar/preservar.
13. projectCode é na verdade "ciclos pagos" — nome enganoso; renomear.
14. Acoplamento forte à Vindi (IDs, status, payloads em todo o domínio). Se a nova app pretende
trocar/abstrair o gateway, isolar atrás de uma porta de billing.
15. Crons dentro de controllers HTTP (mesmo processo da API) — separar workers de API na nova
arquitetura.
16. Integração dupla Omie/Order Bridge por env var — definir um único caminho na nova app.
17. Fluxo de migração Pagar.me ( migratedAt , e-mails específicos) — verificar se ainda é
necessário.

