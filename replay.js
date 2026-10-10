(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GridfallReplay = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const copy = value => structuredClone(value);
  class MatchArchive {
    constructor() { this.turns = []; this.current = null; this.terrain = null; this.terrainVersion = -1; }
    begin(s) { if (this.current) throw new Error('Finish the previous recording first'); this.current = { turn: s.turn, plans: copy(s.plans), frames: [] }; this.capture(s, []); }
    capture(s, events = []) {
      if (!this.current) throw new Error('No active recording');
      if (!this.terrain || this.terrainVersion !== s.terrainVersion) { this.terrain = copy(s.tiles); this.terrainVersion = s.terrainVersion; }
      // Terrain and locked plans are immutable shared snapshots. Mutable combat
      // data and only this tick's events are copied, never the cumulative log.
      const frame = { seed: s.seed, mode:s.mode,winnerTeam:s.winnerTeam, mapId: s.mapId, biome:s.biome, fields:copy(s.fields||[]), width: s.width, height: s.height, size: s.size, initialLimit: s.initialLimit, turn: this.current.turn, tick: s.tick, phase: s.phase, winner: s.winner, safeLimit: s.safeLimit, nextLimit: s.nextLimit, zoneCenter: copy(s.zoneCenter), tiles: this.terrain, plans: this.current.plans, units: copy(s.units), projectiles: copy(s.projectiles), smokes: copy(s.smokes), canisters:copy(s.canisters||[]), grenades: copy(s.grenades), fires: copy(s.fires || []), beacon: copy(s.beacon), events: copy(events), kills: s.kills, shots: s.shots, damage: s.damage };
      if(s.fate)frame.fate=copy(s.fate.roster?s.fate:((typeof module!=='undefined'&&module.exports?require('./fate.js'):globalThis.GridfallFate).publicState(s,null)));if(s.revealedUnits)frame.revealedUnits=copy(s.revealedUnits);
      if (s.visibleCells) frame.visibleCells = [...s.visibleCells];if(s.flights)frame.flights=copy(s.flights);if(s.visibility)frame.visibility=copy(s.visibility);if(s.litCells)frame.litCells=[...s.litCells];
      if (s.aliveCount !== undefined) frame.aliveCount = s.aliveCount;
      this.current.frames.push(frame); return frame;
    }
    finish() { if (!this.current) return []; const turn = this.current; this.turns.push(turn); this.current = null; return turn.frames; }
    frames() { return this.turns.flatMap((turn, i) => i ? turn.frames.slice(1) : turn.frames); }
  }
  // Full-match playback keeps combat at its recorded pace, but shortens long
  // stretches with no action. Five settling ticks keep movement from snapping.
  function continuousFrames(frames, idleTicks = 6) {
    if (!frames.length) return [];
    idleTicks = Math.max(1, Math.floor(idleTicks));
    const result = [], idle = [], terrainCache = new WeakMap();
    const terrain = tiles => {
      if (!tiles) return '';
      if (!terrainCache.has(tiles)) terrainCache.set(tiles, JSON.stringify(tiles));
      return terrainCache.get(tiles);
    };
    const signature = f => JSON.stringify([
      f.units.map(u => [u.id,u.x,u.y,u.alive,u.hidden,u.hp,u.shield,u.weapon,u.ammo,u.facing,u.guard,u.reflectCharges,u.scan,u.burn?.remainingTicks]),
      f.smokes,f.fires,f.fields,f.beacon,f.safeLimit,f.nextLimit,f.winner,f.fate
    ]);
    const flush = () => {
      if (idle.length <= idleTicks) result.push(...idle);
      else { result.push(...idle.slice(0, idleTicks - 1), idle[idle.length - 1]); }
      idle.length = 0;
    };
    let previousSignature, previousTerrain;
    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i], nextSignature = signature(frame), nextTerrain = terrain(frame.tiles);
      const active = i === 0 || i === frames.length - 1 || frame.events?.length || frame.projectiles?.length || frame.canisters?.length || frame.flights?.length || frame.grenades?.length || nextSignature !== previousSignature || nextTerrain !== previousTerrain;
      if (active) { flush(); result.push(frame); } else idle.push(frame);
      previousSignature = nextSignature; previousTerrain = nextTerrain;
    }
    flush();
    return result;
  }
  function plannedActions(s, id) {
    const unit = s.units[id]; let origin = { x: unit.x, y: unit.y };
    return (s.plans[id] || []).map((action, slot) => {
      const from = { ...origin }, moving = ['move', 'skillMove', 'blink'].includes(action.type);
      const target = action.target || action.path?.[action.path.length - 1];
      const result = { ...copy(action), slot, from, target: target ? { ...target } : undefined };
      if (action.type === 'shoot' && !Number.isFinite(result.angle) && target) result.angle = Math.atan2(target.y - from.y, target.x - from.x);
      if (moving && target) origin = { ...target };
      return result;
    });
  }
  function turnStart(frames, index, direction) {
    if (!frames.length) return 0;
    const turn = frames[index].turn;
    if (direction > 0) { const next = frames.findIndex((frame, i) => i > index && frame.turn !== turn); return next < 0 ? frames.length - 1 : next; }
    let first = index; while (first > 0 && frames[first - 1].turn === turn) first--;
    if (index > first) return first;
    if (first > 0) { first--; const previous = frames[first].turn; while (first > 0 && frames[first - 1].turn === previous) first--; }
    return first;
  }
  return { MatchArchive, continuousFrames, plannedActions, turnStart };
});
