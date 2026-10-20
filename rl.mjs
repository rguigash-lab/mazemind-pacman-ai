import { neighbors, randomGenerator } from './engine.mjs';

const pos = (x, y) => `${x},${y}`;

// Compact, maze-independent observation: the policy cannot memorize maze seeds.
// BFS supplies the direction of the nearest reward and nearest ghost; learning
// decides how to use these clues, rather than being given a planned action.
export function observe(game) {
  const exits = neighbors(game, game.player.x, game.player.y);
  const ghostMovesNow = (game.ticks + 1) % 3 === 0;
  // A one-step safety mask: don't deliberately enter a ghost, or a square a
  // ghost can reach on this turn. If every exit is unsafe, let Q-learning
  // choose the least bad move rather than freezing the game.
  const safe = exits.filter(next => game.frightened > 1 || game.powers.has(pos(next.x, next.y)) ||
    game.ghosts.every(ghost => (next.x !== ghost.x || next.y !== ghost.y) &&
      (!ghostMovesNow || !neighbors(game, ghost.x, ghost.y)
        .some(reachable => reachable.x === next.x && reachable.y === next.y))));
  const legal = (safe.length ? safe : exits).map(n => n.direction);
  const start = pos(game.player.x, game.player.y);
  const seen = new Set([start]);
  const queue = [{ x: game.player.x, y: game.player.y, distance: 0, first: 4 }];
  const ghosts = new Set(game.ghosts.map(g => pos(g.x, g.y)));
  let food = null, ghost = null;
  for (let head = 0; head < queue.length; head++) {
    const node = queue[head];
    const position = pos(node.x, node.y);
    if (!food && (game.pellets.has(position) || game.powers.has(position))) food = node;
    if (!ghost && ghosts.has(position)) ghost = node;
    if (food && ghost) break;
    for (const next of neighbors(game, node.x, node.y)) {
      const id = pos(next.x, next.y);
      if (seen.has(id)) continue;
      seen.add(id);
      queue.push({ x: next.x, y: next.y, distance: node.distance + 1,
        first: node.distance === 0 ? next.direction : node.first });
    }
  }
  let mask = 0;
  for (const exit of exits) mask |= 1 << exit.direction;
  const distanceBand = ghost?.distance <= 1 ? 0 : ghost?.distance <= 3 ? 1
    : ghost?.distance <= 6 ? 2 : 3;
  return {
    key: `${mask}:${food?.first ?? 4}:${ghost?.first ?? 4}:${distanceBand}:${game.frightened > 2 ? 1 : 0}:${distanceBand < 2 && ghostMovesNow ? 1 : 0}`,
    legal, target: food?.first ?? 4,
  };
}

export function createLearner(data = {}) {
  const table = data.table ?? {};
  const targetBias = data.targetBias ?? 0;
  const rng = randomGenerator(data.randomSeed ?? 8391);
  const values = key => table[key] ??= [0, 0, 0, 0];
  function action(observation, epsilon = 0) {
    const legal = observation.legal;
    if (!legal.length) return null;
    if (rng() < epsilon) return legal[Math.floor(rng() * legal.length)];
    const q = values(observation.key);
    let best = -Infinity;
    let choices = [];
    for (const move of legal) {
      const preference = q[move] + (move === observation.target ? targetBias : 0);
      if (preference > best + 1e-9) { best = preference; choices = [move]; }
      else if (Math.abs(preference - best) < 1e-9) choices.push(move);
    }
    // Break an unvisited-state tie using the nearest-food direction. All
    // learned Q-values still take priority once an action has been updated.
    if (choices.includes(observation.target)) return observation.target;
    return choices[Math.floor(rng() * choices.length)];
  }
  function learn(before, move, reward, after, done, alpha = .16, gamma = .96) {
    const q = values(before.key);
    const future = done || !after.legal.length ? 0 : Math.max(...after.legal.map(a => values(after.key)[a]));
    q[move] += alpha * (reward + gamma * future - q[move]);
  }
  return { table, action, learn };
}

export function chooseLearnedMove(game, learner) {
  return learner.action(observe(game));
}

export function chooseRouteMove(game) {
  const observation = observe(game);
  return observation.legal.includes(observation.target) ? observation.target : observation.legal[0];
}
