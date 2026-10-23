import {
  addCheckin,
  checkinsByHour,
  FocusCheckin,
  getActiveTimer,
  getTimer,
  insertTimer,
  listFinishedTimers,
  TaskTimer,
  updateTimer,
} from '../db/repositories';
import { addMinutes, hhmmOf } from '../utils/time';
import { cancelByPrefix, CATEGORIES, CHANNELS, presentNow, scheduleAt } from './notifications';

/**
 * MONITOR DE FOCO (cegueira temporal)
 *
 * Os check-ins são agendados como notificações exatas no momento em que a tarefa começa,
 * então funcionam com a tela desligada ou o app fechado. Pausar/retomar reagenda tudo
 * a partir do tempo efetivamente trabalhado.
 */

const OVERRUN_EVERY_MIN = 5;
const OVERRUN_MAX = 12; // até 1 h além do previsto

export function elapsedMs(t: TaskTimer, at: Date = new Date()): number {
  const end = t.endedAt ? new Date(t.endedAt) : at;
  let paused = t.pausedMs;
  if (t.pausedAt && !t.endedAt) paused += at.getTime() - new Date(t.pausedAt).getTime();
  return Math.max(0, end.getTime() - new Date(t.startedAt).getTime() - paused);
}

async function scheduleCheckins(t: TaskTimer) {
  await cancelByPrefix('focus|check');
  const elapsed = elapsedMs(t);
  const now = Date.now();
  const at = (minMark: number) => new Date(now + (minMark * 60_000 - elapsed));
  const base = { route: '/focus', params: { checkin: '1' }, kind: 'focus' };

  for (let m = t.checkinEveryMin; m < t.estimatedMin; m += t.checkinEveryMin) {
    if (m * 60_000 <= elapsed) continue;
    await scheduleAt(`focus|check|${t.id}|${m}`, at(m), {
      title: '🎯 Você ainda está focado nesta tarefa?',
      body: `"${t.title}" — ${m} de ${t.estimatedMin} min.`,
      data: base,
      channel: CHANNELS.focus,
      category: CATEGORIES.focusCheckin,
    });
  }
  if (t.estimatedMin * 60_000 > elapsed) {
    await scheduleAt(`focus|check|${t.id}|end`, at(t.estimatedMin), {
      title: '⏰ O tempo previsto acabou',
      body: `"${t.title}": terminou ou ainda está nela?`,
      data: base,
      channel: CHANNELS.focus,
      category: CATEGORIES.focusCheckin,
    });
  }
  for (let i = 1; i <= OVERRUN_MAX; i++) {
    const m = t.estimatedMin + i * OVERRUN_EVERY_MIN;
    if (m * 60_000 <= elapsed) continue;
    await scheduleAt(`focus|check|${t.id}|over${i}`, at(m), {
      title: `⚠️ ${i * OVERRUN_EVERY_MIN} min além do previsto`,
      body: `"${t.title}" — você ainda está focado nesta tarefa?`,
      data: base,
      channel: CHANNELS.focus,
      category: CATEGORIES.focusCheckin,
    });
  }
}

async function showOngoing(t: TaskTimer) {
  const remaining = t.estimatedMin * 60_000 - elapsedMs(t);
  const eta = addMinutes(new Date(), Math.max(0, Math.round(remaining / 60_000)));
  await presentNow('focus|ongoing', {
    title: t.status === 'paused' ? `⏸️ Pausado: ${t.title}` : `🎯 Fazendo agora: ${t.title}`,
    body: t.status === 'paused' ? 'Toque para retomar.' : `Previsto terminar às ${hhmmOf(eta)}.`,
    data: { route: '/focus', kind: 'focus' },
    channel: CHANNELS.focusOngoing,
    sticky: true,
    silent: true,
  });
}

export async function startFocus(title: string, estimatedMin: number, checkinEveryMin: number): Promise<TaskTimer> {
  const prev = await getActiveTimer();
  if (prev) await finishFocus(prev.id, 'abandoned');
  const id = await insertTimer(title.trim(), estimatedMin, checkinEveryMin);
  const t = (await getTimer(id))!;
  await scheduleCheckins(t);
  await showOngoing(t);
  return t;
}

export async function pauseFocus(id: number) {
  await updateTimer(id, { status: 'paused', pausedAt: new Date().toISOString() });
  await cancelByPrefix('focus|check');
  const t = await getTimer(id);
  if (t) await showOngoing(t);
}

export async function resumeFocus(id: number) {
  const t = await getTimer(id);
  if (!t || !t.pausedAt) return;
  const pausedMs = t.pausedMs + (Date.now() - new Date(t.pausedAt).getTime());
  await updateTimer(id, { status: 'running', pausedAt: null, pausedMs });
  const next = (await getTimer(id))!;
  await scheduleCheckins(next);
  await showOngoing(next);
}

export async function finishFocus(id: number, status: 'done' | 'abandoned') {
  const t = await getTimer(id);
  if (!t) return;
  let pausedMs = t.pausedMs;
  if (t.pausedAt) pausedMs += Date.now() - new Date(t.pausedAt).getTime();
  await updateTimer(id, { status, endedAt: new Date().toISOString(), pausedAt: null, pausedMs });
  await cancelByPrefix('focus|');
}

export async function recordCheckin(id: number, response: FocusCheckin['response']) {
  await addCheckin(id, response);
}

export async function saveBreadcrumb(id: number, note: string) {
  await updateTimer(id, { note });
}

export interface FocusMetrics {
  sessions: number;
  totalEstimatedMin: number;
  totalActualMin: number;
  lostMin: number; // soma do que passou do previsto
  medianRatio: number; // real / previsto
  onTimeRate: number; // % concluídas dentro do previsto (+10%)
  distractionWindows: { hour: number; rate: number; total: number }[];
  recent: { title: string; estimatedMin: number; actualMin: number; status: string; startedAt: string }[];
}

export async function computeMetrics(): Promise<FocusMetrics> {
  const timers = await listFinishedTimers(60);
  const done = timers.filter((t) => t.status === 'done');
  const rows = timers.map((t) => ({
    title: t.title,
    estimatedMin: t.estimatedMin,
    actualMin: Math.round(elapsedMs(t) / 60_000),
    status: t.status,
    startedAt: t.startedAt,
  }));
  const ratios = done
    .map((t) => elapsedMs(t) / 60_000 / t.estimatedMin)
    .filter((r) => isFinite(r) && r > 0)
    .sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
  const totalEstimatedMin = rows.reduce((s, r) => s + r.estimatedMin, 0);
  const totalActualMin = rows.reduce((s, r) => s + r.actualMin, 0);
  const lostMin = rows.reduce((s, r) => s + Math.max(0, r.actualMin - r.estimatedMin), 0);
  const onTime = done.filter((t) => elapsedMs(t) / 60_000 <= t.estimatedMin * 1.1).length;

  const byHour = await checkinsByHour();
  const distractionWindows = byHour
    .map((h) => ({ hour: h.hour, total: h.focused + h.distracted, rate: h.distracted / Math.max(1, h.focused + h.distracted) }))
    .filter((h) => h.total >= 2)
    .sort((a, b) => b.rate - a.rate);

  return {
    sessions: rows.length,
    totalEstimatedMin,
    totalActualMin,
    lostMin,
    medianRatio: median,
    onTimeRate: done.length ? onTime / done.length : 0,
    distractionWindows,
    recent: rows.slice(0, 15),
  };
}

/** Corrige a estimativa com base no histórico pessoal ("você costuma levar 1,6× o previsto"). */
export function suggestEstimate(minutes: number, medianRatio: number): number {
  if (medianRatio <= 1.05) return minutes;
  return Math.round((minutes * Math.min(medianRatio, 3)) / 5) * 5;
}
