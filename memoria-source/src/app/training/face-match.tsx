import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Image, View } from 'react-native';

import { BackBar, BigButton, Body, Card, Screen, useLoader } from '../../components/ui';
import { dueExercises, listPeople, MemoryExercise, Person } from '../../db/repositories';
import { say } from '../../services/speech';
import { generateFlashcards, grade } from '../../services/training';
import { colors, font, RADIUS, space } from '../../theme';

function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** FACE-MATCH — associar o nome à foto, com repetição espaçada por pessoa. */
export default function FaceMatch() {
  const { data } = useLoader(async () => {
    await generateFlashcards();
    const people = await listPeople();
    let due = await dueExercises('face', 12);
    // Sem nada vencido: treino livre com todas as pessoas.
    if (!due.length) due = shuffle(await dueExercisesAll(people));
    return { people, rounds: due };
  });
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [hits, setHits] = useState(0);

  const round: MemoryExercise | undefined = data?.rounds[idx];
  const options = useMemo(() => {
    if (!data || !round) return [];
    const others = shuffle(data.people.filter((p) => p.name !== round.answer)).slice(0, 3).map((p) => p.name);
    return shuffle([round.answer, ...others]);
  }, [data, round]);

  if (!data) return <Screen><BackBar title="🧑 Rostos e nomes" /></Screen>;

  if (data.people.length < 2) {
    return (
      <Screen>
        <BackBar title="🧑 Rostos e nomes" />
        <Card>
          <Body>Cadastre pelo menos 2 pessoas com foto (família, médicos, vizinhos, colegas) para treinar.</Body>
        </Card>
        <BigButton label="Cadastrar pessoas" icon="📸" onPress={() => router.replace('/training/people')} />
      </Screen>
    );
  }

  if (!round) {
    return (
      <Screen>
        <BackBar title="🧑 Rostos e nomes" />
        <Card color={colors.success}>
          <Body size={font.large}>{`Fim! Você acertou ${hits} de ${data.rounds.length}.`}</Body>
        </Card>
        <BigButton label="Voltar ao treino" onPress={() => router.back()} />
      </Screen>
    );
  }

  const choose = async (name: string) => {
    if (picked) return;
    setPicked(name);
    const correct = name === round.answer;
    if (correct) setHits((h) => h + 1);
    await grade(round, correct);
    await say(correct ? `Isso! É ${round.answer}.` : `Esta é ${round.answer}.`);
  };

  const person = data.people.find((p) => p.name === round.answer);

  return (
    <Screen>
      <BackBar title="🧑 Quem é?" />
      <Body dim>{`${idx + 1} de ${data.rounds.length}`}</Body>
      <Image
        source={{ uri: round.imageUri ?? '' }}
        style={{ width: '100%', aspectRatio: 1, borderRadius: RADIUS, borderWidth: 3, borderColor: colors.primary, backgroundColor: colors.surface }}
        accessibilityLabel="Foto da pessoa"
      />
      <View style={{ gap: space.sm }}>
        {options.map((o) => (
          <BigButton
            key={o}
            label={o}
            variant={!picked ? 'ghost' : o === round.answer ? 'success' : o === picked ? 'danger' : 'ghost'}
            onPress={() => choose(o)}
          />
        ))}
      </View>
      {picked ? (
        <>
          {person?.relation ? <Body center>{`${person.name} · ${person.relation}`}</Body> : null}
          <BigButton label="Próxima" icon="➡️" onPress={() => { setPicked(null); setIdx((i) => i + 1); }} />
        </>
      ) : null}
    </Screen>
  );
}

async function dueExercisesAll(people: Person[]): Promise<MemoryExercise[]> {
  return people.map((p, i) => ({
    id: -1 - i,
    type: 'face',
    sourceKey: `person:${p.id}`,
    prompt: 'Quem é esta pessoa?',
    answer: p.name,
    imageUri: p.photoUri,
    box: 1,
    dueAt: new Date().toISOString(),
    correctCount: 0,
    wrongCount: 0,
    lastReviewedAt: null,
    stale: 0,
  }));
}
