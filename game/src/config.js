// RAINLINE — configuration and tuning.
// A rainy-night open-world getaway-driver game set in the fictional city of Port Vane.
// All art is drawn in code; all sound is synthesized. No external assets.
export const GAME_TITLE = 'RAINLINE';
export const GAME_SUBTITLE = 'a rainy-night getaway in Port Vane';
export const SAVE_KEY = 'rainline-save-v1';

// Logical canvas size. The canvas scales to the browser window.
export const VIEW_W = 1280;
export const VIEW_H = 720;

// City layout. Roads are bands on a grid; blocks sit between them.
// Row 1 (index 1) is the wide Rainline Expressway, the elevated highway.
export const BLOCK = 260;
export const ROAD = 100;
export const HIGHWAY_H = 170;
export const COLS = 8; // blocks across
export const ROWS = 8; // blocks down
export const PITCH = BLOCK + ROAD;

// Player on foot.
export const WALK_SPEED = 175;
export const SPRINT_MULT = 1.55;
export const PLAYER_RADIUS = 13;
export const PLAYER_HP = 100;

// Cars. Speeds are px/s. Rain cuts grip, so the car slides more.
export const CAR = {
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 335,
  maxReverse: 130,
  steerRate: 2.6,
  gripDry: 7.5,
  gripWet: 4.1, // rain-slick roads
  handbrakeGrip: 1.6,
  radius: 17,
};

// Wanted system.
export const WANTED = {
  maxLevel: 5,
  decayDelay: 9, // seconds unseen before heat starts to fall
  decayRate: 0.55, // heat per second while hidden
  heatPerLevel: 100,
  stealCar: 55,
  shoot: 70,
  hitPed: 90,
  hitCop: 120,
  ramCop: 60,
};

// Police.
export const POLICE = {
  maxSpeed: 355,
  accel: 480,
  ramDamage: 9,
  arrestRange: 26,
  officerSpeed: 185,
};

// Combat.
export const GUN = {
  damage: 34,
  range: 460,
  fireRate: 0.22, // seconds between shots
  magSize: 12,
  reloadTime: 1.1,
  spread: 0.05,
};

// Traffic and crowds.
export const TRAFFIC_COUNT = 14;
export const PED_COUNT = 22;
export const TRAFFIC_SPEED_MIN = 95;
export const TRAFFIC_SPEED_MAX = 150;

// Rain and night atmosphere.
export const RAIN = {
  drops: 420, // streaks on screen
  splashChance: 0.25,
  lightningEveryMin: 9,
  lightningEveryMax: 22,
};

// Money and ranks.
export const RANKS = [
  { at: 0, name: 'Wheelman' },
  { at: 800, name: 'Night Driver' },
  { at: 2300, name: 'Rain Runner' },
  { at: 6300, name: 'Ghost of the Expressway' },
  { at: 14300, name: 'Rainline Legend' },
];

// Night palette.
export const PALETTE = {
  ground: '#0b0d12',
  asphalt: '#171a21',
  asphaltDark: '#12141a',
  roadLine: '#8a8f7a',
  sidewalk: '#23262e',
  curb: '#2e323d',
  buildingEdge: '#05060a',
  lampGlow: '#ffd9a0',
  neon: ['#ff2e63', '#08d9d6', '#f9ed69', '#ff7a18', '#b967ff', '#00e676'],
  rain: 'rgba(174, 194, 224, 0.55)',
  hudPanel: 'rgba(8, 10, 16, 0.72)',
  hudText: '#e8ecf4',
  hudDim: '#9aa3b2',
  star: '#ffd166',
  danger: '#ff4757',
  ok: '#2ed573',
  mission: '#08d9d6',
};
