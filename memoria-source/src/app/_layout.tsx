import * as Notifications from 'expo-notifications';
import { router, Stack, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Loading } from '../components/ui';
import { getDb } from '../db/database';
import { getSettings } from '../db/repositories';
import { planAlerts } from '../services/alertEngine';
import { registerBackgroundReplan } from '../services/backgroundTasks';
import { syncGeofences } from '../services/geofence';
import { configureForegroundHandler, NotifyData, setupNotificationChannels } from '../services/notifications';
import { say } from '../services/speech';
import { colors, font } from '../theme';

configureForegroundHandler();

function navigateFromNotification(data: NotifyData | undefined, actionId?: string) {
  if (!data?.route) return;
  const params: Record<string, string> = { ...(data.params ?? {}) };
  if (actionId && actionId !== Notifications.DEFAULT_ACTION_IDENTIFIER) params.answer = actionId;
  // navigate reaproveita a tela se ela já estiver aberta (só atualiza os parâmetros).
  router.navigate({ pathname: data.route as never, params });
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
  const [onboarded, setOnboarded] = useState(false);
  const pathname = usePathname();
  const pathRef = useRef(pathname);
  useEffect(() => {
    pathRef.current = pathname;
  }, [pathname]);
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponse = useRef<string | null>(null);

  // Inicialização: banco criptografado, canais, tarefas de background.
  useEffect(() => {
    (async () => {
      try {
        await getDb();
        await setupNotificationChannels();
        const s = await getSettings();
        setOnboarded(s.onboarded);
        setReady(true);
        if (s.onboarded) {
          planAlerts().catch(() => undefined);
          syncGeofences().catch(() => undefined);
          registerBackgroundReplan().catch(() => undefined);
        }
      } catch (e) {
        setFatal(String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (ready && !onboarded) router.replace('/onboarding');
  }, [ready, onboarded]);

  // Toque numa notificação (inclusive com o app fechado — cold start).
  useEffect(() => {
    if (!ready || !lastResponse) return;
    const id = `${lastResponse.notification.request.identifier}|${lastResponse.actionIdentifier}|${lastResponse.notification.date}`;
    if (handledResponse.current === id) return;
    handledResponse.current = id;
    navigateFromNotification(lastResponse.notification.request.content.data as NotifyData, lastResponse.actionIdentifier);
  }, [ready, lastResponse]);

  // Notificação chegando com o app aberto: alertas críticos tomam a tela e falam em voz alta.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as NotifyData;
      if (!data?.route) return;
      // Check-in de foco sempre abre o modal; alerta crítico não interrompe outro alerta já na tela.
      if (data.kind === 'focus' || (data.critical && pathRef.current !== data.route)) navigateFromNotification(data);
      if (data.speak) say(data.speak).catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  // Voltou ao app: replaneja (janela móvel de 48 h).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') planAlerts().catch(() => undefined);
    });
    return () => sub.remove();
  }, []);

  if (fatal) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: 24, justifyContent: 'center' }}>
        <Text style={{ color: colors.danger, fontSize: font.large, fontWeight: '900' }}>Erro ao abrir os dados</Text>
        <Text style={{ color: colors.text, fontSize: font.body }}>{fatal}</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="alert" options={{ gestureEnabled: false, animation: 'none' }} />
        <Stack.Screen name="exit-checklist" options={{ gestureEnabled: false }} />
      </Stack>
      {/* O navegador precisa estar montado desde o 1º render; o carregamento fica por cima. */}
      {!ready ? (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
          <Loading />
        </View>
      ) : null}
    </SafeAreaProvider>
  );
}
