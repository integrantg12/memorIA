import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

import { ensureNotificationPermission } from './notifications';
import { requestLocationPermissions } from './geofence';

const PKG = Constants.expoConfig?.android?.package ?? 'app.memoria.local';

async function intent(action: string, withPackage = true) {
  if (Platform.OS !== 'android') return Linking.openSettings();
  try {
    await Linking.sendIntent(action, withPackage ? [{ key: 'android.provider.extra.APP_PACKAGE', value: PKG }] : []);
  } catch {
    await Linking.openSettings();
  }
}

/** Tela "Exibir sobre outros apps" (SYSTEM_ALERT_WINDOW). */
export const openOverlaySettings = () => intent('android.settings.action.MANAGE_OVERLAY_PERMISSION');

/** Alarmes e lembretes exatos (Android 12+). */
export const openExactAlarmSettings = () => intent('android.settings.REQUEST_SCHEDULE_EXACT_ALARM');

/** Tirar o app da otimização de bateria — essencial em Xiaomi, Samsung, Motorola etc. */
export const openBatterySettings = () => intent('android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS', false);

/** Notificações em tela cheia (Android 14+). */
export const openFullScreenIntentSettings = () => intent('android.settings.MANAGE_APP_USE_FULL_SCREEN_INTENT');

export const openAppSettings = () => Linking.openSettings();

export async function requestCorePermissions() {
  const notifications = await ensureNotificationPermission();
  const location = await requestLocationPermissions().catch(() => ({ foreground: false, background: false }));
  return { notifications, ...location };
}
