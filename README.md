# MazeMind: a Pac-Man-style reinforcement learning lab

A browser-playable maze game with a **trained Q-learning agent** and a pathfinding baseline. The maze is generated from a seed, with loops added to a spanning-tree maze. Pellets, power pellets, and moving ghosts create a reproducible challenge. This is an original small game, not the commercial Pac-Man ROM.

## Play

**Python desktop app:** From this folder run `python desktop.py`. A Tkinter window opens and the trained agent starts playing automatically. Use **Ghost behavior** to cycle between standard, ambush, and chaos ghosts on the *same* maze seed. Use **Pause**, **New maze**, **AI / Manual**, or the speed buttons. In manual mode, use arrow keys or WASD. This needs only Python's standard library and the included `policy.json`.

**Browser app:**

From this folder, run `python -m http.server 8000` and open <http://localhost:8000>. Select **Q-learning (trained)**, **Route + safety (untrained)**, or **Pathfinding baseline**, press **Start AI**, or play with the arrow keys / WASD. Change the speed or generate a new seeded maze with **New maze**. No packages or build step are needed for the game. If serving from the parent directory, open <http://localhost:8000/pacman_ai/> instead.

## Train from scratch

Install Node.js and run `node train.mjs 3000` from this folder (or `node pacman_ai/train.mjs 3000` from its parent). Training takes a few minutes and writes `policy.json`, which the browser loads on refresh. It needs no ML framework. Training seeds start at **10001**, and evaluation seeds start at **1**, so the test mazes do not overlap with the training mazes.

The agent uses **tabular Q-learning**, with epsilon-greedy exploration during training, legal-action masking, a discounted reward target, and an annealed exploration rate. A compact observation records the available exits, the direction of the nearest reward and ghost, ghost-distance band, whether ghosts are frightened, and whether ghosts move next turn. It does not memorize coordinates or the maze seed. Rewards include pellet score, a life-loss penalty, a win bonus, and route-progress shaping. Its nearest-reward/ghost clues use BFS. A route-direction prior favors the closest remaining reward; Q-values learned by playing can override that prior. A one-step safety mask removes immediately dangerous moves when a safe alternative exists. The benchmark includes the **route + safety policy without learning** as an ablation, so the effect of training can be measured honestly. The saved policy is evaluated greedily with no exploration or updates.

## Measure the agent

Run `node benchmark.mjs 20` from this folder. This compares the saved Q-learning agent, the untrained route + safety ablation, the planning agent, and a random legal-move baseline over the **same seeded mazes**, with a limit of 1,500 moves per maze. Reports wins, mean score, and mean percentage of rewards collected. To reproduce the ghost-behavior generalization experiment, run `node benchmark.mjs 100 401 all`: this evaluates seeds 401–500 against standard, ambush and chaos ghosts. Training used only standard ghosts on seeds 10001–13000. Running from the parent directory also works: `node pacman_ai/benchmark.mjs 100 401 all`.

Run `node --test test.mjs` for engine and agent checks.

The pathfinding baseline in `agent.mjs` uses breadth-first search over the walkable grid, scoring available moves by distance to food and power-ups, ghost proximity, and the number of exits. The ghosts use pursuit plus occasional random turns. Neither agent has a proof of perfect play.

On 100 fresh mazes (seeds 401–500, 1,500-move limit), the trained policy cleared **85/100** standard-ghost mazes but only **73/100** ambush-ghost mazes. The untrained route + safety baseline cleared **99/100** and **82/100**, respectively. See [EXPERIMENT.md](EXPERIMENT.md) for the full results, protocol, and limitations. **Training currently hurts performance compared with the route + safety ablation**. This is the main open research question, not a claim of RL superiority.

## Next research milestones

1. Evaluate at least 100 held-out mazes and report variance, not just best runs.
2. Improve the learner with replay or a neural Q-network; compare using exactly the same held-out seeds.
3. Remove access to ghosts' internal state and test inference from observations.
4. Compare reward shaping and epsilon schedules with controlled ablation experiments.
