import { Inject, Injectable, NotImplementedException } from '@nestjs/common';
import { Env, ENV } from '../../config/env';
import { PushMessage, PushSender, PushTarget } from '../../ports';
import { HttpClient } from './http-client';

/**
 * Envio de push via Expo Push Service (abstrai FCM/APNs para o app React Native).
 * Env: EXPO_PUSH_URL (padrão https://exp.host/--/api/v2/push/send), EXPO_ACCESS_TOKEN (Bearer, opcional).
 * Recebe só destinos com `provider === 'expo'` (o `RoutingPushSender` faz a triagem).
 */
@Injectable()
export class ExpoPushSender implements PushSender {
  private readonly http: HttpClient;

  constructor(@Inject(ENV) env: Env) {
    this.http = new HttpClient({
      baseUrl: env.expo.url,
      headers: env.expo.accessToken ? { authorization: `Bearer ${env.expo.accessToken}` } : {},
    });
  }

  /** POST https://exp.host/--/api/v2/push/send com `[{to, title, body, data}]` em lotes de 100 */
  async send(targets: PushTarget[], _message: PushMessage): Promise<void> {
    if (targets.length === 0) return;
    throw new NotImplementedException('TODO: conectar Expo Push POST /--/api/v2/push/send');
  }
}
