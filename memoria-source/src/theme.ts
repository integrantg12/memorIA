/**
 * Tema de altíssimo contraste (WCAG AAA sobre fundo preto) e tipografia grande.
 * Cada cor tem um papel fixo para que o usuário aprenda o significado por repetição:
 * amarelo = ação principal, verde = concluído/seguro, vermelho = urgente/emergência,
 * azul-claro = informação.
 */
export const colors = {
  bg: '#000000',
  surface: '#141414',
  surfaceAlt: '#1F1F1F',
  border: '#FFFFFF',
  text: '#FFFFFF',
  textDim: '#D0D0D0',
  primary: '#FFD600',
  onPrimary: '#000000',
  success: '#00E676',
  onSuccess: '#000000',
  danger: '#FF5252',
  onDanger: '#000000',
  info: '#80D8FF',
  onInfo: '#000000',
  focus: '#B388FF',
  onFocus: '#000000',
};

export const font = {
  huge: 44,
  title: 32,
  large: 26,
  body: 22,
  small: 18,
};

export const space = {
  xs: 6,
  sm: 12,
  md: 18,
  lg: 26,
  xl: 36,
};

/** Área mínima de toque — bem acima dos 48dp recomendados. */
export const TOUCH_MIN = 72;
export const RADIUS = 18;
