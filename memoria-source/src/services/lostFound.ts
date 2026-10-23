import { ItemLocation, latestItemLocations } from '../db/repositories';
import { normalize } from '../utils/time';

/**
 * ACHADOS E PERDIDOS — interpretação local de frases em português, sem IA na nuvem.
 *   "Guardei a chave na gaveta da cozinha"  → { item: "chave", place: "na gaveta da cozinha" }
 *   "O passaporte está no armário do quarto" → { item: "passaporte", place: "no armário do quarto" }
 *   "Onde está minha chave?"                 → busca por "chave"
 */

const ARTICLES = /^(?:a|o|as|os|um|uma|minha|meu|minhas|meus|sua|seu|suas|seus)\s+/i;
const PLACE_START =
  '(?:dentro d[aoe]s?|em cima d[aoe]s?|embaixo d[aoe]s?|debaixo d[aoe]s?|atr[aá]s d[aoe]s?|ao lado d[aoe]s?|perto d[aoe]s?|junto d[aoe]s?|na|no|nas|nos|em|num|numa|sobre|entre)';

const SAVE_PATTERNS: RegExp[] = [
  new RegExp(`^(?:eu\\s+)?(?:guardei|coloquei|deixei|botei|pus|escondi|larguei)\\s+(.+?)\\s+(${PLACE_START}\\s+.+)$`, 'i'),
  new RegExp(`^(.+?)\\s+(?:est[aá]|t[aá]|fica|ficou|ficaram|est[aã]o)\\s+(${PLACE_START}\\s+.+)$`, 'i'),
  new RegExp(`^(.+?)\\s*[:\\-–]\\s*(.+)$`, 'i'),
];

const SEARCH_HINT = /^(?:onde|cad[eê]|aonde|qual|em que lugar)|\?$/i;
const STOPWORDS = new Set([
  'onde', 'aonde', 'cade', 'esta', 'estao', 'ta', 'fica', 'ficou', 'guardei', 'deixei', 'coloquei',
  'meu', 'minha', 'meus', 'minhas', 'o', 'a', 'os', 'as', 'um', 'uma', 'que', 'eu', 'lugar', 'em', 'qual',
  'de', 'do', 'da', 'e', 'foi', 'botei', 'pus',
]);

export function isSearch(text: string): boolean {
  return SEARCH_HINT.test(text.trim());
}

export function parseSave(text: string): { item: string; place: string } | null {
  const t = text.trim().replace(/[.!]+$/, '');
  for (const re of SAVE_PATTERNS) {
    const m = t.match(re);
    if (m) {
      const item = m[1].replace(ARTICLES, '').trim();
      const place = m[2].trim();
      if (item && place) return { item: capitalize(item), place };
    }
  }
  return null;
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function tokens(text: string): string[] {
  return normalize(text)
    .split(' ')
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

/** Plural simples: "chaves" ~ "chave", "óculos" permanece. */
function stem(w: string) {
  return w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w;
}

export async function searchItems(query: string): Promise<ItemLocation[]> {
  const q = tokens(query).map(stem);
  if (!q.length) return [];
  const all = await latestItemLocations();
  const scored = all
    .map((it) => {
      const words = it.itemNorm.split(' ').map(stem);
      let score = 0;
      for (const w of q) {
        if (words.includes(w)) score += 3;
        else if (words.some((x) => x.startsWith(w) || w.startsWith(x))) score += 1;
      }
      return { it, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.map((x) => x.it);
}

export async function lastLocationOf(label: string): Promise<ItemLocation | null> {
  const res = await searchItems(label);
  return res[0] ?? null;
}
