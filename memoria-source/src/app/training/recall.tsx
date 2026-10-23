import { router } from 'expo-router';
import React, { useState } from 'react';

import { BackBar, BigButton, Body, Card, CheckRow, Screen, useLoader } from '../../components/ui';
import { saveDailyRecall } from '../../db/repositories';
import { say } from '../../services/speech';
import { buildRecallList, RecallTask } from '../../services/training';
import { colors, font } from '../../theme';
import { dayKey, longDate } from '../../utils/time';

/**
 * RECALL DIÁRIO — o usuário marca de memória o que fez hoje; depois o app compara com o
 * que foi registrado (remédios confirmados, tarefas concluídas). Treina a memória episódica
 * e revela esquecimentos (ex.: "você acha que tomou, mas não confirmou").
 */
export default function Recall() {
  const { data: tasks } = useLoader(() => buildRecallList());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ score: number; mismatches: { task: RecallTask; said: boolean }[] } | null>(null);

  if (!tasks) return <Screen><BackBar title="🌙 Recall do dia" /></Screen>;

  if (!tasks.length) {
    return (
      <Screen>
        <BackBar title="🌙 Recall do dia" />
        <Card><Body>Ainda não há tarefas registradas hoje para lembrar.</Body></Card>
      </Screen>
    );
  }

  const submit = async () => {
    const checkable = tasks.filter((t) => t.recordSaysDone !== null);
    const mismatches = checkable
      .filter((t) => selected.has(t.id) !== t.recordSaysDone)
      .map((t) => ({ task: t, said: selected.has(t.id) }));
    const score = checkable.length ? (checkable.length - mismatches.length) / checkable.length : 1;
    await saveDailyRecall(dayKey(), tasks, [...selected], score);
    setResult({ score, mismatches });
    await say(
      mismatches.length
        ? `Você acertou ${checkable.length - mismatches.length} de ${checkable.length}. Veja as diferenças na tela.`
        : 'Perfeito! Sua memória bateu com os registros de hoje.',
    );
  };

  if (result) {
    return (
      <Screen>
        <BackBar title="🌙 Resultado" />
        <Card color={result.score >= 0.8 ? colors.success : colors.primary}>
          <Body size={font.title}>{`${Math.round(result.score * 100)}% de acerto`}</Body>
        </Card>
        {result.mismatches.map(({ task, said }) => (
          <Card key={task.id} color={colors.danger}>
            <Body>{task.label}</Body>
            <Body dim>
              {said
                ? '⚠️ Você marcou como feito, mas não houve confirmação no app. Confira se realmente fez!'
                : '💡 Você esqueceu que fez isto — o app registrou como concluído.'}
            </Body>
          </Card>
        ))}
        <BigButton label="Concluir" icon="🌙" onPress={() => router.replace('/')} />
      </Screen>
    );
  }

  return (
    <Screen>
      <BackBar title="🌙 Recall do dia" />
      <Body>{`${longDate()}. Sem olhar a agenda: o que você realmente fez hoje? Toque nos itens concluídos.`}</Body>
      {tasks.map((t) => (
        <CheckRow
          key={t.id}
          label={t.label}
          checked={selected.has(t.id)}
          onToggle={() => {
            const n = new Set(selected);
            if (n.has(t.id)) n.delete(t.id);
            else n.add(t.id);
            setSelected(n);
          }}
        />
      ))}
      <BigButton label="Conferir com os registros" icon="🔍" onPress={submit} />
    </Screen>
  );
}
