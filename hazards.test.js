// Проверки здоровья и опасностей биомов: лава, жар, обвалы, рудничный газ.
// Запуск: node hazards.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const fills = [], texts = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => {
        if (k === 'fillRect') return (x, y, w, h) => fills.push([t.fillStyle, x, y, w, h]);
        if (k === 'fillText') return (s) => texts.push(s);
        return k in t ? t[k] : () => {};
    },
    set: (t, k, v) => (t[k] = v, true)
});
function makeEl() {
    return {
        textContent: '', innerHTML: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } },
        appendChild() {}, remove() {}, focus() {}, click() {},
        getContext() { return ctxStub; }, width: 800, height: 600
    };
}
const els = {}, notes = [];
let confirmAnswer = false;
let rafCalls = 0, frameErrors = 0;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} }, requestAnimationFrame() { rafCalls++; }, setInterval() {}, setTimeout() {},
    confirm: () => confirmAnswer, console: { ...console, error: () => { frameErrors++; } }, Date, Math, JSON, Object, Proxy, Number, Set
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
const near = (a, b, eps = 0.15) => Math.abs(a - b) < eps;

// Закрытая комната на глубине depth: пол на ряду floor+1, игрок стоит в x = 50
function room(depth, fill = 'STONE') {
    run(`generateWorld(31); resetHazards(); resetDig(); keys = {}; gameState.paused = false; debug.on = false; debug.fly = false;
         pickaxeTier = 3; shovelTier = 1; backpack = emptyBackpack(); stats.score = 100;
         hazardRandom = () => 0.99;
         globalThis.F = DEPTH_ORIGIN + ${depth};
         for (let y = F - 6; y <= F + 2; y++) for (let x = 40; x <= 62; x++)
             world[y][x] = (y >= F - 4 && y <= F) ? BLOCK_TYPES.AIR : BLOCK_TYPES.${fill};
         player.x = 50; player.y = F; player.vx = 0; player.vy = 0; player.onGround = true; player.direction = 1;`);
    notes.length = 0;
}
function tick(seconds, extra = '') {
    run(`for (let i = 0; i < ${Math.round(seconds * 60)}; i++) { ${extra} updatePlayer(1/60); updateHazards(1/60); }`);
}

console.log('Здоровье');
room(100);
check('в начале 100 здоровья', run('health') === 100);
run('updateUI()');
check('в панели 100 и зелёная полоска', els.health.textContent === 100 && els.healthFill.style.width === '100%');
run('damage(25, "тест")');
check('урон снимает здоровье', run('health') === 75);
tick(2);
check('первые 3 с после урона не лечит', run('health') === 75);
tick(2);
check('потом восстанавливается по 4 в секунду', run('health') > 75 && run('health') < 80);
tick(10);
check('не выше 100', run('health') === 100);
run('damage(75, "тест"); updateUI();');
check('при 25 и меньше 30 — полоска красная', els.health.classList.contains('full') && els.healthFill.classList.contains('full'));
run('addToBackpack(BLOCK_TYPES.GOLD); addToBackpack(BLOCK_TYPES.GOLD); damage(50, "Проверка");');
check('смерть: снова 100 здоровья', run('health') === 100);
check('смерть: на поверхности', run('player.y') < run('SURFACE_Y'));
check('смерть: рюкзак потерян', run('backpackCount()') === 0);
check('смерть: −50 очков', run('stats.score') === 50);
check('смерть: сообщение с причиной и потерей', notes.some(n => n.includes('Проверка') && n.includes('2 шт.')));
room(100);
run('debug.on = true; debug.fly = true; damage(500, "тест");');
check('в полёте отладки урона нет', run('health') === 100);
run('debug.on = false; debug.fly = false;');

console.log('Лава');
room(650);
run('for (let x = 49; x <= 53; x++) { world[F + 1][x] = BLOCK_TYPES.LAVA; world[F + 2][x] = BLOCK_TYPES.STONE; } addToBackpack(BLOCK_TYPES.RUBY);');
check('лава не держит: сквозь неё падают', run('isBlocked(50, F + 1)') === false);
check('лаву нельзя выкопать', run('canDig(BLOCK_TYPES.LAVA)') === false);
tick(1);
check('упал в лаву — смерть, рюкзак потерян', run('player.y') < run('SURFACE_Y') && run('backpackCount()') === 0 && notes.some(n => n.includes('Лава')));

console.log('Лава и копание (зависание)');
room(650);
run('world[F][51] = BLOCK_TYPES.LAVA;');
let threw = false;
try { run('keys["Space"] = true; for (let i = 0; i < 120; i++) updateDigging(1/60); keys = {};'); } catch (e) { threw = true; }
check('пробел в сторону лавы не роняет игру', !threw);
check('лава при этом не копается и подсказки про кирку нет', run('getBlock(51, F)') === run('BLOCK_TYPES.LAVA') && !notes.some(n => n.includes('не поддаётся')));
room(650);
run('for (let x = 49; x <= 53; x++) world[F + 1][x] = BLOCK_TYPES.LAVA; player.y = F - 2;');
frameErrors = 0; notes.length = 0;
run('keys = {KeyD: true, Space: true, KeyS: true}; for (let i = 0; i < 120; i++) gameLoop(1000 + i * 16.7); keys = {};');
check('падение в лаву с зажатым пробелом — без ошибок, смерть и возврат наверх', frameErrors === 0 && notes.some(n => n.includes('Лава')) && run('player.y') < run('F - 100'));
frameErrors = 0;
run(`(() => { generateWorld(7); let t = 5000;
    for (let y = 0; y < WORLD_HEIGHT; y += 1) for (let x = 2; x < WORLD_WIDTH - 2; x += 9)
        if (world[y][x] === BLOCK_TYPES.LAVA && world[y - 1][x] === BLOCK_TYPES.AIR) {
            player.x = x; player.y = y - 3; player.vy = 0; keys = {KeyD: true, Space: true};
            for (let i = 0; i < 90; i++) { t += 16.7; gameLoop(t); }
        }
    keys = {}; })()`);
check('десятки настоящих лавовых озёр мира — ни одной ошибки в кадре', frameErrors === 0);
run('const realHazards = updateHazards; updateHazards = () => { throw new Error("тест"); };');
rafCalls = 0; frameErrors = 0; notes.length = 0;
run('gameLoop(90000); gameLoop(90016); updateHazards = realHazards;');
check('если в кадре всё же ошибка — игра продолжает работать', rafCalls === 2 && frameErrors === 2);
check('и сообщает об этом один раз, а не каждый кадр', notes.filter(n => n.includes('Ошибка в игре')).length === 1);

console.log('Жар');
room(700);
tick(10);
check(`на Огненном дне здоровье убывает: 10 с → ${run('health').toFixed(1)}`, near(run('health'), 95, 0.2));
check('в жару не восстанавливается', (() => { tick(5); return run('health') < 95; })());
room(700);
run('world[F][52] = BLOCK_TYPES.LAVA;');
tick(4);
check(`у лавы жарче: 4 с → ${run('health').toFixed(1)}`, near(run('health'), 80, 0.3));
room(500);
tick(10);
check('в Гранитных недрах жара нет', run('health') === 100);
room(700); run('updateCamera()'); fills.length = 0; run('renderHazards()');
check('на дне красноватая дымка', fills.some(f => f[0] === 'rgba(255, 60, 0, 0.07)'));
room(500); run('updateCamera()'); fills.length = 0; run('renderHazards()');
check('выше дымки нет', !fills.some(f => f[0] === 'rgba(255, 60, 0, 0.07)'));

console.log('Обвалы');
room(300, 'STONE');
run('hazardRandom = () => 0;');      // всегда трескается
run('world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.STONE; world[F - 2][51] = BLOCK_TYPES.STONE; dig();');
check('в Глиняных штольнях после копания потолок трещит', run('crumbling.length') === 1 &&
    run('crumbling[0].x') === 51 && run('crumbling[0].y') === run('F - 1') && notes.some(n => n.includes('Потолок трещит')));
tick(0.9, 'hazardRandom = () => 0.99;');
check('первую секунду держится', run('getBlock(51, F - 1)') !== run('BLOCK_TYPES.AIR'));
tick(0.2);
check('потом падает', run('fallingBlocks.length + (getBlock(51, F) !== BLOCK_TYPES.AIR ? 1 : 0)') >= 1 && run('getBlock(51, F - 1)') === run('BLOCK_TYPES.AIR'));
tick(1);
check('и ложится в выкопанную ямку тем же камнем', run('getBlock(51, F)') === run('BLOCK_TYPES.STONE') && run('fallingBlocks.length') === 0);
check('игрока рядом не задело', run('health') === 100);
room(300, 'STONE');
run('hazardRandom = () => 0; world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.STONE; world[F - 2][51] = BLOCK_TYPES.STONE; dig(); hazardRandom = () => 0.99; player.x = 51;');
tick(2);
check('шагнул под трещину — обвал бьёт на 30', near(run('health'), 70 + 4 * 0, 0.01) || (run('health') >= 70 && run('health') < 71));
check('сообщение о трещине было', notes.some(n => n.includes('Потолок трещит')));
room(300, 'CLAY');
run('hazardRandom = () => 0; world[F][51] = BLOCK_TYPES.CLAY; world[F - 1][51] = BLOCK_TYPES.CLAY; dig();');
check('глиняный потолок тоже трескается', run('crumbling.length') === 1);
room(300, 'STONE');
run('hazardRandom = () => 0; world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.SILVER; dig();');
check('руда над головой не обваливается', run('crumbling.length') === 0);
room(300, 'STONE');
run('hazardRandom = () => 0.99; world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.STONE; world[F - 2][51] = BLOCK_TYPES.STONE; dig();');
check('чаще всего (70%) потолок держится', run('crumbling.length') === 0);
room(100, 'STONE');
run('hazardRandom = () => 0; world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.STONE; world[F - 2][51] = BLOCK_TYPES.STONE; dig();');
check('в Песчаном пласте обвалов нет', run('crumbling.length') === 0);
room(500, 'STONE');
run('hazardRandom = () => 0; world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.STONE; world[F - 2][51] = BLOCK_TYPES.STONE; dig();');
check('и в Гранитных недрах тоже', run('crumbling.length') === 0);
room(300, 'STONE');
run('hazardRandom = () => 0; world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.STONE; world[F - 2][51] = BLOCK_TYPES.STONE; dig();');
tick(1.2, '');
check('обвал может пойти выше: треснул следующий блок', run('crumbling.some(c => c.y === F - 2)') || run('getBlock(51, F - 2)') === run('BLOCK_TYPES.AIR'));
run('hazardRandom = () => 0.99;');
room(300, 'STONE');
run('fallingBlocks.push({ x: 45, y: F - 3, vy: 0, type: BLOCK_TYPES.STONE }); world[F + 1][45] = BLOCK_TYPES.LAVA;');
run('world[F][45] = BLOCK_TYPES.AIR;');
tick(1);
check('упавший в лаву камень пропадает', run('fallingBlocks.length') === 0 && run('getBlock(45, F)') === run('BLOCK_TYPES.AIR'));

console.log('Рудничный газ');
const gasInfo = run(`(() => { generateWorld(31); let n = 0, home = 0;
    for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) if (world[y][x] === BLOCK_TYPES.GAS) {
        n++; if (BIOMES[biomeAtBlock(x, y)].hazard === 'рудничный газ') home++; }
    return { n, home }; })()`);
check(`газовые карманы есть (${gasInfo.n} клеток)`, gasInfo.n > 100);
check('и только в Гранитных недрах', gasInfo.home === gasInfo.n);
check('газ твёрдый, как камень', run('isBlocked(0, 0) === true || true') && run('(() => { world[300][3] = BLOCK_TYPES.GAS; return isBlocked(3, 300); })()'));
check('копается столько же, сколько камень рядом',
    near(run('digTime(BLOCK_TYPES.GAS, 50, DEPTH_ORIGIN + 500)'), run('digTime(BLOCK_TYPES.STONE, 50, DEPTH_ORIGIN + 500)'), 1e-9));
room(500, 'STONE');
run('world[F][52] = BLOCK_TYPES.GAS; world[F - 1][52] = BLOCK_TYPES.GAS; world[F][53] = BLOCK_TYPES.GAS; world[F][51] = BLOCK_TYPES.STONE;');
run('dig();');
check('копнул рядом с карманом — газ вырвался', run('gasClouds.length') === 1 && notes.some(n => n.includes('Рудничный газ')));
check('весь карман опустел', run('getBlock(52, F)') === run('BLOCK_TYPES.AIR') && run('getBlock(52, F - 1)') === run('BLOCK_TYPES.AIR') && run('getBlock(53, F)') === run('BLOCK_TYPES.AIR'));
tick(1);
check(`стоишь в облаке — 10 в секунду (${run('health').toFixed(1)})`, near(run('health'), 90, 0.3));
run('player.x = 41;');
const hpOut = run('health'); tick(1);
check('отошёл — газ не вредит', run('health') === hpOut);
tick(6);
check('облако рассеивается за 6 с', run('gasClouds.length') === 0);
room(500, 'STONE');
run('world[F][51] = BLOCK_TYPES.GAS; dig();');
check('если копнуть сам карман — тоже выброс', run('gasClouds.length') === 1);
room(500, 'STONE');
run('world[F][51] = BLOCK_TYPES.STONE; world[F - 1][51] = BLOCK_TYPES.STONE; world[F - 2][51] = BLOCK_TYPES.STONE; dig();');
check('обычный камень газа не даёт', run('gasClouds.length') === 0);
run('generateWorld(31); player.x = 60; player.y = DEPTH_ORIGIN + 500; updateCamera(); world[DEPTH_ORIGIN + 500][62] = BLOCK_TYPES.GAS;');
fills.length = 0; run('render()');
check('карман нарисован как гранит с едва заметными точками',
    fills.some(f => f[0] === run('BIOMES[2].rock')) && fills.some(f => f[0] === 'rgba(210, 220, 90, 0.45)'));

console.log('Табличка биома');
run('player.y = DEPTH_ORIGIN + 250; currentBiome = 0; updateBiome(1000);'); texts.length = 0; run('renderBiomeBanner(2000)');
check('Глиняные штольни: «опасно: обвалы»', texts.some(t => t.includes('опасно: обвалы')));
run('player.y = DEPTH_ORIGIN + 450; updateBiome(3000);'); texts.length = 0; run('renderBiomeBanner(4000)');
check('Гранитные недра: «опасно: рудничный газ»', texts.some(t => t.includes('опасно: рудничный газ')));
run('player.y = DEPTH_ORIGIN + 650; updateBiome(5000);'); texts.length = 0; run('renderBiomeBanner(6000)');
check('Огненное дно: «опасно: жар»', texts.some(t => t.includes('опасно: жар')));
run('player.y = DEPTH_ORIGIN + 10; updateBiome(7000);'); texts.length = 0; run('renderBiomeBanner(8000)');
check('Песчаный пласт безопасен', !texts.some(t => t.includes('опасно')));

console.log('Сохранения');
room(100);
run('damage(40, "тест")');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('здоровье в сохранении', save.health === 60);
run('health = 100;');
check('и восстанавливается', run(`loadSaveData(${JSON.stringify(save)})`) && run('health') === 60);
const noHp = Object.assign({}, save); delete noHp.health;
check('без поля — полное здоровье', run(`loadSaveData(${JSON.stringify(noHp)})`) && run('health') === 100);
check('мусор — полное', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { health: 'x' }))})`) && run('health') === 100);
check('больше 100 не бывает', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { health: 9999 }))})`) && run('health') === 100);
run('crumbling.push({x: 1, y: 1, timer: 1}); gasClouds.push({x: 1, y: 1, radius: 3, age: 0});');
run(`loadSaveData(${JSON.stringify(save)})`);
check('загрузка убирает трещины и облака прошлой игры', run('crumbling.length') === 0 && run('gasClouds.length') === 0);
confirmAnswer = true; run('health = 10; newGame();'); confirmAnswer = false;
check('новая игра — полное здоровье', run('health') === 100);
check('игровой цикл с опасностями не падает', (() => { run('gameLoop(16); gameLoop(33);'); return true; })());

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
