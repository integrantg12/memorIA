import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { View } from 'react-native';

import { Challenge, checkAnswer, makeChallenge } from '../services/challenges';
import { colors, font } from '../theme';
import { BarcodeScanner } from './BarcodeScanner';
import { BigButton, BigInput, Body, Card } from './ui';

/**
 * Bloco do "descarte cognitivo". Só chama onSolved quando a resposta está correta.
 * Para o scanner, oferece fallback para um cálculo mais difícil (caixa não está à mão).
 */
export function ChallengeView({ initial, onSolved }: { initial: Challenge; onSolved: (method: string) => void }) {
  const [challenge, setChallenge] = useState(initial);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  const submit = (value: string) => {
    if (checkAnswer(challenge, value)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      onSolved(challenge.type);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
    setAttempts((a) => a + 1);
    if (challenge.type === 'barcode') {
      setError('Esse código não é o da caixa cadastrada. Confira se é o remédio certo!');
    } else {
      setError('Ainda não. Tente outra vez com calma.');
      setInput('');
      // Após 3 erros troca o desafio (evita travar quem está nervoso), sem facilitar.
      if (attempts >= 2) {
        setChallenge(makeChallenge(challenge.type));
        setAttempts(0);
      }
    }
  };

  return (
    <Card color={colors.primary}>
      <Body size={font.large}>{challenge.prompt}</Body>
      {challenge.hint ? <Body dim>{challenge.hint}</Body> : null}

      {challenge.type === 'barcode' ? (
        <View style={{ gap: 12 }}>
          <BarcodeScanner onScanned={submit} />
          <BigButton
            small
            variant="ghost"
            label="Estou sem a caixa agora"
            onPress={() => {
              setError(null);
              setChallenge(makeChallenge('math', { harder: true }));
            }}
          />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <BigInput
            value={input}
            onChangeText={(t) => {
              setInput(t);
              setError(null);
            }}
            placeholder={challenge.type === 'math' ? 'Resultado' : 'Digite aqui'}
            keyboardType={challenge.type === 'math' ? 'number-pad' : 'default'}
            autoCapitalize="characters"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={() => submit(input)}
            style={{ fontSize: 34, textAlign: 'center', fontWeight: '900' }}
          />
          <BigButton label="Confirmar" icon="✔️" onPress={() => submit(input)} disabled={!input.trim()} />
        </View>
      )}
      {error ? <Body size={font.body}>{`❌ ${error}`}</Body> : null}
    </Card>
  );
}
