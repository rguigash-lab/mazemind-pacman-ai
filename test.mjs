import assert from 'node:assert/strict';
import test from 'node:test';
import { createGame, distances, neighbors, step, GHOST_MODES } from './engine.mjs';
import { chooseMove } from './agent.mjs';
import { createLearner, observe } from './rl.mjs';

test('generated rewards and ghost spawns are reachable for 100 maze seeds', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const game = createGame(seed);
    const reached = distances(game, 1, 1);
    for (const position of [...game.pellets, ...game.powers]) assert.ok(reached.has(position), `${seed}: ${position}`);
    for (const ghost of game.ghosts) assert.ok(reached.has(`${ghost.x},${ghost.y}`));
  }
});

test('agent always selects a legal move and games terminate or respect the move budget', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const game = createGame(seed);
    while (game.status === 'playing' && game.ticks < 1500) {
      const legal = neighbors(game, game.player.x, game.player.y).map(n => n.direction);
      const direction = chooseMove(game);
      assert.ok(legal.includes(direction), `illegal move on seed ${seed}`);
      step(game, direction);
    }
    assert.ok(game.lives >= 0 && game.lives <= 3);
    assert.ok(['won', 'lost'].includes(game.status) || game.ticks === 1500);
  }
});

test('the same seed and moves produce identical outcomes', () => {
  const a = createGame(42), b = createGame(42);
  for (let i = 0; i < 100; i++) { step(a, i % 4); step(b, i % 4); }
  assert.equal(a.score, b.score);
  assert.equal(a.status, b.status);
  assert.deepEqual(a.ghosts, b.ghosts);
});

test('Q-learning updates the selected action toward reward and masks illegal moves', () => {
  const game = createGame(1);
  const observation = observe(game);
  const learner = createLearner();
  const move = observation.legal[0];
  learner.learn(observation, move, 10, observation, true, .5);
  assert.equal(learner.table[observation.key][move], 5);
  for (const action of observation.legal) learner.table[observation.key][action] = -1;
  for (let action = 0; action < 4; action++) if (!observation.legal.includes(action)) {
    learner.table[observation.key][action] = 1000;
  }
  assert.ok(observation.legal.includes(learner.action(observation)));
});

test('RL safety mask avoids a reachable ghost when another exit is available', () => {
  const game = createGame(1);
  const exits = neighbors(game, 1, 1);
  game.ghosts[0].x = exits[0].x;
  game.ghosts[0].y = exits[0].y;
  assert.ok(exits.length > 1);
  assert.ok(!observe(game).legal.includes(exits[0].direction));
});

test('unseen ghost modes remain deterministic and have distinct behavior', () => {
  const tracks = [];
  for (const mode of GHOST_MODES) {
    const a = createGame(8, mode), b = createGame(8, mode);
    const trace = [];
    for (let turn = 0; turn < 80; turn++) {
      step(a, turn % 4);
      step(b, turn % 4);
      trace.push(a.ghosts.map(g => `${g.x},${g.y}`).join('|'));
    }
    assert.deepEqual(a.ghosts, b.ghosts);
    assert.deepEqual(a.player, b.player);
    tracks.push(trace.join(';'));
  }
  assert.equal(new Set(tracks).size, GHOST_MODES.length);
});
