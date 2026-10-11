import { FAKE_CATALOG } from '../adapters/fake/fake-state';
import { brl, roundUpToCents } from './money';
import { PricingService } from './pricing.service';

describe('PricingService', () => {
  const service = new PricingService();
  const catalog = FAKE_CATALOG;

  it('aplica o desconto do plano e arredonda para cima ao centavo', () => {
    const preview = service.preview({
      request: {
        frequency: 'Anual',
        items: [{ handle: 'supercoffee-3-0-original-380g', quantity: 1 }],
      },
      catalog,
    });
    // 144,90 × 0,75 = 108,675 → 108,68
    expect(preview.appliedDiscountPercentage).toBe(25);
    expect(preview.items[0].finalUnitPrice).toEqual(brl(108.68));
    expect(preview.items[0].title).toBe('Supercoffee 3.0 380g');
    expect(preview.subtotal).toEqual(brl(144.9));
    expect(preview.total).toEqual(brl(108.68));
    expect(preview.totalDiscount).toEqual(brl(36.22));
    expect(preview.warnings).toEqual([]);
  });

  it('faixa por quantidade vence o plano quando é maior', () => {
    const preview = service.preview({
      request: { frequency: 'Mensal', items: [{ handle: 'supercoffee-3-0-380g', quantity: 3 }] },
      catalog,
    });
    expect(preview.appliedDiscountPercentage).toBe(27); // 3+ itens
    expect(preview.total).toEqual(brl(roundUpToCents(144.9 * 0.73) * 3));
  });

  it('plano maior que a faixa mantém o plano', () => {
    const preview = service.preview({
      request: { frequency: 'Anual', items: [{ handle: 'morning-shot', quantity: 2 }] },
      catalog,
    });
    expect(preview.appliedDiscountPercentage).toBe(25);
  });

  it('desconto temporário da assinatura vence o permanente mesmo sendo menor', () => {
    const preview = service.preview({
      request: { frequency: 'Anual', items: [{ handle: 'morning-shot', quantity: 1 }] },
      catalog,
      currentDiscount: {
        code: 'PRIME-ANUAL',
        percentage: 25,
        temporaryCode: 'PRIME10',
        temporaryPercentage: 10,
        temporaryCycles: 2,
      },
    });
    expect(preview.appliedDiscountPercentage).toBe(10);
    expect(preview.couponApplied).toBe('PRIME10');
  });

  it('desconto temporário esgotado (0 ciclos) volta ao permanente', () => {
    const preview = service.preview({
      request: { frequency: 'Anual', items: [{ handle: 'morning-shot', quantity: 1 }] },
      catalog,
      currentDiscount: { percentage: 25, temporaryPercentage: 10, temporaryCycles: 0 },
    });
    expect(preview.appliedDiscountPercentage).toBe(25);
  });

  it('cupom temporário informado na requisição substitui o base', () => {
    const preview = service.preview({
      request: {
        frequency: 'Anual',
        items: [{ handle: 'morning-shot', quantity: 1 }],
        couponCode: 'BEMVINDO30',
      },
      catalog,
      coupon: { code: 'BEMVINDO30', percentage: 30, temporaryCycles: 1 },
    });
    expect(preview.appliedDiscountPercentage).toBe(30);
    expect(preview.couponApplied).toBe('BEMVINDO30');
  });

  it('cupom permanente só entra se for melhor', () => {
    const preview = service.preview({
      request: {
        frequency: 'Anual',
        items: [{ handle: 'morning-shot', quantity: 1 }],
        couponCode: 'ANUAL20',
      },
      catalog,
      coupon: { code: 'ANUAL20', percentage: 20 },
    });
    expect(preview.appliedDiscountPercentage).toBe(25);
  });

  it('cupom inválido gera warning e não aplica', () => {
    const preview = service.preview({
      request: {
        frequency: 'Anual',
        items: [{ handle: 'morning-shot', quantity: 1 }],
        couponCode: 'NADA',
      },
      catalog,
      coupon: null,
    });
    expect(preview.couponApplied).toBeUndefined();
    expect(preview.warnings[0]).toMatch(/inválido/);
  });

  it('itens "off" não entram no total do ciclo; produto desconhecido gera warning', () => {
    const preview = service.preview({
      request: {
        frequency: 'Anual',
        items: [
          { handle: 'morning-shot', quantity: 1 },
          { handle: 'creatine-300g', quantity: 1, recurrence: 'off' },
          { handle: 'nao-existe', quantity: 1 },
        ],
      },
      catalog,
    });
    expect(preview.items).toHaveLength(2);
    expect(preview.subtotal).toEqual(brl(89.9));
    expect(preview.warnings.some((w) => w.includes('nao-existe'))).toBe(true);
  });

  it('quantidade fora dos limites gera warning', () => {
    const preview = service.preview({
      request: { frequency: 'Anual', items: [{ handle: 'whey-isolado-900g', quantity: 10 }] },
      catalog,
    });
    expect(preview.warnings.some((w) => w.includes('Quantidade'))).toBe(true);
  });

  it('roundUpToCents não sobe centavo por erro de ponto flutuante', () => {
    expect(roundUpToCents(144.9)).toBe(144.9);
    expect(roundUpToCents(108.675)).toBe(108.68);
    expect(roundUpToCents(100.001)).toBe(100.01);
  });
});
