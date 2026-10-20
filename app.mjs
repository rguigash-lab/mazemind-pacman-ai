import { createGame, step } from './engine.mjs';
import { chooseMove } from './agent.mjs';
import { createLearner, chooseLearnedMove, chooseRouteMove } from './rl.mjs';

const $ = selector => document.querySelector(selector);
const canvas = $('#board');
const ctx = canvas.getContext('2d');
const CELL = 30;
canvas.width = 21 * CELL;
canvas.height = 17 * CELL;
let seed = 1;
let game = createGame(seed);
let mode = 'paused';
let timer;
let lastPellets = game.pellets.size + game.powers.size;
let logStep = -100;
const colors = ['#ff647e', '#64dcfa'];
let learner = null;
$('#toggle').disabled = true;
fetch('./policy.json').then(response => {
  if (!response.ok) throw Error(`HTTP ${response.status}`);
  return response.json();
}).then(data => { learner = createLearner(data); $('#toggle').disabled = false;
  if (new URLSearchParams(location.search).has('autoplay')) mode = 'ai';
  run(); })
  .catch(() => { $('#agent').value = 'planner'; $('#agent').querySelector('[value="rl"]').disabled = true;
    $('#toggle').disabled = false; addEvent('No trained policy found. Using planner.');
    if (new URLSearchParams(location.search).has('autoplay')) mode = 'ai';
    run(); });

function addEvent(text) {
  const node = document.createElement('div');
  node.className = 'event';
  const stamp = document.createElement('span');
  stamp.textContent = String(Math.floor(game.ticks / 60)).padStart(2, '0') + ':' + String(game.ticks % 60).padStart(2, '0');
  node.append(stamp, document.createTextNode(text));
  $('#events').prepend(node);
  while ($('#events').children.length > 5) $('#events').lastElementChild.remove();
}

function draw() {
  ctx.fillStyle = '#080f24';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < game.grid.length; y++) for (let x = 0; x < game.grid[y].length; x++) {
    if (game.grid[y][x] !== '#') continue;
    const px = x * CELL, py = y * CELL;
    ctx.fillStyle = '#152a63';
    ctx.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
    ctx.strokeStyle = '#3053a1';
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 3.5, py + 3.5, CELL - 7, CELL - 7);
  }
  for (const pos of game.pellets) {
    const [x, y] = pos.split(',').map(Number);
    ctx.fillStyle = '#d8d8c5';
    ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 2.4, 0, Math.PI * 2); ctx.fill();
  }
  for (const pos of game.powers) {
    const [x, y] = pos.split(',').map(Number);
    ctx.fillStyle = '#ffdb73'; ctx.shadowColor = '#ffcb50'; ctx.shadowBlur = 17;
    ctx.beginPath(); ctx.arc(x * CELL + CELL / 2, y * CELL + CELL / 2, 6, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }
  for (const ghost of game.ghosts) {
    const cx = (ghost.x + .5) * CELL, cy = (ghost.y + .5) * CELL;
    ctx.fillStyle = game.frightened ? '#4d76e6' : colors[ghost.color];
    ctx.beginPath(); ctx.arc(cx, cy - 2, 10, Math.PI, 0); ctx.lineTo(cx + 10, cy + 10);
    for (let j = 0; j < 3; j++) ctx.lineTo(cx + 5 - j * 7, cy + (j % 2 ? 6 : 10));
    ctx.lineTo(cx - 10, cy + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    for (const shift of [-4, 4]) {
      ctx.beginPath(); ctx.arc(cx + shift, cy - 2, 3.1, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#15254a'; ctx.beginPath(); ctx.arc(cx + shift + .8, cy - 2, 1.4, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff';
    }
  }
  const px = (game.player.x + .5) * CELL, py = (game.player.y + .5) * CELL;
  ctx.fillStyle = '#ffd347'; ctx.shadowBlur = 16; ctx.shadowColor = '#ffd347';
  const facing = game.facing ?? 1;
  const angle = facing * Math.PI / 2 - Math.PI / 2;
  ctx.beginPath(); ctx.moveTo(px, py); ctx.arc(px, py, 11, angle + .32, angle + Math.PI * 2 - .32); ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
}

function update() {
  const remaining = game.pellets.size + game.powers.size;
  const percent = Math.round((1 - remaining / lastPellets) * 100);
  $('#score').textContent = game.score.toLocaleString();
  $('#pellets').textContent = remaining;
  $('#percentage').textContent = percent + '%';
  $('#progress-bar').style.width = percent + '%';
  $('#lives').textContent = '● '.repeat(game.lives).trim() || '—';
  $('#ticks').textContent = game.ticks;
  $('#seed-label').textContent = `MAZE #${seed}`;
  if (game.status !== 'playing') {
    clearInterval(timer); mode = 'paused';
    $('#overlay').hidden = false;
    $('#overlay-title').textContent = game.status === 'won' ? 'MAZE CLEARED!' : 'GAME OVER';
    $('#overlay-subtitle').textContent = `Score: ${game.score.toLocaleString()} · ${percent}% complete · ${game.ticks} moves`;
  } else {
    $('#overlay').hidden = true;
  }
  $('#toggle').textContent = mode === 'ai' ? 'Ⅱ  Pause AI' : '▶  Start AI';
  if (game.status === 'won') {
    $('#state-heading').textContent = 'Mission complete';
    $('#state-text').textContent = 'Every pellet collected. Try a new procedural maze.';
  } else if (mode === 'manual') {
    $('#state-heading').textContent = 'Human pilot active';
    $('#state-text').textContent = 'Use the arrow keys or WASD to navigate.';
  } else if (mode === 'ai') {
    const agent = $('#agent').value;
    $('#state-heading').textContent = agent === 'rl' ? 'Q-learning agent active' : agent === 'route' ? 'Route + safety active' : 'Pathfinding agent active';
    $('#state-text').textContent = agent === 'rl' ? 'Combining learned action values with a route prior and immediate-danger mask.' : agent === 'route' ? 'Following the nearest reward with a safety mask; no training involved.' : 'Comparing reachable pellets against ghost proximity and escape routes.';
  } else {
    $('#state-heading').textContent = 'Ready to explore';
    $('#state-text').textContent = 'Select an agent and press Start AI to watch it play.';
  }
  draw();
}

function takeTurn(direction) {
  if (game.status !== 'playing') return;
  game.facing = direction ?? game.facing;
  step(game, direction);
  for (const event of game.events) if (!event.startsWith('Pellet') || game.ticks - logStep >= 24) {
    addEvent(event); logStep = game.ticks;
  }
  update();
}
function run() {
  clearInterval(timer);
  if (mode === 'ai') timer = setInterval(() => takeTurn($('#agent').value === 'rl' && learner
    ? chooseLearnedMove(game, learner) : $('#agent').value === 'route' ? chooseRouteMove(game) : chooseMove(game)), Number($('#speed').value));
  update();
}
function newMaze() {
  seed++;
  game = createGame(seed);
  lastPellets = game.pellets.size + game.powers.size;
  logStep = -100;
  $('#events').replaceChildren();
  addEvent('New maze generated.');
  run();
}
$('#toggle').onclick = () => { if (game.status !== 'playing') newMaze(); mode = mode === 'ai' ? 'paused' : 'ai'; run(); };
$('#manual').onclick = () => { mode = 'manual'; run(); addEvent('Human controls enabled.'); };
$('#reset').onclick = newMaze;
$('#again').onclick = () => { mode = 'ai'; newMaze(); };
$('#speed').onchange = run;
$('#agent').onchange = () => { addEvent($('#agent').value === 'rl' ? 'Q-learning agent selected.' : $('#agent').value === 'route' ? 'Untrained route baseline selected.' : 'Pathfinding baseline selected.'); update(); };
document.addEventListener('keydown', event => {
  if (event.code === 'Space') { event.preventDefault(); $('#toggle').click(); return; }
  const direction = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 }[event.code];
  if (direction === undefined) return;
  event.preventDefault();
  if (mode !== 'manual') { mode = 'manual'; run(); }
  takeTurn(direction);
});
update();
