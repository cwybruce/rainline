// The wanted system: heat, stars, police spawns and the dragnet.
import { WANTED, POLICE } from './config.js';
import { clamp, dist } from './util.js';
import { makeCar, driveToward, stepCarPhysics, roadAutopilot } from './vehicles.js';
import { makeOfficer, stepOfficer } from './people.js';
import { nearestRoadPoint } from './world.js';

export function makeWanted() {
  return {
    level: 0,
    heat: 0,
    unseenFor: 0,
    lastSeenX: 0,
    lastSeenY: 0,
  };
}

/** Add heat; stars are heat / 100, capped at 5. */
export function addHeat(wanted, amount) {
  wanted.heat = clamp(wanted.heat + amount, 0, WANTED.maxLevel * WANTED.heatPerLevel);
  const level = Math.min(WANTED.maxLevel, Math.floor(wanted.heat / WANTED.heatPerLevel) + (wanted.heat > 0 ? 1 : 0));
  wanted.level = wanted.heat <= 0 ? 0 : level;
}

/** Per-frame wanted update: decay while no police can see the player. */
export function stepWanted(wanted, policeCars, officers, player, dt) {
  let seen = false;
  for (const c of policeCars) {
    if (dist(c.x, c.y, player.x, player.y) < 520) { seen = true; break; }
  }
  if (!seen) {
    for (const o of officers) {
      if (dist(o.x, o.y, player.x, player.y) < 320) { seen = true; break; }
    }
  }
  if (seen) {
    wanted.unseenFor = 0;
    wanted.lastSeenX = player.x;
    wanted.lastSeenY = player.y;
  } else {
    wanted.unseenFor += dt;
    if (wanted.unseenFor > WANTED.decayDelay && wanted.level > 0) {
      wanted.heat -= WANTED.decayRate * 100 * dt;
      if (wanted.heat <= 0) { wanted.heat = 0; wanted.level = 0; }
      else wanted.level = Math.min(WANTED.maxLevel, Math.floor(wanted.heat / WANTED.heatPerLevel) + 1);
    }
  }
  return seen;
}

/** Keep the right number of police cars on the map for the wanted level. */
export function maintainPolice(world, wanted, policeCars, player, rng) {
  const want = wanted.level === 0 ? 0 : Math.min(5, wanted.level + (wanted.level >= 3 ? 1 : 0));
  while (policeCars.length < want) {
    // Spawn on a road 500-700px away from the player.
    let x = 0;
    let y = 0;
    for (let tries = 0; tries < 12; tries += 1) {
      const a = rng() * Math.PI * 2;
      const d = 520 + rng() * 220;
      x = player.x + Math.cos(a) * d;
      y = player.y + Math.sin(a) * d;
      x = clamp(x, 60, world.width - 60);
      y = clamp(y, 60, world.height - 60);
      const rp = nearestRoadPoint(world, x, y);
      if (rp) { x = rp.x; y = rp.y; break; }
    }
    const car = makeCar(world, x, y, Math.atan2(player.y - y, player.x - x), 'police', { maxSpeed: POLICE.maxSpeed });
    policeCars.push(car);
  }
  while (policeCars.length > want) policeCars.pop();
}

/** Police cars chase the player's last seen position, then the player. */
export function stepPoliceCar(world, car, player, playerCar, dt) {
  const target = playerCar || player;
  const tx = target.x;
  const ty = target.y;
  const input = roadAutopilot(world, car, tx, ty, POLICE.maxSpeed, dt);
  stepCarPhysics(world, car, input, dt);
  car.flashing += dt;
  // Ram: nudge the player's car on contact (a shove, not a spin-out).
  if (playerCar && dist(car.x, car.y, playerCar.x, playerCar.y) < 44) {
    const push = 110;
    const a = Math.atan2(playerCar.y - car.y, playerCar.x - car.x);
    playerCar.vx += Math.cos(a) * push * dt;
    playerCar.vy += Math.sin(a) * push * dt;
    playerCar.hp = Math.max(0, playerCar.hp - POLICE.ramDamage * dt);
  }
}

/** Officers spill out of a stopped police car near an on-foot player. */
export function stepOfficers(world, officers, policeCars, player, onFoot, dt) {
  let busted = false;
  if (onFoot) {
    for (const car of policeCars) {
      if (dist(car.x, car.y, player.x, player.y) < 130 && officers.length < 3 && Math.random() < dt * 0.5) {
        officers.push(makeOfficer(world, car.x + 20, car.y + 20));
      }
    }
    for (let i = officers.length - 1; i >= 0; i -= 1) {
      if (stepOfficer(world, officers[i], player, dt)) busted = true;
      if (dist(officers[i].x, officers[i].y, player.x, player.y) > 900) officers.splice(i, 1);
    }
  } else if (officers.length) {
    officers.length = 0;
  }
  return busted;
}
