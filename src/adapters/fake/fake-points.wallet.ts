import { Injectable } from '@nestjs/common';
import { Dashboard } from '../../contracts/api';
import { PointsWallet } from '../../ports';
import { FakeState } from './fake-state';

/** Carteira Caffeine X fake: pontos proporcionais ao valor pago nas faturas (regra do programa). */
@Injectable()
export class FakePointsWallet implements PointsWallet {
  constructor(private readonly state: FakeState) {}

  async getBalance(customerId: string): Promise<Dashboard['wallet']> {
    const paid = (this.state.bills.get(customerId) ?? []).filter((b) => b.status === 'paid');
    const points = paid.reduce((s, b) => s + Math.ceil(b.amount.amount), 0);
    return {
      points,
      label:
        points === 1 ? '1 ponto Caffeine X' : `${points.toLocaleString('pt-BR')} pontos Caffeine X`,
    };
  }
}
