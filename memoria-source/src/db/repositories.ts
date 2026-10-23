import { dayKey, normalize } from '../utils/time';
import { getDb } from './database';

const now = () => new Date().toISOString();

// ───────────────────────────── Tipos ─────────────────────────────

export type RoutineKind = 'wake' | 'sleep' | 'meal' | 'work' | 'recall' | 'custom';
export interface UserRoutine {
  id: number;
  label: string;
  kind: RoutineKind;
  time: string;
  weekdays: string;
  remind: number;
}

export interface Medication {
  id: number;
  name: string;
  dose: string | null;
  instructions: string | null;
  times: string[];
  barcode: string | null;
  stock: number | null;
  refillThreshold: number;
  critical: number;
  active: number;
}

export interface Appointment {
  id: number;
  title: string;
  location: string | null;
  notes: string | null;
  startsAt: string | null;
  time: string | null;
  weekdays: string | null;
  leadMin: number;
  bringItems: string[];
  critical: number;
  active: number;
}

export type ChecklistContext = 'exit' | 'physiological' | 'safety';
export interface ChecklistItem {
  id: number;
  context: ChecklistContext;
  label: string;
  question: string;
  isEssentialItem: number;
  sortOrder: number;
  active: number;
  lastCheckedAt: string | null;
}

export interface TaskTimer {
  id: number;
  title: string;
  estimatedMin: number;
  checkinEveryMin: number;
  startedAt: string;
  endedAt: string | null;
  pausedAt: string | null;
  pausedMs: number;
  status: 'running' | 'paused' | 'done' | 'abandoned';
  note: string | null;
}

export interface FocusCheckin {
  id: number;
  timerId: number;
  at: string;
  hour: number;
  response: 'focused' | 'distracted';
}

export interface MemoryExercise {
  id: number;
  type: 'flashcard' | 'face';
  sourceKey: string;
  prompt: string;
  answer: string;
  imageUri: string | null;
  box: number;
  dueAt: string;
  correctCount: number;
  wrongCount: number;
  lastReviewedAt: string | null;
  stale: number;
}

export interface Person {
  id: number;
  name: string;
  relation: string | null;
  photoUri: string;
}

export interface ItemLocation {
  id: number;
  item: string;
  itemNorm: string;
  place: string;
  rawText: string | null;
  createdAt: string;
}

export interface EmergencyContact {
  id: number;
  name: string;
  phone: string;
  relation: string | null;
  sortOrder: number;
}

export interface Place {
  id: number;
  label: string;
  latitude: number;
  longitude: number;
  radius: number;
  isHome: number;
  expiresAt: string | null;
}

export interface AlertLog {
  id: number;
  alertKey: string;
  kind: 'med' | 'appointment' | 'routine' | 'refill' | 'recall' | 'water' | 'test';
  refId: number | null;
  title: string;
  body: string;
  critical: number;
  scheduledFor: string;
  snoozeCount: number;
  acknowledgedAt: string | null;
  method: string | null;
}

export interface QuickNote {
  id: number;
  text: string;
  done: number;
  createdAt: string;
}

export interface DailyRecallRow {
  id: number;
  date: string;
  expectedJson: string;
  selectedJson: string;
  score: number;
}

// ───────────────────────────── Settings ─────────────────────────────

export interface AppSettings {
  onboarded: boolean;
  userName: string;
  ttsEnabled: boolean;
  ttsRate: number;
  challenge: 'word' | 'math';
  hydration: boolean;
  escalationMinutes: number[];
  lastExitChecklistAt: string | null;
  geofenceEnabled: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  onboarded: false,
  userName: '',
  ttsEnabled: true,
  ttsRate: 0.9,
  challenge: 'math',
  hydration: true,
  escalationMinutes: [0, 3, 6, 10, 15, 25, 40],
  lastExitChecklistAt: null,
  geofenceEnabled: true,
};

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ key: string; value: string }>('SELECT key, value FROM Settings');
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // valor corrompido: mantém o padrão
    }
  }
  return out as unknown as AppSettings;
}

export async function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
  const db = await getDb();
  await db.runAsync('INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)', key, JSON.stringify(value));
}

// ───────────────────────────── UserRoutine ─────────────────────────────

export async function listRoutine(): Promise<UserRoutine[]> {
  const db = await getDb();
  return db.getAllAsync<UserRoutine>('SELECT * FROM UserRoutine ORDER BY time');
}

export async function upsertRoutine(kind: RoutineKind, label: string, time: string, weekdays = '1234567') {
  const db = await getDb();
  // wake/sleep/recall são únicos; refeições e "custom" podem repetir.
  if (kind === 'wake' || kind === 'sleep' || kind === 'recall' || kind === 'work') {
    const existing = await db.getFirstAsync<{ id: number }>('SELECT id FROM UserRoutine WHERE kind = ?', kind);
    if (existing) {
      await db.runAsync('UPDATE UserRoutine SET label = ?, time = ?, weekdays = ? WHERE id = ?', label, time, weekdays, existing.id);
      return;
    }
  }
  await db.runAsync(
    'INSERT INTO UserRoutine (label, kind, time, weekdays, createdAt) VALUES (?, ?, ?, ?, ?)',
    label, kind, time, weekdays, now(),
  );
}

export async function deleteRoutine(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM UserRoutine WHERE id = ?', id);
}

export async function getRoutineTime(kind: RoutineKind): Promise<string | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ time: string }>('SELECT time FROM UserRoutine WHERE kind = ? LIMIT 1', kind);
  return r?.time ?? null;
}

// ───────────────────────────── Medications ─────────────────────────────

type MedRow = Omit<Medication, 'times'> & { times: string };
const toMed = (r: MedRow): Medication => ({ ...r, times: JSON.parse(r.times) });

export async function listMedications(onlyActive = true): Promise<Medication[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<MedRow>(
    `SELECT * FROM Medications ${onlyActive ? 'WHERE active = 1' : ''} ORDER BY name`,
  );
  return rows.map(toMed);
}

export async function getMedication(id: number): Promise<Medication | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<MedRow>('SELECT * FROM Medications WHERE id = ?', id);
  return r ? toMed(r) : null;
}

export type MedicationInput = Omit<Medication, 'id' | 'active' | 'refillThreshold'> & { refillThreshold?: number };

export async function addMedication(m: MedicationInput): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO Medications (name, dose, instructions, times, barcode, stock, refillThreshold, critical, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    m.name, m.dose, m.instructions, JSON.stringify(m.times), m.barcode, m.stock, m.refillThreshold ?? 7, m.critical, now(),
  );
  return res.lastInsertRowId;
}

export async function updateMedication(id: number, m: Partial<MedicationInput>) {
  const db = await getDb();
  const cur = await getMedication(id);
  if (!cur) return;
  const next = { ...cur, ...m };
  await db.runAsync(
    `UPDATE Medications SET name=?, dose=?, instructions=?, times=?, barcode=?, stock=?, refillThreshold=?, critical=? WHERE id=?`,
    next.name, next.dose, next.instructions, JSON.stringify(next.times), next.barcode, next.stock, next.refillThreshold, next.critical, id,
  );
}

export async function deleteMedication(id: number) {
  const db = await getDb();
  await db.runAsync('UPDATE Medications SET active = 0 WHERE id = ?', id);
  await db.runAsync(`UPDATE MemoryExercises SET stale = 1 WHERE sourceKey LIKE ?`, `med:${id}:%`);
}

export async function decrementStock(medId: number) {
  const db = await getDb();
  await db.runAsync('UPDATE Medications SET stock = stock - 1 WHERE id = ? AND stock IS NOT NULL AND stock > 0', medId);
}

// ───────────────────────────── Appointments ─────────────────────────────

type ApptRow = Omit<Appointment, 'bringItems'> & { bringItems: string };
const toAppt = (r: ApptRow): Appointment => ({ ...r, bringItems: JSON.parse(r.bringItems || '[]') });

export async function listAppointments(): Promise<Appointment[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<ApptRow>('SELECT * FROM Appointments WHERE active = 1 ORDER BY COALESCE(startsAt, time)');
  return rows.map(toAppt);
}

export async function getAppointment(id: number): Promise<Appointment | null> {
  const db = await getDb();
  const r = await db.getFirstAsync<ApptRow>('SELECT * FROM Appointments WHERE id = ?', id);
  return r ? toAppt(r) : null;
}

export type AppointmentInput = Omit<Appointment, 'id' | 'active'>;

export async function addAppointment(a: AppointmentInput): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    `INSERT INTO Appointments (title, location, notes, startsAt, time, weekdays, leadMin, bringItems, critical, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    a.title, a.location, a.notes, a.startsAt, a.time, a.weekdays, a.leadMin, JSON.stringify(a.bringItems), a.critical, now(),
  );
  return res.lastInsertRowId;
}

export async function deleteAppointment(id: number) {
  const db = await getDb();
  await db.runAsync('UPDATE Appointments SET active = 0 WHERE id = ?', id);
  await db.runAsync(`UPDATE MemoryExercises SET stale = 1 WHERE sourceKey LIKE ?`, `appt:${id}:%`);
}

// ───────────────────────────── DynamicChecklists ─────────────────────────────

export async function listChecklist(contexts?: ChecklistContext[]): Promise<ChecklistItem[]> {
  const db = await getDb();
  if (contexts?.length) {
    const ph = contexts.map(() => '?').join(',');
    return db.getAllAsync<ChecklistItem>(
      `SELECT * FROM DynamicChecklists WHERE active = 1 AND context IN (${ph}) ORDER BY sortOrder, id`,
      ...contexts,
    );
  }
  return db.getAllAsync<ChecklistItem>('SELECT * FROM DynamicChecklists WHERE active = 1 ORDER BY sortOrder, id');
}

export async function addChecklistItem(context: ChecklistContext, label: string, question: string, isEssentialItem = false, sortOrder = 0) {
  const db = await getDb();
  const dup = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM DynamicChecklists WHERE context = ? AND label = ? AND active = 1', context, label,
  );
  if (dup) return dup.id;
  const res = await db.runAsync(
    'INSERT INTO DynamicChecklists (context, label, question, isEssentialItem, sortOrder) VALUES (?, ?, ?, ?, ?)',
    context, label, question, isEssentialItem ? 1 : 0, sortOrder,
  );
  return res.lastInsertRowId;
}

export async function removeChecklistItem(id: number) {
  const db = await getDb();
  await db.runAsync('UPDATE DynamicChecklists SET active = 0 WHERE id = ?', id);
}

export async function markChecklistItems(ids: number[]) {
  if (!ids.length) return;
  const db = await getDb();
  const ph = ids.map(() => '?').join(',');
  await db.runAsync(`UPDATE DynamicChecklists SET lastCheckedAt = ? WHERE id IN (${ph})`, now(), ...ids);
}

export async function startChecklistRun(trigger: string, appointmentId: number | null, items: string[]): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO ChecklistRuns (trigger, appointmentId, itemsJson, startedAt) VALUES (?, ?, ?, ?)',
    trigger, appointmentId, JSON.stringify(items), now(),
  );
  return res.lastInsertRowId;
}

export async function completeChecklistRun(id: number) {
  const db = await getDb();
  await db.runAsync('UPDATE ChecklistRuns SET completedAt = ? WHERE id = ?', now(), id);
}

// ───────────────────────────── TaskTimers / Foco ─────────────────────────────

export async function getActiveTimer(): Promise<TaskTimer | null> {
  const db = await getDb();
  return db.getFirstAsync<TaskTimer>(
    `SELECT * FROM TaskTimers WHERE status IN ('running','paused') ORDER BY id DESC LIMIT 1`,
  );
}

export async function getTimer(id: number): Promise<TaskTimer | null> {
  const db = await getDb();
  return db.getFirstAsync<TaskTimer>('SELECT * FROM TaskTimers WHERE id = ?', id);
}

export async function insertTimer(title: string, estimatedMin: number, checkinEveryMin: number): Promise<number> {
  const db = await getDb();
  const res = await db.runAsync(
    'INSERT INTO TaskTimers (title, estimatedMin, checkinEveryMin, startedAt) VALUES (?, ?, ?, ?)',
    title, estimatedMin, checkinEveryMin, now(),
  );
  return res.lastInsertRowId;
}

export async function updateTimer(id: number, patch: Partial<TaskTimer>) {
  const db = await getDb();
  const keys = Object.keys(patch) as (keyof TaskTimer)[];
  if (!keys.length) return;
  const set = keys.map((k) => `${k} = ?`).join(', ');
  await db.runAsync(`UPDATE TaskTimers SET ${set} WHERE id = ?`, ...keys.map((k) => patch[k] as string | number | null), id);
}

export async function listFinishedTimers(limit = 60): Promise<TaskTimer[]> {
  const db = await getDb();
  return db.getAllAsync<TaskTimer>(
    `SELECT * FROM TaskTimers WHERE status IN ('done','abandoned') ORDER BY id DESC LIMIT ?`,
    limit,
  );
}

export async function listTimersOfDay(day: string): Promise<TaskTimer[]> {
  const db = await getDb();
  const all = await db.getAllAsync<TaskTimer>(`SELECT * FROM TaskTimers WHERE startedAt >= ? ORDER BY id`, new Date(Date.now() - 36 * 3600_000).toISOString());
  return all.filter((t) => dayKey(new Date(t.startedAt)) === day);
}

export async function addCheckin(timerId: number, response: FocusCheckin['response']) {
  const db = await getDb();
  const d = new Date();
  await db.runAsync(
    'INSERT INTO FocusCheckins (timerId, at, hour, response) VALUES (?, ?, ?, ?)',
    timerId, d.toISOString(), d.getHours(), response,
  );
}

export async function checkinsByHour(): Promise<{ hour: number; focused: number; distracted: number }[]> {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT hour,
            SUM(CASE WHEN response = 'focused' THEN 1 ELSE 0 END) AS focused,
            SUM(CASE WHEN response = 'distracted' THEN 1 ELSE 0 END) AS distracted
       FROM FocusCheckins GROUP BY hour ORDER BY hour`,
  );
}

export async function checkinsOf(timerId: number): Promise<FocusCheckin[]> {
  const db = await getDb();
  return db.getAllAsync<FocusCheckin>('SELECT * FROM FocusCheckins WHERE timerId = ? ORDER BY at', timerId);
}

// ───────────────────────────── MemoryExercises ─────────────────────────────

export async function upsertExercise(e: Pick<MemoryExercise, 'type' | 'sourceKey' | 'prompt' | 'answer' | 'imageUri'>) {
  const db = await getDb();
  // Mantém o progresso (box/dueAt) se o card já existe; atualiza texto caso a fonte tenha mudado.
  await db.runAsync(
    `INSERT INTO MemoryExercises (type, sourceKey, prompt, answer, imageUri, dueAt)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(sourceKey) DO UPDATE SET prompt = excluded.prompt, answer = excluded.answer,
       imageUri = excluded.imageUri, stale = 0`,
    e.type, e.sourceKey, e.prompt, e.answer, e.imageUri, now(),
  );
}

export async function markAllExercisesStale(prefixes: string[]) {
  const db = await getDb();
  for (const p of prefixes) await db.runAsync('UPDATE MemoryExercises SET stale = 1 WHERE sourceKey LIKE ?', `${p}%`);
}

export async function dueExercises(type: MemoryExercise['type'], limit = 20): Promise<MemoryExercise[]> {
  const db = await getDb();
  return db.getAllAsync<MemoryExercise>(
    'SELECT * FROM MemoryExercises WHERE type = ? AND stale = 0 AND dueAt <= ? ORDER BY box, dueAt LIMIT ?',
    type, now(), limit,
  );
}

export async function countDue(type: MemoryExercise['type']): Promise<number> {
  const db = await getDb();
  const r = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) AS c FROM MemoryExercises WHERE type = ? AND stale = 0 AND dueAt <= ?', type, now(),
  );
  return r?.c ?? 0;
}

export async function saveReview(id: number, box: number, dueAt: string, correct: boolean) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE MemoryExercises SET box = ?, dueAt = ?, lastReviewedAt = ?,
       correctCount = correctCount + ?, wrongCount = wrongCount + ? WHERE id = ?`,
    box, dueAt, now(), correct ? 1 : 0, correct ? 0 : 1, id,
  );
}

// ───────────────────────────── People ─────────────────────────────

export async function listPeople(): Promise<Person[]> {
  const db = await getDb();
  return db.getAllAsync<Person>('SELECT * FROM People ORDER BY name');
}

export async function addPerson(name: string, relation: string | null, photoUri: string) {
  const db = await getDb();
  const res = await db.runAsync('INSERT INTO People (name, relation, photoUri, createdAt) VALUES (?, ?, ?, ?)', name, relation, photoUri, now());
  return res.lastInsertRowId;
}

export async function deletePerson(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM People WHERE id = ?', id);
  await db.runAsync('DELETE FROM MemoryExercises WHERE sourceKey = ?', `person:${id}`);
}

// ───────────────────────────── DailyRecall ─────────────────────────────

export async function saveDailyRecall(date: string, expected: unknown, selected: unknown, score: number) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO DailyRecall (date, expectedJson, selectedJson, score, createdAt) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET expectedJson = excluded.expectedJson, selectedJson = excluded.selectedJson, score = excluded.score`,
    date, JSON.stringify(expected), JSON.stringify(selected), score, now(),
  );
}

export async function recentRecalls(limit = 14): Promise<DailyRecallRow[]> {
  const db = await getDb();
  return db.getAllAsync<DailyRecallRow>('SELECT * FROM DailyRecall ORDER BY date DESC LIMIT ?', limit);
}

// ───────────────────────────── Achados e Perdidos ─────────────────────────────

export async function saveItemLocation(item: string, place: string, rawText: string | null) {
  const db = await getDb();
  await db.runAsync(
    'INSERT INTO ItemLocations (item, itemNorm, place, rawText, createdAt) VALUES (?, ?, ?, ?, ?)',
    item.trim(), normalize(item), place.trim(), rawText, now(),
  );
}

/** Último local conhecido de cada item. */
export async function latestItemLocations(): Promise<ItemLocation[]> {
  const db = await getDb();
  return db.getAllAsync<ItemLocation>(
    `SELECT l.* FROM ItemLocations l
       JOIN (SELECT itemNorm, MAX(id) AS maxId FROM ItemLocations GROUP BY itemNorm) m ON m.maxId = l.id
      ORDER BY l.createdAt DESC`,
  );
}

export async function itemHistory(itemNorm: string): Promise<ItemLocation[]> {
  const db = await getDb();
  return db.getAllAsync<ItemLocation>('SELECT * FROM ItemLocations WHERE itemNorm = ? ORDER BY id DESC LIMIT 5', itemNorm);
}

export async function deleteItem(itemNorm: string) {
  const db = await getDb();
  await db.runAsync('DELETE FROM ItemLocations WHERE itemNorm = ?', itemNorm);
}

// ───────────────────────────── Contatos de emergência ─────────────────────────────

export async function listContacts(): Promise<EmergencyContact[]> {
  const db = await getDb();
  return db.getAllAsync<EmergencyContact>('SELECT * FROM EmergencyContacts ORDER BY sortOrder, id');
}

export async function addContact(name: string, phone: string, relation: string | null) {
  const db = await getDb();
  await db.runAsync('INSERT INTO EmergencyContacts (name, phone, relation) VALUES (?, ?, ?)', name, phone, relation);
}

export async function deleteContact(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM EmergencyContacts WHERE id = ?', id);
}

// ───────────────────────────── Places ─────────────────────────────

export async function listPlaces(): Promise<Place[]> {
  const db = await getDb();
  await db.runAsync('DELETE FROM Places WHERE expiresAt IS NOT NULL AND expiresAt < ?', now());
  return db.getAllAsync<Place>('SELECT * FROM Places ORDER BY isHome DESC, id');
}

export async function setHome(latitude: number, longitude: number, radius = 120) {
  const db = await getDb();
  await db.runAsync('DELETE FROM Places WHERE isHome = 1');
  await db.runAsync('INSERT INTO Places (label, latitude, longitude, radius, isHome) VALUES (?, ?, ?, ?, 1)', 'Casa', latitude, longitude, radius);
}

export async function addTemporaryPlace(label: string, latitude: number, longitude: number, hours = 12) {
  const db = await getDb();
  const exp = new Date(Date.now() + hours * 3600_000).toISOString();
  await db.runAsync('INSERT INTO Places (label, latitude, longitude, radius, isHome, expiresAt) VALUES (?, ?, ?, 100, 0, ?)', label, latitude, longitude, exp);
}

export async function deletePlace(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM Places WHERE id = ?', id);
}

// ───────────────────────────── AlertLog ─────────────────────────────

export async function ensureAlertLog(a: Omit<AlertLog, 'id' | 'snoozeCount' | 'acknowledgedAt' | 'method'>) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO AlertLog (alertKey, kind, refId, title, body, critical, scheduledFor) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(alertKey) DO UPDATE SET title = excluded.title, body = excluded.body, critical = excluded.critical`,
    a.alertKey, a.kind, a.refId, a.title, a.body, a.critical, a.scheduledFor,
  );
}

export async function getAlert(alertKey: string): Promise<AlertLog | null> {
  const db = await getDb();
  return db.getFirstAsync<AlertLog>('SELECT * FROM AlertLog WHERE alertKey = ?', alertKey);
}

export async function acknowledgedKeys(fromIso: string): Promise<Set<string>> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ alertKey: string }>(
    'SELECT alertKey FROM AlertLog WHERE scheduledFor >= ? AND acknowledgedAt IS NOT NULL', fromIso,
  );
  return new Set(rows.map((r) => r.alertKey));
}

export async function snoozedAlerts(fromIso: string): Promise<AlertLog[]> {
  const db = await getDb();
  return db.getAllAsync<AlertLog>(
    'SELECT * FROM AlertLog WHERE scheduledFor >= ? AND acknowledgedAt IS NULL AND snoozeCount > 0', fromIso,
  );
}

export async function markAlertAcknowledged(alertKey: string, method: string) {
  const db = await getDb();
  await db.runAsync('UPDATE AlertLog SET acknowledgedAt = ?, method = ? WHERE alertKey = ?', now(), method, alertKey);
}

export async function incrementSnooze(alertKey: string): Promise<number> {
  const db = await getDb();
  await db.runAsync('UPDATE AlertLog SET snoozeCount = snoozeCount + 1 WHERE alertKey = ?', alertKey);
  const r = await db.getFirstAsync<{ snoozeCount: number }>('SELECT snoozeCount FROM AlertLog WHERE alertKey = ?', alertKey);
  return r?.snoozeCount ?? 1;
}

/** Alertas críticos que já venceram e ainda não foram confirmados (para o "Próximo Passo"). */
export async function overdueCritical(sinceIso: string): Promise<AlertLog[]> {
  const db = await getDb();
  return db.getAllAsync<AlertLog>(
    `SELECT * FROM AlertLog WHERE critical = 1 AND acknowledgedAt IS NULL AND scheduledFor <= ? AND scheduledFor >= ?
     ORDER BY scheduledFor`,
    now(), sinceIso,
  );
}

export async function alertsOfDay(startIso: string, endIso: string): Promise<AlertLog[]> {
  const db = await getDb();
  return db.getAllAsync<AlertLog>(
    'SELECT * FROM AlertLog WHERE scheduledFor >= ? AND scheduledFor < ? ORDER BY scheduledFor', startIso, endIso,
  );
}

// ───────────────────────────── QuickNotes ─────────────────────────────

export async function listNotes(includeDone = false): Promise<QuickNote[]> {
  const db = await getDb();
  return db.getAllAsync<QuickNote>(
    `SELECT * FROM QuickNotes ${includeDone ? '' : 'WHERE done = 0'} ORDER BY id DESC LIMIT 100`,
  );
}

export async function addNote(text: string) {
  const db = await getDb();
  await db.runAsync('INSERT INTO QuickNotes (text, createdAt) VALUES (?, ?)', text.trim(), now());
}

export async function setNoteDone(id: number, done: boolean) {
  const db = await getDb();
  await db.runAsync('UPDATE QuickNotes SET done = ? WHERE id = ?', done ? 1 : 0, id);
}

export async function deleteNote(id: number) {
  const db = await getDb();
  await db.runAsync('DELETE FROM QuickNotes WHERE id = ?', id);
}
