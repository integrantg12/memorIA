import * as Speech from 'expo-speech';

import { getSettings } from '../db/repositories';

/**
 * TTS nativo do aparelho (Android TextToSpeech). Funciona offline quando o pacote de voz
 * pt-BR está instalado — nenhum áudio é enviado para fora.
 */
export async function say(text: string, opts: { force?: boolean; interrupt?: boolean } = {}) {
  const s = await getSettings();
  if (!s.ttsEnabled && !opts.force) return;
  if (opts.interrupt !== false) Speech.stop();
  return new Promise<void>((resolve) => {
    Speech.speak(text, {
      language: 'pt-BR',
      rate: s.ttsRate,
      pitch: 1.0,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

export function stopSpeaking() {
  Speech.stop();
}

/** Repete a fala a cada `everyMs` até `stop()` ser chamado — usado na Tela de Alerta. */
export function sayRepeating(text: string, everyMs = 30_000): { stop: () => void } {
  let active = true;
  const loop = async () => {
    while (active) {
      await say(text);
      const until = Date.now() + everyMs;
      while (active && Date.now() < until) await new Promise((r) => setTimeout(r, 250));
    }
  };
  loop();
  return {
    stop: () => {
      active = false;
      Speech.stop();
    },
  };
}
