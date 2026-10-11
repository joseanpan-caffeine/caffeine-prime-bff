import { Injectable, Logger } from '@nestjs/common';
import { PushMessage, PushProvider, PushSender, PushTarget } from '../../ports';
import { ExpoPushSender } from './expo-push-sender';
import { FcmPushSender } from './fcm-push-sender';

/**
 * Distribui os destinos pelo provedor que emitiu o token: Expo (RN) ou FCM/APNs (Flutter, ambos
 * via Firebase). Falha em um provedor não impede os outros; o erro vai para o log.
 */
@Injectable()
export class RoutingPushSender implements PushSender {
  private readonly logger = new Logger(RoutingPushSender.name);

  constructor(
    private readonly expo: ExpoPushSender,
    private readonly fcm: FcmPushSender,
  ) {}

  async send(targets: PushTarget[], message: PushMessage): Promise<void> {
    const groups = new Map<PushProvider, PushTarget[]>();
    for (const t of targets) groups.set(t.provider, [...(groups.get(t.provider) ?? []), t]);
    await Promise.all(
      [...groups.entries()].map(async ([provider, group]) => {
        try {
          if (provider === 'expo') await this.expo.send(group, message);
          else await this.fcm.send(group, message);
        } catch (err) {
          this.logger.error(`push ${provider} falhou: ${(err as Error).message}`);
        }
      }),
    );
  }
}
