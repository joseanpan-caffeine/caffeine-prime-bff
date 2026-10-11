# Breaking change — webhooks Estoca (payload cru)

> Fonte: arquivo BREAKING-MICROSERVICE.md enviado em 10/10/2026 (caffeine-prime-api).


## O que muda

Os endpoints deixam de aceitar o envelope do microserviço e passam a receber **somente o JSON cru da Estoca** no body.

| Rota | Antes | Depois |
|------|-------|--------|
| `POST /webhooks/estoca/tracking` | `{ source, eventId, receivedAt, payload }` | body = payload v2 |
| `POST /webhooks/estoca/tracking/v1` | `{ source, eventId, receivedAt, payload }` | body = payload v1 |

Auth Bearer (`FREIGHT_SERVICE_ACCESS_TOKEN`) **não muda**.

## Ação no microserviço

1. Remover o wrapping `{ source, eventId, receivedAt, payload }`.
2. Encaminhar o body recebido da Estoca diretamente para a Prime API.
3. Coordenar deploy MS + Prime API (sem período de dual-support).

## Exemplos

**v1** — body:

```json
{
  "eventType": "tracking",
  "data": {
    "trackings": [
      {
        "estocaStatus": "Em trânsito",
        "trackingCode": "48B155B3292C",
        "marketplaceOrderId": "12345678",
        "lastStatusDate": "2026-04-23T03:14:47Z",
        "carrier": "loggi"
      }
    ]
  }
}
```

**v2** — body:

```json
{
  "url": "https://tracking.estoca.com.br/abc",
  "macro_status": "Em trânsito",
  "status": "Chegada na Filial",
  "order": { "external_id": "12345678" }
}
```
