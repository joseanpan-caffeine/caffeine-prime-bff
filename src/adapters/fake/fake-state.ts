/**
 * Estado em memória compartilhado por todos os adaptadores fake.
 * Semeado com as 9 contas de ROUTES.md e dados realistas relativos a `now`.
 */
import {
  Banner,
  Bill,
  Catalog,
  Frequency,
  PaymentProfile,
  ProductItem,
  ReasonOption,
  ShippingAddress,
  SubscriptionStatus,
} from '../../contracts/api';
import { PAUSE_CREDITS_BY_FREQUENCY, SubscriptionDetail } from '../../core/capabilities.service';
import { brl, roundToCents, roundUpToCents } from '../../core/money';
import { addDays, addMonths } from '../../core/timezone';
import { Coupon } from '../../core/pricing.service';
import { LastCanceled } from '../../ports';

export const FAKE_PASSWORD = 'prime123';

export interface FakeAccount {
  customerId: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  cpf: string; // sem máscara
  phone: string;
  gender?: string;
  birthDate?: string;
}

/** Base pública padrão (mesma do `PUBLIC_BASE_URL` em `config/env.ts`). */
export const DEFAULT_PUBLIC_BASE_URL = 'http://localhost:3333';

/**
 * Monta o catálogo fake apontando as imagens para os arquivos reais servidos pelo
 * próprio BFF em `/static/products` (pasta `public/`). Produtos sem imagem local
 * ficam sem `imageUrl` e o app exibe um placeholder — nunca URLs de CDN inventadas.
 */
export function buildFakeCatalog(publicBaseUrl: string = DEFAULT_PUBLIC_BASE_URL): Catalog {
  const IMG = `${publicBaseUrl.replace(/\/+$/, '')}/static/products`;
  return {
    plans: [
      {
        frequency: 'Mensal',
        name: 'Prime Mensal',
        commitmentMonths: 0,
        discountPercentage: 10,
        pauseCredits: 0,
      },
      {
        frequency: 'Trimestral',
        name: 'Prime Trimestral',
        commitmentMonths: 3,
        discountPercentage: 15,
        pauseCredits: 0,
      },
      {
        frequency: 'Semestral',
        name: 'Prime Semestral',
        commitmentMonths: 6,
        discountPercentage: 20,
        pauseCredits: 1,
      },
      {
        frequency: 'Anual',
        name: 'Prime Anual',
        commitmentMonths: 12,
        discountPercentage: 25,
        pauseCredits: 2,
        highlight: 'Mais vantajoso',
      },
    ],
    products: [
      {
        handle: 'supercoffee-3-0-380g',
        title: 'Supercoffee 3.0 380g',
        category: 'Super Coffee',
        imageUrl: `${IMG}/supercoffee-380g.png`,
        price: brl(144.9),
        flavors: [
          { handle: 'supercoffee-3-0-original-380g', title: 'Original', inStock: true },
          { handle: 'supercoffee-3-0-chocolate-380g', title: 'Chocolate', inStock: true },
          { handle: 'supercoffee-3-0-vanilla-380g', title: 'Vanilla', inStock: true },
          { handle: 'supercoffee-3-0-paçoca-380g', title: 'Paçoca', inStock: false },
        ],
        inStock: true,
        minQuantity: 1,
        maxQuantity: 6,
      },
      {
        handle: 'supercoffee-3-0-economic',
        title: 'Supercoffee 3.0 Economic (2x220g)',
        category: 'Super Coffee',
        imageUrl: `${IMG}/supercoffee-economic.png`,
        price: brl(216.9),
        flavors: [
          { handle: 'supercoffee-3-0-original-economic', title: 'Original', inStock: true },
          { handle: 'supercoffee-3-0-chocolate-economic', title: 'Chocolate', inStock: true },
          { handle: 'supercoffee-3-0-vanilla-economic', title: 'Vanilla', inStock: true },
        ],
        inStock: true,
        minQuantity: 1,
        maxQuantity: 4,
      },
      {
        handle: 'supercoffee-to-go',
        title: 'Supercoffee To Go (10 sachês)',
        category: 'Super Coffee',
        imageUrl: `${IMG}/supercoffee-to-go.png`,
        price: brl(40.65),
        inStock: true,
        minQuantity: 1,
        maxQuantity: 10,
      },
      {
        handle: 'morning-shot',
        title: 'Morning Shot',
        category: 'Suplementos',
        imageUrl: `${IMG}/morning-shot.png`,
        price: brl(89.9),
        inStock: true,
        minQuantity: 1,
        maxQuantity: 4,
      },
      {
        handle: 'creatine-300g',
        title: 'Creatine Caffeine Army 300g',
        category: 'Suplementos',
        price: brl(119.9),
        inStock: true,
        minQuantity: 1,
        maxQuantity: 4,
      },
      {
        handle: 'whey-isolado-900g',
        title: 'Whey Protein Isolado 900g',
        category: 'Suplementos',
        imageUrl: `${IMG}/whey.png`,
        price: brl(189.9),
        flavors: [
          { handle: 'whey-isolado-chocolate-900g', title: 'Chocolate', inStock: true },
          { handle: 'whey-isolado-baunilha-900g', title: 'Baunilha', inStock: true },
        ],
        inStock: true,
        minQuantity: 1,
        maxQuantity: 3,
      },
    ],
    discountTiers: [
      { minItems: 1, discountPercentage: 0, label: '1 item' },
      { minItems: 3, discountPercentage: 27, label: '3+ itens' },
      { minItems: 5, discountPercentage: 30, label: '5+ itens' },
    ],
    gifts: [
      {
        handle: 'copo-termico-prime',
        title: 'Copo Térmico Prime',
        requiresPlan: ['Anual'],
      },
      { handle: 'kit-saches', title: 'Kit de Sachês Supercoffee' },
    ],
  };
}

/** Catálogo fake com a base pública padrão (usado em testes unitários). */
export const FAKE_CATALOG: Catalog = buildFakeCatalog();

/**
 * Imagens por sabor (o contrato `Catalog.products[].flavors` não tem `imageUrl`,
 * então o item da caixa recebe a imagem do sabor por aqui). Sabores sem arquivo
 * próprio herdam a imagem do produto.
 */
export function buildFakeFlavorImages(
  publicBaseUrl: string = DEFAULT_PUBLIC_BASE_URL,
): Record<string, string> {
  const IMG = `${publicBaseUrl.replace(/\/+$/, '')}/static/products`;
  return {
    'supercoffee-3-0-chocolate-380g': `${IMG}/supercoffee-chocolate-380g.png`,
    'supercoffee-3-0-vanilla-380g': `${IMG}/supercoffee-vanilla-380g.png`,
  };
}

export const FAKE_COUPONS: Coupon[] = [
  { code: 'PRIME10', percentage: 10, temporaryCycles: 3 },
  { code: 'BEMVINDO30', percentage: 30, temporaryCycles: 1 },
  { code: 'ANUAL28', percentage: 28 },
];

export const FAKE_CANCEL_REASONS: ReasonOption[] = [
  {
    code: 'price',
    label: 'Está caro para mim',
    followUp: {
      question: 'O que ajudaria?',
      options: ['Desconto', 'Parcelamento', 'Produto menor'],
    },
  },
  {
    code: 'too_much_product',
    label: 'Tenho produto acumulado',
    followUp: { question: 'Prefere pausar?', options: ['Sim, 1 ciclo', 'Sim, 2 ciclos', 'Não'] },
  },
  { code: 'quality', label: 'Não gostei do produto' },
  { code: 'delivery', label: 'Problemas com a entrega' },
  { code: 'other', label: 'Outro motivo' },
];

export const FAKE_PAUSE_REASONS: ReasonOption[] = [
  { code: 'stock', label: 'Ainda tenho produto em casa' },
  { code: 'travel', label: 'Vou viajar' },
  { code: 'budget', label: 'Orçamento apertado este mês' },
  { code: 'other', label: 'Outro motivo' },
];

export const FAKE_BANNERS: Banner[] = [
  {
    id: 'bn-1',
    title: 'Prime Week',
    subtitle: 'Brindes exclusivos para assinantes Anual',
    deepLink: 'caffeineprime://box/gifts',
  },
  {
    id: 'bn-2',
    title: 'Novo sabor: Paçoca',
    subtitle: 'Chegando em breve na sua caixa',
    deepLink: 'caffeineprime://box/edit',
  },
];

interface SeedItem {
  handle: string;
  quantity: number;
  recurrence?: ProductItem['recurrence'];
  cyclesLeft?: number;
}

export interface FakeOrderRef {
  customerId: string;
  billId: string;
}

export class FakeState {
  accounts = new Map<string, FakeAccount>();
  subscriptions = new Map<string, SubscriptionDetail>();
  bills = new Map<string, Bill[]>();
  lastCanceled = new Map<string, LastCanceled>();
  paymentProfiles = new Map<string, PaymentProfile[]>();
  magicLinks = new Map<string, { email: string; expiresAt: Date }>();
  /** external_id (Estoca/Shopify order) e trackingCode → fatura */
  orderRefs = new Map<string, FakeOrderRef>();
  catalog: Catalog;
  /** handle do sabor → imagem (ver `buildFakeFlavorImages`) */
  flavorImages: Record<string, string>;
  coupons: Coupon[] = FAKE_COUPONS;
  private nextCustomerId = 7100;
  private nextBillSeq = 1;

  constructor(
    public readonly seededAt: Date = new Date(),
    publicBaseUrl: string = DEFAULT_PUBLIC_BASE_URL,
  ) {
    this.catalog = buildFakeCatalog(publicBaseUrl);
    this.flavorImages = buildFakeFlavorImages(publicBaseUrl);
    this.seed(seededAt);
  }

  // ---------- helpers de domínio ----------

  findAccountByEmail(email: string): FakeAccount | undefined {
    const e = email.trim().toLowerCase();
    return [...this.accounts.values()].find((a) => a.email === e);
  }

  createAccount(data: Omit<FakeAccount, 'customerId'>): FakeAccount {
    const account: FakeAccount = {
      ...data,
      email: data.email.trim().toLowerCase(),
      customerId: String(this.nextCustomerId++),
    };
    this.accounts.set(account.customerId, account);
    this.paymentProfiles.set(account.customerId, []);
    this.bills.set(account.customerId, []);
    return account;
  }

  findBill(billId: string): { customerId: string; bill: Bill } | null {
    for (const [customerId, bills] of this.bills) {
      const bill = bills.find((b) => b.id === billId);
      if (bill) return { customerId, bill };
    }
    return null;
  }

  newBillId(customerId: string, cycle: number): string {
    return `bill-${customerId}-${cycle}-${this.nextBillSeq++}`;
  }

  /** Monta um ProductItem a partir do catálogo aplicando o percentual de desconto. */
  buildItem(seed: SeedItem, discountPercentage: number, idx: number): ProductItem {
    const product =
      this.catalog.products.find((p) => p.handle === seed.handle) ??
      this.catalog.products.find((p) => p.flavors?.some((f) => f.handle === seed.handle));
    if (!product) throw new Error(`Produto fake não encontrado: ${seed.handle}`);
    const flavor = product.flavors?.find((f) => f.handle === seed.handle);
    const finalUnit = roundUpToCents(product.price.amount * (1 - discountPercentage / 100));
    return {
      id: `item-${idx}-${seed.handle}`,
      handle: seed.handle,
      title: flavor ? `${product.title} ${flavor.title}` : product.title,
      ...(flavor ? { flavor: flavor.title } : {}),
      imageUrl: this.flavorImages[seed.handle] ?? product.imageUrl,
      sku: `SKU-${seed.handle.toUpperCase().slice(0, 18)}`,
      quantity: seed.quantity,
      price: product.price,
      discountPercentage,
      finalPrice: brl(finalUnit),
      recurrence: seed.recurrence ?? null,
      ...(seed.cyclesLeft ? { cyclesLeft: seed.cyclesLeft } : {}),
    };
  }

  /** Recalcula subtotal/desconto/total considerando itens "off" fora do ciclo. */
  recalcTotals(sub: SubscriptionDetail): void {
    let subtotal = 0;
    let total = 0;
    for (const item of sub.items) {
      if (item.recurrence === 'off' || item.isGift) continue;
      subtotal += item.price.amount * item.quantity;
      total += item.finalPrice.amount * item.quantity;
    }
    sub.subtotal = brl(roundToCents(subtotal));
    sub.total = brl(roundToCents(total));
    sub.totalDiscount = brl(roundToCents(subtotal - total));
  }

  /** Reaplica o percentual efetivo (temporário vence o permanente) em todos os itens. */
  reapplyDiscount(sub: SubscriptionDetail): void {
    const pct =
      sub.discount.temporaryPercentage && (sub.discount.temporaryCycles ?? 0) > 0
        ? sub.discount.temporaryPercentage
        : sub.discount.percentage;
    sub.items = sub.items.map((i) => ({
      ...i,
      discountPercentage: pct,
      finalPrice: brl(roundUpToCents(i.price.amount * (1 - pct / 100))),
    }));
    this.recalcTotals(sub);
  }

  // ---------- seed ----------

  private seed(now: Date) {
    const iso = (d: Date) => d.toISOString();
    const plan = (f: Frequency) => this.catalog.plans.find((p) => p.frequency === f)!;

    const address = (
      recipient: string,
      overrides: Partial<ShippingAddress> = {},
    ): ShippingAddress => ({
      id: `addr-${recipient.toLowerCase().replace(/\s+/g, '-')}`,
      recipient,
      postalCode: '01311-000',
      street: 'Avenida Paulista',
      number: '1578',
      complement: 'Apto 42',
      neighborhood: 'Bela Vista',
      city: 'São Paulo',
      state: 'SP',
      deliveryMethod: 'Loggi Standard',
      deliveryEstimateDays: 3,
      ...overrides,
    });

    const card = (
      customerId: string,
      brand: string,
      lastFour: string,
      holder: string,
      isDefault = true,
    ): PaymentProfile => ({
      id: `pp-${customerId}-${lastFour}`,
      brand,
      lastFour,
      holderName: holder,
      expiration: '08/2029',
      isDefault,
    });

    const makeSubscription = (opts: {
      customerId: string;
      status: SubscriptionStatus;
      frequency: Frequency;
      startedAt: Date;
      nextBillingAt: Date;
      currentCycle: number;
      items: SeedItem[];
      pauseCreditsLeft?: number;
      remainingCommitmentMonths?: number;
      profile: PaymentProfile;
      address: ShippingAddress;
      discount?: SubscriptionDetail['discount'];
      cancellationBlocked?: boolean;
    }): SubscriptionDetail => {
      const p = plan(opts.frequency);
      const discount = opts.discount ?? {
        code: `PRIME-${opts.frequency.toUpperCase()}`,
        percentage: p.discountPercentage,
      };
      const pct =
        discount.temporaryPercentage && (discount.temporaryCycles ?? 0) > 0
          ? discount.temporaryPercentage
          : discount.percentage;
      const sub: SubscriptionDetail = {
        id: `sub-${opts.customerId}`,
        status: opts.status,
        frequency: opts.frequency,
        planName: p.name,
        startedAt: iso(opts.startedAt),
        nextBillingAt: iso(opts.nextBillingAt),
        currentCycle: opts.currentCycle,
        paidCycles: Math.max(0, opts.currentCycle - 1),
        remainingCommitmentMonths:
          opts.remainingCommitmentMonths ??
          (opts.frequency === 'Mensal'
            ? -1
            : Math.max(0, p.commitmentMonths - (opts.currentCycle - 1))),
        pauseCreditsLeft: opts.pauseCreditsLeft ?? PAUSE_CREDITS_BY_FREQUENCY[opts.frequency],
        items: opts.items.map((s, i) => this.buildItem(s, pct, i + 1)),
        discount,
        paymentProfile: opts.profile,
        shippingAddress: opts.address,
        subtotal: brl(0),
        totalDiscount: brl(0),
        total: brl(0),
        cancellationBlocked: opts.cancellationBlocked ?? false,
      };
      this.recalcTotals(sub);
      return sub;
    };

    const makeBill = (
      sub: SubscriptionDetail,
      cycle: number,
      issuedAt: Date,
      status: Bill['status'],
      extra: Partial<Bill> = {},
    ): Bill => {
      const bill: Bill = {
        id: this.newBillId(sub.id.replace('sub-', ''), cycle),
        cycle,
        status,
        issuedAt: iso(issuedAt),
        dueAt: iso(addDays(issuedAt, 3)),
        amount: sub.total,
        paymentMethod: 'credit_card',
        paymentProfile: sub.paymentProfile,
        items: sub.items.filter((i) => i.recurrence !== 'off'),
        ...(status === 'paid' ? { paidAt: iso(addDays(issuedAt, 0)) } : {}),
        ...extra,
      };
      return bill;
    };

    const addAccount = (a: Omit<FakeAccount, 'password'>) => {
      const account: FakeAccount = { ...a, password: FAKE_PASSWORD };
      this.accounts.set(a.customerId, account);
      this.bills.set(a.customerId, []);
      this.paymentProfiles.set(a.customerId, []);
      return account;
    };

    const addBills = (customerId: string, bills: Bill[]) => this.bills.set(customerId, bills);
    const addRef = (
      externalId: string,
      trackingCode: string | undefined,
      customerId: string,
      billId: string,
    ) => {
      this.orderRefs.set(externalId, { customerId, billId });
      if (trackingCode) this.orderRefs.set(trackingCode, { customerId, billId });
    };

    // 1) ativa@teste.com — Anual, ativa, 2 créditos, próxima cobrança em 12 dias, último pedido em trânsito
    {
      const a = addAccount({
        customerId: '7001',
        email: 'ativa@teste.com',
        firstName: 'Mariana',
        lastName: 'Almeida',
        cpf: '12345678901',
        phone: '+5511987654321',
        gender: 'Feminino',
        birthDate: '1991-04-12',
      });
      const profile = card(a.customerId, 'Visa', '4242', 'MARIANA ALMEIDA');
      this.paymentProfiles.set(a.customerId, [
        profile,
        card(a.customerId, 'Mastercard', '5555', 'MARIANA ALMEIDA', false),
      ]);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'active',
        frequency: 'Anual',
        startedAt: addMonths(now, -7),
        nextBillingAt: addDays(now, 12),
        currentCycle: 8,
        pauseCreditsLeft: 2,
        remainingCommitmentMonths: 5,
        items: [
          { handle: 'supercoffee-3-0-original-380g', quantity: 2 },
          { handle: 'supercoffee-3-0-chocolate-380g', quantity: 1 },
          { handle: 'morning-shot', quantity: 1, recurrence: 'on' },
        ],
        profile,
        address: address('Mariana Almeida'),
      });
      this.subscriptions.set(a.customerId, sub);
      const bills: Bill[] = [];
      for (let c = 1; c <= 7; c++) {
        const issued = addDays(addDays(now, 12), -30 * (8 - c));
        const paid = makeBill(sub, c, issued, 'paid');
        if (c === 7) {
          paid.fulfillment = {
            status: 'in_transit',
            carrier: 'Loggi',
            trackingCode: '48B155B3292C',
            trackingUrl: 'https://tracking.estoca.com.br/48B155B3292C',
            estimatedDeliveryAt: iso(addDays(now, 2)),
            events: [
              {
                status: 'processing',
                description: 'Pedido confirmado e em separação',
                occurredAt: iso(addDays(now, -4)),
                location: 'CD Cajamar, SP',
              },
              {
                status: 'shipped',
                description: 'Pedido coletado pela transportadora',
                occurredAt: iso(addDays(now, -3)),
                location: 'CD Cajamar, SP',
              },
              {
                status: 'in_transit',
                description: 'Em trânsito para a unidade de destino',
                occurredAt: iso(addDays(now, -1)),
                location: 'São Paulo, SP',
              },
            ],
          };
          addRef('90017001', '48B155B3292C', a.customerId, paid.id);
        } else {
          paid.fulfillment = {
            status: 'delivered',
            carrier: 'Loggi',
            trackingCode: `LG${c}7001BR`,
            events: [
              {
                status: 'delivered',
                description: 'Pedido entregue',
                occurredAt: iso(addDays(issued, 5)),
              },
            ],
          };
        }
        bills.push(paid);
      }
      addBills(a.customerId, bills.reverse());
    }

    // 2) janela@teste.com — Semestral, ativa, próxima cobrança amanhã (janela D-2 fechada)
    {
      const a = addAccount({
        customerId: '7002',
        email: 'janela@teste.com',
        firstName: 'Rafael',
        lastName: 'Souza',
        cpf: '98765432100',
        phone: '+5521998877665',
        gender: 'Masculino',
      });
      const profile = card(a.customerId, 'Elo', '1234', 'RAFAEL SOUZA');
      this.paymentProfiles.set(a.customerId, [profile]);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'active',
        frequency: 'Semestral',
        startedAt: addMonths(now, -3),
        nextBillingAt: addDays(now, 1),
        currentCycle: 4,
        items: [
          { handle: 'supercoffee-3-0-vanilla-380g', quantity: 2 },
          { handle: 'creatine-300g', quantity: 1 },
        ],
        profile,
        address: address('Rafael Souza', {
          postalCode: '22071-900',
          street: 'Avenida Atlântica',
          number: '1702',
          neighborhood: 'Copacabana',
          city: 'Rio de Janeiro',
          state: 'RJ',
          deliveryMethod: 'Correios Sedex',
          deliveryEstimateDays: 4,
        }),
      });
      this.subscriptions.set(a.customerId, sub);
      const bills = [3, 2, 1].map((c) => {
        const b = makeBill(sub, c, addDays(addDays(now, 1), -30 * (4 - c)), 'paid');
        b.fulfillment = {
          status: 'delivered',
          carrier: 'Correios',
          trackingCode: `BR${c}7002SE`,
          events: [
            {
              status: 'delivered',
              description: 'Pedido entregue',
              occurredAt: iso(addDays(addDays(now, 1), -30 * (4 - c) + 6)),
            },
          ],
        };
        return b;
      });
      addBills(a.customerId, bills);
    }

    // 3) pausada@teste.com — Anual, pausada, retoma em 2 ciclos
    {
      const a = addAccount({
        customerId: '7003',
        email: 'pausada@teste.com',
        firstName: 'Camila',
        lastName: 'Ferreira',
        cpf: '45678912377',
        phone: '+5531988776655',
        gender: 'Feminino',
      });
      const profile = card(a.customerId, 'Mastercard', '9876', 'CAMILA FERREIRA');
      this.paymentProfiles.set(a.customerId, [profile]);
      const nextBilling = addDays(now, 18);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'paused',
        frequency: 'Anual',
        startedAt: addMonths(now, -4),
        nextBillingAt: nextBilling,
        currentCycle: 5,
        pauseCreditsLeft: 1,
        items: [
          { handle: 'supercoffee-3-0-original-economic', quantity: 1 },
          { handle: 'whey-isolado-chocolate-900g', quantity: 1 },
        ],
        profile,
        address: address('Camila Ferreira', {
          postalCode: '30130-010',
          street: 'Avenida Afonso Pena',
          number: '1500',
          neighborhood: 'Centro',
          city: 'Belo Horizonte',
          state: 'MG',
          deliveryMethod: 'Total Express',
        }),
      });
      sub.pause = {
        cycles: 2,
        remainingCycles: 2,
        pausedAt: iso(addDays(now, -3)),
        resumeAt: iso(addMonths(nextBilling, 2)),
      };
      this.subscriptions.set(a.customerId, sub);
      addBills(
        a.customerId,
        [4, 3, 2, 1].map((c) => makeBill(sub, c, addDays(nextBilling, -30 * (5 - c)), 'paid')),
      );
    }

    // 4) pendente@teste.com — Trimestral, ativa com fatura pendente e PIX disponível
    {
      const a = addAccount({
        customerId: '7004',
        email: 'pendente@teste.com',
        firstName: 'Bruno',
        lastName: 'Carvalho',
        cpf: '32165498700',
        phone: '+5541999887766',
        gender: 'Masculino',
      });
      const profile = card(a.customerId, 'Visa', '0005', 'BRUNO CARVALHO');
      this.paymentProfiles.set(a.customerId, [profile]);
      const issued = addDays(now, -2);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'active',
        frequency: 'Trimestral',
        startedAt: addMonths(now, -1),
        nextBillingAt: addDays(issued, 30),
        currentCycle: 2,
        items: [
          { handle: 'supercoffee-3-0-chocolate-380g', quantity: 1 },
          { handle: 'supercoffee-to-go', quantity: 2 },
        ],
        profile,
        address: address('Bruno Carvalho', {
          postalCode: '80010-000',
          street: 'Rua XV de Novembro',
          number: '362',
          neighborhood: 'Centro',
          city: 'Curitiba',
          state: 'PR',
          deliveryMethod: 'Braspress Standard',
          deliveryEstimateDays: 5,
        }),
      });
      this.subscriptions.set(a.customerId, sub);
      const pending = makeBill(sub, 2, issued, 'pending', {
        dueAt: iso(addDays(now, 1)),
        pix: {
          qrCodeImageUrl: 'https://sandbox-app.vindi.com.br/pix/qr/fake-7004.png',
          qrCodeText:
            '00020126580014BR.GOV.BCB.PIX0136fake-7004-pix-copia-e-cola5204000053039865406216.905802BR5913CAFFEINE ARMY6009SAO PAULO62070503***6304ABCD',
          expiresAt: iso(addDays(now, 1)),
        },
      });
      const first = makeBill(sub, 1, addDays(issued, -30), 'paid');
      first.fulfillment = {
        status: 'delivered',
        carrier: 'Braspress',
        trackingCode: 'BP17004BR',
        events: [
          {
            status: 'delivered',
            description: 'Pedido entregue',
            occurredAt: iso(addDays(issued, -24)),
          },
        ],
      };
      addRef('90017004', undefined, a.customerId, pending.id);
      addBills(a.customerId, [pending, first]);
    }

    // 5) agendada@teste.com — Anual, ativa com mudança agendada
    {
      const a = addAccount({
        customerId: '7005',
        email: 'agendada@teste.com',
        firstName: 'Juliana',
        lastName: 'Martins',
        cpf: '65498732111',
        phone: '+5551997766554',
        gender: 'Feminino',
      });
      const profile = card(a.customerId, 'Visa', '7777', 'JULIANA MARTINS');
      this.paymentProfiles.set(a.customerId, [profile]);
      const nextBilling = addDays(now, 20);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'active',
        frequency: 'Anual',
        startedAt: addMonths(now, -2),
        nextBillingAt: nextBilling,
        currentCycle: 3,
        items: [
          { handle: 'supercoffee-3-0-original-380g', quantity: 1 },
          { handle: 'morning-shot', quantity: 1 },
        ],
        profile,
        address: address('Juliana Martins', {
          postalCode: '90010-150',
          street: 'Rua dos Andradas',
          number: '1001',
          neighborhood: 'Centro Histórico',
          city: 'Porto Alegre',
          state: 'RS',
        }),
      });
      const scheduledItems = [
        this.buildItem(
          { handle: 'supercoffee-3-0-original-380g', quantity: 2 },
          sub.discount.percentage,
          1,
        ),
        this.buildItem(
          { handle: 'supercoffee-3-0-vanilla-380g', quantity: 1 },
          sub.discount.percentage,
          2,
        ),
        this.buildItem({ handle: 'morning-shot', quantity: 1 }, sub.discount.percentage, 3),
      ];
      const total = roundToCents(
        scheduledItems.reduce((s, i) => s + i.finalPrice.amount * i.quantity, 0),
      );
      sub.scheduledChange = {
        id: `sch-${a.customerId}-1`,
        appliesAt: iso(nextBilling),
        frequency: 'Anual',
        planName: sub.planName,
        items: scheduledItems,
        total: brl(total),
        nextCycleOnly: false,
      };
      this.subscriptions.set(a.customerId, sub);
      addBills(
        a.customerId,
        [2, 1].map((c) => makeBill(sub, c, addDays(nextBilling, -30 * (3 - c)), 'paid')),
      );
    }

    // 6) cancelada@teste.com — cancelada há 20 dias (pode reativar)
    {
      const a = addAccount({
        customerId: '7006',
        email: 'cancelada@teste.com',
        firstName: 'Pedro',
        lastName: 'Rocha',
        cpf: '78912345622',
        phone: '+5585996655443',
        gender: 'Masculino',
      });
      const profile = card(a.customerId, 'Mastercard', '3131', 'PEDRO ROCHA');
      this.paymentProfiles.set(a.customerId, [profile]);
      const canceledAt = addDays(now, -20);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'canceled',
        frequency: 'Semestral',
        startedAt: addMonths(now, -8),
        nextBillingAt: addDays(canceledAt, 10),
        currentCycle: 7,
        remainingCommitmentMonths: 0,
        pauseCreditsLeft: 0,
        items: [{ handle: 'supercoffee-3-0-original-380g', quantity: 1 }],
        profile,
        address: address('Pedro Rocha', {
          postalCode: '60160-230',
          street: 'Avenida Beira Mar',
          number: '2500',
          neighborhood: 'Meireles',
          city: 'Fortaleza',
          state: 'CE',
        }),
      });
      this.subscriptions.set(a.customerId, sub);
      this.lastCanceled.set(a.customerId, {
        canceledAt: iso(canceledAt),
        reason: 'Tenho produto acumulado',
        subscriptionId: sub.id,
      });
      addBills(
        a.customerId,
        [6, 5].map((c) => makeBill(sub, c, addDays(canceledAt, -30 * (7 - c) + 10), 'paid')),
      );
    }

    // 7) analise@teste.com — fraud_review
    {
      const a = addAccount({
        customerId: '7007',
        email: 'analise@teste.com',
        firstName: 'Larissa',
        lastName: 'Nunes',
        cpf: '14725836933',
        phone: '+5562995544332',
        gender: 'Feminino',
      });
      const profile = card(a.customerId, 'Visa', '2020', 'LARISSA NUNES');
      this.paymentProfiles.set(a.customerId, [profile]);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'fraud_review',
        frequency: 'Anual',
        startedAt: addDays(now, -1),
        nextBillingAt: addDays(now, 29),
        currentCycle: 1,
        items: [{ handle: 'supercoffee-3-0-original-380g', quantity: 2 }],
        profile,
        address: address('Larissa Nunes', {
          postalCode: '74000-000',
          city: 'Goiânia',
          state: 'GO',
          street: 'Avenida Goiás',
          number: '800',
          neighborhood: 'Setor Central',
        }),
      });
      this.subscriptions.set(a.customerId, sub);
      addBills(a.customerId, [makeBill(sub, 1, addDays(now, -1), 'review')]);
    }

    // 8) mensal@teste.com — Mensal, ativa, sem créditos de pausa
    {
      const a = addAccount({
        customerId: '7008',
        email: 'mensal@teste.com',
        firstName: 'Thiago',
        lastName: 'Lima',
        cpf: '25836914744',
        phone: '+5571994433221',
        gender: 'Masculino',
      });
      const profile = card(a.customerId, 'Elo', '6060', 'THIAGO LIMA');
      this.paymentProfiles.set(a.customerId, [profile]);
      const nextBilling = addDays(now, 15);
      const sub = makeSubscription({
        customerId: a.customerId,
        status: 'active',
        frequency: 'Mensal',
        startedAt: addMonths(now, -5),
        nextBillingAt: nextBilling,
        currentCycle: 6,
        pauseCreditsLeft: 0,
        remainingCommitmentMonths: -1,
        items: [{ handle: 'supercoffee-3-0-chocolate-economic', quantity: 1 }],
        profile,
        address: address('Thiago Lima', {
          postalCode: '40020-000',
          city: 'Salvador',
          state: 'BA',
          street: 'Avenida Sete de Setembro',
          number: '100',
          neighborhood: 'Centro',
        }),
      });
      this.subscriptions.set(a.customerId, sub);
      addBills(
        a.customerId,
        [5, 4, 3].map((c) => makeBill(sub, c, addDays(nextBilling, -30 * (6 - c)), 'paid')),
      );
    }

    // 9) semassinatura@teste.com — cliente Shopify sem assinatura
    addAccount({
      customerId: '7009',
      email: 'semassinatura@teste.com',
      firstName: 'Ana',
      lastName: 'Silva',
      cpf: '36925814755',
      phone: '+5511991122334',
    });
  }
}
