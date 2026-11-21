// Save / load through localStorage. Saves money, rank progress, mission state and position.
import { SAVE_KEY } from './config.js';

export function saveGame(state) {
  try {
    const data = {
      v: 1,
      money: state.money,
      totalEarned: state.totalEarned,
      missionsCompleted: state.mission.completed,
      nextMission: state.mission.index,
      player: { x: state.player.x, y: state.player.y },
      wanted: state.wanted.level,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* no storage */ }
}
