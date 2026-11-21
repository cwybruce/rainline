// All canvas drawing: the rainy city, cars, people, rain, minimap, HUD and menus.
import { VIEW_W, VIEW_H, ROAD, PALETTE, CAR, RANKS } from './config.js';
import { clamp, lerp, money } from './util.js';
import { currentMission, currentStep, stepTarget } from './missions.js';

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Deterministic pseudo-random from two integers (building windows). */
function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  return (((h ^ (h >> 16)) >>> 0) / 4294967296);
}

export function makeCamera() {
  return { x: 0, y: 0 };
}

export function updateCamera(cam, tx, ty, dt) {
  const k = Math.min(1, 5 * dt);
  cam.x = lerp(cam.x, tx, k);
  cam.y = lerp(cam.y, ty, k);
}

function toScreen(cam, x, y) {
  return { x: x - cam.x + VIEW_W / 2, y: y - cam.y + VIEW_H / 2 };
}

export function drawWorld(g, ctx, cam) {
  const w = g.world;
  const view = {
    x0: cam.x - VIEW_W / 2 - 60,
    y0: cam.y - VIEW_H / 2 - 60,
    x1: cam.x + VIEW_W / 2 + 60,
    y1: cam.y + VIEW_H / 2 + 60,
  };

  // Ground.
  ctx.fillStyle = PALETTE.ground;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  // Roads: asphalt bands with sidewalks.
  ctx.fillStyle = PALETTE.sidewalk;
  for (const r of w.vRoads) {
    const a = toScreen(cam, r.x0 - 16, 0);
    ctx.fillRect(a.x, 0, ROAD + 32, VIEW_H);
  }
  for (const r of w.hRoads) {
    const a = toScreen(cam, 0, r.y0 - 16);
    ctx.fillRect(0, a.y, VIEW_W, (r.y1 - r.y0) + 32);
  }
  ctx.fillStyle = PALETTE.asphalt;
  for (const r of w.vRoads) {
    const a = toScreen(cam, r.x0, 0);
    ctx.fillRect(a.x, 0, ROAD, VIEW_H);
  }
  for (const r of w.hRoads) {
    const a = toScreen(cam, 0, r.y0);
    ctx.fillRect(0, a.y, VIEW_W, r.y1 - r.y0);
  }

  // Road centre dashes (vertical roads).
  ctx.fillStyle = PALETTE.roadLine;
  for (const r of w.vRoads) {
    const cx = (r.x0 + r.x1) / 2;
    const sx = toScreen(cam, cx, 0).x;
    if (sx < -10 || sx > VIEW_W + 10) continue;
    for (let y = Math.floor(view.y0 / 44) * 44; y < view.y1; y += 44) {
      const sy = toScreen(cam, 0, y).y;
      ctx.fillRect(sx - 2, sy, 4, 22);
    }
  }
  for (const r of w.hRoads) {
    if (r.highway) continue;
    const cy = (r.y0 + r.y1) / 2;
    const sy = toScreen(cam, 0, cy).y;
    if (sy < -10 || sy > VIEW_H + 10) continue;
    for (let x = Math.floor(view.x0 / 44) * 44; x < view.x1; x += 44) {
      const sx = toScreen(cam, x, 0).x;
      ctx.fillRect(sx, sy - 2, 22, 4);
    }
  }

  // Expressway: deck, edge rails, lane lines, pillars.
  const hwy = w.highway;
  const hTop = toScreen(cam, 0, hwy.y0);
  const hBot = toScreen(cam, 0, hwy.y1);
  ctx.fillStyle = '#101319';
  ctx.fillRect(0, hTop.y, VIEW_W, hBot.y - hTop.y);
  ctx.fillStyle = '#c8ccd4';
  ctx.fillRect(0, hTop.y, VIEW_W, 3);
  ctx.fillRect(0, hBot.y - 3, VIEW_W, 3);
  ctx.fillStyle = 'rgba(200, 210, 230, 0.5)';
  for (let x = Math.floor(view.x0 / 90) * 90; x < view.x1; x += 90) {
    const sx = toScreen(cam, x, 0).x;
    ctx.fillRect(sx, hTop.y + 56, 44, 3);
    ctx.fillRect(sx, hTop.y + 110, 44, 3);
  }
  ctx.fillStyle = '#2a2f3a';
  for (let x = Math.floor(view.x0 / 180) * 180; x < view.x1; x += 180) {
    const s = toScreen(cam, x, hwy.y1 + 26);
    ctx.fillRect(s.x - 8, s.y - 6, 16, 12);
  }
  ctx.fillStyle = 'rgba(140, 160, 200, 0.85)';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  const hwyLabel = toScreen(cam, w.width / 2, hwy.cy);
  if (hwyLabel.y > 0 && hwyLabel.y < VIEW_H) ctx.fillText('RAINLINE EXPRESSWAY  •  HWY 9', hwyLabel.x, hwyLabel.y - 8);

  // Puddles: wet neon reflections.
  for (const p of w.puddles) {
    if (p.x < view.x0 || p.x > view.x1 || p.y < view.y0 || p.y > view.y1) continue;
    const s = toScreen(cam, p.x, p.y);
    const grad = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, p.rx);
    grad.addColorStop(0, 'rgba(120, 170, 230, 0.28)');
    grad.addColorStop(1, 'rgba(120, 170, 230, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(s.x, s.y, p.rx, p.ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Buildings: slab, lit windows, neon signs.
  for (const b of w.buildings) {
    if (b.x + b.w < view.x0 || b.x > view.x1 || b.y + b.h < view.y0 || b.y > view.y1) continue;
    const s = toScreen(cam, b.x, b.y);
    ctx.fillStyle = PALETTE.buildingEdge;
    ctx.fillRect(s.x - 3, s.y - 3, b.w + 6, b.h + 6);
    ctx.fillStyle = b.color;
    ctx.fillRect(s.x, s.y, b.w, b.h);
    // Rooftop detail.
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(s.x + 6, s.y + 6, b.w - 12, b.h - 12);
    // Windows: deterministic per building.
    const cols = Math.max(2, Math.floor(b.w / 26));
    const rows = Math.max(2, Math.floor(b.h / 26));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const lit = hash2(b.x + i * 31, b.y + j * 17) < 0.42;
        if (!lit) continue;
        const warm = hash2(b.x + j, b.y + i) < 0.6;
        ctx.fillStyle = warm ? 'rgba(255, 214, 130, 0.75)' : 'rgba(140, 220, 255, 0.7)';
        ctx.fillRect(s.x + 10 + i * ((b.w - 20) / cols), s.y + 10 + j * ((b.h - 20) / rows), 9, 12);
      }
    }
    if (b.sign) {
      ctx.save();
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.shadowColor = b.signColor || '#08d9d6';
      ctx.shadowBlur = 14;
      ctx.fillStyle = b.signColor || '#08d9d6';
      ctx.fillText(b.sign, s.x + b.w / 2, s.y + 22);
      ctx.restore();
    }
    if (b.landmark) {
      ctx.save();
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(232, 236, 244, 0.9)';
      ctx.fillText(b.name, s.x + b.w / 2, s.y + b.h - 10);
      ctx.restore();
    }
  }

  // Parking lot: painted bays.
  for (const lot of w.lots) {
    if (lot.x + lot.w < view.x0 || lot.x > view.x1 || lot.y + lot.h < view.y0 || lot.y > view.y1) continue;
    const s = toScreen(cam, lot.x, lot.y);
    ctx.fillStyle = '#14161c';
    ctx.fillRect(s.x, s.y, lot.w, lot.h);
    ctx.strokeStyle = 'rgba(200, 210, 230, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i += 1) {
      ctx.strokeRect(s.x + 16 + i * 38, s.y + 16, 30, 52);
      ctx.strokeRect(s.x + 16 + i * 38, s.y + lot.h - 68, 30, 52);
    }
    ctx.fillStyle = 'rgba(232, 236, 244, 0.7)';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MERIDIAN LOT', s.x + lot.w / 2, s.y + lot.h / 2);
  }

  // Street lamps and their pools of light.
  for (const lamp of w.lamps) {
    if (lamp.x < view.x0 || lamp.x > view.x1 || lamp.y < view.y0 || lamp.y > view.y1) continue;
    const s = toScreen(cam, lamp.x, lamp.y);
    if (lamp.on) {
      const grad = ctx.createRadialGradient(s.x, s.y, 2, s.x, s.y, 70);
      grad.addColorStop(0, 'rgba(255, 217, 160, 0.20)');
      grad.addColorStop(1, 'rgba(255, 217, 160, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 70, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath();
      ctx.arc(s.x, s.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(s.x - 1, s.y - 1, 2, 2);
  }

  // Cash case on the ground.
  if (g.mission.cash && !g.mission.cash.taken) {
    const s = toScreen(cam, g.mission.cash.x, g.mission.cash.y);
    const pulse = 1 + Math.sin(g.time * 6) * 0.15;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#f9ed69';
    ctx.shadowColor = '#f9ed69';
    ctx.shadowBlur = 18;
    rr(ctx, -11, -8, 22, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#222';
    ctx.fillRect(-2, -8, 4, 16);
    ctx.restore();
  }

  // Mission marker: pulsing ring + beam.
  const step = g.mission.active ? currentStep(g.mission) : null;
  if (step) {
    const target = stepTarget(g, step);
    if (target) {
      const s = toScreen(cam, target.x, target.y);
      const pulse = 1 + Math.sin(g.time * 5) * 0.18;
      ctx.save();
      ctx.strokeStyle = PALETTE.mission;
      ctx.lineWidth = 3;
      ctx.shadowColor = PALETTE.mission;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 26 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 34 * pulse);
      ctx.lineTo(s.x, s.y + 34 * pulse);
      ctx.moveTo(s.x - 34 * pulse, s.y);
      ctx.lineTo(s.x + 34 * pulse, s.y);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawCar(ctx, cam, car, time) {
  const s = toScreen(cam, car.x, car.y);
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  rr(ctx, -22 + 3, -12 + 4, 46, 26, 7);
  ctx.fill();
  // Body.
  ctx.fillStyle = car.color;
  rr(ctx, -23, -12, 46, 24, 7);
  ctx.fill();
  // Roof / cabin.
  ctx.fillStyle = 'rgba(20, 26, 36, 0.9)';
  rr(ctx, -8, -10, 20, 20, 5);
  ctx.fill();
  ctx.fillStyle = 'rgba(140, 200, 255, 0.35)';
  rr(ctx, -6, -9, 6, 18, 3);
  ctx.fill();
  // Headlights: two cones ahead.
  ctx.fillStyle = 'rgba(255, 240, 190, 0.16)';
  ctx.beginPath();
  ctx.moveTo(23, -8);
  ctx.lineTo(78, -26);
  ctx.lineTo(78, -2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(23, 8);
  ctx.lineTo(78, 2);
  ctx.lineTo(78, 26);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe9a8';
  ctx.fillRect(21, -10, 3, 5);
  ctx.fillRect(21, 5, 3, 5);
  // Taillights.
  ctx.fillStyle = '#ff2e3e';
  ctx.fillRect(-24, -10, 3, 5);
  ctx.fillRect(-24, 5, 3, 5);
  if (car.kind === 'police') {
    // Light bar, flashing red / blue.
    const phase = Math.floor(time * 6) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2233' : '#2266ff';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 16;
    ctx.fillRect(-4, -12, 8, 6);
    ctx.fillStyle = phase ? '#2266ff' : '#ff2233';
    ctx.fillRect(-4, 6, 8, 6);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PVPD', 2, 3);
  }
  if (car.name) {
    ctx.rotate(-car.angle);
    ctx.fillStyle = 'rgba(232,236,244,0.85)';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(car.name, 0, -20);
  }
  ctx.restore();
}

export function drawPerson(ctx, cam, p, isPlayer, aimAngle, time) {
  const s = toScreen(cam, p.x, p.y);
  const bob = Math.sin(p.bob || 0) * 1.5;
  ctx.save();
  ctx.translate(s.x, s.y + bob * 0.3);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(0, 6, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Body.
  ctx.fillStyle = p.shirt || '#e74c3c';
  ctx.beginPath();
  ctx.arc(0, 0, 10, 0, Math.PI * 2);
  ctx.fill();
  // Head.
  ctx.fillStyle = p.color || '#d8a05a';
  ctx.beginPath();
  ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3 - 1, 5.5, 0, Math.PI * 2);
  ctx.fill();
  if (isPlayer) {
    // Player ring + aim line.
    ctx.strokeStyle = '#08d9d6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.stroke();
    if (aimAngle !== null && aimAngle !== undefined) {
      ctx.strokeStyle = 'rgba(8, 217, 214, 0.7)';
      ctx.beginPath();
      ctx.moveTo(Math.cos(aimAngle) * 12, Math.sin(aimAngle) * 12);
      ctx.lineTo(Math.cos(aimAngle) * 30, Math.sin(aimAngle) * 30);
      ctx.stroke();
    }
    ctx.fillStyle = '#e8ecf4';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ROOK', 0, -20);
  }
  ctx.restore();
}

/** Rain streaks, splashes and the lightning flash. */
export function drawRain(ctx, g) {
  const drops = g.rainDrops;
  ctx.strokeStyle = PALETTE.rain;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const d of drops) {
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x - 3, d.y + d.len);
  }
  ctx.stroke();
  // Splashes.
  ctx.strokeStyle = 'rgba(174, 194, 224, 0.35)';
  for (const d of drops) {
    if (d.splash > 0) {
      ctx.beginPath();
      ctx.ellipse(d.x, d.y + d.len, d.splash, d.splash * 0.4, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  // Lightning flash.
  if (g.lightning > 0) {
    ctx.fillStyle = 'rgba(220, 230, 255,' + (g.lightning * 0.28).toFixed(3) + ')';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  // Vignette.
  const grad = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.45, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

export function drawMinimap(g, ctx) {
  const w = g.world;
  const size = 196;
  const mx = 16;
  const my = VIEW_H - size - 16;
  const scale = size / Math.max(w.width, w.height);
  ctx.save();
  ctx.fillStyle = PALETTE.hudPanel;
  rr(ctx, mx - 6, my - 6, size + 12, size + 12, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(232,236,244,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(mx, my, size, size);
  ctx.clip();
  // Roads.
  ctx.fillStyle = '#2a2f3a';
  for (const r of w.vRoads) ctx.fillRect(mx + r.x0 * scale, my, ROAD * scale, size);
  for (const r of w.hRoads) ctx.fillRect(mx, my + r.y0 * scale, size, (r.y1 - r.y0) * scale);
  // Buildings.
  ctx.fillStyle = 'rgba(120, 130, 150, 0.5)';
  for (const b of w.buildings) ctx.fillRect(mx + b.x * scale, my + b.y * scale, Math.max(1, b.w * scale), Math.max(1, b.h * scale));
  // Mission marker.
  const step = g.mission.active ? currentStep(g.mission) : null;
  if (step) {
    const target = stepTarget(g, step);
    if (target) {
      const px = mx + target.x * scale;
      const py = my + target.y * scale;
      const pulse = 4 + Math.sin(g.time * 5) * 2;
      ctx.fillStyle = '#f9ed69';
      ctx.beginPath();
      ctx.arc(px, py, pulse, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Police.
  ctx.fillStyle = '#ff4757';
  for (const c of g.policeCars) {
    ctx.beginPath();
    ctx.arc(mx + c.x * scale, my + c.y * scale, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = g.playerCar || g.player;
  const px = mx + p.x * scale;
  const py = my + p.y * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(g.playerCar ? g.playerCar.angle : g.player.angle);
  ctx.fillStyle = '#08d9d6';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, -5);
  ctx.lineTo(-5, 5);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  // Label.
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('PORT VANE', mx, my - 10);
}

export function drawHUD(g, ctx) {
  const mission = currentMission(g.mission);
  // Top-left: wanted stars, health, cash.
  ctx.fillStyle = PALETTE.hudPanel;
  rr(ctx, 12, 12, 250, 84, 8);
  ctx.fill();
  ctx.fillStyle = PALETTE.star;
  ctx.font = 'bold 22px monospace';
  ctx.textAlign = 'left';
  let stars = '';
  for (let i = 0; i < 5; i += 1) stars += i < g.wanted.level ? '★' : '☆';
  ctx.fillText(stars, 24, 40);
  // Health bar.
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(24, 50, 150, 10);
  ctx.fillStyle = g.player.hp > 30 ? PALETTE.ok : PALETTE.danger;
  ctx.fillRect(24, 50, 150 * clamp(g.player.hp / 100, 0, 1), 10);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = 'bold 13px monospace';
  ctx.fillText('HP ' + Math.ceil(g.player.hp), 182, 60);
  // Cash and rank.
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = 'bold 16px monospace';
  ctx.fillText(money(g.money), 24, 84);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '12px monospace';
  const rank = RANKS.slice().reverse().find((r) => g.totalEarned >= r.at) || RANKS[0];
  ctx.fillText(rank.name, 120, 84);

  // Top-centre: mission objective.
  const step = g.mission.active ? currentStep(g.mission) : null;
  if (step) {
    const text = (mission ? mission.title + ' — ' : '') + step.text;
    ctx.font = 'bold 15px monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = PALETTE.hudPanel;
    rr(ctx, VIEW_W / 2 - tw / 2 - 14, 12, tw + 28, 30, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.mission;
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 33);
    if (step.type === 'escape') {
      ctx.fillStyle = g.mission.timer < 20 ? PALETTE.danger : PALETTE.hudText;
      ctx.font = 'bold 22px monospace';
      ctx.fillText(Math.ceil(g.mission.timer) + 's', VIEW_W / 2, 68);
    }
  } else if (g.mission.nextReady) {
    const text = 'Press ENTER for the next job';
    ctx.font = 'bold 15px monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = PALETTE.hudPanel;
    rr(ctx, VIEW_W / 2 - tw / 2 - 14, 12, tw + 28, 30, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudText;
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 33);
  } else {
    const text = 'Free roam — find a car, make some trouble, or press ENTER to replay the jobs';
    ctx.font = 'bold 14px monospace';
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = PALETTE.hudPanel;
    rr(ctx, VIEW_W / 2 - tw / 2 - 14, 12, tw + 28, 30, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudDim;
    ctx.textAlign = 'center';
    ctx.fillText(text, VIEW_W / 2, 33);
  }

  // Transient message.
  if (g.messageT > 0) {
    ctx.font = '15px monospace';
    const tw = ctx.measureText(g.message).width;
    ctx.fillStyle = 'rgba(8, 10, 16, 0.8)';
    rr(ctx, VIEW_W / 2 - tw / 2 - 12, 52, tw + 24, 28, 8);
    ctx.fill();
    ctx.fillStyle = '#f9ed69';
    ctx.textAlign = 'center';
    ctx.fillText(g.message, VIEW_W / 2, 71);
  }

  // Bottom-right: speed and controls.
  if (g.playerCar) {
    ctx.fillStyle = PALETTE.hudPanel;
    rr(ctx, VIEW_W - 190, VIEW_H - 66, 178, 54, 8);
    ctx.fill();
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(Math.abs(g.playerCar.speed) * 0.55) + ' mph', VIEW_W - 26, VIEW_H - 34);
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '12px monospace';
    ctx.fillText(g.playerCar.name || g.playerCar.model, VIEW_W - 26, VIEW_H - 18);
  } else {
    ctx.fillStyle = PALETTE.hudDim;
    ctx.font = '12px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('WASD move  •  Click shoot  •  E enter car  •  R reload', VIEW_W - 16, VIEW_H - 42);
    ctx.fillText('WASD drive  •  Space handbrake  •  E exit  •  M mute  •  P pause', VIEW_W - 16, VIEW_H - 24);
  }
  if (!g.playerCar) {
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'left';
    const ammo = g.player.ammo + ' / ' + g.player.reserveAmmo;
    ctx.fillText('AMMO ' + ammo, 24, 116);
  }

  // Mission complete / failed banner.
  if (g.mission.banner && g.mission.banner.t > 0) {
    const b = g.mission.banner;
    ctx.save();
    ctx.globalAlpha = clamp(b.t, 0, 1);
    ctx.fillStyle = 'rgba(8, 10, 16, 0.78)';
    ctx.fillRect(0, VIEW_H / 2 - 70, VIEW_W, 120);
    ctx.fillStyle = b.title === 'MISSION COMPLETE' ? PALETTE.ok : PALETTE.danger;
    ctx.font = 'bold 44px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(b.title, VIEW_W / 2, VIEW_H / 2 - 8);
    ctx.fillStyle = PALETTE.hudText;
    ctx.font = 'bold 20px monospace';
    ctx.fillText(b.sub, VIEW_W / 2, VIEW_H / 2 + 30);
    ctx.restore();
  }

  drawMinimap(g, ctx);
}

export function drawTitle(g, ctx) {
  // Darken the live city behind the menu.
  ctx.fillStyle = 'rgba(5, 7, 12, 0.62)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  // Neon title.
  ctx.save();
  ctx.shadowColor = '#ff2e63';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ff2e63';
  ctx.font = 'bold 92px monospace';
  ctx.fillText('RAINLINE', VIEW_W / 2, 190);
  ctx.restore();
  ctx.fillStyle = '#08d9d6';
  ctx.font = 'bold 24px monospace';
  ctx.fillText('A RAINY-NIGHT GETAWAY IN PORT VANE', VIEW_W / 2, 232);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '16px monospace';
  ctx.fillText('You are Rook, the best wheelman on the Rainline Expressway.', VIEW_W / 2, 276);
  ctx.fillText('Vera has four jobs for you tonight. The rain never stops. Neither do the cops.', VIEW_W / 2, 300);

  const hasSave = !!g.saveData;
  const items = hasSave ? ['▶  CONTINUE  —  ' + money(g.saveData.money) + '  •  ' + g.saveData.missionsCompleted.length + '/4 jobs done', '▶  NEW GAME'] : ['▶  NEW GAME'];
  ctx.font = 'bold 22px monospace';
  items.forEach((item, i) => {
    const y = 380 + i * 46;
    const selected = g.menuIndex === i;
    ctx.fillStyle = selected ? '#f9ed69' : PALETTE.hudText;
    if (selected) {
      ctx.fillStyle = 'rgba(249, 237, 105, 0.12)';
      const tw = ctx.measureText(item).width;
      rr(ctx, VIEW_W / 2 - tw / 2 - 16, y - 28, tw + 32, 38, 8);
      ctx.fill();
      ctx.fillStyle = '#f9ed69';
    }
    ctx.fillText(item, VIEW_W / 2, y);
  });

  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '14px monospace';
  ctx.fillText('WASD move / drive  •  E enter & exit cars  •  Mouse aim, Click shoot  •  Space handbrake', VIEW_W / 2, 500);
  ctx.fillText('Steal cars, lose the cops, run Vera\'s four jobs — then the city is yours.', VIEW_W / 2, 524);
  ctx.fillText('ENTER to start  •  rain-slick roads: grip is low, drifts are free', VIEW_W / 2, 556);
  ctx.fillStyle = 'rgba(154, 163, 178, 0.7)';
  ctx.font = '12px monospace';
  ctx.fillText('An original game. Port Vane, Rook, Vera and the PVPD are fictional.', VIEW_W / 2, 640);
  ctx.fillText('No Rockstar, no GTA assets — every pixel and sound is made in code.', VIEW_W / 2, 660);
}

export function drawPause(g, ctx) {
  ctx.fillStyle = 'rgba(5, 7, 12, 0.66)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = 'bold 48px monospace';
  ctx.fillText('PAUSED', VIEW_W / 2, 300);
  ctx.font = '16px monospace';
  ctx.fillStyle = PALETTE.hudDim;
  ctx.fillText('P / Esc resume  •  L save game  •  M mute  •  Q quit to title', VIEW_W / 2, 340);
  ctx.fillText('Progress saves automatically after every job.', VIEW_W / 2, 368);
}

export function drawEndScreen(g, ctx, kind) {
  ctx.fillStyle = 'rgba(5, 7, 12, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.textAlign = 'center';
  const busted = kind === 'busted';
  ctx.fillStyle = busted ? '#4a90e2' : PALETTE.danger;
  ctx.font = 'bold 72px monospace';
  ctx.fillText(busted ? 'BUSTED' : 'WASTED', VIEW_W / 2, 300);
  ctx.fillStyle = PALETTE.hudText;
  ctx.font = '18px monospace';
  ctx.fillText(busted ? 'The PVPD finally caught up with you in the rain.' : 'Port Vane keeps its secrets. So will you.', VIEW_W / 2, 344);
  ctx.fillStyle = PALETTE.hudDim;
  ctx.font = '15px monospace';
  ctx.fillText('You lost ' + money(g.lostCash) + '. The job list is still open.', VIEW_W / 2, 380);
  ctx.fillStyle = '#f9ed69';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Press ENTER to get back out there', VIEW_W / 2, 440);
}
