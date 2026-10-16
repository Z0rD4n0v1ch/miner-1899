// Проверки физики игрока: одинаковое поведение при любой частоте кадров.
// Запуск: node physics.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function fresh() {
    const P = () => new Proxy(function () {}, {
        get: (t, k) => k === 'getContext' ? () => P() : (k === 'width' ? 800 : k === 'height' ? 600 : P()),
        set: () => true, apply: () => P()
    });
    const c = {
        document: { getElementById: () => P(), createElement: () => P(), body: P() },
        localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
        window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
        confirm: () => false, console, Date, Math, JSON, Object, Proxy
    };
    vm.createContext(c);
    vm.runInContext(script, c);
    const run = code => vm.runInContext(code, c);
    // ровная комната: пол на ряду 101, игрок стоит на нём в x = 50
    run(`for (let y = 85; y <= 101; y++) for (let x = 40; x < 80; x++)
             world[y][x] = y === 101 ? BLOCK_TYPES.STONE : BLOCK_TYPES.AIR;
         for (let y = 102; y <= 110; y++) for (let x = 40; x < 80; x++) world[y][x] = BLOCK_TYPES.AIR;
         player.x = 50; player.y = 100; player.vx = 0; player.vy = 0; player.onGround = true; keys = {};`);
    return run;
}
function sim(run, hz, seconds, keysPerFrame) {
    const dt = 1 / hz;
    for (let i = 0; i < Math.round(hz * seconds); i++) {
        run(`keys = ${JSON.stringify(keysPerFrame(i))}; updatePlayer(${dt});`);
    }
    run('keys = {}');
}
function jumpHeight(hz) {
    const run = fresh();
    let top = 100;
    const dt = 1 / hz;
    for (let i = 0; i < hz * 2; i++) {
        run(`keys = ${i === 0 ? '{KeyW:true}' : '{}'}; updatePlayer(${dt});`);
        top = Math.min(top, run('player.y'));
    }
    return { height: 100 - top, landed: run('player.y') === 100 && run('player.onGround') };
}

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
const RATES = [30, 60, 105, 144, 240];

console.log('Прыжок');
const heights = RATES.map(jumpHeight);
RATES.forEach((hz, i) => check(`${hz} Гц: прыжок ${heights[i].height.toFixed(2)} блока и приземление`,
    heights[i].height > 1.5 && heights[i].landed));
const spread = Math.max(...heights.map(h => h.height)) - Math.min(...heights.map(h => h.height));
check(`высота прыжка не зависит от частоты кадров (разброс ${spread.toFixed(3)})`, spread < 0.05);

console.log('Ступеньки');
for (const hz of [60, 105, 144]) {
    const run = fresh();
    run('for (let x = 53; x < 80; x++) world[100][x] = BLOCK_TYPES.STONE;');   // уступ в 1 блок
    sim(run, hz, 3, i => (i % 30 === 0 ? { KeyD: true, KeyW: true } : { KeyD: true }));
    check(`${hz} Гц: уступ в 1 блок берётся`, run('player.x') > 54 && run('player.y') === 99);
}
{
    const run = fresh();
    run('world[100][53] = BLOCK_TYPES.STONE; world[99][53] = BLOCK_TYPES.STONE;');  // стена в 2 блока
    sim(run, 105, 3, i => (i % 30 === 0 ? { KeyD: true, KeyW: true } : { KeyD: true }));
    check('стена в 2 блока не берётся', run('player.x') < 53);
}

console.log('Стены');
for (const hz of [30, 105, 240]) {
    const run = fresh();
    run('world[100][55] = BLOCK_TYPES.STONE;');
    sim(run, hz, 3, () => ({ KeyD: true }));
    const edge = run('player.x + PLAYER_W');
    check(`${hz} Гц: справа упирается вплотную, не заходя в стену (край ${edge.toFixed(3)})`, edge <= 55 && edge > 54.99);
    run('world[100][45] = BLOCK_TYPES.STONE;');
    sim(run, hz, 5, () => ({ KeyA: true }));
    check(`${hz} Гц: слева упирается вплотную`, run('player.x') === 46);
}

console.log('Падение');
{
    const run = fresh();
    run('world[101][50] = BLOCK_TYPES.AIR; world[101][51] = BLOCK_TYPES.AIR; world[106][50] = BLOCK_TYPES.STONE; world[106][51] = BLOCK_TYPES.STONE;');
    run('player.x = 50; player.y = 90; player.vy = 15;');
    sim(run, 10, 3, () => ({}));   // 10 FPS — dt упирается в 0.1
    check('при 10 FPS быстрое падение не проскакивает сквозь пол', run('player.y') === 105 && run('player.onGround'));
}
{
    const run = fresh();
    run('player.y = 85; player.vy = 0;');
    sim(run, 60, 0.2, () => ({}));
    check('скорость падения ограничена', run('player.vy') <= run('MAX_FALL_SPEED'));
}
{
    const run = fresh();
    run('world[97][50] = BLOCK_TYPES.STONE;');   // потолок на 2 блока выше головы
    run('keys = {KeyW:true}; updatePlayer(1/60);');
    sim(run, 60, 1, () => ({}));
    check('потолок останавливает прыжок, игрок возвращается на пол', run('player.y') === 100);
}

console.log('Копание');
{
    const run = fresh();
    run('player.x = 50.3; player.direction = 1; world[100][52] = BLOCK_TYPES.STONE; dig();');
    check('при дробном x копается блок за правым краем', run('world[100][52]') === run('BLOCK_TYPES.AIR'));
    run('player.x = 50.3; player.direction = -1; world[100][49] = BLOCK_TYPES.STONE; dig();');
    check('при дробном x копается блок за левым краем', run('world[100][49]') === run('BLOCK_TYPES.AIR'));
    run('player.x = 50.6; keys = {KeyS: true}; dig(); keys = {};');
    check('S + пробел копает под серединой игрока', run('world[101][51]') === run('BLOCK_TYPES.AIR'));
}

console.log('Отрисовка');
{
    const fills = [];
    const ctxStub = new Proxy({}, {
        get: (t, k) => k === 'fillRect' ? () => fills.push(t.fillStyle) : (k in t ? t[k] : () => {}),
        set: (t, k, v) => (t[k] = v, true)
    });
    const el = { getContext: () => ctxStub, width: 800, height: 600, style: {}, classList: { toggle() {}, add() {}, remove() {}, contains() { return false; } } };
    const c = {
        document: { getElementById: () => el, createElement: () => el, body: { appendChild() {} } },
        localStorage: { getItem: () => null, setItem() {} }, window: { addEventListener() {} },
        requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, confirm: () => false, console, Date, Math, JSON, Object, Proxy
    };
    vm.createContext(c); vm.runInContext(script, c);
    const run = code => vm.runInContext(code, c);
    run('generateWorld(7); player.y = SURFACE_Y - 1; updateCamera(); render();');
    check('небо над поверхностью голубое', fills.includes(run('BLOCK_COLORS[BLOCK_TYPES.AIR]')));
    fills.length = 0;
    run('player.y = 400; updateCamera(); for (let y = 395; y < 405; y++) world[y][60] = BLOCK_TYPES.AIR; render();');
    check('пещеры тёмные, а не цвета неба', fills.includes(run('CAVE_COLOR')) && !fills.includes(run('BLOCK_COLORS[BLOCK_TYPES.AIR]')));
}

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
