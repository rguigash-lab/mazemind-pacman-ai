import { distances, neighbors } from './engine.mjs';

const id = (x, y) => `${x},${y}`;

// A model-based agent: shortest-path search to remaining rewards, with an
// explicit risk penalty for nearby ghosts and a look-ahead for escape routes.
export function chooseMove(game) {
  const moves = neighbors(game, game.player.x, game.player.y);
  if (!moves.length) return null;
  const ghostDistances = game.ghosts.map(g => distances(game, g.x, g.y));
  const targets = [...game.pellets].map(pos => [pos, 10])
    .concat([...game.powers].map(pos => [pos, game.frightened ? 8 : 65]));
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const route = distances(game, move.x, move.y);
    let reward = -Infinity;
    for (const [target, value] of targets) {
      const distance = route.get(target);
      if (distance === undefined) continue;
      // Prefer the nearest pellet; powers are especially valuable near danger.
      const powerBonus = game.powers.has(target) && ghostDistances.some(map =>
        (map.get(id(move.x, move.y)) ?? 99) < 8) ? 25 : 0;
      reward = Math.max(reward, (value + powerBonus) / (distance + 2));
    }
    let risk = 0;
    let chase = 0;
    for (const map of ghostDistances) {
      const distance = map.get(id(move.x, move.y)) ?? 99;
      if (game.frightened > 2) {
        chase += distance < game.frightened / 2 ? 15 / (distance + 1) : 0;
      } else {
        // Ghosts move every third turn. Protect against their immediate move,
        // including the possibility that a ghost takes a non-greedy branch.
        const ghostMovesNow = (game.ticks + 1) % 3 === 0;
        risk += distance === 0 ? 10000 : distance === 1 && ghostMovesNow ? 900
          : distance === 1 ? 45 : distance === 2 ? 17 : distance === 3 ? 7 : 0;
      }
    }
    const exits = neighbors(game, move.x, move.y).length;
    const score = reward * 3 + chase - risk + exits * 0.35;
    if (score > bestScore) { bestScore = score; bestMove = move; }
  }
  return bestMove.direction;
}

export function randomMove(game) {
  const choices = neighbors(game, game.player.x, game.player.y);
  return choices.length ? choices[Math.floor(game.rng() * choices.length)].direction : null;
}
