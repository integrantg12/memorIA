import {
  addDays,
  atTime,
  dayKey,
  hhmmOf,
  isoWeekday,
  startOfDay,
  WEEKDAY_LONG,
  weekdaysLabel,
} from '../utils/time';
import {
  alertsOfDay,
  dueExercises,
  latestItemLocations,
  listAppointments,
  listMedications,
  listPeople,
  listRoutine,
  listTimersOfDay,
  markAllExercisesStale,
  MemoryExercise,
  saveReview,
  upsertExercise,
} from '../db/repositories';

/**
 * TREINO COGNITIVO
 * Repetição espaçada no sistema Leitner: acertou sobe de caixa (intervalo maior),
 * errou volta para a caixa 1 (revisar hoje de novo).
 */
const BOX_INTERVAL_DAYS = [0, 0, 1, 3, 7, 16];
export const MAX_BOX = 5;

export function nextReview(box: number, correct: boolean): { box: number; dueAt: string } {
  if (!correct) return { box: 1, dueAt: new Date(Date.now() + 10 * 60_000).toISOString() };
  const nb = Math.min(MAX_BOX, box + 1);
  const due = startOfDay(addDays(new Date(), BOX_INTERVAL_DAYS[nb]));
  due.setHours(4);
  return { box: nb, dueAt: due.toISOString() };
}

export async function grade(card: MemoryExercise, correct: boolean) {
  const r = nextReview(card.box, correct);
  await saveReview(card.id, r.box, r.dueAt, correct);
}

/** Recria os flashcards a partir dos dados reais da semana (mantendo o progresso de cada um). */
export async function generateFlashcards() {
  await markAllExercisesStale(['med:', 'appt:', 'item:']);
  const [meds, appts, items] = await Promise.all([listMedications(), listAppointments(), latestItemLocations()]);

  for (const m of meds) {
    await upsertExercise({
      type: 'flashcard',
      sourceKey: `med:${m.id}:times`,
      prompt: `Em quais horários você toma ${m.name}?`,
      answer: m.times.join(' e ') + (m.dose ? ` — ${m.dose}` : ''),
      imageUri: null,
    });
    if (m.instructions) {
      await upsertExercise({
        type: 'flashcard',
        sourceKey: `med:${m.id}:instr`,
        prompt: `Qual o cuidado ao tomar ${m.name}?`,
        answer: m.instructions,
        imageUri: null,
      });
    }
  }

  const today = startOfDay();
  const weekEnd = addDays(today, 7);
  for (const a of appts) {
    let when: string | null = null;
    if (a.startsAt) {
      const d = new Date(a.startsAt);
      if (d >= today && d <= weekEnd) when = `${WEEKDAY_LONG[isoWeekday(d)]}, ${d.getDate()}/${d.getMonth() + 1} às ${hhmmOf(d)}`;
    } else if (a.weekdays && a.time) {
      when = `${weekdaysLabel(a.weekdays)} às ${a.time}`;
    }
    if (!when) continue;
    await upsertExercise({
      type: 'flashcard',
      sourceKey: `appt:${a.id}:when`,
      prompt: `Quando é: ${a.title}?`,
      answer: when + (a.location ? ` — ${a.location}` : ''),
      imageUri: null,
    });
    if (a.bringItems.length) {
      await upsertExercise({
        type: 'flashcard',
        sourceKey: `appt:${a.id}:bring`,
        prompt: `O que você precisa levar para: ${a.title}?`,
        answer: a.bringItems.join(', '),
        imageUri: null,
      });
    }
  }

  for (const it of items.slice(0, 15)) {
    await upsertExercise({
      type: 'flashcard',
      sourceKey: `item:${it.itemNorm}`,
      prompt: `Onde você guardou: ${it.item}?`,
      answer: it.place,
      imageUri: null,
    });
  }

  const people = await listPeople();
  for (const p of people) {
    await upsertExercise({
      type: 'face',
      sourceKey: `person:${p.id}`,
      prompt: 'Quem é esta pessoa?',
      answer: p.name,
      imageUri: p.photoUri,
    });
  }
}

export async function loadDueFlashcards(): Promise<MemoryExercise[]> {
  await generateFlashcards();
  return dueExercises('flashcard', 15);
}

export interface RecallTask {
  id: string;
  label: string;
  /** O que o registro do app diz: concluído (true), não concluído (false) ou sem registro (null). */
  recordSaysDone: boolean | null;
}

/** Lista do dia para o Recall noturno, cruzando agenda e registros reais. */
export async function buildRecallList(day: Date = new Date()): Promise<RecallTask[]> {
  const start = startOfDay(day);
  const end = addDays(start, 1);
  const list: RecallTask[] = [];
  const alerts = await alertsOfDay(start.toISOString(), end.toISOString());
  for (const a of alerts) {
    if (a.kind !== 'med' && a.kind !== 'appointment') continue;
    if (a.alertKey.endsWith(':eve')) continue;
    if (new Date(a.scheduledFor) > new Date()) continue;
    list.push({
      id: a.alertKey,
      label: a.title.replace(/^[^\p{L}\d]+/u, ''),
      recordSaysDone: a.acknowledgedAt ? a.method !== 'skipped' : false,
    });
  }
  const timers = await listTimersOfDay(dayKey(start));
  for (const t of timers) list.push({ id: `timer:${t.id}`, label: `Tarefa: ${t.title}`, recordSaysDone: t.status === 'done' });

  const routine = await listRoutine();
  for (const r of routine) {
    if (r.kind !== 'meal') continue;
    if (atTime(day, r.time) > new Date()) continue;
    list.push({ id: `routine:${r.id}`, label: r.label, recordSaysDone: null });
  }
  return list;
}
