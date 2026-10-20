import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createGame, step } from './engine.mjs';
import { createLearner, observe } from './rl.mjs';

const episodes = Math.max(1, Math.min(50000, Number(process.argv[2]) || 3000));
const targetBias = 4;
const learner = createLearner({ randomSeed: 8391, targetBias });
let wins = 0, score = 0;
for (let episode = 0; episode < episodes; episode++) {
  // Training mazes start at 10,001. Evaluation mazes start at 1: no overlap.
  const game = createGame(10001 + episode);
  const epsilon = Math.max(.04, .55 * (1 - episode / episodes));
  while (game.status === 'playing' && game.ticks < 800) {
    const before = observe(game);
    const move = learner.action(before, epsilon);
    const oldScore = game.score, oldLives = game.lives;
    step(game, move);
    const gained = game.score - oldScore;
    // Dense route-progress shaping helps a sparse-reward agent learn to leave
    // familiar corridors instead of bouncing between already-cleared cells.
    const routeProgress = before.target === move ? .9 : -.35;
    const reward = gained / 10 - .12 + routeProgress - (oldLives - game.lives) * 26
      + (game.status === 'won' ? 90 : 0);
    learner.learn(before, move, reward, observe(game), game.status !== 'playing' || game.ticks >= 800);
  }
  wins += Number(game.status === 'won'); score += game.score;
  if ((episode + 1) % 500 === 0 || episode === episodes - 1) {
    console.log(`${episode + 1}/${episodes} episodes | train wins ${wins} | mean score ${Math.round(score / (episode + 1))} | states ${Object.keys(learner.table).length}`);
  }
}
const checkpoint = { algorithm: 'tabular Q-learning', episodes, trainingSeeds: '10001+',
  alpha: .16, gamma: .96, targetBias, table: learner.table };
await writeFile(fileURLToPath(new URL('./policy.json', import.meta.url)), JSON.stringify(checkpoint));
console.log('Saved policy.json');
