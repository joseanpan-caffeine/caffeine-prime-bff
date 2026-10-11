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
| POST | /me/subscription/scheduling | SchedulingRequest | ScheduledChange (403 EDIT_WINDOW_CLOSED) |
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

## Regras (calculadas no servidor; ver docs/04 §6)
- Edição bloqueada entre D-2 00:00 (America/Sao_Paulo) e nextBillingAt → `canEdit.allowed=false, reason EDIT_WINDOW_CLOSED, until=nextBillingAt`.
- Pausa: status active, frequência Semestral|Anual, pauseCreditsLeft>0; créditos Anual=2, Semestral=1, Trimestral/Mensal=0; maxCycles=2.
- Cancelar: não permitido se status canceled, fraud_review ou cancellationBlocked. remainingCommitmentMonths informado.
- Fatura pendente → hasPendingBill; bloqueia edição (PENDING_BILL) até pagar.
- 60 dias: pelo menos um item com recurrence null.
- Preço: desconto temporário vence o permanente; desconto por faixa de itens (discountTiers) do catálogo; arredondar para cima ao centavo.

## Contas fake (adaptador em memória)
Senha de todas: `prime123`.
| E-mail | Cenário |
|---|---|
| ativa@teste.com | Anual, ativa, 2 créditos de pausa, próxima cobrança em 12 dias, último pedido em trânsito |
| janela@teste.com | Semestral, ativa, próxima cobrança amanhã (janela D-2 fechada) |
| pausada@teste.com | Anual, pausada, retoma em 2 ciclos |
| pendente@teste.com | Trimestral, ativa com fatura pendente e PIX disponível |
| agendada@teste.com | Anual, ativa com mudança agendada |
| cancelada@teste.com | cancelada há 20 dias (pode reativar) |
| analise@teste.com | fraud_review |
| mensal@teste.com | Mensal, ativa, sem créditos de pausa |
| semassinatura@teste.com | cliente Shopify sem assinatura |
