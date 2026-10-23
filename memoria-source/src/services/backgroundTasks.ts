import * as BackgroundTask from 'expo-background-task';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { deletePlace, getSettings, listPlaces } from '../db/repositories';
import { planAlerts } from './alertEngine';
import { GEOFENCE_TASK, syncGeofences } from './geofence';
import { CHANNELS, presentNow } from './notifications';

/**
 * Tarefas executadas pelo sistema com o app fechado (HeadlessJS no Android).
 * Este arquivo é importado em index.ts, antes do Expo Router, como exige o TaskManager.
 */
export const REPLAN_TASK = 'memoria-replan';

/** Se o usuário já fez o checklist manualmente há pouco, não incomodar de novo. */
const RECENT_CHECKLIST_MIN = 20;

interface GeofenceEvent {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
}

TaskManager.defineTask<GeofenceEvent>(GEOFENCE_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const { eventType, region } = data;
  const placeId = Number(region.identifier?.split(':')[1]);
  const places = await listPlaces();
  const place = places.find((p) => p.id === placeId);

  if (eventType === Location.GeofencingEventType.Exit) {
    const s = await getSettings();
    const last = s.lastExitChecklistAt ? new Date(s.lastExitChecklistAt).getTime() : 0;
    if (Date.now() - last > RECENT_CHECKLIST_MIN * 60_000) {
      await presentNow(`exit|${Date.now()}`, {
        title: '🚪 Você está saindo! Checklist obrigatório',
        body: 'Banheiro, água, chaves, carteira, remédios… Toque para conferir item por item.',
        data: {
          route: '/exit-checklist',
          params: { trigger: 'geofence', place: place?.label ?? '' },
          critical: true,
          kind: 'exit',
          speak: 'Atenção, você está saindo. Vamos conferir o checklist antes de ir.',
        },
        channel: CHANNELS.exit,
        sticky: true,
      });
    }
    // Cercas temporárias ("me avise quando eu sair daqui") valem uma única vez.
    if (place && !place.isHome) {
      await deletePlace(place.id);
      await syncGeofences();
    }
  } else if (eventType === Location.GeofencingEventType.Enter && place?.isHome) {
    await presentNow(`home|${Date.now()}`, {
      title: '🏠 Chegou em casa',
      body: 'Antes de largar tudo: onde você vai deixar as chaves e a carteira? Toque para registrar.',
      data: { route: '/lost-found', params: { mode: 'save' }, kind: 'home' },
      channel: CHANNELS.reminder,
    });
  }
});

TaskManager.defineTask(REPLAN_TASK, async () => {
  try {
    await planAlerts();
    return BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

export async function registerBackgroundReplan() {
  const status = await BackgroundTask.getStatusAsync();
  if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
  if (await TaskManager.isTaskRegisteredAsync(REPLAN_TASK)) return;
  await BackgroundTask.registerTaskAsync(REPLAN_TASK, { minimumInterval: 60 });
}
