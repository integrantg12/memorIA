/**
 * DESCARTE COGNITIVO
 * Desafios curtos que exigem atenção consciente — impossível silenciar "no automático".
 */
export type ChallengeType = 'word' | 'math' | 'barcode';

export interface Challenge {
  type: ChallengeType;
  prompt: string;
  answer: string;
  hint?: string;
}

const WORDS = [
  'ATENÇÃO', 'REMÉDIO', 'MEMÓRIA', 'AGORA', 'CUIDADO', 'LEMBRAR', 'CONFIRMO', 'PRESENTE',
  'SAÚDE', 'FOCO', 'CALMA', 'TOMEI', 'JANELA', 'CADERNO', 'LARANJA', 'PLANETA',
];

function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function makeChallenge(type: ChallengeType, opts: { expectedBarcode?: string; harder?: boolean } = {}): Challenge {
  if (type === 'barcode') {
    return {
      type,
      prompt: 'Escaneie o código de barras da caixa do remédio',
      answer: opts.expectedBarcode ?? '',
      hint: 'Aponte a câmera para as listras pretas da caixa.',
    };
  }
  if (type === 'word') {
    const w = WORDS[rand(0, WORDS.length - 1)];
    return { type, prompt: `Digite a palavra: ${w}`, answer: w, hint: 'Maiúsculas ou minúsculas, tanto faz.' };
  }
  // Cálculo simples, mas que exige fazer a conta (sem resultados triviais).
  if (opts.harder) {
    const a = rand(12, 39);
    const b = rand(11, 29);
    return { type, prompt: `Quanto é ${a} + ${b}?`, answer: String(a + b) };
  }
  const op = rand(0, 2);
  if (op === 0) {
    const a = rand(6, 19);
    const b = rand(5, 14);
    return { type, prompt: `Quanto é ${a} + ${b}?`, answer: String(a + b) };
  }
  if (op === 1) {
    const a = rand(15, 30);
    const b = rand(3, 12);
    return { type, prompt: `Quanto é ${a} − ${b}?`, answer: String(a - b) };
  }
  const a = rand(3, 9);
  const b = rand(3, 9);
  return { type, prompt: `Quanto é ${a} × ${b}?`, answer: String(a * b) };
}

function clean(s: string) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

export function checkAnswer(c: Challenge, input: string): boolean {
  if (c.type === 'barcode') return input.replace(/\D/g, '') === c.answer.replace(/\D/g, '') && c.answer !== '';
  return clean(input) === clean(c.answer);
}
