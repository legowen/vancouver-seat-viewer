/**
 * Colours of the 3D auditorium. They follow the UI tokens in src/styles/tokens.css:
 * indigo darkness, warm sconce light, velvet seats.
 */
export const PALETTE = {
  carpet: 0x30264f,
  riser: 0x261e42,
  wallLight: 0x2e2758,
  wallDark: 0x221c46,
  ceiling: 0x141130,
  screenWall: 0x08070f,
  /** A projection screen showing nothing in particular: bright, slightly cool. */
  screen: 0xdde3ff,
  screenGlow: 0xb9c6ff,
  velvet: 0xc0425c,
  velvetDark: 0x7e2439,
  armrest: 0x2c2535,
  leather: 0x5a3a3c,
  leatherDark: 0x2e1f24,
  sconce: 0xffb866,
  stepLight: 0xffc98a,
  exit: 0x3ddc84,
  door: 0x0d0b18,
  headDark: 0x110e19,
  headLight: 0x3c3448,
  marker: 0xffd166,
  ambientSky: 0x8f8ad8,
  ambientGround: 0x3a2632,
  screenLight: 0xd0d9ff,
} as const;
