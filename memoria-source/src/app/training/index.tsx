import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';

import { BackBar, Body, Card, Screen, Tile, useLoader } from '../../components/ui';
import { countDue, listPeople, recentRecalls } from '../../db/repositories';
import { generateFlashcards } from '../../services/training';
import { colors, space } from '../../theme';

export default function TrainingHub() {
  const { data } = useLoader(async () => {
    await generateFlashcards();
    const [cards, faces, people, recalls] = await Promise.all([countDue('flashcard'), countDue('face'), listPeople(), recentRecalls(7)]);
    return { cards, faces, people: people.length, recalls };
  });

  const avg = data?.recalls.length ? Math.round((data.recalls.reduce((s, r) => s + r.score, 0) / data.recalls.length) * 100) : null;

  return (
    <Screen>
      <BackBar title="🧠 Treino da memória" />
      <Body dim>Exercícios curtos com as SUAS informações: remédios, compromissos, pessoas e onde guardou as coisas.</Body>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        <Tile icon="🃏" label="Flashcards" color={colors.primary} fg={colors.onPrimary} badge={data?.cards || undefined} onPress={() => router.push('/training/flashcards')} />
        <Tile icon="🧑" label="Rostos e nomes" color={colors.info} fg={colors.onInfo} badge={data?.faces || undefined} onPress={() => router.push('/training/face-match')} />
        <Tile icon="🌙" label="Recall do dia" color={colors.focus} fg={colors.onFocus} onPress={() => router.push('/training/recall')} />
        <Tile icon="📸" label="Cadastrar pessoas" onPress={() => router.push('/training/people')} badge={data ? `${data.people}` : undefined} />
      </View>
      {avg != null ? (
        <Card color={colors.success}>
          <Body>{`Recall dos últimos ${data!.recalls.length} dias: ${avg}% de acerto.`}</Body>
        </Card>
      ) : null}
    </Screen>
  );
}
