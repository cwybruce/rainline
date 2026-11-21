// The city of Port Vane: roads, blocks, buildings, lamps and mission landmarks.
// The grid is uniform in X; in Y, row 1 is the wide Rainline Expressway.
import { BLOCK, ROAD, HIGHWAY_H, COLS, ROWS, PITCH, PALETTE } from './config.js';
import { mulberry32, pick } from './util.js';

export const HIGHWAY_ROW = 1;

// Vertical road bands (x0, x1) for i = 0..COLS.
export function verticalRoads() {
  const out = [];
  for (let i = 0; i <= COLS; i += 1) out.push({ x0: i * PITCH, x1: i * PITCH + ROAD });
  return out;
}

// Horizontal road bands (y0, y1, highway?) for j = 0..ROWS.
export function horizontalRoads() {
  const out = [];
  let y = 0;
  for (let j = 0; j <= ROWS; j += 1) {
    const h = j === HIGHWAY_ROW ? HIGHWAY_H : ROAD;
    out.push({ y0: y, y1: y + h, highway: j === HIGHWAY_ROW });
    y += h + BLOCK;
  }
  return out;
}

export function worldWidth() {
  return COLS * PITCH + ROAD;
}

export function worldHeight() {
  const rows = horizontalRoads();
  return rows[ROWS].y1;
}

/** Build the whole city from a seed. Returns the world object. */
export function generateWorld(seed) {
  const rng = mulberry32(seed);
  const vRoads = verticalRoads();
  const hRoads = horizontalRoads();
  const width = worldWidth();
  const height = worldHeight();

  // Blocks: cells between roads. Each block holds 1-4 buildings, or a landmark lot.
  const buildings = [];
  const lots = [];
  const signs = ['INKWELL', 'NOODLE BAR', 'MOTEL', '24H PAWN', 'LAUNDRO', 'TACOS', 'GARAGE', 'HOTEL VANE', 'ARCADE', 'Diner', 'CLUB NEON', 'PHARMACY'];
  let signIndex = 0;

  // Landmark blocks, by (col, row): garage, club, parking lot, stash.
  const landmark = {
    '1,3': 'garage',
    '5,2': 'club',
    '6,5': 'lot',
    '2,6': 'stash',
  };

  for (let c = 0; c < COLS; c += 1) {
    for (let r = 0; r < ROWS; r += 1) {
      const bx = c * PITCH + ROAD;
      const by = hRoads[r].y1;
      const bw = BLOCK;
      const bh = hRoads[r + 1].y0 - hRoads[r].y1;
      const key = c + ',' + r;
      const kind = landmark[key];
      if (kind === 'lot') {
        lots.push({ x: bx, y: by, w: bw, h: bh, kind: 'lot', name: 'Meridian Lot' });
        continue;
      }
      if (kind === 'garage' || kind === 'club' || kind === 'stash') {
        const name = kind === 'garage' ? "Rook's Garage" : kind === 'club' ? 'Inkwell Club' : 'Vera\'s Stash';
        buildings.push({
          x: bx + 14, y: by + 14, w: bw - 28, h: bh - 28,
          color: kind === 'club' ? '#3a1f3d' : kind === 'garage' ? '#1f2a3a' : '#2a2a1f',
          floors: 2, landmark: kind, name, sign: kind === 'club' ? 'INKWELL CLUB' : kind === 'garage' ? 'GARAGE' : 'STASH',
          signColor: kind === 'club' ? '#ff2e63' : '#08d9d6',
        });
        continue;
      }
      // Ordinary block: split into 1-4 buildings with alley gaps.
      const splitV = rng() < 0.55;
      const splitH = rng() < 0.45;
      const cols = splitV ? 2 : 1;
      const rows = splitH ? 2 : 1;
      const gap = 14;
      const palette = ['#1d2431', '#241d2b', '#1c2b26', '#2b2118', '#232a33', '#2e1f24'];
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          const w = (bw - gap * (cols + 1)) / cols;
          const h = (bh - gap * (rows + 1)) / rows;
          const b = {
            x: bx + gap + i * (w + gap),
            y: by + gap + j * (h + gap),
            w, h,
            color: pick(rng, palette),
            floors: 2 + Math.floor(rng() * 7),
            landmark: null, name: '',
            sign: rng() < 0.4 ? signs[signIndex++ % signs.length] : '',
            signColor: pick(rng, PALETTE.neon),
          };
          buildings.push(b);
        }
      }
    }
  }

  // Street lamps along road edges, every ~180px.
  const lamps = [];
  for (let i = 0; i <= COLS; i += 1) {
    const x = i * PITCH + ROAD + 8;
    for (let y = 40; y < height - 40; y += 190) lamps.push({ x, y, on: rng() < 0.92 });
  }
  for (let j = 0; j <= ROWS; j += 1) {
    const y = hRoads[j].y1 + 8;
    for (let x = 40; x < width - 40; x += 190) lamps.push({ x, y, on: rng() < 0.92 });
  }

  // Puddles on roads: shiny wet patches that catch the neon.
  const puddles = [];
  for (let i = 0; i < 90; i += 1) {
    const vr = pick(rng, vRoads);
    const hr = pick(rng, hRoads);
    const onVertical = rng() < 0.5;
    puddles.push({
      x: onVertical ? vr.x0 + 8 + rng() * (ROAD - 40) : 20 + rng() * (width - 60),
      y: onVertical ? 20 + rng() * (height - 60) : hr.y0 + 8 + rng() * ((hr.y1 - hr.y0) - 40),
      rx: 14 + rng() * 34,
      ry: 8 + rng() * 16,
    });
  }

  // Mission landmarks in world coordinates.
  const hwy = hRoads[HIGHWAY_ROW];
  const garageBlock = { x: 1 * PITCH + ROAD, y: hRoads[3].y1, w: BLOCK, h: hRoads[4].y0 - hRoads[3].y1 };
  const clubBlock = { x: 5 * PITCH + ROAD, y: hRoads[2].y1, w: BLOCK, h: hRoads[3].y0 - hRoads[2].y1 };
  const lotBlock = { x: 6 * PITCH + ROAD, y: hRoads[5].y1, w: BLOCK, h: hRoads[6].y0 - hRoads[5].y1 };
  const stashBlock = { x: 2 * PITCH + ROAD, y: hRoads[6].y1, w: BLOCK, h: hRoads[7].y0 - hRoads[6].y1 };

  const landmarks = {
    garage: { x: garageBlock.x + garageBlock.w / 2, y: garageBlock.y + garageBlock.h + 26, name: "Rook's Garage" },
    club: { x: clubBlock.x + clubBlock.w / 2, y: clubBlock.y - 26, name: 'Inkwell Club' },
    lot: { x: lotBlock.x + lotBlock.w / 2, y: lotBlock.y + lotBlock.h / 2, name: 'Meridian Lot' },
    stash: { x: stashBlock.x + stashBlock.w / 2, y: stashBlock.y - 26, name: "Vera's Stash" },
    tunnel: { x: width - 60, y: (hwy.y0 + hwy.y1) / 2, name: 'East Tunnel' },
    pickup: { x: 3 * PITCH + ROAD / 2, y: hRoads[4].y0 + ROAD / 2, name: 'Dove Pickup' },
  };

  return {
    seed, width, height, vRoads, hRoads, buildings, lots, lamps, puddles, landmarks,
    highway: { y0: hwy.y0, y1: hwy.y1, cy: (hwy.y0 + hwy.y1) / 2 },
  };
}

/** True when the point is on a road (drivable). */
export function isRoad(world, x, y) {
  for (const r of world.vRoads) if (x >= r.x0 && x <= r.x1) return true;
  for (const r of world.hRoads) if (y >= r.y0 && y <= r.y1) return true;
  return false;
}

/** True when the point is on the expressway band. */
export function isHighway(world, x, y) {
  return y >= world.highway.y0 && y <= world.highway.y1;
}

/** Nearest road-centre point (used to snap spawns onto roads). */
export function nearestRoadPoint(world, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const r of world.vRoads) {
    const cx = (r.x0 + r.x1) / 2;
    const d = Math.abs(x - cx);
    if (d < bestD) { bestD = d; best = { x: cx, y, vertical: true }; }
  }
  for (const r of world.hRoads) {
    const cy = (r.y0 + r.y1) / 2;
    const d = Math.abs(y - cy);
    if (d < bestD) { bestD = d; best = { x, y: cy, vertical: false }; }
  }
  return best;
}

/** Push a circle out of every building. Returns true when a wall was hit. */
export function collideBuildings(world, ent, r) {
  let hit = false;
  for (const b of world.buildings) {
    if (ent.x + r < b.x || ent.x - r > b.x + b.w || ent.y + r < b.y || ent.y - r > b.y + b.h) continue;
    const nx = Math.max(b.x, Math.min(ent.x, b.x + b.w));
    const ny = Math.max(b.y, Math.min(ent.y, b.y + b.h));
    const dx = ent.x - nx;
    const dy = ent.y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      ent.x = nx + (dx / d) * r;
      ent.y = ny + (dy / d) * r;
    } else {
      const left = ent.x - b.x;
      const right = b.x + b.w - ent.x;
      const top = ent.y - b.y;
      const bottom = b.y + b.h - ent.y;
      const m = Math.min(left, right, top, bottom);
      if (m === left) ent.x = b.x - r;
      else if (m === right) ent.x = b.x + b.w + r;
      else if (m === top) ent.y = b.y - r;
      else ent.y = b.y + b.h + r;
    }
  }
  return hit;
}

/** Clamp an entity inside the city bounds. */
export function clampToWorld(world, ent, margin) {
  ent.x = Math.max(margin, Math.min(world.width - margin, ent.x));
  ent.y = Math.max(margin, Math.min(world.height - margin, ent.y));
}
