import * as Notifications from 'expo-notifications';

import {
  acknowledgedKeys,
  AlertLog,
  decrementStock,
  ensureAlertLog,
  getAlert,
  getSettings,
  incrementSnooze,
  listAppointments,
  listMedications,
  listRoutine,
  markAlertAcknowledged,
  snoozedAlerts,
} from '../db/repositories';
import { addDays, addMinutes, atTime, dayKey, hhmmOf, isoWeekday, startOfDay } from '../utils/time';
import { cancelByPrefix, CHANNELS, NotifyData, scheduleAt } from './notifications';
import { stopSpeaking } from './speech';

/**
 * ENGINE DE ALERTA
 *
 * Expande rotina, remédios e compromissos em "ocorrências" concretas para as próximas 48 h.
 * Cada ocorrência crítica vira uma CADEIA de notificações escalonadas (0, 3, 6, 10, 15, 25, 40 min…)
 * já agendadas no AlarmManager. A cadeia só é cancelada quando o usuário resolve o desafio
 * cognitivo na Tela de Alerta — por isso apagar a notificação não silencia nada: o próximo
 * degrau dispara mesmo com o app fechado.
 *
 * O planejamento é idempotente e incremental (compara identificadores), roda ao abrir o app,
 * após qualquer edição e a cada ~1 h via expo-background-task.
 */

const HORIZON_HOURS = 48;
const MAX_SCHEDULED = 420; // Android limita ~500 alarmes por app; deixamos folga para foco/saída.
export const MAX_SNOOZES = 3;

export interface Occurrence {
  alertKey: string;
  kind: AlertLog['kind'];
  refId: number | null;
  at: Date; // horário do evento em si
  fireAt: Date; // quando o primeiro alerta toca (ex.: compromisso - antecedência)
  title: string;
  body: string;
  critical: boolean;
  data: NotifyData;
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Gera todas as ocorrências entre `from` e `to`. */
export async function buildOccurrences(from: Date, to: Date): Promise<Occurrence[]> {
  const settings = await getSettings();
  const [meds, appts, routine] = await Promise.all([listMedications(), listAppointments(), listRoutine()]);
  const out: Occurrence[] = [];
  const days: Date[] = [];
  for (let d = startOfDay(addDays(from, -1)); d <= to; d = addDays(d, 1)) days.push(d);

  // Remédios
  for (const m of meds) {
    for (const day of days) {
      for (const t of m.times) {
        const at = atTime(day, t);
        if (at < from || at > to) continue;
        const key = `med:${m.id}:${dayKey(day)}T${t}`;
        const doseTxt = m.dose ? ` (${m.dose})` : '';
        const instr = m.instructions ? ` ${m.instructions}.` : '';
        out.push({
          alertKey: key,
          kind: 'med',
          refId: m.id,
          at,
          fireAt: at,
          title: `💊 ${m.name}${doseTxt} — ${t}`,
          body: `Hora de tomar ${m.name}${doseTxt}.${instr}`,
          critical: !!m.critical,
          data: { route: '/alert', params: { key }, alertKey: key, critical: !!m.critical, kind: 'med' },
        });
      }
    }
  }

  // Compromissos (aviso de preparação/saída com antecedência)
  for (const a of appts) {
    const starts: { at: Date; key: string }[] = [];
    if (a.startsAt) {
      starts.push({ at: new Date(a.startsAt), key: `appt:${a.id}:once` });
    } else if (a.time && a.weekdays) {
      for (const day of days) {
        if (!a.weekdays.includes(String(isoWeekday(day)))) continue;
        starts.push({ at: atTime(day, a.time), key: `appt:${a.id}:${dayKey(day)}` });
      }
    }
    for (const s of starts) {
      const fireAt = addMinutes(s.at, -a.leadMin);
      if (fireAt > to || s.at < from) continue;
      const bring = a.bringItems.length ? ` Leve: ${a.bringItems.join(', ')}.` : '';
      const where = a.location ? ` em ${a.location}` : '';
      out.push({
        alertKey: s.key,
        kind: 'appointment',
        refId: a.id,
        at: s.at,
        fireAt,
        title: `📅 ${a.title} às ${hhmmOf(s.at)}`,
        body: `Em ${a.leadMin} minutos você tem ${a.title}${where}. Hora de se preparar.${bring}`,
        critical: !!a.critical,
        data: a.critical
          ? { route: '/alert', params: { key: s.key }, alertKey: s.key, critical: true, kind: 'appointment' }
          : { route: '/exit-checklist', params: { appointmentId: String(a.id), trigger: 'appointment' }, alertKey: s.key, kind: 'appointment' },
      });
      // Compromisso único: lembrete na véspera, para separar os itens com calma.
      if (a.startsAt) {
        const eve = addMinutes(s.at, -24 * 60);
        if (eve >= from && eve <= to) {
          const key = `${s.key}:eve`;
          out.push({
            alertKey: key,
            kind: 'appointment',
            refId: a.id,
            at: eve,
            fireAt: eve,
            title: `Amanhã: ${a.title} às ${hhmmOf(s.at)}`,
            body: `Separe agora o que precisa levar.${bring}`,
            critical: false,
            data: { route: '/', alertKey: key, kind: 'appointment' },
          });
        }
      }
    }
  }

  // Rotina
  let wake = '07:00';
  let sleep = '23:00';
  for (const r of routine) {
    if (r.kind === 'wake') wake = r.time;
    if (r.kind === 'sleep') sleep = r.time;
  }
  for (const r of routine) {
    if (!r.remind) continue;
    for (const day of days) {
      if (!r.weekdays.includes(String(isoWeekday(day)))) continue;
      const at = atTime(day, r.time);
      if (at < from || at > to) continue;
      const key = `routine:${r.id}:${dayKey(day)}`;
      const msg = ROUTINE_MESSAGES[r.kind](r.label);
      out.push({
        alertKey: key,
        kind: r.kind === 'recall' ? 'recall' : 'routine',
        refId: r.id,
        at,
        fireAt: at,
        title: msg.title,
        body: msg.body,
        critical: false,
        data: { route: r.kind === 'recall' ? '/training/recall' : '/', alertKey: key, kind: 'routine', speak: msg.body },
      });
    }
  }

  // Hidratação: a cada 2 h entre acordar+2h e dormir-1h
  if (settings.hydration) {
    for (const day of days) {
      const start = addMinutes(atTime(day, wake), 120);
      const end = addMinutes(atTime(day, sleep), -60);
      for (let t = start; t <= end; t = addMinutes(t, 120)) {
        if (t < from || t > to) continue;
        const key = `water:${dayKey(day)}T${hhmmOf(t)}`;
        out.push({
          alertKey: key,
          kind: 'water',
          refId: null,
          at: t,
          fireAt: t,
          title: '💧 Beba um copo de água',
          body: 'Pausa rápida: água agora. Seu cérebro agradece.',
          critical: false,
          data: { route: '/', alertKey: key, kind: 'water' },
        });
      }
    }
  }

  // Estoque baixo de remédio: 30 min após acordar
  for (const m of meds) {
    if (m.stock == null || m.stock > m.refillThreshold) continue;
    for (const day of days) {
      const at = addMinutes(atTime(day, wake), 30);
      if (at < from || at > to) continue;
      const key = `refill:${m.id}:${dayKey(day)}`;
      out.push({
        alertKey: key,
        kind: 'refill',
        refId: m.id,
        at,
        fireAt: at,
        title: `🛒 ${m.name} está acabando`,
        body: `Restam ${m.stock} doses. Compre ou peça a receita hoje.`,
        critical: false,
        data: { route: '/', alertKey: key, kind: 'refill' },
      });
    }
  }

  return out.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
}

const ROUTINE_MESSAGES: Record<string, (label: string) => { title: string; body: string }> = {
  wake: () => ({ title: '☀️ Bom dia!', body: 'Abra o memorIA para ver seu próximo passo do dia.' }),
  sleep: () => ({
    title: '🌙 Hora de desacelerar',
    body: 'Deixe chaves, carteira e óculos no lugar de sempre e registre onde ficaram.',
  }),
  meal: (label) => ({ title: `🍽️ ${label}`, body: `Hora de ${label.toLowerCase()}. Pare o que está fazendo e coma algo.` }),
  work: (label) => ({ title: `💼 ${label}`, body: 'Hora de começar. Escolha UMA tarefa e inicie o Monitor de Foco.' }),
  recall: () => ({ title: '🧠 Recall do dia', body: 'Vamos lembrar juntos o que você fez hoje? Leva 1 minuto.' }),
  custom: (label) => ({ title: `🔔 ${label}`, body: label }),
};

interface PlannedNotification {
  id: string;
  date: Date;
  title: string;
  body: string;
  data: NotifyData;
  channel: string;
  sticky: boolean;
}

function chainFor(o: Occurrence, steps: number[], start: Date, idPrefix: string): PlannedNotification[] {
  const list: PlannedNotification[] = [];
  const sig = hash(o.title + o.body);
  if (!o.critical) {
    list.push({
      id: `${idPrefix}|0|${sig}`,
      date: start,
      title: o.title,
      body: o.body,
      data: o.data,
      channel: CHANNELS.reminder,
      sticky: false,
    });
    return list;
  }
  steps.forEach((min, i) => {
    const urgent = i >= 2;
    list.push({
      id: `${idPrefix}|${i}|${sig}`,
      date: addMinutes(start, min),
      title: urgent ? `⚠️ NÃO CONFIRMADO: ${o.title}` : o.title,
      body: urgent
        ? `${o.body} Este alerta vai continuar até você confirmar no app.`
        : `${o.body} Toque para confirmar.`,
      data: { ...o.data, speak: o.body },
      channel: CHANNELS.critical,
      sticky: true,
    });
  });
  return list;
}

let planning: Promise<void> | null = null;

/** Sincroniza os alarmes agendados com o estado atual do banco. */
export function planAlerts(): Promise<void> {
  if (!planning) {
    planning = doPlan().finally(() => {
      planning = null;
    });
  }
  return planning;
}

async function doPlan() {
  const settings = await getSettings();
  if (!settings.onboarded) return;
  const now = new Date();
  const from = addMinutes(now, -60); // cadeias que começaram há pouco ainda têm degraus futuros
  const to = addMinutes(now, HORIZON_HOURS * 60);
  const occurrences = await buildOccurrences(from, to);
  const acked = await acknowledgedKeys(addMinutes(from, -24 * 60).toISOString());
  const snoozed = new Set((await snoozedAlerts(addMinutes(from, -24 * 60).toISOString())).map((a) => a.alertKey));

  const desired: PlannedNotification[] = [];
  for (const o of occurrences) {
    if (acked.has(o.alertKey) || snoozed.has(o.alertKey)) continue;
    await ensureAlertLog({
      alertKey: o.alertKey,
      kind: o.kind,
      refId: o.refId,
      title: o.title,
      body: o.body,
      critical: o.critical ? 1 : 0,
      scheduledFor: o.fireAt.toISOString(),
    });
    for (const n of chainFor(o, settings.escalationMinutes, o.fireAt, `alert|${o.alertKey}`)) {
      if (n.date.getTime() > now.getTime() + 5_000) desired.push(n);
    }
  }
  desired.sort((a, b) => a.date.getTime() - b.date.getTime());
  const capped = desired.slice(0, MAX_SCHEDULED);
  const wanted = new Map(capped.map((n) => [n.id, n]));

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  const existing = new Set<string>();
  for (const s of scheduled) {
    if (!s.identifier.startsWith('alert|')) continue;
    if (wanted.has(s.identifier)) existing.add(s.identifier);
    else await Notifications.cancelScheduledNotificationAsync(s.identifier);
  }
  for (const n of capped) {
    if (existing.has(n.id)) continue;
    await scheduleAt(n.id, n.date, { title: n.title, body: n.body, data: n.data, channel: n.channel, sticky: n.sticky });
  }
}

/** Descarte cognitivo concluído: silencia a cadeia inteira daquela ocorrência. */
export async function acknowledgeAlert(alertKey: string, method: string) {
  stopSpeaking();
  const alert = await getAlert(alertKey);
  await markAlertAcknowledged(alertKey, method);
  await cancelByPrefix(`alert|${alertKey}|`);
  await cancelByPrefix(`snooze|${alertKey}|`);
  if (alert?.kind === 'med' && alert.refId && method !== 'skipped') await decrementStock(alert.refId);
}

/** Adiar: só é oferecido depois do desafio resolvido, no máximo MAX_SNOOZES vezes. */
export async function snoozeAlert(alertKey: string, minutes = 10) {
  stopSpeaking();
  const alert = await getAlert(alertKey);
  if (!alert) return;
  const n = await incrementSnooze(alertKey);
  await cancelByPrefix(`alert|${alertKey}|`);
  await cancelByPrefix(`snooze|${alertKey}|`);
  const settings = await getSettings();
  const occ: Occurrence = {
    alertKey,
    kind: alert.kind,
    refId: alert.refId,
    at: new Date(),
    fireAt: addMinutes(new Date(), minutes),
    title: `⏰ (adiado) ${alert.title}`,
    body: alert.body,
    critical: true,
    data: { route: '/alert', params: { key: alertKey }, alertKey, critical: true, kind: alert.kind },
  };
  for (const p of chainFor(occ, settings.escalationMinutes, occ.fireAt, `snooze|${alertKey}|${n}`)) {
    await scheduleAt(p.id, p.date, { title: p.title, body: p.body, data: p.data, channel: p.channel, sticky: true });
  }
}

/** Dispara um alerta crítico de teste em `seconds` segundos (Ajustes > Testar). */
export async function scheduleTestAlert(seconds = 10) {
  const key = `test:${Date.now()}`;
  const fireAt = new Date(Date.now() + seconds * 1000);
  await ensureAlertLog({
    alertKey: key,
    kind: 'test',
    refId: null,
    title: '🧪 Alerta de teste',
    body: 'Este é um teste do alerta intrometido. Resolva o desafio para silenciar.',
    critical: 1,
    scheduledFor: fireAt.toISOString(),
  });
  const settings = await getSettings();
  const occ: Occurrence = {
    alertKey: key,
    kind: 'test',
    refId: null,
    at: fireAt,
    fireAt,
    title: '🧪 Alerta de teste',
    body: 'Este é um teste do alerta intrometido. Resolva o desafio para silenciar.',
    critical: true,
    data: { route: '/alert', params: { key }, alertKey: key, critical: true, kind: 'test' },
  };
  for (const p of chainFor(occ, settings.escalationMinutes.slice(0, 3), fireAt, `alert|${key}`)) {
    await scheduleAt(p.id, p.date, { title: p.title, body: p.body, data: p.data, channel: p.channel, sticky: true });
  }
}
