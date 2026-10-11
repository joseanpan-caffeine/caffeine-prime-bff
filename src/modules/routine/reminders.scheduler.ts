import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Env, ENV } from '../../config/env';
import { addDaysToDateKey, localDateKey, localTimeHHmm } from '../../core/timezone';
import {
  CLOCK,
  Clock,
  DEVICE_STORE,
  DeviceStore,
  NOTIFICATION_PREFERENCES_STORE,
  NotificationPreferencesStore,
  PUSH_SENDER,
  PushSender,
  ROUTINE_STORE,
  RoutineStore,
  toPushTargets,
} from '../../ports';
import { ConsentService } from '../consent/consent.service';

const TICK_MS = 60_000;

/**
 * Lembretes da rotina: a cada minuto envia push para os itens cujo `reminderTime` bate com a hora
 * local do plano e que ainda não foram marcados hoje. Respeita a preferência `routine` e o
 * consentimento `push`. Desligado em testes (`REMINDERS_ENABLED=false`).
 *
 * Em produção isto deve sair do processo HTTP para um worker (Cloud Run Job / Cloud Scheduler):
 * com várias réplicas cada uma dispararia o mesmo lembrete. A deduplicação aqui é só em memória.
 */
@Injectable()
export class RemindersScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RemindersScheduler.name);
  private timer?: NodeJS.Timeout;
  /** `${customerId}:${itemId}:${date}` já notificados (evita repetição dentro do minuto). */
  private readonly sent = new Set<string>();

  constructor(
    @Inject(ROUTINE_STORE) private readonly routine: RoutineStore,
    @Inject(DEVICE_STORE) private readonly devices: DeviceStore,
    @Inject(NOTIFICATION_PREFERENCES_STORE) private readonly prefs: NotificationPreferencesStore,
    @Inject(PUSH_SENDER) private readonly push: PushSender,
    @Inject(CLOCK) private readonly clock: Clock,
    @Inject(ENV) private readonly env: Env,
    private readonly consents: ConsentService,
  ) {}

  onModuleInit() {
    if (!this.env.reminders.enabled) return;
    this.timer = setInterval(() => {
      this.tick().catch((err) => this.logger.error(`lembretes: ${(err as Error).message}`));
    }, TICK_MS);
    this.timer.unref();
    this.logger.log('Lembretes da rotina ativos (varredura a cada minuto)');
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Uma varredura; `now` injetável para testes. Devolve quantos lembretes foram enviados. */
  async tick(now: Date = this.clock.now()): Promise<number> {
    const plans = await this.routine.listPlansWithReminders();
    let count = 0;
    for (const plan of plans) {
      const hhmm = localTimeHHmm(now, plan.timezone);
      const today = localDateKey(now, plan.timezone);
      const due = plan.items.filter((i) => i.reminderEnabled && i.reminderTime === hhmm);
      if (due.length === 0) continue;

      const [prefs, pushConsent] = await Promise.all([
        this.prefs.get(plan.customerId),
        this.consents.isGranted(plan.customerId, 'push'),
      ]);
      if (prefs.routine === false || !pushConsent) continue;

      const doneToday = new Set(
        (await this.routine.listCheckIns(plan.customerId, today))
          .filter((c) => c.date === today)
          .map((c) => c.routineItemId),
      );
      const pending = due.filter((i) => !doneToday.has(i.id));
      if (pending.length === 0) continue;

      const devices = await this.devices.listByCustomer(plan.customerId);
      const targets = toPushTargets(devices);
      for (const item of pending) {
        const key = `${plan.customerId}:${item.id}:${today}`;
        if (this.sent.has(key)) continue;
        this.sent.add(key);
        if (targets.length === 0) continue;
        await this.push.send(targets, {
          title: 'Hora da sua rotina',
          body: `${item.title}: marque quando tomar.`,
          data: { type: 'routine_reminder', routineItemId: item.id, date: today },
        });
        count++;
      }
    }
    this.sweep(now);
    return count;
  }

  /** Esquece chaves de dias passados para não crescer sem limite. */
  private sweep(now: Date) {
    const today = localDateKey(now);
    const yesterday = addDaysToDateKey(today, -1);
    for (const key of this.sent) {
      const date = key.slice(key.lastIndexOf(':') + 1);
      if (date < yesterday) this.sent.delete(key);
    }
  }
}
