import { Inject, Injectable, Logger, NotImplementedException } from '@nestjs/common';
import { Env, ENV } from '../../config/env';
import { PushMessage, PushSender, PushTarget } from '../../ports';

/**
 * Envio de push via Firebase Cloud Messaging (tokens FCM do Android e APNs via FCM no iOS),
 * para o app Flutter. Env: FIREBASE_SERVICE_ACCOUNT_JSON (conteúdo da service account).
 *
 * TODO: instalar `firebase-admin`, inicializar com
 *   admin.initializeApp({ credential: admin.credential.cert(JSON.parse(env.firebase.serviceAccountJson)) })
 * e chamar `admin.messaging().sendEachForMulticast({ tokens, notification: {title, body}, data })`
 * em lotes de 500. Tokens inválidos (`messaging/registration-token-not-registered`) devem ser
 * removidos do `DeviceStore`.
 */
@Injectable()
export class FcmPushSender implements PushSender {
  private readonly logger = new Logger(FcmPushSender.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    if (!env.firebase.serviceAccountJson) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_JSON ausente: push FCM/APNs indisponível');
    }
  }

  async send(targets: PushTarget[], _message: PushMessage): Promise<void> {
    if (targets.length === 0) return;
    throw new NotImplementedException(
      'TODO: conectar FCM via firebase-admin (sendEachForMulticast)',
    );
  }
}
