/**
 * Motor de regras das sugestões de saúde (frente 2). Puro e determinístico: recebe os agregados
 * do dia, a caixa do cliente e a hora local e devolve dicas de USO DOS PRODUTOS. Nunca orientação
 * médica, diagnóstico ou dose acima do rótulo — só "quando encaixar" o que já está na caixa.
 */
import { HealthDailySample, HealthSummary } from '../contracts/api';

export type HealthSuggestion = HealthSummary['suggestions'][number];

export interface HealthSuggestionInput {
  /** Agregados de hoje (fuso do cliente). */
  today: HealthDailySample[];
  /** Agregados de ontem (para sono, que fecha de manhã). */
  yesterday?: HealthDailySample[];
  /** Handles dos produtos da caixa (produto ou sabor). */
  boxHandles: string[];
  /** Hora local (0–23) no fuso do cliente. */
  localHour: number;
  /** Itens da rotina já concluídos hoje (handles). */
  doneToday?: string[];
}

export const LOW_STEPS_THRESHOLD = 3000;
export const AFTERNOON_HOUR = 14;
export const SHORT_SLEEP_MINUTES = 6 * 60;
export const LOW_WATER_ML = 1000;
export const EVENING_CAFFEINE_CUTOFF_HOUR = 16;

const metric = (samples: HealthDailySample[] | undefined, m: HealthDailySample['metric']) =>
  samples?.find((s) => s.metric === m)?.value;

const has = (handles: string[], fragment: string) =>
  handles.some((h) => h.toLowerCase().includes(fragment));

export function buildHealthSuggestions(input: HealthSuggestionInput): HealthSuggestion[] {
  const out: HealthSuggestion[] = [];
  const { boxHandles, localHour } = input;
  const done = new Set((input.doneToday ?? []).map((h) => h.toLowerCase()));
  const workouts = metric(input.today, 'workouts') ?? 0;
  const activeMinutes = metric(input.today, 'active_minutes') ?? 0;
  const steps = metric(input.today, 'steps');
  const sleep = metric(input.today, 'sleep_minutes') ?? metric(input.yesterday, 'sleep_minutes');
  const water = metric(input.today, 'water_ml');

  const hasShot = has(boxHandles, 'morning-shot');
  const hasWhey = has(boxHandles, 'whey');
  const hasCoffee = has(boxHandles, 'supercoffee');
  const hasCreatine = has(boxHandles, 'creatin');

  // Treino registrado hoje → Morning Shot antes do treino / whey depois.
  if ((workouts > 0 || activeMinutes >= 30) && hasShot && !has([...done], 'morning-shot')) {
    out.push({
      id: 'workout-morning-shot',
      title: 'Morning Shot antes do treino',
      body: 'Você treinou hoje. Na próxima sessão, experimente o Morning Shot uns 20 minutos antes de começar, como indica o rótulo.',
      productHandle: boxHandles.find((h) => h.includes('morning-shot')),
      deepLink: 'app://routine',
    });
  }
  if ((workouts > 0 || activeMinutes >= 30) && hasWhey && !has([...done], 'whey')) {
    out.push({
      id: 'workout-whey',
      title: 'Whey no pós-treino',
      body: 'Dia de treino é um bom momento para encaixar o seu Whey Isolado na rotina, na porção do rótulo.',
      productHandle: boxHandles.find((h) => h.includes('whey')),
      deepLink: 'app://routine',
    });
  }

  // Poucos passos à tarde → convite leve a se mexer (sem cobrança).
  if (steps !== undefined && steps < LOW_STEPS_THRESHOLD && localHour >= AFTERNOON_HOUR) {
    out.push({
      id: 'low-steps',
      title: 'Que tal uma volta?',
      body: 'O dia está mais parado que o normal. Uma caminhada curta já conta — e combina com o seu Supercoffee To Go, se tiver um na bolsa.',
      ...(hasCoffee ? { productHandle: boxHandles.find((h) => h.includes('supercoffee')) } : {}),
      deepLink: 'app://routine',
    });
  }

  // Sono curto → dica de corte de cafeína à tarde e whey/rotina noturna.
  if (sleep !== undefined && sleep < SHORT_SLEEP_MINUTES) {
    out.push({
      id: 'short-sleep-caffeine-cutoff',
      title: 'Noite curta? Cafeína só até o meio da tarde',
      body: `Você dormiu menos de 6h. Para não atrapalhar a próxima noite, concentre o Supercoffee de manhã e evite cafeína depois das ${EVENING_CAFFEINE_CUTOFF_HOUR}h.`,
      ...(hasCoffee ? { productHandle: boxHandles.find((h) => h.includes('supercoffee')) } : {}),
      deepLink: 'app://routine',
    });
    if (hasWhey) {
      out.push({
        id: 'short-sleep-evening-whey',
        title: 'Rotina noturna mais leve',
        body: 'Uma porção do seu Whey à noite, sem cafeína, é uma opção tranquila para fechar o dia.',
        productHandle: boxHandles.find((h) => h.includes('whey')),
        deepLink: 'app://routine',
      });
    }
  }

  // Pouca água → lembrete geral (creatina pede boa hidratação pelo rótulo).
  if (water !== undefined && water < LOW_WATER_ML && localHour >= AFTERNOON_HOUR) {
    out.push({
      id: 'low-water',
      title: 'Hidratação do dia',
      body: hasCreatine
        ? 'Pouca água registrada hoje. Quem toma creatina costuma precisar de uma atenção extra à hidratação — vale um copo agora.'
        : 'Pouca água registrada hoje. Vale um copo agora.',
      ...(hasCreatine ? { productHandle: boxHandles.find((h) => h.includes('creatin')) } : {}),
    });
  }

  return out;
}
