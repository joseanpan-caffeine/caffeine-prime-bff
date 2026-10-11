import { Env } from '../../config/env';
import { FakePushSender } from '../../adapters/fake/fake-push.sender';
import {
  MemoryConsentStore,
  MemoryDeviceStore,
  MemoryNotificationPreferencesStore,
  MemoryRoutineStore,
} from '../../adapters/fake/memory-stores';
import { ConsentService } from '../consent/consent.service';
import { RemindersScheduler } from './reminders.scheduler';

describe('RemindersScheduler', () => {
  const env = {
    reminders: { enabled: false },
    consentVersions: {
      push: 'v1',
      health_data: 'v1',
      routine_data: 'v1',
      ai_assistant: 'v1',
      analytics: 'v1',
    },
  } as unknown as Env;
  const clock = { now: () => new Date('2026-10-11T10:30:00.000Z') }; // 07:30 em São Paulo

  const setup = async () => {
    const routine = new MemoryRoutineStore();
    const devices = new MemoryDeviceStore();
    const prefs = new MemoryNotificationPreferencesStore();
    const push = new FakePushSender();
    const consentStore = new MemoryConsentStore();
    const consents = new ConsentService(consentStore, clock, env);
    await consentStore.upsert('c1', { kind: 'push', granted: true, version: 'v1' });
    await devices.upsert('c1', {
      pushToken: 'tok',
      pushProvider: 'fcm',
      platform: 'android',
      appVersion: '1',
    });
    await routine.savePlan('c1', {
      timezone: 'America/Sao_Paulo',
      weeklyGoalDays: 5,
      items: [
        {
          id: 'sc',
          productHandle: 'sc',
          title: 'Supercoffee',
          slot: 'morning',
          reminderTime: '07:30',
          reminderEnabled: true,
          dosesPerDay: 1,
        },
        {
          id: 'ms',
          productHandle: 'ms',
          title: 'Morning Shot',
          slot: 'pre_workout',
          reminderTime: '17:30',
          reminderEnabled: true,
          dosesPerDay: 1,
        },
      ],
    });
    const scheduler = new RemindersScheduler(routine, devices, prefs, push, clock, env, consents);
    return { routine, prefs, push, consentStore, scheduler };
  };

  it('envia só o item cujo horário bate com a hora local do plano, uma vez por dia', async () => {
    const { push, scheduler } = await setup();
    expect(await scheduler.tick()).toBe(1);
    expect(push.sent[0].message.body).toMatch(/Supercoffee/);
    expect(push.sent[0].targets).toEqual([{ token: 'tok', provider: 'fcm' }]);
    expect(await scheduler.tick()).toBe(0); // mesmo minuto de novo: deduplicado
  });

  it('item já marcado hoje não recebe lembrete', async () => {
    const { routine, scheduler } = await setup();
    await routine.addCheckIn({
      customerId: 'c1',
      routineItemId: 'sc',
      date: '2026-10-11',
      doneAt: new Date().toISOString(),
      source: 'manual',
    });
    expect(await scheduler.tick()).toBe(0);
  });

  it('respeita a preferência routine=false e o consentimento push', async () => {
    const a = await setup();
    await a.prefs.update('c1', { routine: false });
    expect(await a.scheduler.tick()).toBe(0);
    const b = await setup();
    await b.consentStore.upsert('c1', { kind: 'push', granted: false, version: 'v1' });
    expect(await b.scheduler.tick()).toBe(0);
  });
});
