import {
  Catalog,
  CatalogProduct,
  Discount,
  Frequency,
  PreviewRequest,
  PricePreview,
} from '../contracts/api';
import { brl, roundToCents, roundUpToCents } from './money';

/** Cupom resolvido pelo adaptador (metaobject/Prime API). */
export interface Coupon {
  code: string;
  percentage: number;
  /** Quando presente, é um desconto temporário por N ciclos. */
  temporaryCycles?: number;
}

export interface PricingInput {
  request: PreviewRequest;
  catalog: Catalog;
  /** Desconto atual da assinatura (permanente + temporário), se houver. */
  currentDiscount?: Discount;
  /** Cupom informado na requisição, já validado; `null` quando o código não existe. */
  coupon?: Coupon | null;
}

/**
 * Cálculo local do preço da caixa (preview). Replica a regra do melhor desconto:
 * 1. Desconto base = desconto do plano (catálogo) ou desconto permanente da assinatura;
 * 2. Desconto temporário (cupom com ciclos) vence o permanente enquanto houver ciclos;
 * 3. Faixa por quantidade de itens (`discountTiers`) concorre com o base: vence o maior;
 * 4. Valor unitário final arredondado para cima ao centavo (roundUpToCents).
 * O preview é informativo; o valor final vem da Prime API na resposta do agendamento.
 */
export class PricingService {
  preview(input: PricingInput): PricePreview {
    const { request, catalog } = input;
    const warnings: string[] = [];

    const planDiscount = this.planDiscount(catalog, request.frequency);
    const permanent = input.currentDiscount?.percentage ?? planDiscount;

    let base = Math.max(permanent, planDiscount);
    let couponApplied: string | undefined;

    // Desconto temporário da assinatura (ainda com ciclos) vence o permanente.
    const temp = input.currentDiscount;
    if (temp?.temporaryPercentage && (temp.temporaryCycles ?? 0) > 0) {
      base = temp.temporaryPercentage;
      couponApplied = temp.temporaryCode;
    }

    if (request.couponCode) {
      if (input.coupon) {
        // Cupom novo: temporário vence o permanente; permanente só entra se for melhor.
        if (input.coupon.temporaryCycles && input.coupon.temporaryCycles > 0) {
          base = input.coupon.percentage;
        } else {
          base = Math.max(base, input.coupon.percentage);
        }
        couponApplied = input.coupon.code;
      } else {
        warnings.push(`Cupom "${request.couponCode}" inválido ou expirado; desconto não aplicado.`);
      }
    }

    const totalItems = request.items.reduce((sum, i) => sum + Math.max(0, i.quantity), 0);
    const tier = this.tierDiscount(catalog, totalItems);
    const applied = Math.max(base, tier);

    const items: PricePreview['items'] = [];
    let subtotal = 0;
    let total = 0;

    for (const line of request.items) {
      const product = this.findProduct(catalog, line.handle);
      if (!product) {
        warnings.push(`Produto "${line.handle}" não encontrado no catálogo; ignorado.`);
        continue;
      }
      if (!product.inStock) warnings.push(`Produto "${product.title}" sem estoque no momento.`);
      if (line.quantity < product.minQuantity || line.quantity > product.maxQuantity) {
        warnings.push(
          `Quantidade de "${product.title}" fora do permitido (${product.minQuantity}–${product.maxQuantity}).`,
        );
      }
      // Itens "off" no ciclo corrente não entram no subtotal nem na cobrança (§4.6).
      const countsThisCycle = line.recurrence !== 'off';
      const unitPrice = product.price.amount;
      const finalUnit = roundUpToCents(unitPrice * (1 - applied / 100));
      items.push({
        handle: line.handle,
        quantity: line.quantity,
        recurrence: line.recurrence ?? null,
        title: product.title,
        unitPrice: brl(unitPrice),
        discountPercentage: applied,
        finalUnitPrice: brl(finalUnit),
      });
      if (countsThisCycle) {
        subtotal += unitPrice * line.quantity;
        total += finalUnit * line.quantity;
      }
    }

    subtotal = roundToCents(subtotal);
    total = roundToCents(total);

    return {
      frequency: request.frequency,
      items,
      subtotal: brl(subtotal),
      totalDiscount: brl(subtotal - total),
      total: brl(total),
      appliedDiscountPercentage: applied,
      ...(couponApplied ? { couponApplied } : {}),
      warnings,
    };
  }

  planDiscount(catalog: Catalog, frequency: Frequency): number {
    return catalog.plans.find((p) => p.frequency === frequency)?.discountPercentage ?? 0;
  }

  /** Maior faixa cujo `minItems` é atendido pela quantidade total de itens. */
  tierDiscount(catalog: Catalog, totalItems: number): number {
    return catalog.discountTiers
      .filter((t) => totalItems >= t.minItems)
      .reduce((best, t) => Math.max(best, t.discountPercentage), 0);
  }

  private findProduct(catalog: Catalog, handle: string): CatalogProduct | undefined {
    const direct = catalog.products.find((p) => p.handle === handle);
    if (direct) return direct;
    // Handle de sabor (ex.: supercoffee-chocolate) resolve para o produto pai.
    return catalog.products.find((p) => p.flavors?.some((f) => f.handle === handle));
  }
}
