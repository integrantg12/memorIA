import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useState } from 'react';

/**
 * Reconhecimento de voz SOMENTE no aparelho (requiresOnDeviceRecognition).
 * Se o pacote offline de português não estiver instalado, não caímos para o modo em nuvem:
 * avisamos o usuário e ele pode usar o microfone do teclado ou digitar.
 */
export function useVoiceInput(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);

  useSpeechRecognitionEvent('start', () => setListening(true));
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results[0]?.transcript ?? '';
    setPartial(text);
    if (e.isFinal && text) {
      setPartial('');
      onFinal(text);
    }
  });
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    if (e.error === 'no-speech' || e.error === 'aborted') return;
    setError(
      e.error === 'language-not-supported' || e.error === 'service-not-allowed'
        ? 'Voz offline em português não instalada. Use o microfone do teclado ou digite.'
        : 'Não entendi. Tente de novo ou digite.',
    );
  });

  const start = useCallback(async () => {
    setError(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError('Permita o microfone para usar a voz.');
      return;
    }
    if (!ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) {
      setError('Este aparelho não tem reconhecimento de voz offline. Use o microfone do teclado ou digite.');
      return;
    }
    ExpoSpeechRecognitionModule.start({
      lang: 'pt-BR',
      interimResults: true,
      continuous: false,
      requiresOnDeviceRecognition: true,
      addsPunctuation: true,
    });
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  return { listening, partial, error, start, stop };
}
