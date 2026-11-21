// Screenshot scenes behind ?shot=title|drive|chase|mission.
// Each one plays the real rules forward from a fresh world for a fixed number of steps,
// so the frame is what a short game really looks like. The drive and chase scenes leave
// the autopilot on, so the city keeps moving while the shot is taken.
import { makeCar } from './vehicles.js';
import { driveToward, stepCarPhysics, roadAutopilot } from './vehicles.js';
import { addHeat, maintainPolice, stepPoliceCar } from './police.js';
import { startMission } from './missions.js';
import { nearestRoadPoint } from './world.js';
import { dist } from './util.js';

const STEP = 1 / 60;

/** Run the game's own update loop N steps without input. */
function runFor(g, seconds, autopilotTarget) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    // Drive the player's car with the autopilot.
    if (g.playerCar && autopilotTarget) {
      const car = g.playerCar;
      const d = dist(car.x, car.y, autopilotTarget.tx, autopilotTarget.ty);
      if (d < 40) {
        const rp = nearestRoadPoint(g.world, car.x + (Math.random() - 0.5) * 700, car.y + (Math.random() - 0.5) * 700);
        autopilotTarget.tx = rp.x;
        autopilotTarget.ty = rp.y;
      }
      const inp = roadAutopilot(g.world, car, autopilotTarget.tx, autopilotTarget.ty, 260, STEP);
      stepCarPhysics(g.world, car, inp, STEP);
    }
    // Police chase the player.
    for (const pc of g.policeCars) stepPoliceCar(g.world, pc, g.player, g.playerCar, STEP);
    // Ambient traffic and pedestrians keep moving.
    g.__ambient(STEP);
    g.time += STEP;
  }
}

/** Stage the named scene on the game. Called once at boot, before the first frame. */
export function stageShot(name, g) {
  const lm = g.world.landmarks;
  if (name === 'drive') {
    // Rook in his sedan, mid-drive on the Rainline Expressway in the rain.
    const hwy = g.world.highway;
    const car = makeCar(g.world, 500, hwy.cy + 20, 0, 'target', { color: '#8a2f2f', name: "Rook's Sedan", model: 'Sedan', maxSpeed: 320 });
    car.owned = true;
    g.cars.push(car);
    g.playerCar = car;
    g.player.x = car.x;
    g.player.y = car.y;
    g.camera.x = car.x;
    g.camera.y = car.y;
    const target = { tx: 2700, ty: hwy.cy };
    g.autopilot = target;
    runFor(g, 5, target);
    g.screen = 'play';
    g.message = 'Rainline Expressway — grip is low, drifts are free.';
    g.messageT = 6;
    return;
  }
  if (name === 'chase') {
    // Three stars on the Rainline Expressway: Rook's sedan flat out east with
    // three PVPD cruisers right on its tail, lights flashing.
    const hwy = g.world.highway;
    const car = makeCar(g.world, 900, hwy.cy + 20, 0, 'target', { color: '#8a2f2f', name: "Rook's Sedan", model: 'Sedan', maxSpeed: 320 });
    car.owned = true;
    g.cars.push(car);
    g.playerCar = car;
    g.player.x = car.x;
    g.player.y = car.y;
    addHeat(g.wanted, 250);
    maintainPolice(g.world, g.wanted, g.policeCars, g.player, g.rng);
    // Line the cruisers up behind Rook on the same highway, lights flashing.
    g.policeCars.forEach((pc, i) => {
      pc.x = car.x - 110 - i * 75;
      pc.y = hwy.cy + (i % 2 === 0 ? 34 : -14);
      pc.angle = 0;
      pc.vx = 200;
      pc.vy = 0;
    });
    g.camera.x = car.x + 60;
    g.camera.y = car.y;
    const target = { tx: 2700, ty: hwy.cy };
    g.autopilot = target;
    runFor(g, 3, target);
    g.screen = 'play';
    g.message = 'Three stars. Lose them on the expressway.';
    g.messageT = 6;
    return;
  }
  if (name === 'mission') {
    // Mission 1 just completed outside the Inkwell Club: banner, payout, passenger gone.
    startMission(g, 0);
    g.mission.completed = ['first-fare'];
    g.money = 800;
    g.totalEarned = 800;
    g.mission.active = false;
    g.mission.index = 1;
    g.mission.nextReady = true;
    g.mission.banner = { title: 'MISSION COMPLETE', sub: 'First Fare  •  +$800', t: 4 };
    const car = makeCar(g.world, lm.club.x + 30, lm.club.y + 40, Math.PI, 'traffic', { color: '#8a2f2f', name: "Rook's Sedan", model: 'Sedan', maxSpeed: 320 });
    car.owned = true;
    car.parked = true;
    g.cars.push(car);
    g.player.x = lm.club.x;
    g.player.y = lm.club.y + 40;
    g.camOffY = -120; // player sits below the banner, not behind it
    g.camera.x = g.player.x;
    g.camera.y = g.player.y - 120;
    for (let i = 0; i < 120; i += 1) { g.__ambient(STEP); g.time += STEP; }
    g.screen = 'play';
    g.message = 'Press ENTER for the next job: Cold Wheels';
    g.messageT = 8;
    return;
  }
  // Default: title. Let the city breathe for a few seconds behind the menu.
  g.__ambient(6);
  g.time += 6;
  g.camera.x = lm.garage.x;
  g.camera.y = lm.garage.y;
  g.screen = 'title';
}
