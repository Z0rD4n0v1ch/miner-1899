// Проверки подъёма: лестницы, верёвки, клеть.
// Запуск: node climb.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const fills = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => k === 'fillRect' ? (x, y, w, h) => fills.push([t.fillStyle, x, y, w, h]) : (k in t ? t[k] : () => {}),
    set: (t, k, v) => (t[k] = v, true)
});
function makeEl() {
    return {
        _html: '', get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {},
        getContext() { return ctxStub; }, width: 800, height: 600
    };
}
const els = {}, notes = [], handlers = {};
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener(type, fn) { handlers[type] = fn; } },
    requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => confirmAnswer, console, Date, Math, JSON, Object, Proxy, Number, Set
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);
const press = code => { handlers.keydown({ code, preventDefault() {} }); handlers.keyup({ code }); };

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
const near = (a, b, eps = 0.06) => Math.abs(a - b) < eps;

// Сплошной камень вокруг (x 40..62, y B-25..B+3), вертикальный колодец в x = 50
// с дном на ряду B (пол B+1). Игрок на дне.
function shaft(depth = 100, top = 20) {
    run(`generateWorld(5); resetHazards(); resetDig(); keys = {}; gameState.paused = false; debug.on = false; debug.fly = false;
         hazardRandom = () => 0.99; ladders = 5; ropes = 0; stats.money = 0; debt = 0; backpack = emptyBackpack();
         globalThis.B = DEPTH_ORIGIN + ${depth};
         for (let y = Math.max(SURFACE_Y, B - 25); y <= B + 3; y++) for (let x = 40; x <= 62; x++) world[y][x] = BLOCK_TYPES.STONE;
         for (let y = Math.max(SURFACE_Y, B - ${top}); y <= B; y++) world[y][50] = BLOCK_TYPES.AIR;
         player.x = 50; player.y = B; player.vx = 0; player.vy = 0; player.onGround = true; player.direction = 1;`);
    notes.length = 0;
}
function ladderColumn(from, to) { run(`for (let y = ${from}; y <= ${to}; y++) world[y][50] = BLOCK_TYPES.LADDER;`); }
function sim(seconds, keysObj, hz = 60) {
    run(`keys = ${JSON.stringify(keysObj)}; for (let i = 0; i < ${Math.round(seconds * hz)}; i++) { updatePlayer(${1 / hz}); updateHazards(${1 / hz}); updateCage(${1 / hz}); } keys = {};`);
}
const y = () => run('player.y'), x = () => run('player.x');

console.log('Лестницы: установка');
check('в начале игры 10 лестниц', run('START_LADDERS') === 10);
check('хватает, чтобы пройти земляную корку у поверхности', run('START_LADDERS') > run('DIRT_DEPTH'));
shaft();
check('в тестовой шахте 5 лестниц', run('ladders') === 5);
run('updateUI()');
check('в панели «Лестницы 5», «Верёвки 0»', els.ladders.textContent === 5 && els.ropes.textContent === 0);
check('Q ставит лестницу в клетку игрока', (() => { press('KeyQ'); return run('world[B][50]') === run('BLOCK_TYPES.LADDER') && run('ladders') === 4; })());
check('в занятую клетку вторую не поставить', run('placeLadder()') === false && run('ladders') === 4);
check('лестница не мешает ходить', run('isBlocked(50, B)') === false);
run('player.y = SURFACE_Y - 1;');
check('на поверхности (в небе) не ставится', run('placeLadder()') === false && notes.some(n => n.includes('под землёй')));
shaft(); run('ladders = 0;');
check('без лестниц — подсказка купить', run('placeLadder()') === false && notes.some(n => n.includes('купи в лавке')));

console.log('Лестницы: лазанье');
shaft(); ladderColumn(run('B') - 10, run('B'));
sim(1, { KeyW: true });
check(`W — вверх 3 блока в секунду (${(run('B') - y()).toFixed(2)})`, near(run('B') - y(), 3));
const yHold = y(); sim(2, {});
check('на лестнице не падает', near(y(), yHold, 1e-9));
sim(1, { KeyS: true });
check('S — вниз 3 блока в секунду', near(y(), yHold + 3));
for (const hz of [30, 144, 240]) {
    shaft(); ladderColumn(run('B') - 10, run('B'));
    sim(1, { KeyW: true }, hz);
    check(`на ${hz} Гц та же скорость (${(run('B') - y()).toFixed(2)})`, near(run('B') - y(), 3));
}
shaft(); ladderColumn(run('B') - 10, run('B'));
sim(1, { KeyW: true, ShiftLeft: true });
check('W + Shift — быстрее, 4.5 блока/с', near(run('B') - y(), 4.5));
run('player.y = B - 10;'); sim(0.5, { KeyS: true, ShiftLeft: true });
check('S + Shift — съезжаешь, 7.5 блока/с', near(y(), run('B') - 10 + 3.75));
shaft(); ladderColumn(run('B') - 5, run('B'));
run('keys = {KeyW: true}; updatePlayer(1/60); keys = {};');
check('на лестнице W не прыжок', run('player.vy') === 0);

console.log('Лестницы: верх и выход');
shaft(); ladderColumn(run('B') - 5, run('B'));
sim(4, { KeyW: true });
check(`долез до верха — стоит на верхней ступеньке (y = ${y().toFixed(2)})`, near(y(), run('B') - 6, 1e-6));
sim(2, {});
check('и не падает обратно', near(y(), run('B') - 6, 1e-6));
sim(0.5, { KeyS: true });
check('S с верхней ступеньки — обратно на лестницу', y() > run('B') - 6 + 1);
// штрек вбок высотой в 1 блок на ряду B-3
shaft(); ladderColumn(run('B') - 8, run('B'));
run('for (let xx = 51; xx <= 56; xx++) world[B - 3][xx] = BLOCK_TYPES.AIR; player.y = B - 3.3;');
sim(1, { KeyD: true });
check(`с лестницы шагнул в низкий штрек, хоть и висел не ровно (x = ${x().toFixed(2)})`, x() > 52 && near(y(), run('B') - 3, 1e-6));
// колодец от самой поверхности
run(`generateWorld(5); resetHazards(); keys = {}; ladders = 30;
     for (let yy = SURFACE_Y; yy <= SURFACE_Y + 12; yy++) world[yy][30] = BLOCK_TYPES.LADDER;
     player.x = 30; player.y = SURFACE_Y + 12; player.vy = 0;`);
sim(6, { KeyW: true });
check('из колодца с поверхности долез наверх', y() < run('SURFACE_Y'));
sim(1, { KeyD: true });
check('и ушёл по земле в сторону', x() > 31.5 && y() < run('SURFACE_Y'));

console.log('Лестницы: падение, постройка, снятие');
shaft(15); ladderColumn(run('B') - 8, run('B'));
run('player.y = B - 14; player.vy = 0;');
sim(3, {});
check('падая в колодец с лестницей, цепляется за верх', y() <= run('B') - 8 && y() >= run('B') - 9.01);
shaft();
const startY = y();
for (let i = 0; i < 3; i++) { run('placeLadder()'); sim(0.5, { KeyW: true }); }
check(`строим вверх: поставил, залез, поставил… (+${(startY - y()).toFixed(1)})`, startY - y() >= 2.9 && run('ladders') === 2);
shaft(); run('world[B][51] = BLOCK_TYPES.LADDER; ladders = 3; dig();');
check('пробелом лестница снимается обратно', run('world[B][51]') === run('BLOCK_TYPES.AIR') && run('ladders') === 4);
check('копая вниз (S), лестницу под собой не снимаешь', (() => { run('world[B + 1][50] = BLOCK_TYPES.LADDER; keys = {KeyS: true}; const n = ladders; dig(); keys["Space"] = true; for (let i = 0; i < 60; i++) updateDigging(1/60); keys = {}; globalThis.__n = n;'); return run('world[B + 1][50]') === run('BLOCK_TYPES.LADDER') && run('ladders') === run('__n'); })());
run('world[B + 1][50] = BLOCK_TYPES.STONE;');
check('и снимается быстро', run('digTime(BLOCK_TYPES.LADDER)') <= 0.2);
run('hazardRandom = () => 0; world[B][51] = BLOCK_TYPES.LADDER; world[B - 1][51] = BLOCK_TYPES.STONE; dig(); hazardRandom = () => 0.99;');
check('снятие лестницы не вызывает обвалов и газа', run('crumbling.length') === 0 && run('gasClouds.length') === 0);
check('за лестницу очков не дают', (() => { run('stats.score = 0; world[B][51] = BLOCK_TYPES.LADDER; dig();'); return run('stats.score') === 0; })());

console.log('Верёвка');
shaft();
check('без верёвки — подсказка', run('deployRope()') === 0 && notes.some(n => n.includes('Верёвок нет')));
// уступ: игрок стоит на ряду B-20 на полу, колодец справа x = 51 глубиной 15
run(`ropes = 2; globalThis.T = B - 20;
     for (let yy = T - 2; yy <= T; yy++) for (let xx = 45; xx <= 50; xx++) world[yy][xx] = BLOCK_TYPES.AIR;
     for (let xx = 45; xx <= 50; xx++) world[T + 1][xx] = BLOCK_TYPES.STONE;
     for (let yy = T - 2; yy <= T + 15; yy++) world[yy][51] = BLOCK_TYPES.AIR;
     player.x = 49.9; player.y = T; player.direction = 1; player.vy = 0;`);
notes.length = 0;
press('KeyR');
check('R у края — верёвка до дна колодца (16 м)', run('(() => { let n = 0; for (let yy = T; yy <= T + 20; yy++) if (world[yy][51] === BLOCK_TYPES.ROPE) n++; return n; })()') === 16 && run('ropes') === 1);
check('сообщение о длине', notes.some(n => n.includes('16 м')));
run('player.x = 51; player.y = T;');
sim(2, { KeyS: true });
check(`по верёвке вниз 4 блока/с (${(y() - run('T')).toFixed(2)})`, near(y() - run('T'), 8));
sim(1, { KeyW: true });
check('и вверх', near(y() - run('T'), 4));
sim(4, { KeyW: true });
check('наверху встаёт на узел и может уйти на уступ', (() => { sim(1, { KeyA: true }); return x() < 50.5 && y() <= run('T') + 0.01; })());
run('player.x = 49.9; player.y = T; player.direction = 1; dig();');
check('пробелом верёвка сматывается целиком', run('(() => { for (let yy = T; yy <= T + 20; yy++) if (world[yy][51] === BLOCK_TYPES.ROPE) return false; return true; })()') && run('ropes') === 2);
run(`for (let yy = T; yy <= T + 60 && yy < WORLD_HEIGHT - 4; yy++) world[yy][51] = BLOCK_TYPES.AIR;`);
run('deployRope()');
check('длина верёвки не больше 30 м', run('(() => { let n = 0; for (let yy = T; yy <= T + 60; yy++) if (world[yy][51] === BLOCK_TYPES.ROPE) n++; return n; })()') === 30);
shaft(); run('ropes = 1; player.direction = 1;');
check('не у края — не тратится', run('deployRope()') === 0 && run('ropes') === 1 && notes.some(n => n.includes('край')));

console.log('Клеть');
shaft(5);
check('у поверхности клеть не нужна', run('openCage()') === false && run('gameState.paused') === false);
check('цена: 10 + 1 руб. за 5 м (500 м → 110)', run('cageCost(500)') === 110 && run('cageCost(300)') === 70);
check('ждать: секунда на 10 м (500 м → 50 с)', run('cageWait(500)') === 50);
shaft(500); run('stats.money = 200; addToBackpack(BLOCK_TYPES.EMERALD); addToBackpack(BLOCK_TYPES.GOLD);');
press('KeyC');
check('C открывает окно клети, игра на паузе', run('gameState.paused') === true && els.cageModal.classList.contains('active'));
check('в окне цена, ожидание и кнопка «Вызвать»', els.cageInfo.innerHTML.includes('110<span class="coin"') && els.cageInfo.innerHTML.includes('50 с') && els.cageInfo.innerHTML.includes('callCage()'));
press('Escape');
check('ESC закрывает', run('gameState.paused') === false && !els.cageModal.classList.contains('active'));
run('openCage(); callCage();');
check('вызвал — окно закрыто, клеть в пути, деньги пока не списаны', run('gameState.paused') === false && run('cageCall !== null') && run('stats.money') === 200);
check('второй вызов, пока едет, не принимается', run('openCage()') === false);
sim(25, {});
check('через 25 с ещё внизу', run('player.y') > run('SURFACE_Y'));
sim(26, {});
check('через 50 с — наверху у лавки', run('player.y') < run('SURFACE_Y') && run('isAtShop()'));
check('заплатил 110 по прибытии', run('stats.money') === 90);
check('рюкзак при себе', run('backpackCount()') === 2);
run('checkShop()');
check('и сразу продал его в лавке', run('backpackCount()') === 0 && run('stats.money') === 90 + 35 + 8);
shaft(300); run('stats.money = 200; openCage(); callCage();');
sim(0.5, { KeyW: true }); sim(1, {});
check('сдвинулся — вызов сорван, остался внизу', run('cageCall') === null && run('player.y') > run('SURFACE_Y') && notes.some(n => n.includes('сдвинулся')));
check('деньги не списаны', run('stats.money') === 200);
shaft(300); run('stats.money = 200; openCage(); callCage(); damage(5, "тест");'); sim(0.1, {});
check('ранило — вызов сорван', run('cageCall') === null && notes.some(n => n.includes('ранило')));
shaft(300);
run('openCage()');
check('без денег — вызов в долг', els.cageInfo.innerHTML.includes('в долг'));
run('callCage()'); sim(31, {});
check('долг — двойная цена (70 → 140)', run('debt') === 140 && run('player.y') < run('SURFACE_Y'));
shaft(300); run('debt = 200;');
run('openCage()');
check('долг вышел бы больше 300 руб. — нельзя', run('callCage()') === false && run('player.y') > run('SURFACE_Y'));
run('closeCage()');
shaft(700); run('stats.money = 500;');
check('на Огненном дне клеть не ходит', run('openCage()') === false && run('gameState.paused') === false && notes.some(n => n.includes('Огненное дно')));

console.log('Лавка');
shaft(); run('stats.money = 50; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
const item = name => els.shopList.children.find(c => c.innerHTML.includes(name)) || { innerHTML: '' };
check('в лавке есть лестницы и верёвка', item('Лестницы').innerHTML.includes('buyLadders()') && item('Верёвка').innerHTML.includes('buyRope()'));
check('10 лестниц за 20 руб.', run('buyLadders()') === true && run('ladders') === 15 && run('stats.money') === 30);
check('верёвка за 15 руб.', run('buyRope()') === true && run('ropes') === 1 && run('stats.money') === 15);
check('без денег не купить', run('buyLadders()') === false && run('ladders') === 15);
run('closeShop()');

console.log('Сохранения и смерть');
shaft(); run('ladders = 12; ropes = 3; world[B][50] = BLOCK_TYPES.LADDER; world[B - 1][50] = BLOCK_TYPES.ROPE;');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('SAVE_VERSION = 10', run('SAVE_VERSION') === 10 && save.version === 10);
run('ladders = 0; ropes = 0; world[B][50] = BLOCK_TYPES.AIR; world[B - 1][50] = BLOCK_TYPES.AIR;');
run(`loadSaveData(${JSON.stringify(save)})`);
check('снаряжение восстанавливается', run('ladders') === 12 && run('ropes') === 3);
check('лестница и верёвка в мире тоже', run('world[B][50]') === run('BLOCK_TYPES.LADDER') && run('world[B - 1][50]') === run('BLOCK_TYPES.ROPE'));
const v5 = Object.assign({}, save, { version: 5 }); delete v5.ladders; delete v5.ropes;
check('сохранение v5 — стартовые 10 лестниц', run(`loadSaveData(${JSON.stringify(v5)})`) && run('ladders') === 10 && run('ropes') === 0);
check('мусор — значения по умолчанию', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { ladders: -3, ropes: 'x' }))})`) && run('ladders') === 10 && run('ropes') === 0);
run('ladders = 7; ropes = 2; die("тест");');
check('смерть снаряжение не отнимает', run('ladders') === 7 && run('ropes') === 2);
confirmAnswer = true; run('ladders = 50; ropes = 9; newGame();'); confirmAnswer = false;
check('новая игра — 10 лестниц, без верёвок', run('ladders') === 10 && run('ropes') === 0);

console.log('Отрисовка');
shaft(); ladderColumn(run('B') - 2, run('B')); run('world[B - 3][50] = BLOCK_TYPES.ROPE; player.x = 52; updateCamera();');
fills.length = 0; run('render()');
check('лестница рисуется перекладинами', fills.filter(f => f[0] === run('BLOCK_COLORS[BLOCK_TYPES.LADDER]')).length >= 12);
check('верёвка рисуется', fills.some(f => f[0] === run('BLOCK_COLORS[BLOCK_TYPES.ROPE]')));
check('игровой цикл не падает', (() => { run('gameLoop(16); gameLoop(33);'); return true; })());

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
