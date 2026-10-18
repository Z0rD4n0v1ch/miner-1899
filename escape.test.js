// Проверки выхода из шахты без лестниц и денег (случай из видео: лопата в долг, 30 м, лестниц нет):
// копание вверх (W + пробел) и клеть в долг при уже взятом долге — до 300 руб.
// Запуск: node escape.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
function makeEl() {
    return { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); },
        width: 800, height: 600 };
}
const els = {}, notes = [];
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => false, console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = c => vm.runInContext(c, sandbox);
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

// Как в видео: колодец шириной в блок, игрок на дне на глубине depth, вокруг камень
function shaft(depth, top) {
    run(`generateWorld(21); creatures = []; resetHazards(); resetDig(); keys = {}; gameState.paused = false; cageCall = null; fallTop = null;
         hazardRandom = () => 0.99; respawnTimer = 1e9; ladders = 0; ropes = 0; stats.money = 0; debt = 80; shovelTier = 1; pickaxeTier = 0;
         backpack = emptyBackpack(); for (let i = 0; i < 20; i++) addToBackpack(BLOCK_TYPES.COAL);
         globalThis.B = DEPTH_ORIGIN + ${depth};
         for (let y = SURFACE_Y; y <= B + 3; y++) for (let x = 40; x <= 80; x++) world[y][x] = BLOCK_TYPES.STONE;
         for (let y = ${top === undefined ? 'SURFACE_Y' : 'B - ' + top}; y <= B; y++) world[y][50] = BLOCK_TYPES.AIR;
         player.x = 50; player.y = B; player.vx = 0; player.vy = 0; player.onGround = true; player.direction = 1;`);
    notes.length = 0;
}
function step(seconds, keysObj) {
    run(`keys = ${JSON.stringify(keysObj)}; for (let i = 0; i < ${Math.round(seconds * 60)}; i++) { updatePlayer(1/60); updateDigging(1/60); updateHazards(1/60); updateCage(1/60); } keys = {};`);
}

console.log('Копание вверх');
shaft(30, 2);
run('world[B - 1][50] = BLOCK_TYPES.STONE;');
check('W + пробел целится в блок над головой', JSON.stringify(run('(() => { keys = {KeyW: true, Space: true}; const t = digTarget(); keys = {}; return t; })()')) === JSON.stringify({ x: 50, y: run('B - 1') }));
run('world[B - 1][50] = BLOCK_TYPES.AIR;');
run('world[B - 2][51] = BLOCK_TYPES.STONE;');
check('над головой пусто — целится вверх-вперёд', JSON.stringify(run('(() => { keys = {KeyW: true, Space: true}; const t = digTarget(); keys = {}; return t; })()')) === JSON.stringify({ x: 51, y: run('B - 1') }));
check('вверх-вперёд пусто — ещё на блок выше, чтобы на ступеньку было где запрыгнуть', JSON.stringify(run('(() => { world[B - 1][51] = BLOCK_TYPES.AIR; world[B - 2][51] = BLOCK_TYPES.STONE; keys = {KeyW: true, Space: true}; const t = digTarget(); keys = {}; return t; })()')) === JSON.stringify({ x: 51, y: run('B - 2') }));
run('world[B - 1][51] = BLOCK_TYPES.STONE; world[B - 1][49] = BLOCK_TYPES.STONE; player.direction = -1;');
check('смотрит влево — вверх-влево', run('(() => { keys = {KeyW: true, Space: true}; const t = digTarget(); keys = {}; return t.x; })()') === 49);
shaft(30, 2); run('world[B - 1][50] = BLOCK_TYPES.STONE;');
step(1, { KeyW: true, Space: true });
check('с пробелом W не прыгает — копает', run('player.y') === run('B') && run('world[B - 1][50]') === run('BLOCK_TYPES.AIR'));
shaft(30);
step(0.3, { KeyW: true });
check('без пробела W — по-прежнему прыжок', run('player.y') < run('B') - 0.5);

console.log('Выход из колодца ступеньками');
shaft(30);
const startY = run('player.y');
let t = 0;
for (let i = 0; i < 60 && run('player.y') >= run('SURFACE_Y'); i++) {
    let guard = 0;
    while (guard++ < 600) {   // копаем, пока над головой и вверх-вперёд не станет пусто
        const busy = run(`(() => { const r = Math.floor(player.y + 0.5) - 1, cx = Math.floor(player.x + PLAYER_W / 2), fx = Math.floor(player.x + PLAYER_W) + 1;
            return getBlock(cx, r) !== BLOCK_TYPES.AIR || getBlock(fx, r) !== BLOCK_TYPES.AIR || getBlock(fx, r - 1) !== BLOCK_TYPES.AIR; })()`);
        if (!busy) break;
        step(0.1, { KeyW: true, Space: true }); t += 0.1;
    }
    step(0.2, { KeyW: true, KeyD: true }); step(0.35, { KeyD: true }); step(0.3, {}); t += 0.85;
}
const climbed = startY - run('player.y');
check(`без лестниц и денег выбрался ступеньками с 30 м за ~${Math.round(t)} с игрового времени`, run('player.y') < run('SURFACE_Y') && t < 240);
check('руда при этом цела', run('backpackCount()') === 20);
check('падений и урона не было', run('health') === 100);

console.log('На лестнице');
shaft(30, 6); run('for (let y = B - 6; y <= B; y++) world[y][50] = BLOCK_TYPES.LADDER; world[B - 7][50] = BLOCK_TYPES.STONE; player.y = B - 3; ladders = 0;');
const yl = run('player.y');
step(0.5, { KeyW: true, Space: true });
check('на лестнице W + пробел не лезет вверх и не снимает лестницу над головой', run('player.y') === yl && run('world[B - 4][50]') === run('BLOCK_TYPES.LADDER') && run('ladders') === 0);
step(0.5, { KeyW: true });
check('без пробела W — лезет как раньше', run('player.y') < yl - 1);

console.log('Клеть в долг при уже взятом долге');
shaft(30);
check('долг за лопату 80, на 30 м подъём 16 руб. — в долг можно', run('openCage()') === true && els.cageInfo.innerHTML.includes('в долг'));
run('callCage()'); step(4, {});
check('клеть пришла, долг вырос до 80 + 32 = 112', run('player.y') < run('SURFACE_Y') && run('debt') === 112);
check('руда поднялась вместе с игроком', run('backpackCount()') === 20);
run('checkShop()');
check('и в лавке пошла в счёт долга', run('debt') === 112 - 80 && run('stats.money') === 0);
shaft(300); run('debt = 250;');
check('сверх 300 руб. долга клеть не дают', run('openCage()') === true && !els.cageInfo.innerHTML.includes('callCage()'));
check('и подсказывают про W + пробел', els.cageInfo.innerHTML.includes('W + пробел'));
run('closeCage()');
check('callCage тоже отказывает', run('callCage()') === false);
check('лопату в долг при долге по-прежнему не дают', (() => { run('debt = 10; shovelTier = 0;'); return run('takeShovelOnCredit(1)') === false; })());
check('в подсказках управления есть «с W — вверх»', /с <span class="key">W<\/span> — вверх/.test(html));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
