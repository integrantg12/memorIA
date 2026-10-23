import React, { useState } from 'react';
import { Text } from 'react-native';

import { BackBar, BigButton, Body, Card, Screen, useLoader } from '../../components/ui';
import { MemoryExercise } from '../../db/repositories';
import { say } from '../../services/speech';
import { grade, loadDueFlashcards, MAX_BOX } from '../../services/training';
import { colors, font } from '../../theme';

/** REPETIÇÃO ESPAÇADA — cards gerados a partir dos compromissos, remédios e itens da semana. */
export default function Flashcards() {
  const { data: cards, reload } = useLoader(loadDueFlashcards);
  const [idx, setIdx] = useState(0);
  const [show, setShow] = useState(false);
  const [score, setScore] = useState({ ok: 0, miss: 0 });

  if (!cards) return <Screen><BackBar title="🃏 Flashcards" /></Screen>;

  const card: MemoryExercise | undefined = cards[idx];

  if (!card) {
    return (
      <Screen>
        <BackBar title="🃏 Flashcards" />
        <Card color={colors.success}>
          <Body size={font.large}>{cards.length ? `Sessão concluída! ✅ ${score.ok} lembrou · ${score.miss} para revisar` : 'Nenhum card para hoje. 🎉'}</Body>
          <Body dim>Os cards voltam em intervalos cada vez maiores conforme você acerta.</Body>
        </Card>
        <BigButton label="Revisar de novo" variant="ghost" onPress={() => { setIdx(0); setShow(false); setScore({ ok: 0, miss: 0 }); reload(); }} />
      </Screen>
    );
  }

  const answer = async (correct: boolean) => {
    await grade(card, correct);
    setScore((s) => (correct ? { ...s, ok: s.ok + 1 } : { ...s, miss: s.miss + 1 }));
    setShow(false);
    setIdx((i) => i + 1);
  };

  return (
    <Screen>
      <BackBar title="🃏 Flashcards" />
      <Body dim>{`Card ${idx + 1} de ${cards.length} · nível ${card.box}/${MAX_BOX}`}</Body>
      <Card color={colors.primary} style={{ minHeight: 200, justifyContent: 'center' }}>
        <Text style={{ color: colors.text, fontSize: font.title, fontWeight: '900', textAlign: 'center' }}>{card.prompt}</Text>
      </Card>
      {show ? (
        <>
          <Card color={colors.success}>
            <Text style={{ color: colors.success, fontSize: font.title, fontWeight: '900', textAlign: 'center' }}>{card.answer}</Text>
          </Card>
          <BigButton label="Eu lembrei" icon="✅" variant="success" onPress={() => answer(true)} />
          <BigButton label="Não lembrei" icon="🔁" variant="danger" onPress={() => answer(false)} />
        </>
      ) : (
        <>
          <Body center dim>Tente lembrar (pode falar em voz alta) e depois veja a resposta.</Body>
          <BigButton label="Mostrar resposta" icon="👀" onPress={() => { setShow(true); say(card.answer); }} />
        </>
      )}
    </Screen>
  );
}
