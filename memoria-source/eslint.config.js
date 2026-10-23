// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*'],
  },
  {
    // Falso positivo: os enums do expo-notifications vêm de `export *` encadeados.
    rules: { 'import/namespace': 'off' },
  },
]);
