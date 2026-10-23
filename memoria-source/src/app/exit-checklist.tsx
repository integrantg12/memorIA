import { useKeepAwake } from 'expo-keep-awake';
import * as Notifications from 'expo-notifications';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Text, View } from 'react-native';

import { BigButton, Body, Card, CheckRow, Loading, Screen } from '../components/ui';
import {
  completeChecklistRun,
  getAppointment,
  listAppointments,
  listChecklist,
  markChecklistItems,
  setSetting,
  startChecklistRun,
} from '../db/repositories';
import { watchCurrentPlace } from '../services/geofence';
import { lastLocationOf } from '../services/lostFound';
import { say, stopSpeaking } from '../services/speech';
import { colors, font, space } from '../theme';
import { addMinutes, atTime, isoWeekday, relative } from '../utils/time';

interface Row {
  key: string;
  label: string;
  question: string;
  group: 'Seu corpo' | 'Segurança da casa' | 'Itens essenciais' | 'Para o compromisso';
  checklistId?: number;
  whereHint?: string;
}

/**
 * CHECKLIST CONTEXTUAL DE SAÍDA
 * Junta itens fisiológicos, de segurança, os itens de porte diário do onboarding e o que
 * o compromisso das próximas horas exige. Só fecha com TODOS os itens marcados.
 */
export default function ExitChecklist() {
  useKeepAwake();
  const params = useLocalSearchParams<{ trigger?: string; appointmentId?: string; place?: string }>();
  const trigger = params.trigger ?? 'manual';
  const blocking = trigger !== 'manual';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [apptTitle, setApptTitle] = useState<string | null>(null);
  const runId = useRef<number | null>(null);

  useEffect(() => {
    if (!blocking) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [blocking]);

  useEffect(() => {
    (async () => {
      const items = await listChecklist();
      const out: Row[] = [];
      for (const it of items) {
        const group = it.context === 'physiological' ? 'Seu corpo' : it.context === 'safety' ? 'Segurança da casa' : 'Itens essenciais';
        let whereHint: string | undefined;
        if (it.isEssentialItem) {
          const loc = await lastLocationOf(it.label);
          if (loc) whereHint = `📍 Última vez: ${loc.place} (${relative(new Date(loc.createdAt))})`;
        }
        out.push({ key: `c${it.id}`, label: it.label, question: it.question, group, checklistId: it.id, whereHint });
      }

      // Compromisso: o indicado pela notificação, ou qualquer um nas próximas 4 horas.
      const appts = params.appointmentId ? [await getAppointment(Number(params.appointmentId))] : await listAppointments();
      const now = new Date();
      for (const a of appts) {
        if (!a) continue;
        let start: Date | null = null;
        if (a.startsAt) start = new Date(a.startsAt);
        else if (a.time && a.weekdays?.includes(String(isoWeekday(now)))) start = atTime(now, a.time);
        const relevant = params.appointmentId || (start && start > now && start < addMinutes(now, 240));
        if (!relevant) continue;
        setApptTitle(a.title);
        for (const b of a.bringItems) {
          out.push({ key: `a${a.id}:${b}`, label: b, question: `Pegou: ${b}?`, group: 'Para o compromisso' });
        }
      }
      setRows(out);
      runId.current = await startChecklistRun(trigger, params.appointmentId ? Number(params.appointmentId) : null, out.map((r) => r.label));

      const intro = blocking ? 'Atenção, você está saindo. ' : '';
      await say(`${intro}Vamos conferir ${out.length} itens. Primeiro: ${out[0]?.question ?? ''}`);
    })();
    return () => stopSpeaking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const groups = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows ?? []) g.set(r.group, [...(g.get(r.group) ?? []), r]);
    return [...g.entries()];
  }, [rows]);

  if (!rows) return <Loading />;

  const total = rows.length;
  const done = checked.size;
  const allDone = done === total;

  const toggle = (r: Row) => {
    const next = new Set(checked);
    if (next.has(r.key)) next.delete(r.key);
    else next.add(r.key);
    setChecked(next);
    if (!checked.has(r.key)) {
      const pending = rows.find((x) => !next.has(x.key));
      if (pending) say(`Próximo: ${pending.question}`);
      else say('Tudo conferido. Pode sair tranquilo.');
    }
  };

  const finish = async () => {
    stopSpeaking();
    await markChecklistItems(rows.filter((r) => r.checklistId).map((r) => r.checklistId!));
    if (runId.current) await completeChecklistRun(runId.current);
    await setSetting('lastExitChecklistAt', new Date().toISOString());
    // Remove a notificação fixa de saída, se houver.
    const presented = await Notifications.getPresentedNotificationsAsync();
    await Promise.all(presented.filter((n) => n.request.identifier.startsWith('exit|')).map((n) => Notifications.dismissNotificationAsync(n.request.identifier)));
    router.replace('/');
  };

  return (
    <Screen>
      <View style={{ backgroundColor: colors.primary, borderRadius: 24, padding: space.lg, gap: space.xs }}>
        <Text style={{ color: colors.onPrimary, fontSize: font.title, fontWeight: '900' }}>
          {blocking ? '🚪 Você está saindo!' : '🚪 Antes de sair'}
        </Text>
        <Text style={{ color: colors.onPrimary, fontSize: font.body, fontWeight: '700' }}>
          {apptTitle ? `Destino: ${apptTitle}. ` : ''}Marque cada item para liberar.
        </Text>
        <Text style={{ color: colors.onPrimary, fontSize: font.large, fontWeight: '900' }}>
          {done} de {total} conferidos
        </Text>
      </View>

      {groups.map(([group, items]) => (
        <View key={group} style={{ gap: space.sm }}>
          <Text style={{ color: colors.primary, fontSize: font.large, fontWeight: '900', marginTop: space.sm }}>{group}</Text>
          {items.map((r) => (
            <CheckRow key={r.key} label={r.question} sub={r.whereHint} checked={checked.has(r.key)} onToggle={() => toggle(r)} />
          ))}
        </View>
      ))}

      <BigButton
        label={allDone ? 'Tudo verificado — pode ir!' : `Faltam ${total - done} itens`}
        icon={allDone ? '✅' : '⏳'}
        variant={allDone ? 'success' : 'ghost'}
        disabled={!allDone}
        onPress={finish}
      />
      {!blocking ? (
        <Card>
          <Body dim>Está num lugar fora de casa (consultório, restaurante, casa de alguém)?</Body>
          <BigButton
            small
            variant="ghost"
            icon="📍"
            label="Avisar quando eu sair daqui"
            onPress={async () => {
              try {
                await watchCurrentPlace();
                await say('Combinado. Quando você sair daqui, eu mostro o checklist.');
              } catch {
                await say('Não consegui acessar a localização.');
              }
            }}
          />
          <BigButton small variant="ghost" label="Fechar sem sair" onPress={() => router.back()} />
        </Card>
      ) : null}
    </Screen>
  );
}
