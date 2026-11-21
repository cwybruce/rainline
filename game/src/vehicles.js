// Cars: arcade driving physics on rain-slick roads, plus traffic and pursuit steering.
import { CAR, PALETTE } from './config.js';
import { clamp, angleDiff, angleLerp, dist } from './util.js';
import { isRoad, collideBuildings, clampToWorld, nearestRoadPoint } from './world.js';

let nextId = 1;

const TRAFFIC_COLORS = ['#5b6b7a', '#7a5b5b', '#4a5d4a', '#6b5b7a', '#8a7a4a', '#3f4a5a', '#74553a', '#54606e'];
const TRAFFIC_MODELS = ['Sedan', 'Hatch', 'Taxi', 'Van', 'Coupe', 'Pickup'];

/** Make a car. kind: 'player' | 'traffic' | 'police' | 'target'. */
export function makeCar(world, x, y, angle, kind, opts = {}) {
  const car = {
    id: nextId++,
    kind,
    x, y, angle,
    vx: 0, vy: 0,
    speed: 0, // signed forward speed
    steer: 0,
    color: opts.color || (kind === 'police' ? '#1c2733' : TRAFFIC_COLORS[Math.floor(Math.random() * TRAFFIC_COLORS.length)]),
    model: opts.model || TRAFFIC_MODELS[Math.floor(Math.random() * TRAFFIC_MODELS.length)],
    name: opts.name || '',
    hp: opts.hp || 100,
    maxSpeed: opts.maxSpeed || CAR.maxSpeed,
    crashT: 0, // cooldown between wall-scrape damage ticks
    driver: kind, // 'player' | 'traffic' | 'police' | 'target'
    targetSpeed: 0,
    // traffic AI
    heading: angle,
    nextTurnAt: 0,
    lane: (Math.random() < 0.5 ? -1 : 1) * 14,
    stopped: false,
    // police
    siren: kind === 'police',
    flashing: 0,
    // mission van
    isVan: !!opts.isVan,
    dead: false,
    horn: 0,
  };
  return car;
}

/** Arcade car physics. input: {throttle, steer, handbrake} each in -1..1. Rain cuts grip. */
export function stepCarPhysics(world, car, input, dt) {
  const grip = input.handbrake ? CAR.handbrakeGrip : CAR.gripWet; // it always rains in Port Vane
  const fwdX = Math.cos(car.angle);
  const fwdY = Math.sin(car.angle);
  const rightX = -fwdY;
  const rightY = fwdX;

  // Forward speed along the car's heading.
  let fwdSpeed = car.vx * fwdX + car.vy * fwdY;
  let latSpeed = car.vx * rightX + car.vy * rightY;

  // Engine / brake.
  if (input.throttle > 0) fwdSpeed += CAR.accel * input.throttle * dt;
  else if (input.throttle < 0) {
    if (fwdSpeed > 8) fwdSpeed += CAR.brake * input.throttle * dt; // brake
    else fwdSpeed += CAR.reverseAccel * input.throttle * dt; // reverse
  }
  // Drag and rolling resistance.
  fwdSpeed -= fwdSpeed * 0.55 * dt;
  if (Math.abs(fwdSpeed) < 4 && input.throttle === 0) fwdSpeed = 0;
  fwdSpeed = clamp(fwdSpeed, -CAR.maxReverse, car.maxSpeed);

  // Steering: stronger at speed, weaker when crawling.
  const steerAuthority = clamp(Math.abs(fwdSpeed) / 90, 0, 1) * (fwdSpeed >= 0 ? 1 : -1);
  const targetSteer = input.steer * CAR.steerRate * steerAuthority;
  car.steer += (targetSteer - car.steer) * Math.min(1, 10 * dt);
  car.angle += car.steer * dt * (input.handbrake ? 1.35 : 1);

  // Lateral grip: rain makes the car slide.
  latSpeed *= Math.exp(-grip * dt);

  car.vx = fwdX * fwdSpeed + rightX * latSpeed;
  car.vy = fwdY * fwdSpeed + rightY * latSpeed;
  car.x += car.vx * dt;
  car.y += car.vy * dt;
  car.speed = fwdSpeed;

  clampToWorld(world, car, 24);
  car.crashT = Math.max(0, (car.crashT || 0) - dt);
  if (collideBuildings(world, car, CAR.radius)) {
    // Scrape: kill some speed, keep sliding along the wall. Damage ticks
    // at most twice a second and only when the impact had real speed.
    car.vx *= 0.55;
    car.vy *= 0.55;
    car.speed *= 0.55;
    if (car.crashT <= 0 && Math.abs(car.speed) > 40) {
      car.hp = Math.max(0, car.hp - 3);
      car.crashT = 0.5;
    }
  }
  return car;
}

/** Steer a car toward a point, as the autopilot and police do. Returns the input. */
export function driveToward(car, tx, ty, targetSpeed, dt) {
  const desired = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, desired);
  const steer = clamp(diff * 1.6, -1, 1);
  const d = dist(car.x, car.y, tx, ty);
  let throttle = 1;
  if (Math.abs(diff) > 1.9) throttle = 0.35; // slow down for a hard turn
  if (d < 60) throttle = 0.3;
  if (car.speed > targetSpeed) throttle = 0;
  return { throttle, steer, handbrake: Math.abs(diff) > 2.4 && car.speed > 120 };
}

/** Nearest vertical / horizontal road centre lines. */
function nearestVerticalCentre(world, x) {
  let best = world.vRoads[0];
  let bestD = Infinity;
  for (const r of world.vRoads) {
    const cx = (r.x0 + r.x1) / 2;
    const d = Math.abs(x - cx);
    if (d < bestD) { bestD = d; best = r; }
  }
  return (best.x0 + best.x1) / 2;
}

function nearestHorizontalCentre(world, y) {
  let best = world.hRoads[0];
  let bestD = Infinity;
  for (const r of world.hRoads) {
    const cy = (r.y0 + r.y1) / 2;
    const d = Math.abs(y - cy);
    if (d < bestD) { bestD = d; best = r; }
  }
  return (best.y0 + best.y1) / 2;
}

/**
 * Road-following autopilot: drive along the road grid toward a point, turning
 * at intersections (Manhattan routing), and steer straight at it when close.
 * Keeps cars off the buildings, unlike a straight-line chase.
 */
export function roadAutopilot(world, car, tx, ty, targetSpeed, dt) {
  const d = dist(car.x, car.y, tx, ty);
  if (d < 140) return driveToward(car, tx, ty, targetSpeed, dt);
  // Off-road (wedged): head back to the nearest road first.
  if (!isRoad(world, car.x, car.y)) {
    const rp = nearestRoadPoint(world, car.x, car.y);
    if (rp) return driveToward(car, rp.x, rp.y, targetSpeed, dt);
  }
  const dx = tx - car.x;
  const dy = ty - car.y;
  let wx;
  let wy;
  if (Math.abs(dx) > Math.abs(dy)) {
    // Close the east-west gap: run along the nearest horizontal road.
    wx = car.x + Math.sign(dx) * 220;
    wy = nearestHorizontalCentre(world, car.y);
  } else {
    // Close the north-south gap: run along the nearest vertical road.
    wx = nearestVerticalCentre(world, car.x);
    wy = car.y + Math.sign(dy) * 220;
  }
  return driveToward(car, wx, wy, targetSpeed, dt);
}

/** Traffic: follow the road grid, turn at intersections, brake for the car ahead. */
export function stepTraffic(world, car, cars, dt) {
  // Find the car ahead on roughly the same heading.
  let ahead = null;
  let aheadD = 120;
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const d = Math.hypot(dx, dy);
    if (d < aheadD) {
      const fwd = Math.cos(car.angle) * dx + Math.sin(car.angle) * dy;
      if (fwd > 0 && Math.abs(-Math.sin(car.angle) * dx + Math.cos(car.angle) * dy) < 26) {
        ahead = other;
        aheadD = d;
      }
    }
  }
  if (ahead && aheadD < 70) {
    stepCarPhysics(world, car, { throttle: -0.6, steer: 0, handbrake: false }, dt);
    return;
  }

  // Are we at an intersection? (near a road crossing centre)
  const nearCentre = (v) => {
    for (const r of world.vRoads) {
      const cx = (r.x0 + r.x1) / 2;
      if (Math.abs(v - cx) < 46) return true;
    }
    return false;
  };
  const atX = nearCentre(car.x);
  const atY = (() => {
    for (const r of world.hRoads) {
      const cy = (r.y0 + r.y1) / 2;
      if (Math.abs(car.y - cy) < 46) return true;
    }
    return false;
  })();

  if (atX && atY && Math.random() < dt * 0.9) {
    // Pick a new cardinal direction (not a U-turn).
    const dirs = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const cur = Math.round(car.angle / (Math.PI / 2)) % 4;
    const options = dirs.filter((d) => Math.abs(angleDiff(d, car.angle)) > 2.6 ? false : Math.abs(angleDiff(d, car.angle)) < 0.1 ? false : true);
    if (options.length) car.heading = options[Math.floor(Math.random() * options.length)];
    void cur;
  }

  // Steer toward the current heading, staying on the road.
  const target = {
    x: car.x + Math.cos(car.heading) * 120,
    y: car.y + Math.sin(car.heading) * 120,
  };
  // Nudge toward the centre line of the road we are on.
  const rp = nearestRoadPoint(world, car.x, car.y);
  if (rp) {
    if (rp.vertical) target.x = rp.x + car.lane;
    else target.y = rp.y + car.lane;
  }
  const input = driveToward(car, target.x, target.y, car.targetSpeed || 120, dt);
  stepCarPhysics(world, car, input, dt);
  // Keep traffic on roads: if it drifted into a block, steer back.
  if (!isRoad(world, car.x, car.y)) {
    const back = nearestRoadPoint(world, car.x, car.y);
    if (back) {
      const inp = driveToward(car, back.x, back.y, 80, dt);
      stepCarPhysics(world, car, inp, dt);
    }
  }
}

/** Simple circle collision between cars: push apart and exchange a little speed. */
export function collideCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      if (a.dead || b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = CAR.radius * 2 - 4;
      if (d > 0.01 && d < min) {
        const push = (min - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        if (rel > 0) {
          a.vx -= nx * rel * 0.5;
          a.vy -= ny * rel * 0.5;
          b.vx += nx * rel * 0.5;
          b.vy += ny * rel * 0.5;
          a.hp = Math.max(0, a.hp - 1);
          b.hp = Math.max(0, b.hp - 1);
        }
      }
    }
  }
}
