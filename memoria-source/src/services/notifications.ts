import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Canais Android. As configurações de um canal ficam imutáveis depois de criado,
 * por isso os IDs têm sufixo de versão.
 */
export const CHANNELS = {
  critical: 'critico-v1',
  reminder: 'lembrete-v1',
  focus: 'foco-v1',
  focusOngoing: 'foco-ativo-v1',
  exit: 'saida-v1',
} as const;

export const CATEGORIES = {
  focusCheckin: 'focus-checkin',
} as const;

const ALARM_VIBRATION = [0, 900, 400, 900, 400, 900, 400, 1500];

export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNELS.critical, {
    name: 'Alertas críticos (remédios, compromissos)',
    description: 'Não podem ser ignorados. Exigem uma ação para silenciar.',
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: ALARM_VIBRATION,
    enableVibrate: true,
    enableLights: true,
    lightColor: '#FFD600',
    sound: 'default',
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.exit, {
    name: 'Checklist de saída',
    description: 'Disparado ao sair de casa.',
    importance: Notifications.AndroidImportance.MAX,
    bypassDnd: true,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: ALARM_VIBRATION,
    enableVibrate: true,
    sound: 'default',
    audioAttributes: {
      usage: Notifications.AndroidAudioUsage.ALARM,
      contentType: Notifications.AndroidAudioContentType.SONIFICATION,
    },
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.reminder, {
    name: 'Lembretes da rotina',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 400, 200, 400],
    enableVibrate: true,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.focus, {
    name: 'Check-ins de foco',
    description: '"Você ainda está focado nesta tarefa?"',
    importance: Notifications.AndroidImportance.HIGH,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    vibrationPattern: [0, 250, 150, 250, 150, 250],
    enableVibrate: true,
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(CHANNELS.focusOngoing, {
    name: 'Tarefa em andamento',
    description: 'Mostra fixo na barra qual tarefa você está fazendo.',
    importance: Notifications.AndroidImportance.LOW,
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    sound: null,
    enableVibrate: false,
  });

  await Notifications.setNotificationCategoryAsync(CATEGORIES.focusCheckin, [
    { identifier: 'focused', buttonTitle: '✅ Sim, focado', options: { opensAppToForeground: true } },
    { identifier: 'distracted', buttonTitle: '😵 Me distraí', options: { opensAppToForeground: true } },
  ]);
}

/** Exibição de notificações com o app aberto: sempre mostrar, tocar som e vibrar. */
export function configureForegroundHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      priority: Notifications.AndroidNotificationPriority.MAX,
    }),
  });
}

export async function ensureNotificationPermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false, allowCriticalAlerts: true },
  });
  return req.granted;
}

/** Cancela agendamentos cujo identificador começa com `prefix` e remove os já exibidos. */
export async function cancelByPrefix(prefix: string) {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(prefix))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
  const presented = await Notifications.getPresentedNotificationsAsync();
  await Promise.all(
    presented
      .filter((n) => n.request.identifier.startsWith(prefix))
      .map((n) => Notifications.dismissNotificationAsync(n.request.identifier)),
  );
}

export interface NotifyData extends Record<string, unknown> {
  route: string;
  params?: Record<string, string>;
  alertKey?: string;
  critical?: boolean;
  speak?: string;
  kind?: string;
}

export async function scheduleAt(
  identifier: string,
  date: Date,
  content: { title: string; body: string; data: NotifyData; channel: string; sticky?: boolean; category?: string },
) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      sticky: content.sticky ?? false,
      autoDismiss: !content.sticky,
      priority: Notifications.AndroidNotificationPriority.MAX,
      sound: 'default',
      categoryIdentifier: content.category,
      color: '#FFD600',
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: content.channel },
  });
}

export async function presentNow(
  identifier: string,
  content: { title: string; body: string; data: NotifyData; channel: string; sticky?: boolean; category?: string; silent?: boolean },
) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: {
      title: content.title,
      body: content.body,
      data: content.data,
      sticky: content.sticky ?? false,
      autoDismiss: !content.sticky,
      priority: content.silent ? Notifications.AndroidNotificationPriority.LOW : Notifications.AndroidNotificationPriority.MAX,
      sound: content.silent ? false : 'default',
      categoryIdentifier: content.category,
      color: '#FFD600',
    },
    trigger: { channelId: content.channel },
  });
}
