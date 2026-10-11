import { Injectable } from '@nestjs/common';
import { AddressQuote } from '../../contracts/api';
import { brl } from '../../core/money';
import { AppError } from '../../common/errors';
import { ShippingQuoter } from '../../ports';

/** Cotação de frete fake: cidade/UF derivadas da faixa do CEP; 2–3 opções por região. */
@Injectable()
export class FakeShippingQuoter implements ShippingQuoter {
  async quote(postalCode: string): Promise<AddressQuote> {
    const digits = postalCode.replace(/\D/g, '');
    if (digits.length !== 8) throw AppError.badRequest('INVALID_POSTAL_CODE', 'CEP inválido.');
    const prefix = Number(digits.slice(0, 2));
    const region =
      REGIONS.find((r) => prefix >= r.from && prefix <= r.to) ?? REGIONS[REGIONS.length - 1];
    const formatted = `${digits.slice(0, 5)}-${digits.slice(5)}`;
    const options: AddressQuote['options'] = [
      {
        id: `q-${digits}-loggi`,
        method: 'Loggi Standard',
        carrier: 'Loggi',
        estimateDays: region.days,
        price: brl(0),
      },
      {
        id: `q-${digits}-pac`,
        method: 'Correios PAC',
        carrier: 'Correios',
        estimateDays: region.days + 3,
        price: brl(0),
      },
    ];
    if (region.express) {
      options.unshift({
        id: `q-${digits}-expresso`,
        method: 'Frota Interna Expresso',
        carrier: 'Caffeine Army',
        estimateDays: 1,
        price: brl(0),
      });
    }
    return {
      postalCode: formatted,
      city: region.city,
      state: region.state,
      ...(region.street ? { street: region.street, neighborhood: region.neighborhood } : {}),
      options,
    };
  }
}

const REGIONS = [
  {
    from: 1,
    to: 5,
    city: 'São Paulo',
    state: 'SP',
    days: 2,
    express: true,
    street: 'Avenida Paulista',
    neighborhood: 'Bela Vista',
  },
  { from: 6, to: 19, city: 'Campinas', state: 'SP', days: 3, express: false },
  { from: 20, to: 28, city: 'Rio de Janeiro', state: 'RJ', days: 4, express: false },
  { from: 29, to: 29, city: 'Vitória', state: 'ES', days: 5, express: false },
  { from: 30, to: 39, city: 'Belo Horizonte', state: 'MG', days: 4, express: false },
  { from: 40, to: 48, city: 'Salvador', state: 'BA', days: 7, express: false },
  { from: 60, to: 63, city: 'Fortaleza', state: 'CE', days: 8, express: false },
  { from: 70, to: 72, city: 'Brasília', state: 'DF', days: 5, express: false },
  { from: 74, to: 76, city: 'Goiânia', state: 'GO', days: 6, express: false },
  { from: 80, to: 87, city: 'Curitiba', state: 'PR', days: 4, express: false },
  { from: 88, to: 89, city: 'Florianópolis', state: 'SC', days: 5, express: false },
  { from: 90, to: 99, city: 'Porto Alegre', state: 'RS', days: 6, express: false },
  { from: 0, to: 99, city: 'Manaus', state: 'AM', days: 12, express: false },
];
