// Pedestrians and police officers on foot.
import { WALK_SPEED, PLAYER_RADIUS, POLICE } from './config.js';
import { clamp, dist, angleLerp } from './util.js';
import { isRoad, collideBuildings, clampToWorld, nearestRoadPoint } from './world.js';

const PED_COLORS = ['#d8a05a', '#7a8ba8', '#a87a8b', '#5a8a6a', '#c9c9c9', '#8a6a4a', '#6a7a9a'];
const PED_SHIRTS = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22', '#ecf0f1', '#2ecc71'];

export function makePed(world, x, y) {
  return {
    x, y,
    angle: Math.random() * Math.PI * 2,
    speed: 34 + Math.random() * 30,
    color: PED_COLORS[Math.floor(Math.random() * PED_COLORS.length)],
    shirt: PED_SHIRTS[Math.floor(Math.random() * PED_SHIRTS.length)],
    state: 'walk', // walk | flee | down
    stateT: 0,
    target: null,
    bob: Math.random() * 10,
  };
}

/** Pedestrians stroll the sidewalks; they flee gunfire and speeding cars. */
export function stepPed(world, ped, player, danger, dt) {
  ped.bob += dt * 8;
  ped.stateT -= dt;
  if (ped.state === 'down') {
    if (ped.stateT <= 0) { ped.state = 'flee'; ped.stateT = 4; }
    return;
  }
  // Danger nearby: flee.
  if (danger && dist(ped.x, ped.y, danger.x, danger.y) < 260) {
    ped.state = 'flee';
    ped.stateT = 3;
  }
  if (ped.state === 'flee') {
    const away = Math.atan2(ped.y - (danger ? danger.y : player.y), ped.x - (danger ? danger.x : player.x));
    ped.angle = angleLerp(ped.angle, away, Math.min(1, 8 * dt));
    const sp = ped.speed * 2.6;
    ped.x += Math.cos(ped.angle) * sp * dt;
    ped.y += Math.sin(ped.angle) * sp * dt;
    if (ped.stateT <= 0) ped.state = 'walk';
  } else {
    // Stroll: pick a nearby sidewalk point and walk to it.
    if (!ped.target || dist(ped.x, ped.y, ped.target.x, ped.target.y) < 12) {
      const rp = nearestRoadPoint(world, ped.x, ped.y);
      const side = Math.random() < 0.5 ? -1 : 1;
      if (rp && rp.vertical) {
        ped.target = { x: rp.x + side * 62, y: ped.y + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 160) };
      } else if (rp) {
        ped.target = { x: ped.x + (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 160), y: rp.y + side * 62 };
      } else {
        ped.target = { x: ped.x + (Math.random() - 0.5) * 200, y: ped.y + (Math.random() - 0.5) * 200 };
      }
    }
    const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
    ped.angle = angleLerp(ped.angle, want, Math.min(1, 6 * dt));
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
  }
  collideBuildings(world, ped, 10);
  clampToWorld(world, ped, 16);
  // Peds avoid standing in the middle of the road when walking.
  if (ped.state === 'walk' && isRoad(world, ped.x, ped.y)) {
    const rp = nearestRoadPoint(world, ped.x, ped.y);
    if (rp) {
      const push = rp.vertical ? { x: rp.x + 62 * Math.sign(ped.x - rp.x || 1), y: ped.y } : { x: ped.x, y: rp.y + 62 * Math.sign(ped.y - rp.y || 1) };
      ped.x += (push.x - ped.x) * Math.min(1, 2 * dt);
      ped.y += (push.y - ped.y) * Math.min(1, 2 * dt);
    }
  }
}

export function makeOfficer(world, x, y) {
  return {
    x, y,
    angle: 0,
    speed: POLICE.officerSpeed,
    state: 'chase', // chase | arrest
    shirt: '#1c2733',
    color: '#d8c9a0',
    bob: 0,
  };
}

/** On-foot officer: runs at the player; touching the player busts them. */
export function stepOfficer(world, off, player, dt) {
  off.bob += dt * 10;
  const want = Math.atan2(player.y - off.y, player.x - off.x);
  off.angle = angleLerp(off.angle, want, Math.min(1, 8 * dt));
  off.x += Math.cos(off.angle) * off.speed * dt;
  off.y += Math.sin(off.angle) * off.speed * dt;
  collideBuildings(world, off, 11);
  clampToWorld(world, off, 16);
  return dist(off.x, off.y, player.x, player.y) < POLICE.arrestRange;
}
