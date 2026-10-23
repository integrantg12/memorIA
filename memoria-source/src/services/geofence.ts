import * as Location from 'expo-location';

import { addTemporaryPlace, getSettings, listPlaces, setHome } from '../db/repositories';

/**
 * GEOFENCING PREVENTIVO
 *
 * Usa a API de geofencing do próprio sistema (Android GeofencingClient via expo-location):
 * o aparelho só avisa o app quando ele cruza o raio da casa. Nenhuma coordenada é enviada a
 * servidores, gravada em histórico ou compartilhada — guardamos apenas o centro da casa.
 */
export const GEOFENCE_TASK = 'memoria-geofence';

export async function requestLocationPermissions(): Promise<{ foreground: boolean; background: boolean }> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (!fg.granted) return { foreground: false, background: false };
  // No Android 11+ isso leva o usuário à tela "Permitir o tempo todo".
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { foreground: true, background: bg.granted };
}

export async function currentPosition() {
  const fg = await Location.getForegroundPermissionsAsync();
  if (!fg.granted) {
    const req = await Location.requestForegroundPermissionsAsync();
    if (!req.granted) throw new Error('Permissão de localização negada');
  }
  return Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
}

export async function setHomeHere(radius = 120) {
  const pos = await currentPosition();
  await setHome(pos.coords.latitude, pos.coords.longitude, radius);
  await syncGeofences();
}

/** "Me avise quando eu sair daqui": cerca temporária no local atual (expira em 12 h). */
export async function watchCurrentPlace(label = 'Local atual') {
  const pos = await currentPosition();
  await addTemporaryPlace(label, pos.coords.latitude, pos.coords.longitude);
  await syncGeofences();
}

/** Liga/atualiza/desliga o monitoramento conforme os locais cadastrados. */
export async function syncGeofences() {
  const settings = await getSettings();
  const places = await listPlaces();
  const started = await Location.hasStartedGeofencingAsync(GEOFENCE_TASK).catch(() => false);
  if (!settings.geofenceEnabled || places.length === 0) {
    if (started) await Location.stopGeofencingAsync(GEOFENCE_TASK);
    return;
  }
  const bg = await Location.getBackgroundPermissionsAsync();
  if (!bg.granted) return;
  await Location.startGeofencingAsync(
    GEOFENCE_TASK,
    places.map((p) => ({
      identifier: `place:${p.id}`,
      latitude: p.latitude,
      longitude: p.longitude,
      radius: p.radius,
      notifyOnExit: true,
      notifyOnEnter: !!p.isHome,
    })),
  );
}
