import React from 'react';

import { useVoiceInput } from '../services/voice';
import { colors } from '../theme';
import { BigButton, Body, Card } from './ui';

export function VoiceButton({ onText, label = 'Falar' }: { onText: (t: string) => void; label?: string }) {
  const { listening, partial, error, start, stop } = useVoiceInput(onText);
  return (
    <>
      <BigButton
        label={listening ? 'Ouvindo… toque para parar' : label}
        icon={listening ? '🔴' : '🎤'}
        variant={listening ? 'danger' : 'info'}
        onPress={listening ? stop : start}
      />
      {partial ? (
        <Card color={colors.info}>
          <Body>{`“${partial}”`}</Body>
        </Card>
      ) : null}
      {error ? <Body dim>{error}</Body> : null}
    </>
  );
}
