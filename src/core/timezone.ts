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

/** Confere se o fuso IANA é reconhecido pelo runtime (ex.: `America/Sao_Paulo`). */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/** Dia civil (YYYY-MM-DD) do instante no fuso dado. */
export function localDateKey(date: Date, timeZone = SAO_PAULO_TZ): string {
  const p = partsIn(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** Hora local "HH:mm" do instante no fuso dado (ciclo de 24h). */
export function localTimeHHmm(date: Date, timeZone = SAO_PAULO_TZ): string {
  const p = partsIn(date, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

/** Soma dias a uma data civil YYYY-MM-DD (aritmética de calendário, sem fuso). */
export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${next.getUTCFullYear()}-${pad(next.getUTCMonth() + 1)}-${pad(next.getUTCDate())}`;
}

/** Dia da semana (0 = domingo … 6 = sábado) de uma data civil YYYY-MM-DD. */
export function weekdayOfDateKey(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Instante (UTC) de 00:00 do dia civil de `date` em um fuso IANA qualquer. */
export function startOfDayIn(date: Date, timeZone: string): Date {
  const p = partsIn(date, timeZone);
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0));
  const offset = offsetMinutes(guess, timeZone);
  return new Date(guess.getTime() - offset * 60000);
}
