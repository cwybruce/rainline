// Missions: the Rainline Job — four jobs from the fixer Vera, one story thread.
// Each mission is a list of steps. The main loop feeds the controller events
// (reach a marker, enter a car, stop the van, grab the cash, beat the timer).
import { addHeat } from './police.js';
import { dist } from './util.js';
import { makeCar } from './vehicles.js';

export const MISSIONS = [
  {
    id: 'first-fare',
    title: 'First Fare',
    payout: 800,
    briefing: 'Vera: "Rook, you\'re back on the clock. Pick up Dove on Marrow Street and get her to the Inkwell Club. Keep it clean — no heat."',
    steps: [
      { type: 'goto', target: 'pickup', radius: 46, text: 'Pick up Dove on Marrow Street' },
      { type: 'driveTo', target: 'club', radius: 60, text: 'Drive Dove to the Inkwell Club', needsCar: true },
    ],
  },
  {
    id: 'cold-wheels',
    title: 'Cold Wheels',
    payout: 1500,
    briefing: 'Vera: "A black Nightjar coupe is sitting in the Meridian Lot. Take it. The owner won\'t miss it till morning — the cops might."',
    steps: [
      { type: 'goto', target: 'lot', radius: 70, text: 'Reach the Meridian Lot' },
      { type: 'enterCar', target: 'nightjar', radius: 0, text: 'Steal the black Nightjar coupe' },
      { type: 'driveTo', target: 'garage', radius: 60, text: 'Bring the Nightjar to your garage', needsCar: true },
    ],
  },
  {
    id: 'payroll',
    title: 'Payroll in the Rain',
    payout: 4000,
    briefing: 'Vera: "A payroll van runs the expressway loop tonight, fat with cash. Stop it, take the case, bring it to my stash. Expect company."',
    steps: [
      { type: 'goto', target: 'highway', radius: 90, text: 'Find the payroll van on the expressway' },
      { type: 'stopVan', target: 'van', radius: 0, text: 'Stop the payroll van — ram it or shoot it' },
      { type: 'grab', target: 'cash', radius: 40, text: 'Grab the cash case' },
      { type: 'driveTo', target: 'stash', radius: 60, text: 'Deliver the cash to Vera\'s stash', needsCar: false },
    ],
  },
  {
    id: 'storm-break',
    title: 'Storm Break',
    payout: 8000,
    briefing: 'Vera: "The whole city is on you, Rook. Four stars and climbing. Make the east tunnel before the dragnet closes — then you\'re a legend."',
    timeLimit: 100,
    steps: [
      { type: 'escape', target: 'tunnel', radius: 70, text: 'Reach the east tunnel — outrun the dragnet', timer: 100 },
    ],
  },
];

/** Fresh mission runtime state. */
export function makeMissionState() {
  return {
    index: 0, // which mission is active; -1 = free roam
    step: 0,
    active: false,
    timer: 0,
    startedAt: 0,
    passenger: false,
    van: null,
    cash: null, // {x, y, taken}
    nightjar: null,
    banner: null, // {title, sub, t}
    completed: [], // mission ids finished
  };
}

export function currentMission(m) {
  return m.index >= 0 && m.index < MISSIONS.length ? MISSIONS[m.index] : null;
}

export function currentStep(m) {
  const mission = currentMission(m);
  return mission ? mission.steps[m.step] : null;
}

/** Start mission i (or resume free roam when i is out of range). */
export function startMission(g, i) {
  const m = g.mission;
  m.index = i;
  m.step = 0;
  m.active = i >= 0 && i < MISSIONS.length;
  m.timer = 0;
  m.passenger = false;
  m.van = null;
  m.cash = null;
  m.nightjar = null;
  if (!m.active) return;
  const mission = MISSIONS[i];
  g.message = mission.title + ' — ' + mission.briefing;
  g.messageT = 7;
  if (mission.id === 'cold-wheels') {
    const lot = g.world.landmarks.lot;
    m.nightjar = makeCar(g.world, lot.x, lot.y - 20, Math.PI / 2, 'target', { color: '#0c0c10', name: 'Nightjar', model: 'Nightjar', maxSpeed: 355 });
    g.cars.push(m.nightjar);
  }
  if (mission.id === 'payroll') {
    const hwy = g.world.highway;
    m.van = makeCar(g.world, 300, hwy.cy + 20, 0, 'target', { color: '#5a6b7a', name: 'Payroll Van', model: 'Van', isVan: true, hp: 120, maxSpeed: 210 });
    m.van.heading = 0;
    m.van.targetSpeed = 150;
    g.cars.push(m.van);
  }
  if (mission.id === 'storm-break') {
    addHeat(g.wanted, 300); // four stars, instantly
    m.timer = mission.timeLimit;
  }
}

/** Advance the mission when the player reaches the current marker. */
export function missionReach(g) {
  const m = g.mission;
  if (!m.active) return;
  const step = currentStep(m);
  if (!step) return;
  if (step.type !== 'goto' && step.type !== 'driveTo' && step.type !== 'escape') return;
  if (step.needsCar && !g.playerCar) return; // drive-to steps need a car
  const target = stepTarget(g, step);
  if (!target) return;
  const p = g.playerCar || g.player;
  if (dist(p.x, p.y, target.x, target.y) < step.radius) {
    if (step.type === 'goto' && currentMission(m).id === 'first-fare' && m.step === 0) {
      m.passenger = true;
      g.message = 'Dove is in. "Don\'t keep Vera waiting, driver."';
      g.messageT = 4;
      g.audio.blip();
    }
    advanceStep(g);
  }
}

export function stepTarget(g, step) {
  const lm = g.world.landmarks;
  if (step.target === 'highway') return { x: g.world.width / 2, y: g.world.highway.cy };
  if (step.target === 'van') return g.mission.van ? { x: g.mission.van.x, y: g.mission.van.y } : null;
  if (step.target === 'cash') return g.mission.cash;
  if (step.target === 'nightjar') return g.mission.nightjar ? { x: g.mission.nightjar.x, y: g.mission.nightjar.y } : null;
  return lm[step.target] || null;
}

/** Called when the player enters a car. */
export function missionEnterCar(g, car) {
  const m = g.mission;
  if (!m.active) return;
  const step = currentStep(m);
  if (step && step.type === 'enterCar') {
    if (car === m.nightjar) {
      addHeat(g.wanted, 110); // stealing the Nightjar draws two stars
      g.message = 'The Nightjar is yours. The owner just called it in — move!';
      g.messageT = 4;
      advanceStep(g);
    }
  }
}

/** Called every frame for step types that need watching (van stopped, cash grab, timer). */
export function missionTick(g, dt) {
  const m = g.mission;
  if (!m.active) return;
  const step = currentStep(m);
  if (!step) return;
  if (step.type === 'stopVan' && m.van && m.van.hp <= 30) {
    m.cash = { x: m.van.x + 30, y: m.van.y + 10, taken: false };
    g.message = 'The van is stopped. Grab the cash case!';
    g.messageT = 4;
    g.audio.blip();
    advanceStep(g);
    return;
  }
  if (step.type === 'grab' && m.cash && !m.cash.taken) {
    const p = g.playerCar || g.player;
    if (dist(p.x, p.y, m.cash.x, m.cash.y) < step.radius) {
      m.cash.taken = true;
      addHeat(g.wanted, 110);
      g.message = 'Cash secured. Three stars — get it to Vera\'s stash!';
      g.messageT = 4;
      g.audio.cash();
      advanceStep(g);
      return;
    }
  }
  if (step.type === 'escape') {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(g, 'The dragnet closed in. Vera will call again.');
    }
  }
  // The payroll van keeps driving its loop while it is a target.
  if (m.van && !m.van.dead && step.type === 'stopVan') {
    const hwy = g.world.highway;
    if (m.van.x > g.world.width - 140) { m.van.heading = Math.PI; }
    if (m.van.x < 140) { m.van.heading = 0; }
    m.van.y += ((hwy.cy + 20) - m.van.y) * Math.min(1, 2 * dt);
    m.van.angle = m.van.heading;
    m.van.x += Math.cos(m.van.heading) * m.van.targetSpeed * dt;
    m.van.speed = m.van.targetSpeed;
  }
}

function advanceStep(g) {
  const m = g.mission;
  m.step += 1;
  const mission = currentMission(m);
  if (m.step >= mission.steps.length) {
    completeMission(g, mission);
  } else {
    const next = mission.steps[m.step];
    g.message = next.text;
    g.messageT = 4;
  }
}

function completeMission(g, mission) {
  const m = g.mission;
  m.active = false;
  m.completed.push(mission.id);
  g.money += mission.payout;
  m.banner = { title: 'MISSION COMPLETE', sub: mission.title + '  •  +' + '$' + mission.payout.toLocaleString('en-US'), t: 4 };
  g.audio.missionComplete();
  g.saveGame();
  // Next mission starts on the player's say-so (Enter), or auto-queue the next one.
  m.index += 1;
  if (m.index < MISSIONS.length) {
    m.nextReady = true;
    g.message = 'Press ENTER for the next job: ' + MISSIONS[m.index].title;
    g.messageT = 8;
  } else {
    m.index = -1;
    g.message = 'The Rainline Job is done. Port Vane is yours, legend. Free roam — press ENTER to replay the jobs.';
    g.messageT = 10;
  }
}

export function failMission(g, reason) {
  const m = g.mission;
  m.active = false;
  m.banner = { title: 'JOB FAILED', sub: reason, t: 4 };
  g.audio.missionFail();
  m.index = m.index; // retry the same mission on ENTER
  m.nextReady = true;
  g.message = 'Press ENTER to retry: ' + (currentMission(m) ? currentMission(m).title : '');
  g.messageT = 8;
}
