import React, { useState } from 'react';
import { View } from 'react-native';

import { VoiceButton } from '../components/VoiceButton';
import { BackBar, BigButton, BigInput, Body, Card, Screen, useLoader } from '../components/ui';
import { addNote, deleteNote, listNotes, setNoteDone } from '../db/repositories';
import { say } from '../services/speech';
import { colors, font, space } from '../theme';
import { relative } from '../utils/time';

/**
 * CAIXA DE PENSAMENTOS — captura instantânea de ideias que surgem no meio de outra tarefa.
 * Anotar em 3 segundos e voltar ao que estava fazendo evita a "cascata de distração".
 */
export default function Notes() {
  const { data: notes, reload } = useLoader(listNotes);
  const [text, setText] = useState('');

  const save = async (t: string) => {
    if (!t.trim()) return;
    await addNote(t);
    setText('');
    reload();
    await say('Anotado. Pode voltar ao que estava fazendo.');
  };

  return (
    <Screen>
      <BackBar title="💭 Anotar ideia" />
      <Body dim>Surgiu uma ideia no meio de outra coisa? Anote aqui e volte para o que estava fazendo.</Body>
      <VoiceButton label="Ditar ideia" onText={save} />
      <BigInput value={text} onChangeText={setText} placeholder="Ex.: ligar para o dentista" onSubmitEditing={() => save(text)} />
      <BigButton label="Guardar" icon="💾" disabled={!text.trim()} onPress={() => save(text)} />

      {notes?.map((n) => (
        <Card key={n.id} color={colors.info}>
          <Body size={font.large}>{n.text}</Body>
          <Body dim>{relative(new Date(n.createdAt))}</Body>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <BigButton small variant="success" label="Feito" icon="✅" onPress={async () => { await setNoteDone(n.id, true); reload(); }} />
            </View>
            <View style={{ flex: 1 }}>
              <BigButton small variant="ghost" label="Apagar" onPress={async () => { await deleteNote(n.id); reload(); }} />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
