import {
  addAppointment,
  addChecklistItem,
  addContact,
  addMedication,
  AppointmentInput,
  MedicationInput,
  setSetting,
  upsertRoutine,
} from '../db/repositories';
import { planAlerts } from './alertEngine';
import { syncGeofences } from './geofence';
import { generateFlashcards } from './training';

/** Itens fisiológicos e de segurança presentes em todo checklist de saída. */
export const UNIVERSAL_CHECKS: { context: 'physiological' | 'safety'; label: string; question: string }[] = [
  { context: 'physiological', label: 'Banheiro', question: 'Você foi ao banheiro antes de sair?' },
  { context: 'physiological', label: 'Água', question: 'Bebeu água?' },
  { context: 'physiological', label: 'Comida', question: 'Comeu alguma coisa ou levou um lanche?' },
  { context: 'safety', label: 'Fogão e ferro', question: 'Fogão, forno e ferro estão desligados?' },
  { context: 'safety', label: 'Torneiras e janelas', question: 'Torneiras fechadas e janelas trancadas?' },
  { context: 'safety', label: 'Porta', question: 'Vai trancar a porta ao sair?' },
];

export const COMMON_ITEMS = ['Chaves', 'Celular', 'Carteira', 'Óculos', 'Documentos', 'Remédios', 'Fone de ouvido', 'Carregador', 'Guarda-chuva', 'Máscara', 'Crachá', 'Garrafa de água'];

export interface OnboardingData {
  name: string;
  voice: boolean;
  wake: string;
  sleep: string;
  meals: { label: string; time: string }[];
  work: { time: string; weekdays: string } | null;
  meds: MedicationInput[];
  appointments: AppointmentInput[];
  items: string[];
  contacts: { name: string; phone: string; relation: string | null }[];
  challenge: 'word' | 'math';
}

/** Transforma as respostas da entrevista em rotina, matriz de alertas e checklists. */
export async function saveOnboarding(d: OnboardingData) {
  await setSetting('userName', d.name.trim());
  await setSetting('ttsEnabled', d.voice);
  await setSetting('challenge', d.challenge);

  await upsertRoutine('wake', 'Acordar', d.wake);
  await upsertRoutine('sleep', 'Dormir', d.sleep);
  for (const m of d.meals) await upsertRoutine('meal', m.label, m.time);
  if (d.work) await upsertRoutine('work', 'Começar o trabalho/estudo', d.work.time, d.work.weekdays);
  // Recall noturno: 1 h antes de dormir.
  const [h, mi] = d.sleep.split(':').map(Number);
  const recallH = (h + 23) % 24;
  await upsertRoutine('recall', 'Recall do dia', `${String(recallH).padStart(2, '0')}:${String(mi).padStart(2, '0')}`);

  for (const m of d.meds) await addMedication(m);
  for (const a of d.appointments) await addAppointment(a);

  let order = 0;
  for (const u of UNIVERSAL_CHECKS) await addChecklistItem(u.context, u.label, u.question, false, order++);
  for (const it of d.items) await addChecklistItem('exit', it, `Pegou: ${it}?`, true, order++);
  if (d.meds.length) await addChecklistItem('exit', 'Remédios do dia', 'Levou os remédios que vai precisar tomar fora de casa?', false, order++);

  for (const c of d.contacts) await addContact(c.name, c.phone, c.relation);

  await setSetting('onboarded', true);
  await generateFlashcards();
  await planAlerts();
  await syncGeofences().catch(() => undefined);
}
