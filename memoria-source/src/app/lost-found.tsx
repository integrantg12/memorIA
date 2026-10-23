import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { View } from 'react-native';

import { VoiceButton } from '../components/VoiceButton';
import { BackBar, BigButton, BigInput, Body, Card, Chip, Screen, useLoader } from '../components/ui';
import { deleteItem, ItemLocation, latestItemLocations, saveItemLocation } from '../db/repositories';
import { isSearch, parseSave, searchItems } from '../services/lostFound';
import { say } from '../services/speech';
import { colors, font, space } from '../theme';
import { relative } from '../utils/time';

/**
 * ACHADOS E PERDIDOS LOCAL
 * Fale ou digite: "Guardei o passaporte na gaveta do escritório" ou "Onde está minha chave?".
 */
export default function LostFound() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const { data: items, reload } = useLoader(latestItemLocations);
  const [mode, setMode] = useState<'save' | 'search'>(params.mode === 'save' ? 'save' : 'search');
  const [text, setText] = useState('');
  const [item, setItem] = useState('');
  const [place, setPlace] = useState('');
  const [results, setResults] = useState<ItemLocation[] | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const doSearch = async (q: string) => {
    const res = await searchItems(q);
    setResults(res);
    if (res.length) {
      const r = res[0];
      const msg = `${r.item}: ${r.place}. Anotado ${relative(new Date(r.createdAt))}.`;
      setFeedback(msg);
      await say(msg, { force: true });
    } else {
      setFeedback('Não encontrei esse item nas suas anotações.');
      await say('Não encontrei esse item nas suas anotações.', { force: true });
    }
  };

  const doSave = async (it: string, pl: string, raw: string | null) => {
    await saveItemLocation(it, pl, raw);
    const msg = `Anotado: ${it}, ${pl}.`;
    setFeedback(msg);
    setItem('');
    setPlace('');
    setText('');
    reload();
    await say(msg, { force: true });
  };

  /** Texto livre (falado ou digitado): decide sozinho se é busca ou registro. */
  const handleFree = async (t: string) => {
    setText(t);
    if (isSearch(t)) {
      setMode('search');
      return doSearch(t);
    }
    const parsed = parseSave(t);
    if (parsed) {
      setMode('save');
      return doSave(parsed.item, parsed.place, t);
    }
    if (mode === 'search') return doSearch(t);
    setFeedback('Não entendi o lugar. Preencha "O quê" e "Onde" abaixo.');
    setItem(t);
  };

  return (
    <Screen>
      <BackBar title="🔑 Onde guardei?" />
      <View style={{ flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <BigButton label="Procurar" icon="🔍" variant={mode === 'search' ? 'info' : 'ghost'} onPress={() => setMode('search')} />
        </View>
        <View style={{ flex: 1 }}>
          <BigButton label="Guardei" icon="📥" variant={mode === 'save' ? 'primary' : 'ghost'} onPress={() => setMode('save')} />
        </View>
      </View>

      <VoiceButton
        label={mode === 'search' ? 'Perguntar por voz' : 'Ditar onde guardei'}
        onText={handleFree}
      />
      <Body dim>
        {mode === 'search' ? 'Ex.: “Onde está minha chave?”' : 'Ex.: “Guardei o passaporte na gaveta do escritório”'}
      </Body>

      {mode === 'search' ? (
        <>
          <BigInput value={text} onChangeText={setText} placeholder="Qual item?" onSubmitEditing={() => text.trim() && handleFree(text)} returnKeyType="search" />
          <BigButton label="Procurar" disabled={!text.trim()} onPress={() => handleFree(text)} variant="info" />
        </>
      ) : (
        <>
          <BigInput label="O quê?" value={item} onChangeText={setItem} placeholder="Ex.: Chave do carro" />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.xs }}>
            {['Chaves', 'Carteira', 'Óculos', 'Documentos', 'Controle remoto'].map((s) => (
              <Chip key={s} label={s} selected={item === s} onPress={() => setItem(s)} />
            ))}
          </View>
          <BigInput label="Onde?" value={place} onChangeText={setPlace} placeholder="Ex.: na gaveta da cozinha" />
          <BigButton label="Salvar" icon="💾" disabled={!item.trim() || !place.trim()} onPress={() => doSave(item.trim(), place.trim(), null)} />
        </>
      )}

      {feedback ? (
        <Card color={colors.primary}>
          <Body size={font.large}>{feedback}</Body>
        </Card>
      ) : null}

      {mode === 'search' && results && results.length > 1 ? (
        <>
          <Body>Também pode ser:</Body>
          {results.slice(1, 4).map((r) => (
            <Card key={r.id}>
              <Body>{`${r.item}: ${r.place}`}</Body>
            </Card>
          ))}
        </>
      ) : null}

      <Body>{`Itens anotados (${items?.length ?? 0})`}</Body>
      {items?.map((r) => (
        <Card key={r.id}>
          <Body size={font.large}>{r.item}</Body>
          <Body>{`📍 ${r.place}`}</Body>
          <Body dim>{relative(new Date(r.createdAt))}</Body>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <BigButton small variant="info" label="Ouvir" icon="🔊" onPress={() => say(`${r.item}: ${r.place}`, { force: true })} />
            </View>
            <View style={{ flex: 1 }}>
              <BigButton small variant="ghost" label="Achei/apagar" onPress={async () => { await deleteItem(r.itemNorm); reload(); }} />
            </View>
          </View>
        </Card>
      ))}
    </Screen>
  );
}
