/**
 * Esquema do banco local (SQLite + SQLCipher). Cada entrada de MIGRATIONS é aplicada uma única
 * vez, em ordem, e o índice é guardado em PRAGMA user_version.
 *
 * Tabelas pedidas na especificação: UserRoutine, Medications, Appointments, MemoryExercises,
 * TaskTimers e DynamicChecklists. As demais dão suporte aos módulos (log de alertas, check-ins
 * de foco, achados e perdidos, contatos, locais de geofencing, pessoas e recall diário).
 */
export const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS Settings (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
  );

  -- Blocos fixos do dia: acordar, refeições, trabalho, dormir, recall noturno…
  CREATE TABLE IF NOT EXISTS UserRoutine (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    label       TEXT NOT NULL,
    kind        TEXT NOT NULL,                 -- wake | sleep | meal | work | recall | custom
    time        TEXT NOT NULL,                 -- HH:MM
    weekdays    TEXT NOT NULL DEFAULT '1234567',
    remind      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Medications (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    dose            TEXT,
    instructions    TEXT,
    times           TEXT NOT NULL,             -- JSON ["08:00","20:00"]
    barcode         TEXT,                      -- código da caixa (descarte cognitivo por scanner)
    stock           INTEGER,                   -- doses restantes
    refillThreshold INTEGER NOT NULL DEFAULT 7,
    critical        INTEGER NOT NULL DEFAULT 1,
    active          INTEGER NOT NULL DEFAULT 1,
    createdAt       TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS Appointments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    title       TEXT NOT NULL,
    location    TEXT,
    notes       TEXT,
    startsAt    TEXT,                          -- ISO para compromisso único
    time        TEXT,                          -- HH:MM para compromisso fixo
    weekdays    TEXT,                          -- preenchido => recorrente
    leadMin     INTEGER NOT NULL DEFAULT 30,   -- aviso "hora de se arrumar/sair"
    bringItems  TEXT NOT NULL DEFAULT '[]',    -- JSON ["Exames","Cartão do SUS"]
    critical    INTEGER NOT NULL DEFAULT 0,
    active      INTEGER NOT NULL DEFAULT 1,
    createdAt   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS DynamicChecklists (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    context        TEXT NOT NULL,              -- exit | physiological | safety
    label          TEXT NOT NULL,              -- "Carteira"
    question       TEXT NOT NULL,              -- "Pegou a carteira?"
    isEssentialItem INTEGER NOT NULL DEFAULT 0,
    sortOrder      INTEGER NOT NULL DEFAULT 0,
    active         INTEGER NOT NULL DEFAULT 1,
    lastCheckedAt  TEXT
  );

  CREATE TABLE IF NOT EXISTS ChecklistRuns (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    trigger       TEXT NOT NULL,               -- geofence | manual | appointment
    appointmentId INTEGER,
    itemsJson     TEXT NOT NULL,
    startedAt     TEXT NOT NULL,
    completedAt   TEXT
  );

  CREATE TABLE IF NOT EXISTS TaskTimers (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    title            TEXT NOT NULL,
    estimatedMin     INTEGER NOT NULL,
    checkinEveryMin  INTEGER NOT NULL DEFAULT 15,
    startedAt        TEXT NOT NULL,
    endedAt          TEXT,
    pausedAt         TEXT,
    pausedMs         INTEGER NOT NULL DEFAULT 0,
    status           TEXT NOT NULL DEFAULT 'running', -- running | paused | done | abandoned
    note             TEXT                              -- "onde parei" (âncora de contexto)
  );

  CREATE TABLE IF NOT EXISTS FocusCheckins (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    timerId   INTEGER NOT NULL REFERENCES TaskTimers(id) ON DELETE CASCADE,
    at        TEXT NOT NULL,
    hour      INTEGER NOT NULL,
    response  TEXT NOT NULL                     -- focused | distracted
  );

  CREATE TABLE IF NOT EXISTS MemoryExercises (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    type           TEXT NOT NULL,               -- flashcard | face
    sourceKey      TEXT NOT NULL UNIQUE,
    prompt         TEXT NOT NULL,
    answer         TEXT NOT NULL,
    imageUri       TEXT,
    box            INTEGER NOT NULL DEFAULT 1,  -- caixa Leitner (1…5)
    dueAt          TEXT NOT NULL,
    correctCount   INTEGER NOT NULL DEFAULT 0,
    wrongCount     INTEGER NOT NULL DEFAULT 0,
    lastReviewedAt TEXT,
    stale          INTEGER NOT NULL DEFAULT 0   -- fonte apagada/alterada
  );

  CREATE TABLE IF NOT EXISTS People (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    relation  TEXT,
    photoUri  TEXT NOT NULL,
    createdAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS DailyRecall (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    date         TEXT NOT NULL UNIQUE,
    expectedJson TEXT NOT NULL,
    selectedJson TEXT NOT NULL,
    score        REAL NOT NULL,
    createdAt    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS ItemLocations (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    item      TEXT NOT NULL,
    itemNorm  TEXT NOT NULL,
    place     TEXT NOT NULL,
    rawText   TEXT,
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_norm ON ItemLocations(itemNorm, createdAt);

  CREATE TABLE IF NOT EXISTS EmergencyContacts (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT NOT NULL,
    phone     TEXT NOT NULL,
    relation  TEXT,
    sortOrder INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS Places (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    label     TEXT NOT NULL,
    latitude  REAL NOT NULL,
    longitude REAL NOT NULL,
    radius    INTEGER NOT NULL DEFAULT 120,
    isHome    INTEGER NOT NULL DEFAULT 0,
    expiresAt TEXT                               -- locais temporários ("me avise quando eu sair daqui")
  );

  -- Cada ocorrência de alerta (dose das 08:00 de hoje, compromisso de quinta…)
  CREATE TABLE IF NOT EXISTS AlertLog (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    alertKey       TEXT NOT NULL UNIQUE,
    kind           TEXT NOT NULL,                -- med | appointment | routine | refill | recall | water
    refId          INTEGER,
    title          TEXT NOT NULL,
    body           TEXT NOT NULL,
    critical       INTEGER NOT NULL DEFAULT 0,
    scheduledFor   TEXT NOT NULL,
    snoozeCount    INTEGER NOT NULL DEFAULT 0,
    acknowledgedAt TEXT,
    method         TEXT                          -- word | math | barcode | tap | skipped
  );
  CREATE INDEX IF NOT EXISTS idx_alert_sched ON AlertLog(scheduledFor);

  CREATE TABLE IF NOT EXISTS QuickNotes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    text      TEXT NOT NULL,
    done      INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL
  );
  `,
];
