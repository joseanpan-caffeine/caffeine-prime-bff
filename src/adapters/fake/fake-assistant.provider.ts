import { Injectable } from '@nestjs/common';
import { AssistantProvider, AssistantReply, AssistantReplyInput } from '../../ports';

/**
 * Assistente fake: respostas determinísticas por palavra-chave, para desenvolvimento e testes.
 * Usa o contexto injetado (caixa, próxima cobrança) para parecer "de verdade".
 */
@Injectable()
export class FakeAssistantProvider implements AssistantProvider {
  async reply(input: AssistantReplyInput): Promise<AssistantReply> {
    const text = input.message.toLowerCase();
    const ctx = input.customerContext;
    const box = ctx.boxItems.map((i) => `${i.quantity}x ${i.title}`).join(', ') || 'sem itens';
    const nextBilling = ctx.nextBillingAt
      ? new Date(ctx.nextBillingAt).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
      : undefined;

    if (/\bpaus/.test(text)) {
      const can = ctx.capabilities?.canPause;
      return {
        content:
          can === false
            ? 'A pausa fica disponível a partir da 4ª cobrança paga, só em planos Semestral e Anual, com crédito disponível e pedido até 3 dias antes da cobrança. Pelo que vejo na sua conta, agora ela não está liberada — o app mostra o motivo e a data em que reabre.'
            : 'Você pode pausar a assinatura direto no app: cada ciclo pausado pula uma cobrança (a fatura sai em R$ 0,00) e consome 1 crédito de pausa. O pedido precisa ser feito até 3 dias antes da cobrança.',
        actions: [{ label: 'Pausar assinatura', deepLink: 'app://subscription/pause' }],
      };
    }
    if (/cancel/.test(text)) {
      return {
        content:
          'Dá para cancelar pelo app, respeitando a fidelidade do plano: enquanto houver meses de fidelidade restantes o cancelamento fica travado; depois disso, até a véspera da próxima cobrança. Se o problema for sabor, quantidade ou ritmo de entrega, uma pausa ou edição da caixa costuma resolver sem perder os benefícios.',
        actions: [
          { label: 'Ver assinatura', deepLink: 'app://subscription' },
          { label: 'Falar com atendimento', deepLink: 'app://support' },
        ],
      };
    }
    if (/sabor|trocar|editar|caixa/.test(text)) {
      return {
        content: `Sua caixa hoje: ${box}. Você pode trocar sabores e quantidades até 3 dias antes da cobrança${nextBilling ? ` (a próxima é em ${nextBilling})` : ''}; depois disso a edição fecha e vale para a caixa seguinte.`,
        actions: [{ label: 'Editar caixa', deepLink: 'app://box/edit' }],
      };
    }
    if (/ponto|caffeine x|resgat/.test(text)) {
      return {
        content:
          'Seus pontos Caffeine X são acumulados a cada compra paga e aparecem na carteira do app. O resgate é feito na loja; o saldo e a validade estão em "Pontos".',
        actions: [{ label: 'Ver pontos', deepLink: 'app://wallet' }],
      };
    }
    if (/entreg|rastre|chega|pedido/.test(text)) {
      return {
        content: `A próxima caixa é faturada${nextBilling ? ` em ${nextBilling}` : ' na data da próxima cobrança'} e sai para entrega logo após a confirmação do pagamento. O rastreio fica em "Entrega" no app, atualizado a cada etapa.`,
        actions: [{ label: 'Acompanhar entrega', deepLink: 'app://tracking' }],
      };
    }
    if (/cafe[ií]na|dormir|sono|ansios/.test(text)) {
      return {
        content:
          'O Supercoffee tem cafeína, então a dica geral é concentrar o consumo na primeira metade do dia e evitar depois das 16h se o sono for sensível. Siga sempre a dose do rótulo (1 dose por vez). Se você tem alguma condição de saúde, está grávida ou toma medicação, converse com um médico ou nutricionista antes de usar.',
        actions: [{ label: 'Ajustar rotina', deepLink: 'app://routine' }],
      };
    }
    if (/rotina|treino|hor[aá]rio/.test(text)) {
      const streak = ctx.routine?.currentStreakDays ?? 0;
      return {
        content: `Para a sua caixa (${box}), uma rotina simples: Supercoffee de manhã, Morning Shot ~20 min antes do treino e Whey no pós-treino ou à noite, sempre na porção do rótulo.${streak > 0 ? ` Você está há ${streak} dia(s) seguidos no plano — continue!` : ' Ative os lembretes no app para não esquecer.'}`,
        actions: [{ label: 'Ver rotina', deepLink: 'app://routine' }],
      };
    }
    return {
      content:
        'Posso ajudar com a sua rotina de consumo, com dúvidas sobre os produtos da caixa e com o funcionamento da assinatura (cobrança, pausa, edição da caixa, entrega e pontos). O que você quer saber?',
      actions: [{ label: 'Ver minha caixa', deepLink: 'app://box' }],
    };
  }
}
