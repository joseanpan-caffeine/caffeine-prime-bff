/**
 * Utilitários de fuso horário sem dependências externas.
 * Regra do projeto: calcular em America/Sao_Paulo, armazenar/comparar em UTC.
 */

export const SAO_PAULO_TZ = 'America/Sao_Paulo';

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function partsIn(date: Date, timeZone: string): Parts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  return {
    year: map.year,
    month: map.month,
    day: map.day,
    hour: map.hour,
    minute: map.minute,
    second: map.second,
  };
}

/** Diferença (em minutos) entre o horário local do fuso e o UTC para o instante dado. */
export function offsetMinutes(date: Date, timeZone = SAO_PAULO_TZ): number {
  const p = partsIn(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Instante (UTC) que corresponde a 00:00 do dia civil de `date` em São Paulo. */
export function startOfDayInSaoPaulo(date: Date): Date {
  const p = partsIn(date, SAO_PAULO_TZ);
  // Primeiro chute: meia-noite local tratada como se fosse UTC, depois corrige pelo offset.
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
  const offset = offsetMinutes(guess, SAO_PAULO_TZ);
  return new Date(guess.getTime() - offset * 60000);
}

/** Soma dias a um instante. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

/** Soma meses mantendo o dia quando possível (usado para datas de retomada de pausa). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/** Formata um instante como ISO com o offset de São Paulo (ex.: 2026-10-13T00:00:00-03:00). */
export function toSaoPauloIso(date: Date): string {
  const offset = offsetMinutes(date, SAO_PAULO_TZ);
  const local = new Date(date.getTime() + offset * 60000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const sign = offset <= 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
