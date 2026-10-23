// As tarefas de background (geofencing e replanejamento de alertas) precisam ser
// definidas no escopo global, antes do app montar, para funcionar com o app fechado.
import './src/services/backgroundTasks';
import 'expo-router/entry';
