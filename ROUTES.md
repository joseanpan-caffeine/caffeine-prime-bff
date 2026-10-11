# Rotas do BFF v1 (prefixo `/v1`)

Tipos em `src/contracts/api.ts`. Auth: `Authorization: Bearer <accessToken>` em tudo exceto `/auth/*`, `/config`, `/payments/vindi-config`, `/webhooks/*`, `/health`.
Erros: `{code, message, details?}` com HTTP adequado. Mutações aceitam header `Idempotency-Key`.

## Auth
| Método | Rota | Body | Resposta |
|---|---|---|---|
| POST | /auth/login | LoginRequest | AuthResponse |
| POST | /auth/google | SocialLoginRequest | AuthResponse |
| POST | /auth/apple | SocialLoginRequest | AuthResponse |
| POST | /auth/magic-link | MagicLinkRequest | 202 `{sent: true}` |
| POST | /auth/magic-link/exchange | MagicLinkExchangeRequest | AuthResponse |
| POST | /auth/register | RegisterRequest | AuthResponse |
| POST | /auth/refresh | RefreshRequest | AuthTokens |
| POST | /auth/logout | RefreshRequest | 204 |

## Conta e assinatura
| GET | /me | — | UserProfile |
| PATCH | /me/profile | UpdateProfileRequest | UserProfile |
| GET | /me/dashboard | — | Dashboard |
| GET | /me/subscription | — | Subscription (404 se não há) |
| GET | /me/catalog | — | Catalog |
| POST | /me/subscription/preview | PreviewRequest | PricePreview |
| POST | /me/subscription/scheduling | SchedulingRequest | ScheduledChange (403 EDIT_WINDOW_CLOSED; outra `frequency` → id da assinatura muda) |
| DELETE | /me/subscription/scheduling | — | 204 |
| PATCH | /me/subscription/items/:itemId/recurrence | `{recurrence: ItemRecurrence}` | Subscription (422 se todos os itens ficariam 'on') |
| PATCH | /me/subscription/discount | `{code: string}` | Subscription |
| POST | /me/subscription/pause | PauseRequest | Subscription (403 com reason) |
| POST | /me/subscription/resume | — | Subscription |
| POST | /me/subscription/cancel | CancelRequest | Subscription |
| POST | /me/subscription/reactivate | — | Subscription |
| GET | /me/subscription/cancel-reasons | — | ReasonOption[] |
| GET | /me/subscription/pause-reasons | — | ReasonOption[] |

## Pagamento
| GET | /payments/vindi-config | — | VindiConfig |
| GET | /me/payment-profiles | — | PaymentProfile[] |
| POST | /me/payment-profiles | AddCardRequest | PaymentProfile |
| DELETE | /me/payment-profiles/:id | — | 204 |
| GET | /me/bills | — | Bill[] |
| GET | /me/bills/:billId | — | Bill |
| POST | /me/bills/:billId/pay/pix | — | Bill (com `pix`) |
| POST | /me/bills/:billId/pay/current-card | — | Bill |
| POST | /me/bills/:billId/pay/new-card | PayWithNewCardRequest | Bill |

## Entrega e extras
| GET | /me/shipping-address | — | ShippingAddress |
| POST | /me/shipping-address/quote | AddressQuoteRequest | AddressQuote |
| PATCH | /me/shipping-address | UpdateAddressRequest | ShippingAddress |
| GET | /me/tracking | — | Fulfillment (404 se não há) |
| GET | /me/savings | — | Dashboard['savings'] |
| GET | /me/wallet | — | Dashboard['wallet'] |
| POST | /me/delete-request | `{reason?: string}` | 202 |

## Dispositivo / config
| POST | /me/devices | RegisterDeviceRequest | `{id}` |
| DELETE | /me/devices/:id | — | 204 |
| GET | /me/notification-preferences | — | NotificationPreferences |
| PATCH | /me/notification-preferences | Partial<NotificationPreferences> | NotificationPreferences |
| GET | /config | — | AppConfig |
| GET | /health | — | `{status:'ok'}` |

## Webhooks (sem sessão)
| POST | /webhooks/vindi?secret= | payload Vindi | 200 |
| POST | /webhooks/estoca | payload cru v1/v2 (Bearer) | 200 |

## Regras (calculadas no servidor, fuso America/Sao_Paulo; fonte: docs/contexto-prime.md §6.1–6.3)
Toda ação passa primeiro por `capabilities`; negada → 403 com `code` = razão (`details.until` quando há janela). Quando permitida e sujeita a janela, a capability traz `closesAt` (ISO São Paulo) para o app mostrar "até {data}" **sem calcular prazo no aparelho**.

- **Edição da caixa / endereço**: bloqueada de **D-3 00:00** (America/Sao_Paulo) até `nextBillingAt` → `canEdit.allowed=false, reason EDIT_WINDOW_CLOSED, until=nextBillingAt`. Regra oficial é D-3 [REGRA]; a Prime API só bloqueia em D-2 [SISTEMA] (divergência documentada em `EDIT_WINDOW_DAYS`).
- **Pausa** (`canPause`), nesta ordem de razões: status active (`SUBSCRIPTION_NOT_ACTIVE`/`UNDER_REVIEW`); frequência Semestral|Anual (`FREQUENCY_NOT_ELIGIBLE`); `pauseCreditsLeft>0` (`NO_PAUSE_CREDITS`); **≥ 3 cobranças pagas**, ou seja, a partir da 4ª (`MIN_PAID_CYCLES`); **pedido até D-3** da próxima cobrança (`PAUSE_WINDOW_CLOSED`, `until=nextBillingAt`). Créditos Anual=2, Semestral=1, Trimestral/Mensal=0; `maxCycles=2`; **cada ciclo pausado consome 1 crédito** (`cycles > créditos` → 422 `NOT_ENOUGH_PAUSE_CREDITS`).
- **Semântica da pausa**: cada ciclo pausado pula exatamente 1 cobrança, gera uma fatura **R$ 0,00 já paga** (`Bill.pausedCycle=true`, esperado, não erro) e **não conta para a fidelidade** nem como cobrança paga. A pausa `Offer` (retenção, CS) não consome crédito e **não tem rota pública**: a rota do app cria sempre `pauseType='User'`.
- **Desfazer a pausa** (`canResume`): só com status paused e **até D-5 00:00** da cobrança do ciclo pausado (`nextBillingAt`; fallback `pause.resumeAt`) → `RESUME_WINDOW_CLOSED` com `until`. Desfazer devolve os créditos dos ciclos ainda não pausados.
- **Cancelar** (`canCancel`): negado se canceled/fraud_review/`cancellationBlocked` (`CANCELLATION_BLOCKED`); **fidelidade em vigor** (`remainingCommitmentMonths>0`) → `COMMITMENT_ACTIVE` (`until` e `commitmentEndsAt` = estimativa nextBillingAt + meses restantes); **fidelidade cumprida** (`=0`) → permitido do último pagamento até o dia anterior à cobrança; a partir de 00:00 do dia da cobrança → `CANCEL_WINDOW_CLOSED` (sem cancelar, renova). Mensal (`-1`) sempre pode. Taxa de cancelamento antecipado **não** é calculada pelo BFF (§6.4).
- **Troca de plano** (`POST /me/subscription/scheduling` com outra `frequency`, caso B §4.3): nasce uma assinatura `future` com **id novo** e a atual é cancelada ("Upgrade de Plano"). `GET /me/subscription` devolve sempre a assinatura corrente do cliente; o app nunca guarda o id. `DELETE /me/subscription/scheduling` reativa a original. Mesma fidelidade (caso A) mantém o id.
- **Status desconhecido** vindo da Prime API (string livre): normalizado para `active` + `rawStatus`, nunca erro.
- Fatura pendente → `hasPendingBill`; bloqueia edição (`PENDING_BILL`) até pagar.
- 60 dias: pelo menos um item com `recurrence null`.
- Preço: desconto temporário vence o permanente; desconto por faixa de itens (`discountTiers`) do catálogo; arredondar para cima ao centavo. **O valor exibido é o que a API devolve**; nenhum preço/produto/plano fixo em adaptador real.
- Ciclo de cobrança é de **30 dias**, não um dia fixo do mês: o app mostra `nextBillingAt`; datas seguintes são "previsão".

## Contas fake (adaptador em memória)
Senha de todas: `prime123`.
| E-mail | Cenário |
|---|---|
| ativa@teste.com | Anual, ativa, 2 créditos de pausa, próxima cobrança em 12 dias, último pedido em trânsito |
| janela@teste.com | Semestral, ativa, próxima cobrança amanhã (janela D-3 fechada: `EDIT_WINDOW_CLOSED` e `PAUSE_WINDOW_CLOSED`) |
| pausada@teste.com | Anual, pausada por 2 ciclos: 1º já faturado em R$ 0,00 (`pausedCycle`), falta 1; 0 créditos |
| pendente@teste.com | Trimestral, ativa com fatura pendente e PIX disponível |
| agendada@teste.com | Anual, ativa com mudança agendada |
| cancelada@teste.com | cancelada há 20 dias (pode reativar) |
| analise@teste.com | fraud_review |
| mensal@teste.com | Mensal, ativa, sem créditos de pausa |
| semassinatura@teste.com | cliente Shopify sem assinatura |
| novata@teste.com | Anual com 1 cobrança paga: ainda não pode pausar (`MIN_PAID_CYCLES`), cancelamento travado (`COMMITMENT_ACTIVE`) |
| fim-fidelidade@teste.com | Anual com fidelidade cumprida (`remainingCommitmentMonths=0`), cobrança em 9 dias: pode cancelar |
