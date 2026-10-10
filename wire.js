// WebSocket terrain patches apply only to the already filtered player view.
// Tunnels may disable protocol compression; avoid resending the whole map.
const deeplyFrozen=value=>!value||typeof value!=='object'||Object.isFrozen(value)&&Object.values(value).every(deeplyFrozen);
class TerrainWire {
  constructor() { this.tiles = null; this.fingerprints=new WeakMap(); }
  encode(packet) {
    if (packet.type !== 'state') return packet;
    const tiles = packet.state.tiles, next = tiles.map(row => row.map(tile => {
      // Frozen server snapshots can be reused; mutable callers must be checked.
      let value=this.fingerprints.get(tile);if(value!==undefined)return value;
      value=JSON.stringify(tile);if(deeplyFrozen(tile))this.fingerprints.set(tile,value);return value;
    }));
    if (!this.tiles || packet.init || this.tiles.length !== next.length || this.tiles[0]?.length !== next[0]?.length) { this.tiles = next; return packet; }
    const changes = [];
    for (let y = 0; y < tiles.length; y++) for (let x = 0; x < tiles[y].length; x++) if (next[y][x] !== this.tiles[y][x]) changes.push([x, y, tiles[y][x]]);
    this.tiles = next;
    const state = { ...packet.state }; delete state.tiles;
    return { ...packet, state, tileChanges: changes };
  }
}
module.exports = { TerrainWire };
