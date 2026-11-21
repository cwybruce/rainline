// RAINLINE — game state, loop, player control, combat and screen flow.
import { VIEW_W, VIEW_H, WALK_SPEED, SPRINT_MULT, PLAYER_RADIUS, PLAYER_HP, GUN, CAR, RAIN, WANTED, PALETTE } from './config.js';
import { clamp, dist, mulberry32 } from './util.js';
import { generateWorld, nearestRoadPoint, collideBuildings, clampToWorld } from './world.js';
import { makeCar, stepCarPhysics, stepTraffic, collideCars, driveToward, roadAutopilot } from './vehicles.js';
import { makePed, stepPed, makeOfficer } from './people.js';
import { makeWanted, addHeat, stepWanted, maintainPolice, stepPoliceCar, stepOfficers } from './police.js';
import { MISSIONS, makeMissionState, startMission, missionReach, missionTick, missionEnterCar, currentMission, currentStep } from './missions.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame } from './save.js';
import { makeCamera, updateCamera, drawWorld, drawCar, drawPerson, drawRain, drawHUD, drawTitle, drawPause, drawEndScreen } from './render.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;

export function createGame(canvas) {
  const ctx = canvas.getContext('2d');
  const params = new URLSearchParams(window.location.search);
  const seed = parseInt(params.get('seed') || '7', 10) || 7;
  const shotName = params.get('shot') || '';

  const g = {
    canvas, ctx,
    seed,
    time: 0,
    world: generateWorld(seed),
    rng: mulberry32(seed * 7919 + 13),
    screen: 'title', // title | play | paused | busted | wasted
    menuIndex: 0,
    saveData: loadGame(),
    player: {
      x: 0, y: 0, angle: -Math.PI / 2,
      hp: PLAYER_HP, ammo: GUN.magSize, reserveAmmo: 48,
      fireCooldown: 0, reloadT: 0, aimAngle: 0, bob: 0,
    },
    playerCar: null,
    cars: [],
    peds: [],
    policeCars: [],
    officers: [],
    wanted: makeWanted(),
    mission: makeMissionState(),
    money: 0,
    totalEarned: 0,
    lostCash: 0,
    message: '',
    messageT: 0,
    camera: makeCamera(),
    camOffY: 0, // screenshot scenes can shift the camera (mission banner clearance)
    rainDrops: [],
    lightning: 0,
    nextLightning: 8,
    audio: new AudioEngine(),
    input: new Input(canvas),
    autopilot: null, // {tx, ty} when a shot scene drives itself
    tracer: null, // {x1,y1,x2,y2,t}
    muzzleT: 0,
    danger: null, // last gunshot / crash point peds flee from
    dangerT: 0,
    endKind: '',
    shotName,
  };

  // Rain streaks in screen space.
  for (let i = 0; i < RAIN.drops; i += 1) {
    g.rainDrops.push({
      x: Math.random() * VIEW_W,
      y: Math.random() * VIEW_H,
      len: 14 + Math.random() * 22,
      speed: 620 + Math.random() * 380,
      splash: 0,
    });
  }

  function resetWorld() {
    const lm = g.world.landmarks;
    g.player.x = lm.garage.x;
    g.player.y = lm.garage.y + 60;
    g.player.hp = PLAYER_HP;
    g.player.ammo = GUN.magSize;
    g.player.reserveAmmo = 48;
    g.playerCar = null;
    g.cars = [];
    g.peds = [];
    g.policeCars = [];
    g.officers = [];
    g.wanted = makeWanted();
    g.mission = makeMissionState();
    g.autopilot = null;
    g.tracer = null;
    // Player's starter car parked at the garage, facing east along the road.
    const starter = makeCar(g.world, lm.garage.x + 40, lm.garage.y + 60, 0, 'traffic', { color: '#8a2f2f', name: 'Rook\'s Sedan', model: 'Sedan', maxSpeed: 320 });
    starter.owned = true;
    starter.parked = true;
    g.cars.push(starter);
    // Traffic.
    for (let i = 0; i < 14; i += 1) {
      const x = 60 + g.rng() * (g.world.width - 120);
      const y = 60 + g.rng() * (g.world.height - 120);
      const rp = nearestRoadPoint(g.world, x, y);
      if (!rp) continue;
      const car = makeCar(g.world, rp.x, rp.y, rp.vertical ? Math.PI / 2 : 0, 'traffic', { maxSpeed: 150 });
      car.targetSpeed = 95 + g.rng() * 55;
      car.heading = rp.vertical ? (g.rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (g.rng() < 0.5 ? 0 : Math.PI);
      g.cars.push(car);
    }
    // Parked cars in the Meridian Lot.
    for (let i = 0; i < 3; i += 1) {
      const lot = g.world.landmarks.lot;
      const car = makeCar(g.world, lot.x - 60 + i * 40, lot.y - 60, Math.PI / 2, 'traffic', { maxSpeed: 300 });
      car.parked = true;
      g.cars.push(car);
    }
    // Pedestrians on sidewalks.
    for (let i = 0; i < 22; i += 1) {
      const x = 60 + g.rng() * (g.world.width - 120);
      const y = 60 + g.rng() * (g.world.height - 120);
      g.peds.push(makePed(g.world, x, y));
    }
    g.camera.x = g.player.x;
    g.camera.y = g.player.y;
  }

  g.saveGame = function save() {
    g.totalEarned = Math.max(g.totalEarned, g.money);
    return saveGame(g);
  };

  function applySave(data) {
    g.money = data.money || 0;
    g.totalEarned = data.money || 0;
    g.mission.completed = data.missionsCompleted || [];
    g.mission.index = typeof data.nextMission === 'number' ? data.nextMission : 0;
    if (data.player) { g.player.x = data.player.x; g.player.y = data.player.y; }
    g.mission.nextReady = g.mission.index >= 0 && g.mission.index < MISSIONS.length;
  }

  function newGame() {
    g.money = 0;
    g.totalEarned = 0;
    resetWorld();
    g.screen = 'play';
    startMission(g, 0);
    g.message = MISSIONS[0].briefing;
    g.messageT = 7;
  }

  function continueGame() {
    resetWorld();
    if (g.saveData) applySave(g.saveData);
    g.screen = 'play';
    if (g.mission.nextReady && g.mission.index >= 0) {
      g.message = 'Back on the clock. Press ENTER to start: ' + MISSIONS[g.mission.index].title;
      g.messageT = 8;
    }
  }

  function enterCar(car) {
    if (car.kind === 'police') {
      g.message = 'Locked. PVPD cars don\'t open for you.';
      g.messageT = 3;
      return;
    }
    if (!car.owned && car.kind === 'traffic') {
      addHeat(g.wanted, WANTED.stealCar);
      g.message = 'You jacked the ' + car.model + '. Someone saw that.';
      g.messageT = 3;
      g.audio.thud();
    }
    car.owned = true;
    car.parked = false;
    g.playerCar = car;
    g.player.x = car.x;
    g.player.y = car.y;
    missionEnterCar(g, car);
  }

  function exitCar() {
    const car = g.playerCar;
    if (!car) return;
    g.playerCar = null;
    g.player.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    g.player.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    g.player.angle = car.angle;
    collideBuildings(g.world, g.player, PLAYER_RADIUS);
    car.targetSpeed = 0;
  }

  function nearestCar(maxD) {
    let best = null;
    let bestD = maxD;
    for (const car of g.cars) {
      if (car.dead || car.kind === 'police') continue;
      const d = dist(g.player.x, g.player.y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function shoot() {
    const p = g.player;
    if (p.fireCooldown > 0 || p.reloadT > 0) return;
    if (p.ammo <= 0) {
      p.reloadT = GUN.reloadTime;
      return;
    }
    p.ammo -= 1;
    p.fireCooldown = GUN.fireRate;
    g.audio.gunshot();
    g.muzzleT = 0.06;
    const range = GUN.range;
    const ax = Math.cos(p.aimAngle);
    const ay = Math.sin(p.aimAngle);
    let hitD = range;
    let hit = null;
    let hitKind = '';
    const consider = (x, y, r, obj, kind) => {
      const dx = x - p.x;
      const dy = y - p.y;
      const along = dx * ax + dy * ay;
      if (along < 0 || along > hitD) return;
      const perp = Math.abs(-ay * dx + ax * dy);
      if (perp < r + 4) { hitD = along; hit = obj; hitKind = kind; }
    };
    for (const car of g.cars) {
      if (car.dead || car === g.playerCar) continue;
      consider(car.x, car.y, 20, car, 'car');
    }
    for (const ped of g.peds) {
      if (ped.state === 'down') continue;
      consider(ped.x, ped.y, 11, ped, 'ped');
    }
    for (const off of g.officers) consider(off.x, off.y, 11, off, 'officer');
    const ex = p.x + ax * hitD;
    const ey = p.y + ay * hitD;
    g.tracer = { x1: p.x, y1: p.y, x2: ex, y2: ey, t: 0.09 };
    g.danger = { x: ex, y: ey };
    g.dangerT = 1.5;
    if (hit) {
      if (hitKind === 'car') {
        hit.hp -= GUN.damage;
        if (hit.hp <= 0) { hit.dead = true; hit.targetSpeed = 0; }
        if (hit.kind === 'police') addHeat(g.wanted, WANTED.hitCop);
        else addHeat(g.wanted, 25);
      } else if (hitKind === 'ped') {
        hit.state = 'down';
        hit.stateT = 6;
        addHeat(g.wanted, WANTED.hitPed);
      } else if (hitKind === 'officer') {
        g.officers.splice(g.officers.indexOf(hit), 1);
        addHeat(g.wanted, WANTED.hitCop);
      }
    } else {
      addHeat(g.wanted, 8); // firing a gun in the city still draws attention
    }
  }

  function busted() {
    g.lostCash = Math.floor(g.money * 0.1);
    g.money -= g.lostCash;
    g.wanted = makeWanted();
    g.policeCars = [];
    g.officers = [];
    g.endKind = 'busted';
    g.screen = 'busted';
    g.audio.missionFail();
    g.saveGame();
  }

  function wasted() {
    g.lostCash = Math.floor(g.money * 0.1);
    g.money -= g.lostCash;
    g.wanted = makeWanted();
    g.policeCars = [];
    g.officers = [];
    g.endKind = 'wasted';
    g.screen = 'wasted';
    g.audio.missionFail();
    g.saveGame();
  }

  function respawn() {
    const lm = g.world.landmarks;
    g.player.hp = PLAYER_HP;
    g.player.x = lm.garage.x;
    g.player.y = lm.garage.y + 60;
    g.playerCar = null;
    g.screen = 'play';
    if (g.mission.active) {
      // Keep the current mission running; the player drives back to it.
      g.message = 'Back on your feet. The job is still open.';
      g.messageT = 4;
    }
  }

  function update(dt) {
    g.time += dt;
    // Rain.
    for (const d of g.rainDrops) {
      d.y += d.speed * dt;
      d.x -= d.speed * 0.12 * dt;
      if (d.splash > 0) d.splash = Math.max(0, d.splash - dt * 14);
      if (d.y > VIEW_H) {
        d.y = -20;
        d.x = Math.random() * (VIEW_W + 100);
        if (Math.random() < RAIN.splashChance) d.splash = 5;
      }
      if (d.x < -20) d.x = VIEW_W + 10;
    }
    // Lightning.
    g.nextLightning -= dt;
    if (g.nextLightning <= 0) {
      g.lightning = 1;
      g.nextLightning = RAIN.lightningEveryMin + Math.random() * (RAIN.lightningEveryMax - RAIN.lightningEveryMin);
    }
    if (g.lightning > 0) g.lightning = Math.max(0, g.lightning - dt * 2.2);
    if (g.messageT > 0) g.messageT -= dt;
    if (g.mission.banner) {
      g.mission.banner.t -= dt;
      if (g.mission.banner.t <= 0) g.mission.banner = null;
    }
    if (g.tracer) {
      g.tracer.t -= dt;
      if (g.tracer.t <= 0) g.tracer = null;
    }
    if (g.dangerT > 0) g.dangerT -= dt;
    if (g.muzzleT > 0) g.muzzleT -= dt;

    const input = g.input;

    if (g.screen === 'title') {
      // Ambient city life behind the menu.
      stepAmbient(dt);
      if (input.hit('ArrowUp', 'KeyW')) g.menuIndex = Math.max(0, g.menuIndex - 1);
      if (input.hit('ArrowDown', 'KeyS')) g.menuIndex = Math.min((g.saveData ? 1 : 0), g.menuIndex + 1);
      if (input.hit('Enter', 'NumpadEnter')) {
        g.audio.ensure();
        if (g.saveData && g.menuIndex === 0) continueGame();
        else newGame();
      }
      updateCamera(g.camera, g.player.x, g.player.y, dt);
      return;
    }

    if (g.screen === 'paused') {
      if (input.hit('KeyP', 'Escape')) g.screen = 'play';
      if (input.hit('KeyL')) { g.saveGame(); g.message = 'Game saved.'; g.messageT = 2; }
      if (input.hit('KeyM')) g.audio.setMuted(!g.audio.muted);
      if (input.hit('KeyQ')) { g.screen = 'title'; g.menuIndex = 0; }
      return;
    }

    if (g.screen === 'busted' || g.screen === 'wasted') {
      if (input.hit('Enter', 'NumpadEnter')) respawn();
      return;
    }

    // ---- Play ----
    if (input.hit('KeyP', 'Escape')) { g.screen = 'paused'; return; }
    if (input.hit('KeyM')) g.audio.setMuted(!g.audio.muted);
    if (input.hit('KeyL')) { g.saveGame(); g.message = 'Game saved.'; g.messageT = 2; }

    // Next / retry mission.
    if (g.mission.nextReady && input.hit('Enter', 'NumpadEnter')) {
      g.mission.nextReady = false;
      const idx = g.mission.index;
      if (idx >= 0 && idx < MISSIONS.length) startMission(g, idx);
      else { // replay all jobs
        g.mission.completed = [];
        startMission(g, 0);
      }
    }

    const p = g.player;
    p.fireCooldown = Math.max(0, p.fireCooldown - dt);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) { p.ammo = GUN.magSize; p.reserveAmmo = Math.max(0, p.reserveAmmo - GUN.magSize); }
    }
    if (input.hit('KeyR') && p.ammo < GUN.magSize && p.reserveAmmo > 0) p.reloadT = GUN.reloadTime;

    // Aim from the mouse (world coordinates).
    const aimWorldX = g.camera.x - VIEW_W / 2 + input.mouseX;
    const aimWorldY = g.camera.y - VIEW_H / 2 + input.mouseY;
    p.aimAngle = Math.atan2(aimWorldY - p.y, aimWorldX - p.x);

    if (g.playerCar) {
      const car = g.playerCar;
      let throttle = 0;
      let steer = 0;
      if (g.autopilot) {
        const d = dist(car.x, car.y, g.autopilot.tx, g.autopilot.ty);
        if (d < 40) {
          const rp = nearestRoadPoint(g.world, car.x + (Math.random() - 0.5) * 600, car.y + (Math.random() - 0.5) * 600);
          g.autopilot.tx = rp.x;
          g.autopilot.ty = rp.y;
        }
        const inp = roadAutopilot(g.world, car, g.autopilot.tx, g.autopilot.ty, 260, dt);
        throttle = inp.throttle;
        steer = inp.steer;
      } else {
        throttle = (input.down('KeyW', 'ArrowUp') ? 1 : 0) + (input.down('KeyS', 'ArrowDown') ? -1 : 0);
        steer = (input.down('KeyD', 'ArrowRight') ? 1 : 0) + (input.down('KeyA', 'ArrowLeft') ? -1 : 0);
      }
      const handbrake = input.down('Space');
      const prevSpeed = Math.abs(car.speed);
      stepCarPhysics(g.world, car, { throttle, steer, handbrake }, dt);
      // Crash damage at high speed (rate-limited by the car's crash cooldown).
      if (car.crashT <= 0 && prevSpeed > 240 && Math.abs(car.speed) < prevSpeed * 0.5) {
        p.hp -= 6;
        car.crashT = 0.5;
        g.audio.thud();
      }
      if (car.hp <= 0) {
        car.dead = true;
        exitCar();
        g.message = 'Your ride is wrecked. Find another car.';
        g.messageT = 4;
      }
      if (input.hit('KeyE')) exitCar();
      updateCamera(g.camera, car.x, car.y + g.camOffY, dt);
    } else {
      // On foot.
      let mx = (input.down('KeyD', 'ArrowRight') ? 1 : 0) - (input.down('KeyA', 'ArrowLeft') ? 1 : 0);
      let my = (input.down('KeyS', 'ArrowDown') ? 1 : 0) - (input.down('KeyW', 'ArrowUp') ? 1 : 0);
      const len = Math.hypot(mx, my);
      if (len > 0) {
        mx /= len;
        my /= len;
        const sprint = input.down('ShiftLeft', 'ShiftRight') ? SPRINT_MULT : 1;
        p.x += mx * WALK_SPEED * sprint * dt;
        p.y += my * WALK_SPEED * sprint * dt;
        p.angle = Math.atan2(my, mx);
        p.bob += dt * 10;
      }
      collideBuildings(g.world, p, PLAYER_RADIUS);
      clampToWorld(g.world, p, 16);
      if (input.mouseDown || input.mouseClicked) shoot();
      if (input.hit('KeyE')) {
        const car = nearestCar(46);
        if (car) enterCar(car);
      }
      updateCamera(g.camera, p.x, p.y + g.camOffY, dt);
    }

    // Traffic, peds, police.
    stepAmbient(dt);
    collideCars(g.cars.concat(g.policeCars));

    // Wanted + police.
    stepWanted(g.wanted, g.policeCars, g.officers, p, dt);
    maintainPolice(g.world, g.wanted, g.policeCars, p, g.rng);
    for (const pc of g.policeCars) stepPoliceCar(g.world, pc, p, g.playerCar, dt);
    if (stepOfficers(g.world, g.officers, g.policeCars, p, !g.playerCar, dt)) busted();

    // Officers shoot at an on-foot player.
    if (!g.playerCar) {
      for (const off of g.officers) {
        off.shootT = (off.shootT || 1) - dt;
        const d = dist(off.x, off.y, p.x, p.y);
        if (off.shootT <= 0 && d < 280) {
          off.shootT = 1.4;
          g.audio.gunshot();
          g.tracer = { x1: off.x, y1: off.y, x2: p.x, y2: p.y, t: 0.08 };
          if (Math.random() < 0.45) {
            p.hp -= 8;
            g.message = 'PVPD is firing on you!';
            g.messageT = 2;
          }
        }
      }
    }

    // Missions.
    missionReach(g);
    missionTick(g, dt);

    // Player down?
    if (p.hp <= 0) wasted();

    // Audio follows the chase.
    const speed = g.playerCar ? Math.abs(g.playerCar.speed) : 0;
    g.audio.update(speed, g.wanted.level, !!g.playerCar);
  }

  function stepAmbient(dt) {
    // Traffic cars drive; parked / mission cars sit still; the player's own
    // car is never traffic-driven (its driver is the player or the autopilot).
    for (const car of g.cars) {
      if (car.dead || car.parked || car.kind === 'police' || car.kind === 'target' || car === g.playerCar) continue;
      stepTraffic(g.world, car, g.cars, dt);
    }
    // The payroll van is moved by the mission controller, not traffic.
    const danger = g.dangerT > 0 ? g.danger : (g.playerCar && Math.abs(g.playerCar.speed) > 200 ? g.playerCar : null);
    for (const ped of g.peds) stepPed(g.world, ped, g.player, danger, dt);
  }

  // Screenshot scenes drive the same ambient step.
  g.__ambient = stepAmbient;

  function render() {
    const ctx = g.ctx;
    ctx.clearRect(0, 0, VIEW_W, VIEW_H);
    ctx.save();
    drawWorld(g, ctx, g.camera);
    for (const car of g.cars) {
      if (!car.dead) drawCar(ctx, g.camera, car, g.time);
    }
    for (const car of g.policeCars) {
      if (!car.dead) drawCar(ctx, g.camera, car, g.time);
    }
    for (const ped of g.peds) drawPerson(ctx, g.camera, ped, false, null, g.time);
    for (const off of g.officers) drawPerson(ctx, g.camera, off, false, null, g.time);
    if (!g.playerCar) {
      drawPerson(ctx, g.camera, g.player, true, g.player.aimAngle, g.time);
      if (g.muzzleT > 0) {
        const sx = g.player.x - g.camera.x + VIEW_W / 2 + Math.cos(g.player.aimAngle) * 24;
        const sy = g.player.y - g.camera.y + VIEW_H / 2 + Math.sin(g.player.aimAngle) * 24;
        ctx.fillStyle = 'rgba(255, 230, 150, 0.9)';
        ctx.beginPath();
        ctx.arc(sx, sy, 7, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    // Gunfire tracer.
    if (g.tracer) {
      const a = { x: g.tracer.x1 - g.camera.x + VIEW_W / 2, y: g.tracer.y1 - g.camera.y + VIEW_H / 2 };
      const b = { x: g.tracer.x2 - g.camera.x + VIEW_W / 2, y: g.tracer.y2 - g.camera.y + VIEW_H / 2 };
      ctx.strokeStyle = 'rgba(255, 220, 120, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    drawRain(ctx, g);
    ctx.restore();

    if (g.screen === 'title') drawTitle(g, ctx);
    else if (g.screen === 'paused') { drawHUD(g, ctx); drawPause(g, ctx); }
    else if (g.screen === 'busted' || g.screen === 'wasted') { drawHUD(g, ctx); drawEndScreen(g, ctx, g.endKind); }
    else drawHUD(g, ctx);
  }

  let last = performance.now();
  let acc = 0;
  function frame(now) {
    const elapsed = Math.min(0.1, (now - last) / 1000);
    last = now;
    acc += elapsed;
    let guard = 0;
    while (acc >= STEP && guard < 5) {
      update(STEP);
      acc -= STEP;
      guard += 1;
    }
    render();
    g.input.consume();
    requestAnimationFrame(frame);
  }

  // Boot.
  resetWorld();
  if (shotName) {
    stageShot(shotName, g);
  }
  window.__rainline = { game: g, ready: true };
  requestAnimationFrame(frame);
  return g;
}
