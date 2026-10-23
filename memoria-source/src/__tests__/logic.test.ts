/// <reference types="jest" />
import { checkAnswer, makeChallenge } from '../services/challenges';
import { isSearch, parseSave, searchItems } from '../services/lostFound';
import { nextReview } from '../services/training';
import { atTime, isoWeekday, normalize, relative, weekdaysLabel } from '../utils/time';

// jest.mock é içado acima dos imports pelo babel-jest.
jest.mock('../db/repositories', () => ({
  latestItemLocations: jest.fn(async () => [
    { id: 1, item: 'Chave do carro', itemNorm: 'chave do carro', place: 'na gaveta da cozinha', rawText: null, createdAt: new Date().toISOString() },
    { id: 2, item: 'Óculos', itemNorm: 'oculos', place: 'em cima da TV', rawText: null, createdAt: new Date().toISOString() },
    { id: 3, item: 'Passaporte', itemNorm: 'passaporte', place: 'no armário do quarto', rawText: null, createdAt: new Date().toISOString() },
  ]),
}));

describe('Achados e perdidos — interpretação de frases', () => {
  it.each([
    ['Guardei a chave na gaveta da cozinha', 'Chave', 'na gaveta da cozinha'],
    ['coloquei meus óculos em cima da mesa', 'Óculos', 'em cima da mesa'],
    ['O passaporte está no armário do quarto', 'Passaporte', 'no armário do quarto'],
    ['Deixei o controle remoto dentro da gaveta.', 'Controle remoto', 'dentro da gaveta'],
    ['carregador: mochila azul', 'Carregador', 'mochila azul'],
  ])('"%s"', (text, item, place) => {
    expect(parseSave(text)).toEqual({ item, place });
  });

  it('reconhece perguntas', () => {
    expect(isSearch('Onde está minha chave?')).toBe(true);
    expect(isSearch('cadê o passaporte')).toBe(true);
    expect(isSearch('Guardei a chave na gaveta')).toBe(false);
  });

  it('busca tolerante a acento, plural e palavras extras', async () => {
    expect((await searchItems('Onde estão minhas chaves?'))[0].item).toBe('Chave do carro');
    expect((await searchItems('cadê meus oculos'))[0].item).toBe('Óculos');
    expect(await searchItems('onde está o guarda-chuva?')).toEqual([]);
  });
});

describe('Descarte cognitivo', () => {
  it('cálculo: só aceita o resultado certo', () => {
    for (let i = 0; i < 50; i++) {
      const c = makeChallenge('math');
      expect(checkAnswer(c, c.answer)).toBe(true);
      expect(checkAnswer(c, String(Number(c.answer) + 1))).toBe(false);
    }
  });

  it('palavra: ignora caixa e acentos', () => {
    const c = { type: 'word' as const, prompt: '', answer: 'MEMÓRIA' };
    expect(checkAnswer(c, 'memoria')).toBe(true);
    expect(checkAnswer(c, 'memori')).toBe(false);
  });

  it('código de barras: precisa ser o da caixa cadastrada', () => {
    const c = makeChallenge('barcode', { expectedBarcode: '7891234567895' });
    expect(checkAnswer(c, '7891234567895')).toBe(true);
    expect(checkAnswer(c, '7890000000000')).toBe(false);
    expect(checkAnswer(makeChallenge('barcode'), '')).toBe(false);
  });
});

describe('Repetição espaçada (Leitner)', () => {
  it('acerto sobe de caixa, erro volta para a caixa 1', () => {
    expect(nextReview(1, true).box).toBe(2);
    expect(nextReview(5, true).box).toBe(5);
    expect(nextReview(4, false).box).toBe(1);
  });

  it('intervalo cresce com a caixa', () => {
    const d3 = new Date(nextReview(2, true).dueAt).getTime();
    const d5 = new Date(nextReview(4, true).dueAt).getTime();
    expect(d5).toBeGreaterThan(d3);
  });
});

describe('Utilitários de tempo', () => {
  it('dia da semana ISO', () => {
    expect(isoWeekday(new Date(2026, 9, 25))).toBe(7); // domingo
    expect(isoWeekday(new Date(2026, 9, 26))).toBe(1); // segunda
  });

  it('atTime usa o fuso local', () => {
    const d = atTime(new Date(2026, 0, 1), '08:30');
    expect([d.getHours(), d.getMinutes()]).toEqual([8, 30]);
  });

  it('textos amigáveis', () => {
    const now = new Date(2026, 0, 1, 10, 0);
    expect(relative(new Date(2026, 0, 1, 10, 25), now)).toBe('em 25 min');
    expect(relative(new Date(2026, 0, 1, 7, 50), now)).toBe('há 2 h 10 min');
    expect(weekdaysLabel('12345')).toBe('Dias úteis');
    expect(normalize('  Óculos  de SOL! ')).toBe('oculos de sol');
  });
});
