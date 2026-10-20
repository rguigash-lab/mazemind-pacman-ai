# Experiment: does a trained agent generalize to new ghost behavior?

## Question and protocol

The Q-learning agent was trained for 3,000 games with **standard ghosts** on maze seeds 10001–13000. Freeze the saved `policy.json`. Evaluate it, an untrained route + safety agent, the original pathfinding agent, and a random-move baseline on the **same 100 fresh mazes** (seeds 401–500) in each ghost mode. Each game has three lives and a 1,500-turn limit. A win requires collecting every pellet. Training, policies, mazes, and metrics are deterministic for a given run.

The new modes change **only ghost decisions**, not the maze or player rules:

- **Standard (training behavior):** first ghost chases the player; second ghost sometimes turns randomly.
- **Ambush (unseen):** ghosts chase projected positions ahead and to the side of the player's heading, instead of the player's current tile.
- **Chaos (unseen):** both ghosts choose random legal turns 72% of the time; otherwise they pursue the player. This is less persistent pursuit, not necessarily a harder mode.

Run `node benchmark.mjs 100 401 all` from `pacman_ai/` to reproduce. A separate earlier development comparison used seeds 201–300; the results below use seeds 401–500.

## Results (wins / 100; mean percent of rewards collected)

| Policy | Standard | Ambush | Chaos |
| --- | --- | --- | --- |
| Trained Q-learning + route prior + safety | 85; 97.5% | 73; 93.9% | 99; 100% |
| Route + safety, **no learning** | 99; 99.9% | 82; 97.1% | 100; 100% |
| Original pathfinding agent | 55; 90.6% | 44; 82.2% | 77; 98.2% |
| Random legal moves | 0; 15.4% | 0; 14.1% | 0; 29.1% |

## Interpretation and limitations

Ambush reduces Q-learning wins by **12 percentage points** (85 → 73); it also reduces the untrained route + safety baseline by **17 points** (99 → 82). The learned policy never beat the untrained baseline in these conditions. Chaos makes the game easier because random ghosts pursue less consistently. These results show a measurable behavior shift, **not** evidence of perfect play, nor proof that reinforcement learning improved the agent. The agent receives exact ghost positions and nearest-food directions from BFS; it does not learn perception. The test consists of 100 seeded mazes per mode, not every possible maze or opponent behavior.

## Next experiment

Train across **multiple ghost policies**, leaving one policy entirely unseen at evaluation time. Compare with the same untrained route + safety baseline on another predeclared range of fresh maze seeds, and report paired per-seed win differences rather than only overall win rates. A useful goal is to improve the learned policy without sacrificing standard-ghost performance.
