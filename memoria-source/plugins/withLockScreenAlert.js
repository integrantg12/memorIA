/**
 * Config plugin: faz a MainActivity acender a tela e aparecer por cima da tela de bloqueio.
 * Assim, ao tocar num alerta crítico com o celular bloqueado, a Tela de Alerta Intrometido
 * abre imediatamente, sem exigir desbloqueio prévio.
 */
const { withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withLockScreenAlert(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    activity.$['android:showWhenLocked'] = 'true';
    activity.$['android:turnScreenOn'] = 'true';
    // Uma única instância: toques em notificações reaproveitam a Activity existente.
    activity.$['android:launchMode'] = 'singleTask';
    return cfg;
  });
};
