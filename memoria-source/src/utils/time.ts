/** Utilitários de data/hora. Horários são guardados como "HH:MM" e dias da semana ISO (1=seg … 7=dom). */

export const WEEKDAY_SHORT = ['', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
export const WEEKDAY_LONG = ['', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado', 'domingo'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

export const ALL_WEEKDAYS = '1234567';

export function isoWeekday(d: Date): number {
  const w = d.getDay();
  return w === 0 ? 7 : w;
}

export function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

export function parseHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  return { h: h || 0, m: m || 0 };
}

export function toHHMM(h: number, m: number): string {
  return `${pad(h)}:${pad(m)}`;
}

export function hhmmOf(d: Date): string {
  return toHHMM(d.getHours(), d.getMinutes());
}

/** Data local no formato AAAA-MM-DD (sem conversão para UTC). */
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Combina um dia com um horário "HH:MM" no fuso local. */
export function atTime(day: Date, hhmm: string): Date {
  const { h, m } = parseHHMM(hhmm);
  const d = new Date(day);
  d.setHours(h, m, 0, 0);
  return d;
}

export function addMinutes(d: Date, min: number): Date {
  return new Date(d.getTime() + min * 60_000);
}

export function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

export function startOfDay(d: Date = new Date()): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

/** Ex.: "quinta-feira, 23 de outubro" */
export function longDate(d: Date = new Date()): string {
  return `${WEEKDAY_LONG[isoWeekday(d)]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

/** Ex.: "15h10" — formato que soa natural no TTS em português. */
export function spokenTime(d: Date): string {
  const m = d.getMinutes();
  return m === 0 ? `${d.getHours()} horas` : `${d.getHours()}h${pad(m)}`;
}

/** "em 25 min", "em 2 h 10 min", "há 3 dias" */
export function relative(target: Date, now: Date = new Date()): string {
  const diffMin = Math.round((target.getTime() - now.getTime()) / 60_000);
  const abs = Math.abs(diffMin);
  let txt: string;
  if (abs < 1) return 'agora';
  if (abs < 60) txt = `${abs} min`;
  else if (abs < 60 * 24) {
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    txt = m ? `${h} h ${m} min` : `${h} h`;
  } else {
    const days = Math.round(abs / (60 * 24));
    txt = days === 1 ? '1 dia' : `${days} dias`;
  }
  return diffMin > 0 ? `em ${txt}` : `há ${txt}`;
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function weekdaysLabel(weekdays: string): string {
  if (weekdays === ALL_WEEKDAYS) return 'Todos os dias';
  if (weekdays === '12345') return 'Dias úteis';
  return weekdays
    .split('')
    .map((d) => WEEKDAY_SHORT[parseInt(d, 10)])
    .join(', ');
}

/** Remove acentos e caixa para buscas tolerantes ("Óculos" == "oculos"). */
export function normalize(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
