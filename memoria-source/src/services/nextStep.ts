import { getActiveTimer, overdueCritical } from '../db/repositories';
import { addMinutes, hhmmOf, relative } from '../utils/time';
import { buildOccurrences } from './alertEngine';
import { elapsedMs } from './focusTimer';

/**
 * "PRÓXIMO PASSO" — a única coisa que a tela inicial mostra.
 * Prioridade: alerta crítico vencido > tarefa em andamento > próximo evento da agenda.
 */
export interface NextStep {
  kind: 'overdue' | 'focus' | 'med' | 'appointment' | 'routine' | 'free';
  title: string;
  detail: string;
  when: string;
  speech: string;
  action?: { label: string; route: string; params?: Record<string, string> };
}

export async function computeNextStep(): Promise<NextStep> {
  const now = new Date();

  const overdue = await overdueCritical(addMinutes(now, -6 * 60).toISOString());
  if (overdue.length) {
    const a = overdue[0];
    return {
      kind: 'overdue',
      title: a.title,
      detail: a.body,
      when: `Atrasado ${relative(new Date(a.scheduledFor), now).replace('há ', '')}`,
      speech: `Atenção. Ainda não foi confirmado: ${a.body}`,
      action: { label: 'Resolver agora', route: '/alert', params: { key: a.alertKey } },
    };
  }

  const timer = await getActiveTimer();
  if (timer) {
    const left = timer.estimatedMin - Math.round(elapsedMs(timer) / 60_000);
    return {
      kind: 'focus',
      title: timer.title,
      detail: timer.status === 'paused' ? 'Tarefa pausada.' : left >= 0 ? `Faltam ${left} min do previsto.` : `Passou ${-left} min do previsto.`,
      when: 'Fazendo agora',
      speech: `Você está fazendo: ${timer.title}.`,
      action: { label: 'Abrir monitor de foco', route: '/focus' },
    };
  }

  const occ = (await buildOccurrences(now, addMinutes(now, 24 * 60))).filter(
    (o) => o.kind === 'med' || o.kind === 'appointment' || o.kind === 'routine' || o.kind === 'recall',
  );
  const next = occ.find((o) => o.at >= now);
  if (next) {
    const kind: NextStep['kind'] = next.kind === 'med' ? 'med' : next.kind === 'appointment' ? 'appointment' : 'routine';
    const action =
      next.kind === 'appointment'
        ? { label: 'Ver o que levar', route: '/exit-checklist', params: { appointmentId: String(next.refId), trigger: 'manual' } }
        : undefined;
    return {
      kind,
      title: next.title.replace(/ — \d\d:\d\d$/, ''),
      detail: next.body,
      when: `${hhmmOf(next.at)} · ${relative(next.at, now)}`,
      speech: `Seu próximo passo, ${relative(next.at, now)}: ${next.body}`,
      action,
    };
  }

  return {
    kind: 'free',
    title: 'Nada urgente agora',
    detail: 'Que tal escolher UMA tarefa e iniciar o Monitor de Foco?',
    when: 'Tempo livre',
    speech: 'Nada urgente agora. Que tal escolher uma tarefa e iniciar o monitor de foco?',
    action: { label: 'Começar uma tarefa', route: '/focus' },
  };
}
