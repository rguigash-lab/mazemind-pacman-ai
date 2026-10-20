export const WIDTH = 21;
export const HEIGHT = 17;
export const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const key = (x, y) => `${x},${y}`;

export function randomGenerator(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function neighbors(game, x, y) {
  return DIRS.map(([dx, dy], direction) => ({ x: x + dx, y: y + dy, direction }))
    .filter(({ x: nx, y: ny }) => game.grid[ny]?.[nx] !== undefined && game.grid[ny][nx] !== '#');
}

export function distances(game, x, y) {
  const result = new Map([[key(x, y), 0]]);
  const queue = [{ x, y }];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head];
    const distance = result.get(key(current.x, current.y));
    for (const next of neighbors(game, current.x, current.y)) {
      const id = key(next.x, next.y);
      if (!result.has(id)) {
        result.set(id, distance + 1);
        queue.push(next);
      }
    }
  }
  return result;
}

export const GHOST_MODES = ['standard', 'ambush', 'chaos'];

export function createGame(seed = 1, ghostMode = 'standard') {
  if (!GHOST_MODES.includes(ghostMode)) throw new Error(`Unknown ghost mode: ${ghostMode}`);
  const rng = randomGenerator(seed);
  const grid = Array.from({ length: HEIGHT }, () => Array(WIDTH).fill('#'));
  const stack = [{ x: 1, y: 1 }];
  grid[1][1] = ' ';
  while (stack.length) {
    const current = stack[stack.length - 1];
    const options = DIRS.map(([dx, dy]) => ({ x: current.x + dx * 2, y: current.y + dy * 2, dx, dy }))
      .filter(({ x, y }) => x > 0 && x < WIDTH - 1 && y > 0 && y < HEIGHT - 1 && grid[y][x] === '#');
    if (!options.length) { stack.pop(); continue; }
    const next = options[Math.floor(rng() * options.length)];
    grid[current.y + next.dy][current.x + next.dx] = ' ';
    grid[next.y][next.x] = ' ';
    stack.push(next);
  }
  // Open extra passages so decisions involve routes, not just a single maze corridor.
  for (let y = 1; y < HEIGHT - 1; y++) for (let x = 1; x < WIDTH - 1; x++) {
    if (grid[y][x] !== '#') continue;
    const horizontal = grid[y][x - 1] === ' ' && grid[y][x + 1] === ' ';
    const vertical = grid[y - 1][x] === ' ' && grid[y + 1][x] === ' ';
    if ((horizontal || vertical) && rng() < 0.23) grid[y][x] = ' ';
  }

  const pellets = new Set();
  for (let y = 1; y < HEIGHT - 1; y++) for (let x = 1; x < WIDTH - 1; x++) {
    if (grid[y][x] === ' ') pellets.add(key(x, y));
  }
  const spawn = { x: 1, y: 1 };
  const ghostSpawns = [{ x: WIDTH - 2, y: HEIGHT - 2 }, { x: WIDTH - 2, y: 1 }];
  pellets.delete(key(spawn.x, spawn.y));
  for (const ghost of ghostSpawns) pellets.delete(key(ghost.x, ghost.y));
  const powers = new Set([key(1, HEIGHT - 2), key(WIDTH - 2, 1), key(WIDTH - 2, HEIGHT - 2)]);
  for (const power of powers) pellets.delete(power);
  return {
    seed, rng, grid, pellets, powers, player: { ...spawn }, spawn,
    ghosts: ghostSpawns.map((pos, i) => ({ ...pos, spawn: { ...pos }, direction: 0, color: i })),
    score: 0, lives: 3, ticks: 0, frightened: 0, status: 'playing', events: [],
    facing: 1, ghostMode,
  };
}

function collide(game) {
  for (const ghost of game.ghosts) {
    if (ghost.x !== game.player.x || ghost.y !== game.player.y) continue;
    if (game.frightened > 0) {
      game.score += 200;
      game.events.push('Ghost eaten +200');
      ghost.x = ghost.spawn.x; ghost.y = ghost.spawn.y;
    } else {
      game.lives--;
      game.events.push('Caught by a ghost');
      game.player = { ...game.spawn };
      game.frightened = 0;
      for (const enemy of game.ghosts) {
        enemy.x = enemy.spawn.x; enemy.y = enemy.spawn.y;
      }
      if (game.lives <= 0) game.status = 'lost';
    }
    return true;
  }
  return false;
}

export function step(game, direction) {
  if (game.status !== 'playing') return game;
  game.events = [];
  game.ticks++;
  const move = neighbors(game, game.player.x, game.player.y).find(n => n.direction === direction);
  if (move) { game.player.x = move.x; game.player.y = move.y; game.facing = direction; }
  const pos = key(game.player.x, game.player.y);
  if (game.pellets.delete(pos)) { game.score += 10; game.events.push('Pellet +10'); }
  if (game.powers.delete(pos)) {
    game.score += 50; game.frightened = 34;
    game.events.push('Power pellet +50');
  }
  if (collide(game)) return game;
  if (game.pellets.size === 0 && game.powers.size === 0) {
    game.status = 'won'; game.score += 500; game.events.push('Maze cleared +500');
    return game;
  }
  if (game.ticks % 3 === 0) {
    for (const ghost of game.ghosts) {
      const choices = neighbors(game, ghost.x, ghost.y);
      if (!choices.length) continue;
      // Ambushers chase the tile Pac-Man is heading toward; in the standard
      // mode both ghosts chase his current tile. Chaos adds unpredictable turns.
      let target = { ...game.player };
      if (game.ghostMode === 'ambush' && !game.frightened) {
        const direction = (game.facing + (ghost.color === 1 ? 1 : 0)) % 4;
        for (let k = 0; k < 3; k++) {
          const next = neighbors(game, target.x, target.y).find(n => n.direction === direction);
          if (!next) break;
          target = next;
        }
      }
      const playerDistances = distances(game, target.x, target.y);
      const ordered = [...choices].sort((a, b) => {
        const da = playerDistances.get(key(a.x, a.y)) ?? 999;
        const db = playerDistances.get(key(b.x, b.y)) ?? 999;
        return game.frightened ? db - da : da - db;
      });
      // One pursuer is more predictable; the other sometimes takes another path.
      const randomChance = game.ghostMode === 'chaos' ? .72 : game.ghostMode === 'ambush' ? 0 : ghost.color === 1 ? .32 : 0;
      const pick = randomChance > 0 && game.rng() < randomChance
        ? choices[Math.floor(game.rng() * choices.length)] : ordered[0];
      ghost.x = pick.x; ghost.y = pick.y; ghost.direction = pick.direction;
      if (collide(game)) break;
    }
  }
  if (game.frightened > 0) game.frightened--;
  return game;
}
