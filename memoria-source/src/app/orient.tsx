import { router } from 'expo-router';
import React, { useEffect } from 'react';
import { Text } from 'react-native';

import { BackBar, BigButton, Body, Card, H2, Screen, useLoader } from '../components/ui';
import { getActiveTimer, getSettings, latestItemLocations, listFinishedTimers, listNotes } from '../db/repositories';
import { elapsedMs } from '../services/focusTimer';
import { computeNextStep } from '../services/nextStep';
import { say } from '../services/speech';
import { colors, font } from '../theme';
import { longDate, relative, spokenTime } from '../utils/time';

/**
 * ME ORIENTA — "Onde eu estava? O que eu estava fazendo?"
 * Um botão para os momentos de branco: diz a data, a hora, a tarefa em andamento,
 * a última anotação de contexto e o próximo compromisso.
 */
export default function Orient() {
  const { data } = useLoader(async () => {
    const [settings, timer, last, next, notes, items] = await Promise.all([
      getSettings(),
      getActiveTimer(),
      listFinishedTimers(1),
      computeNextStep(),
      listNotes(),
      latestItemLocations(),
    ]);
    return { settings, timer, last: last[0] ?? null, next, notes: notes.slice(0, 3), items: items.slice(0, 3) };
  });

  const speech = (() => {
    if (!data) return '';
    const now = new Date();
    const parts = [`${data.settings.userName ? data.settings.userName + ', ' : ''}hoje é ${longDate(now)}, são ${spokenTime(now)}.`];
    if (data.timer) {
      parts.push(`Você estava fazendo: ${data.timer.title}, começou ${relative(new Date(data.timer.startedAt))}.`);
      if (data.timer.note) parts.push(`Sua anotação diz: ${data.timer.note}.`);
    } else if (data.last) {
      parts.push(`A última tarefa registrada foi: ${data.last.title}, ${relative(new Date(data.last.endedAt ?? data.last.startedAt))}.`);
    }
    if (data.next.kind !== 'free') parts.push(`Próximo passo: ${data.next.title}, ${data.next.when}.`);
    return parts.join(' ');
  })();

  useEffect(() => {
    if (speech) say(speech, { force: true });
  }, [speech]);

  if (!data) return <Screen><BackBar title="🧭 Me orienta" /></Screen>;
  const now = new Date();

  return (
    <Screen>
      <BackBar title="🧭 Me orienta" />
      <Card color={colors.success}>
        <Text style={{ color: colors.success, fontSize: font.title, fontWeight: '900' }}>{longDate(now)}</Text>
        <Text style={{ color: colors.text, fontSize: 60, fontWeight: '900' }}>{spokenTime(now)}</Text>
      </Card>

      <H2>Você estava fazendo</H2>
      {data.timer ? (
        <Card color={colors.focus}>
          <Body size={font.large}>{`🎯 ${data.timer.title}`}</Body>
          <Body dim>{`Começou ${relative(new Date(data.timer.startedAt))} · ${Math.round(elapsedMs(data.timer) / 60000)} min de trabalho`}</Body>
          {data.timer.note ? <Body>{`📌 ${data.timer.note}`}</Body> : null}
          <BigButton small variant="focus" label="Voltar para a tarefa" onPress={() => router.replace('/focus')} />
        </Card>
      ) : (
        <Card>
          <Body>{data.last ? `Última tarefa: ${data.last.title} (${relative(new Date(data.last.endedAt ?? data.last.startedAt))})` : 'Nenhuma tarefa em andamento.'}</Body>
        </Card>
      )}

      <H2>Próximo passo</H2>
      <Card color={colors.primary}>
        <Body size={font.large}>{data.next.title}</Body>
        <Body dim>{data.next.when}</Body>
      </Card>

      {data.notes.length ? (
        <>
          <H2>Ideias anotadas</H2>
          {data.notes.map((n) => (
            <Card key={n.id}><Body>{`💭 ${n.text}`}</Body></Card>
          ))}
        </>
      ) : null}

      {data.items.length ? (
        <>
          <H2>Guardado recentemente</H2>
          {data.items.map((i) => (
            <Card key={i.id}><Body>{`📍 ${i.item}: ${i.place}`}</Body></Card>
          ))}
        </>
      ) : null}

      <BigButton label="Ouvir de novo" icon="🔊" variant="info" onPress={() => say(speech, { force: true })} />
    </Screen>
  );
}
