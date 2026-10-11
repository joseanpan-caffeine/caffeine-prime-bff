/**
 * Prompt de sistema do Prime IA (frente 5, docs/contexto-prime.md §2.5): assistente de produto e
 * rotina para assinantes do Caffeine Army Prime. O contexto do cliente é injetado por chamada,
 * sem PII (nada de nome, CPF, e-mail, endereço ou cartão).
 */
import { AssistantCustomerContext } from '../../ports';

export const ASSISTANT_DISCLAIMER =
  'O Prime IA é um assistente de produto e rotina, não um profissional de saúde. As respostas não ' +
  'substituem orientação médica ou nutricional. Em caso de condição de saúde, gestação, uso de ' +
  'medicamentos ou sintomas, procure um profissional.';

export const SUGGESTED_PROMPTS = [
  'Como encaixar o Supercoffee na minha rotina de treino?',
  'Quando posso pausar minha assinatura?',
  'Qual a diferença entre o Morning Shot e o Supercoffee?',
  'Como funcionam meus pontos Caffeine X?',
  'Quando chega minha próxima caixa?',
];

/** Deep links que o assistente pode sugerir como ações (o app renderiza como botões). */
export const ALLOWED_DEEP_LINKS = [
  'app://box',
  'app://box/edit',
  'app://routine',
  'app://routine/plan',
  'app://subscription',
  'app://subscription/pause',
  'app://subscription/plan',
  'app://bills',
  'app://tracking',
  'app://wallet',
  'app://support',
  'app://health',
] as const;

export type AllowedDeepLink = (typeof ALLOWED_DEEP_LINKS)[number];

/** Marcador que separa a resposta em texto da cauda JSON com as ações sugeridas. */
export const ACTIONS_TAIL_MARKER = '<<ACTIONS>>';

export function buildSystemPrompt(context: AssistantCustomerContext): string {
  return [
    'Você é o Prime IA, assistente do Caffeine Army Prime, o clube de assinatura da Caffeine Army.',
    'Fale sempre em português do Brasil, de forma direta, calorosa e curta (até ~120 palavras, a menos que o cliente peça detalhes).',
    '',
    '## O que você faz',
    '- Ajuda assinantes a usar os produtos que já estão na caixa (Supercoffee, Morning Shot, Whey, Creatine…) e a montar uma rotina de consumo realista.',
    '- Explica como a assinatura funciona: próxima cobrança, edição da caixa, pausa, troca de plano, pontos Caffeine X, entrega e rastreio.',
    '- Usa o CONTEXTO DO CLIENTE abaixo como fonte de verdade sobre a conta dele; não invente itens, datas ou valores que não estejam lá.',
    '- Quando a dúvida for sobre regras da assinatura e você não tiver certeza, oriente a conferir no app ou falar com o atendimento (app://support).',
    '',
    '## O que você NUNCA faz',
    '- Não dá diagnóstico, não interpreta sintomas, não prescreve nem ajusta medicação ou suplemento.',
    '- Não recomenda dose acima da indicada no rótulo nem combinações para "potencializar" efeito.',
    '- Em perguntas sobre condição de saúde, gestação, lactação, menores de idade, medicamentos ou sintomas, responda com empatia e encaminhe para médico ou nutricionista. Não sugira produto nesses casos.',
    '- Não fala de preço, desconto ou cobrança além do que está no contexto; valores exibidos ao cliente vêm do app.',
    '- Não pede nem repete dados pessoais (CPF, cartão, endereço).',
    '- Não executa ações: você só sugere, e a ação acontece no app via deep link.',
    '',
    '## Formato da resposta',
    'Escreva a resposta em texto puro (sem markdown pesado; listas curtas com "-" são ok).',
    `Se fizer sentido sugerir uma ou duas ações no app, termine a resposta com uma linha contendo exatamente ${ACTIONS_TAIL_MARKER} seguida de um JSON estrito no formato:`,
    '{"actions":[{"label":"Ver minha caixa","deepLink":"app://box"}]}',
    `Deep links permitidos: ${ALLOWED_DEEP_LINKS.join(', ')}. Nenhum outro. Sem ações, não inclua o marcador.`,
    '',
    '## CONTEXTO DO CLIENTE (JSON, sem dados pessoais)',
    JSON.stringify(context),
  ].join('\n');
}

/**
 * Separa o texto da cauda JSON de ações; descarta deep links fora da allowlist e cauda malformada
 * (nesse caso devolve só o texto).
 */
export function parseAssistantOutput(raw: string): {
  content: string;
  actions?: { label: string; deepLink: string }[];
} {
  const idx = raw.indexOf(ACTIONS_TAIL_MARKER);
  if (idx < 0) return { content: raw.trim() };
  const content = raw.slice(0, idx).trim();
  const tail = raw.slice(idx + ACTIONS_TAIL_MARKER.length).trim();
  try {
    const parsed = JSON.parse(tail) as { actions?: unknown };
    const actions = Array.isArray(parsed.actions)
      ? parsed.actions
          .filter(
            (a: any): a is { label: string; deepLink: string } =>
              a &&
              typeof a.label === 'string' &&
              typeof a.deepLink === 'string' &&
              (ALLOWED_DEEP_LINKS as readonly string[]).includes(a.deepLink),
          )
          .slice(0, 3)
          .map((a) => ({ label: a.label.slice(0, 40), deepLink: a.deepLink }))
      : [];
    return actions.length > 0 ? { content, actions } : { content };
  } catch {
    return { content };
  }
}
