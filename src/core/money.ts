import { Money } from '../contracts/api';

/** Arredonda para cima ao centavo (regra da Prime API: roundUpToCents). */
export function roundUpToCents(value: number): number {
  // Usa uma pequena tolerância para evitar que 144.9 * 100 = 14489.999... suba um centavo a mais.
  const cents = Math.ceil(Math.round(value * 100 * 1e6) / 1e6);
  return cents / 100;
}

/** Arredonda ao centavo mais próximo (para somas que já foram arredondadas item a item). */
export function roundToCents(value: number): number {
  return Math.round(value * 100) / 100;
}

export function brl(amount: number): Money {
  return { amount: roundToCents(amount), currency: 'BRL' };
}
