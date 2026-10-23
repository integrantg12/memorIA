import type { ExpoConfig } from 'expo/config';

/**
 * memorIA — configuração nativa.
 *
 * PRIVACY_STRICT=1 (usado no perfil de build "apk" do eas.json e no workflow do GitHub)
 * remove a permissão INTERNET do APK final: o sistema operacional passa a impedir
 * fisicamente qualquer tráfego de rede do app. Em desenvolvimento a permissão é mantida
 * porque o Metro bundler precisa dela.
 */
const PRIVACY_STRICT = process.env.PRIVACY_STRICT === '1';

const config: ExpoConfig = {
  name: 'memorIA',
  slug: 'memoria',
  scheme: 'memoria',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: '#000000',
  ios: {
    bundleIdentifier: 'app.memoria.local',
    supportsTablet: false,
    infoPlist: {
      UIBackgroundModes: ['location', 'fetch', 'processing'],
      NSLocationAlwaysAndWhenInUseUsageDescription:
        'O memorIA usa sua localização apenas no aparelho para lembrar o checklist quando você sai de casa.',
      NSLocationWhenInUseUsageDescription:
        'O memorIA usa sua localização apenas no aparelho para marcar sua casa.',
      NSMicrophoneUsageDescription: 'Para você ditar onde guardou objetos e fazer buscas por voz.',
      NSSpeechRecognitionUsageDescription: 'Reconhecimento de voz processado no próprio aparelho.',
      NSCameraUsageDescription: 'Para escanear o código de barras da caixa do remédio.',
    },
  },
  android: {
    package: 'app.memoria.local',
    versionCode: 1,
    // Nada de backup automático na nuvem do Google: os dados nunca saem do aparelho.
    allowBackup: false,
    adaptiveIcon: {
      backgroundColor: '#000000',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    permissions: [
      // Notificações locais e alarmes exatos
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.SCHEDULE_EXACT_ALARM',
      'android.permission.USE_EXACT_ALARM',
      'android.permission.RECEIVE_BOOT_COMPLETED',
      'android.permission.VIBRATE',
      'android.permission.WAKE_LOCK',
      // Sobreposição / tela cheia para alertas intrometidos
      'android.permission.USE_FULL_SCREEN_INTENT',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
      // Geofencing (processado 100% no aparelho)
      'android.permission.ACCESS_COARSE_LOCATION',
      'android.permission.ACCESS_FINE_LOCATION',
      'android.permission.ACCESS_BACKGROUND_LOCATION',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_LOCATION',
      // Voz e câmera
      'android.permission.RECORD_AUDIO',
      'android.permission.CAMERA',
    ],
    blockedPermissions: [
      'com.google.android.gms.permission.AD_ID',
      'android.permission.READ_PHONE_STATE',
      'android.permission.READ_CONTACTS',
      ...(PRIVACY_STRICT
        ? ['android.permission.INTERNET', 'android.permission.ACCESS_NETWORK_STATE']
        : []),
    ],
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 200, resizeMode: 'contain', backgroundColor: '#000000' },
    ],
    'expo-secure-store',
    'expo-background-task',
    // Banco criptografado (SQLCipher) — chave guardada no Android Keystore via SecureStore.
    ['expo-sqlite', { useSQLCipher: true }],
    [
      'expo-notifications',
      {
        color: '#FFD600',
        defaultChannel: 'critico-v1',
      },
    ],
    [
      'expo-location',
      {
        locationAlwaysAndWhenInUsePermission:
          'O memorIA usa sua localização apenas no aparelho para lembrar o checklist quando você sai de casa.',
        isAndroidBackgroundLocationEnabled: true,
        isAndroidForegroundServiceEnabled: true,
      },
    ],
    [
      'expo-camera',
      {
        cameraPermission: 'Para escanear o código de barras da caixa do remédio.',
        recordAudioAndroid: false,
      },
    ],
    [
      'expo-image-picker',
      {
        photosPermission: 'Para cadastrar fotos de pessoas no treino Face-Match.',
        cameraPermission: 'Para fotografar pessoas no treino Face-Match.',
      },
    ],
    [
      'expo-speech-recognition',
      {
        microphonePermission: 'Para você ditar onde guardou objetos e fazer buscas por voz.',
        speechRecognitionPermission: 'Reconhecimento de voz processado no próprio aparelho.',
        androidSpeechServicePackages: ['com.google.android.as', 'com.google.android.googlequicksearchbox'],
      },
    ],
    // Plugin próprio: permite que a tela de alerta apareça por cima da tela de bloqueio.
    './plugins/withLockScreenAlert',
  ],
  experiments: {
    typedRoutes: false,
  },
  extra: {
    privacyStrict: PRIVACY_STRICT,
  },
};

export default config;
