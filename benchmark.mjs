import { createGame, step, GHOST_MODES } from './engine.mjs';
import { chooseMove, randomMove } from './agent.mjs';
import { createLearner, chooseLearnedMove, chooseRouteMove } from './rl.mjs';
import { readFile } from 'node:fs/promises';

export function evaluate(policy, seeds = 20, maxTicks = 1500, startSeed = 1, ghostMode = 'standard') {
  const results = [];
  for (let seed = startSeed; seed < startSeed + seeds; seed++) {
    const game = createGame(seed, ghostMode);
    const initial = game.pellets.size + game.powers.size;
    while (game.status === 'playing' && game.ticks < maxTicks) step(game, policy(game));
    results.push({ seed, score: game.score, cleared: game.status === 'won',
      collected: (initial - game.pellets.size - game.powers.size) / initial,
      lives: game.lives, ticks: game.ticks });
  }
  return {
    runs: seeds,
    wins: results.filter(r => r.cleared).length,
    meanScore: Math.round(results.reduce((sum, r) => sum + r.score, 0) / seeds),
    meanCollected: +(results.reduce((sum, r) => sum + r.collected, 0) / seeds * 100).toFixed(1),
    details: results,
  };
}

if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll('\\', '/')}`).href) {
  const seeds = Math.max(1, Math.min(200, Number(process.argv[2]) || 20));
  const startSeed = Math.max(1, Number(process.argv[3]) || 1);
  const mode = process.argv[4] || 'standard';
  if (mode !== 'all' && !GHOST_MODES.includes(mode)) throw new Error(`Mode must be: ${GHOST_MODES.join(', ')}, or all`);
  console.log(`Evaluation seeds ${startSeed}–${startSeed + seeds - 1} (training: 10001+ standard ghosts)`);
  const policies = [
    ['Route + safety (no learning)', chooseRouteMove],
    ['Planning agent', chooseMove], ['Random baseline', randomMove],
  ];
  try {
    const saved = JSON.parse(await readFile(new URL('./policy.json', import.meta.url), 'utf8'));
    const learner = createLearner(saved);
    policies.unshift(['Trained Q-learning', game => chooseLearnedMove(game, learner)]);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log('No trained policy.json yet; run node train.mjs 3000 to add the RL agent.');
  }
  for (const ghostMode of mode === 'all' ? GHOST_MODES : [mode]) {
    console.log(`\nGhost behavior: ${ghostMode}${ghostMode === 'standard' ? ' (training behavior)' : ' (unseen during training)'}`);
    for (const [name, policy] of policies) {
      const { runs, wins, meanScore, meanCollected } = evaluate(policy, seeds, 1500, startSeed, ghostMode);
      console.log(`${name}: ${wins}/${runs} wins | mean score ${meanScore} | ${meanCollected}% pellets collected`);
    }
  }
}
