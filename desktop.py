"""Tkinter Pac-Man-style desktop app using the trained JS Q-learning policy.

Run: python desktop.py
No pip packages required. The game rules and observations mirror engine.mjs
and rl.mjs, so the same policy.json works in both versions.
"""

from collections import deque
import json
from pathlib import Path
import tkinter as tk


WIDTH, HEIGHT, CELL = 21, 17, 32
DIRS = ((0, -1), (1, 0), (0, 1), (-1, 0))


class RNG:
    def __init__(self, seed):
        self.state = seed & 0xFFFFFFFF

    def next(self):
        self.state = (1664525 * self.state + 1013904223) & 0xFFFFFFFF
        return self.state / 4294967296


class Game:
    def __init__(self, seed=1, ghost_mode='standard'):
        if ghost_mode not in ('standard', 'ambush', 'chaos'):
            raise ValueError(f'Unknown ghost mode: {ghost_mode}')
        self.ghost_mode = ghost_mode
        self.seed, self.rng = seed, RNG(seed)
        self.grid = [['#'] * WIDTH for _ in range(HEIGHT)]
        stack = [(1, 1)]
        self.grid[1][1] = ' '
        while stack:
            x, y = stack[-1]
            choices = [(x + dx * 2, y + dy * 2, dx, dy) for dx, dy in DIRS
                       if 0 < x + dx * 2 < WIDTH - 1 and 0 < y + dy * 2 < HEIGHT - 1
                       and self.grid[y + dy * 2][x + dx * 2] == '#']
            if not choices:
                stack.pop()
                continue
            nx, ny, dx, dy = choices[int(self.rng.next() * len(choices))]
            self.grid[y + dy][x + dx] = ' '
            self.grid[ny][nx] = ' '
            stack.append((nx, ny))
        for y in range(1, HEIGHT - 1):
            for x in range(1, WIDTH - 1):
                if self.grid[y][x] != '#':
                    continue
                horizontal = self.grid[y][x - 1] == self.grid[y][x + 1] == ' '
                vertical = self.grid[y - 1][x] == self.grid[y + 1][x] == ' '
                if (horizontal or vertical) and self.rng.next() < .23:
                    self.grid[y][x] = ' '
        self.player = (1, 1)
        self.ghost_spawns = ((WIDTH - 2, HEIGHT - 2), (WIDTH - 2, 1))
        self.ghosts = list(self.ghost_spawns)
        self.powers = {(1, HEIGHT - 2), self.ghost_spawns[0], self.ghost_spawns[1]}
        self.pellets = {(x, y) for y in range(1, HEIGHT - 1)
                        for x in range(1, WIDTH - 1) if self.grid[y][x] == ' '}
        self.pellets.difference_update({self.player, *self.ghost_spawns, *self.powers})
        self.initial = len(self.pellets) + len(self.powers)
        self.score, self.lives, self.ticks, self.frightened = 0, 3, 0, 0
        self.status, self.facing = 'playing', 1

    def exits(self, point):
        x, y = point
        return [(direction, (x + dx, y + dy)) for direction, (dx, dy) in enumerate(DIRS)
                if 0 <= x + dx < WIDTH and 0 <= y + dy < HEIGHT
                and self.grid[y + dy][x + dx] != '#']

    def distances(self, start):
        result = {start: 0}
        queue = deque([start])
        while queue:
            point = queue.popleft()
            for _, neighbor in self.exits(point):
                if neighbor not in result:
                    result[neighbor] = result[point] + 1
                    queue.append(neighbor)
        return result

    def collision(self):
        for i, ghost in enumerate(self.ghosts):
            if ghost != self.player:
                continue
            if self.frightened:
                self.score += 200
                self.ghosts[i] = self.ghost_spawns[i]
            else:
                self.lives -= 1
                self.player = (1, 1)
                self.frightened = 0
                self.ghosts = list(self.ghost_spawns)
                if self.lives <= 0:
                    self.status = 'lost'
            return True
        return False

    def step(self, direction):
        if self.status != 'playing':
            return
        self.ticks += 1
        for available, position in self.exits(self.player):
            if available == direction:
                self.player, self.facing = position, direction
                break
        if self.player in self.pellets:
            self.pellets.remove(self.player)
            self.score += 10
        if self.player in self.powers:
            self.powers.remove(self.player)
            self.score += 50
            self.frightened = 34
        if self.collision():
            return
        if not self.pellets and not self.powers:
            self.status = 'won'
            self.score += 500
            return
        if self.ticks % 3 == 0:
            for i, ghost in enumerate(self.ghosts):
                choices = self.exits(ghost)
                if not choices:
                    continue
                target = self.player
                if self.ghost_mode == 'ambush' and not self.frightened:
                    direction = (self.facing + (1 if i == 1 else 0)) % 4
                    for _ in range(3):
                        forward = dict(self.exits(target)).get(direction)
                        if forward is None:
                            break
                        target = forward
                distance = self.distances(target)
                ordered = sorted(choices, key=lambda move: distance.get(move[1], 999),
                                 reverse=bool(self.frightened))
                random_chance = .72 if self.ghost_mode == 'chaos' else 0 if self.ghost_mode == 'ambush' else .32 if i == 1 else 0
                if random_chance and self.rng.next() < random_chance:
                    picked = choices[int(self.rng.next() * len(choices))]
                else:
                    picked = ordered[0]
                self.ghosts[i] = picked[1]
                if self.collision():
                    break
        if self.frightened:
            self.frightened -= 1


class Policy:
    def __init__(self, path):
        saved = json.loads(Path(path).read_text(encoding='utf-8'))
        self.table = saved['table']
        self.bias = saved.get('targetBias', 0)
        self.rng = RNG(8391)

    def observe(self, game):
        exits = game.exits(game.player)
        ghost_moves = (game.ticks + 1) % 3 == 0
        safe = [(direction, position) for direction, position in exits
                if game.frightened > 1 or position in game.powers or all(
                    position != ghost and (not ghost_moves or
                    position not in (next_pos for _, next_pos in game.exits(ghost)))
                    for ghost in game.ghosts)]
        legal = [direction for direction, _ in (safe or exits)]
        seen = {game.player}
        queue = deque([(game.player, 0, 4)])
        food, ghost = None, None
        while queue:
            point, distance, first = queue.popleft()
            if food is None and (point in game.pellets or point in game.powers):
                food = first
            if ghost is None and point in game.ghosts:
                ghost = (first, distance)
            if food is not None and ghost is not None:
                break
            for direction, neighbor in game.exits(point):
                if neighbor not in seen:
                    seen.add(neighbor)
                    queue.append((neighbor, distance + 1, direction if distance == 0 else first))
        mask = sum(1 << direction for direction, _ in exits)
        band = 0 if ghost and ghost[1] <= 1 else 1 if ghost and ghost[1] <= 3 else 2 if ghost and ghost[1] <= 6 else 3
        key = f'{mask}:{food if food is not None else 4}:{ghost[0] if ghost else 4}:{band}:{int(game.frightened > 2)}:{int(band < 2 and ghost_moves)}'
        return key, legal, food if food is not None else 4

    def action(self, game):
        key, legal, target = self.observe(game)
        q = self.table.get(key, (0, 0, 0, 0))
        best = max(q[move] + (self.bias if move == target else 0) for move in legal)
        choices = [move for move in legal
                   if abs(q[move] + (self.bias if move == target else 0) - best) < 1e-9]
        if target in choices:
            return target
        return choices[int(self.rng.next() * len(choices))]


class Desktop:
    def __init__(self):
        self.root = tk.Tk()
        self.root.title('MazeMind | Pac-Man AI')
        self.root.configure(bg='#0b1020')
        self.root.resizable(False, False)
        self.policy = Policy(Path(__file__).with_name('policy.json'))
        self.game = Game(1)
        self.running = True
        self.manual = False
        self.delay = tk.IntVar(value=85)
        self.header = tk.Label(self.root, text='◕   MAZEMIND    /    TRAINED Q-LEARNING AGENT',
                               fg='#ffcf4b', bg='#0b1020', font=('Consolas', 15, 'bold'), pady=14)
        self.header.pack()
        self.canvas = tk.Canvas(self.root, width=WIDTH * CELL, height=HEIGHT * CELL,
                                bg='#080f24', highlightthickness=0)
        self.canvas.pack(padx=20)
        self.status = tk.Label(self.root, bg='#0b1020', fg='#dfe9fb', font=('Consolas', 11), pady=12)
        self.status.pack()
        controls = tk.Frame(self.root, bg='#0b1020')
        controls.pack(pady=(0, 13))
        self.button(controls, 'Pause', self.pause).pack(side='left', padx=5)
        self.button(controls, 'New maze', self.reset).pack(side='left', padx=5)
        self.button(controls, 'Ghost behavior', self.cycle_ghosts).pack(side='left', padx=5)
        self.button(controls, 'AI / Manual', self.switch).pack(side='left', padx=5)
        self.button(controls, 'Faster', lambda: self.delay.set(max(15, self.delay.get() // 2))).pack(side='left', padx=5)
        self.button(controls, 'Slower', lambda: self.delay.set(min(500, self.delay.get() * 2))).pack(side='left', padx=5)
        self.root.bind('<Key>', self.keydown)
        self.render()
        self.root.after(self.delay.get(), self.tick)

    @staticmethod
    def button(parent, text, command):
        return tk.Button(parent, text=text, command=command, bg='#202d49', fg='white',
                         activebackground='#ffcf4b', relief='flat', padx=12, pady=7)

    def pause(self):
        self.running = not self.running
        self.render()

    def switch(self):
        self.manual = not self.manual
        self.render()

    def reset(self):
        self.game = Game(self.game.seed + 1, self.game.ghost_mode)
        self.running = True
        self.render()

    def cycle_ghosts(self):
        modes = ('standard', 'ambush', 'chaos')
        self.game = Game(self.game.seed, modes[(modes.index(self.game.ghost_mode) + 1) % len(modes)])
        self.running = True
        self.render()

    def keydown(self, event):
        directions = {'Up': 0, 'w': 0, 'Right': 1, 'd': 1, 'Down': 2, 's': 2, 'Left': 3, 'a': 3}
        if event.keysym == 'space':
            self.pause()
        elif event.keysym in directions:
            self.manual = True
            self.game.step(directions[event.keysym])
            self.render()

    def tick(self):
        if self.running and not self.manual and self.game.status == 'playing':
            self.game.step(self.policy.action(self.game))
            self.render()
        self.root.after(self.delay.get(), self.tick)

    def render(self):
        g, c = self.game, self.canvas
        c.delete('all')
        for y, row in enumerate(g.grid):
            for x, tile in enumerate(row):
                if tile == '#':
                    c.create_rectangle(x * CELL + 2, y * CELL + 2, (x + 1) * CELL - 2,
                                       (y + 1) * CELL - 2, fill='#1a326c', outline='#3455a1')
        for x, y in g.pellets:
            cx, cy = (x + .5) * CELL, (y + .5) * CELL
            c.create_oval(cx - 2, cy - 2, cx + 2, cy + 2, fill='#eee5d4', outline='')
        for x, y in g.powers:
            cx, cy = (x + .5) * CELL, (y + .5) * CELL
            c.create_oval(cx - 6, cy - 6, cx + 6, cy + 6, fill='#ffca69', outline='')
        for i, (x, y) in enumerate(g.ghosts):
            cx, cy = (x + .5) * CELL, (y + .5) * CELL
            color = '#5274e5' if g.frightened else ('#fa6587', '#62dbf7')[i]
            c.create_oval(cx - 11, cy - 11, cx + 11, cy + 11, fill=color, outline='')
            c.create_rectangle(cx - 11, cy, cx + 11, cy + 11, fill=color, outline='')
            for eye in (-4, 4):
                c.create_oval(cx + eye - 3, cy - 6, cx + eye + 3, cy, fill='white', outline='')
        x, y = g.player
        cx, cy = (x + .5) * CELL, (y + .5) * CELL
        c.create_oval(cx - 12, cy - 12, cx + 12, cy + 12, fill='#ffcf4b', outline='')
        c.create_arc(cx - 12, cy - 12, cx + 12, cy + 12, start=45 - g.facing * 90,
                     extent=-90, fill='#080f24', outline='#080f24')
        progress = 100 * (1 - (len(g.pellets) + len(g.powers)) / g.initial)
        label = 'WON!' if g.status == 'won' else 'GAME OVER' if g.status == 'lost' else 'MANUAL' if self.manual else 'AI PLAYING' if self.running else 'PAUSED'
        self.status.config(text=f'{label}   •   SCORE {g.score:,}   •   {progress:.0f}% CLEARED   •   LIVES {g.lives}   •   {g.ghost_mode.upper()} GHOSTS   •   MAZE #{g.seed}')


if __name__ == '__main__':
    Desktop().root.mainloop()
