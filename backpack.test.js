// Проверки рюкзака: умная замена, содержимое на виду, улучшения в лавке, вес.
// Запуск: node backpack.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeEl() {
    return {
        _html: '', get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => (t[k] = v, true) }); },
        width: 800, height: 600
    };
}
const els = {}, notes = [];
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => confirmAnswer, console, Date, Math, JSON, Object, Proxy, Number, Set
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
const near = (a, b, eps = 0.03) => Math.abs(a - b) < eps;
function fresh() {
    run(`generateWorld(8); creatures = []; resetHazards(); resetDig(); keys = {}; gameState.paused = false;
         backpack = emptyBackpack(); backpackTier = 0; stats.money = 0; stats.score = 0; pickaxeTier = 3;`);
    notes.length = 0;
}
const fill = (block, n) => run(`for (let i = 0; i < ${n}; i++) addToBackpack(BLOCK_TYPES.${block});`);

console.log('Умная замена');
fresh(); fill('COAL', 20);
check('полный рюкзак угля + платина — «swapped»', run('addToBackpack(BLOCK_TYPES.PLATINUM)') === 'swapped');
check('уголь выброшен, платина в рюкзаке', run('backpack.coal') === 19 && run('backpack.platinum') === 1 && run('lastDropped') === 'coal');
check('мест по-прежнему 20', run('backpackCount()') === 20);
fresh(); fill('GOLD', 10); fill('COAL', 5); fill('SILVER', 5);
run('addToBackpack(BLOCK_TYPES.EMERALD)');
check('выбрасывается именно самая дешёвая (уголь), а не первая попавшаяся', run('backpack.coal') === 4 && run('backpack.gold') === 10 && run('backpack.silver') === 5);
fresh(); fill('GOLD', 20);
check('руда той же цены — не берётся', run('addToBackpack(BLOCK_TYPES.GOLD)') === 'full' && run('backpack.gold') === 20);
check('руда дешевле — не берётся', run('addToBackpack(BLOCK_TYPES.COAL)') === 'full' && run('backpack.coal') === 0);
fresh(); fill('COAL', 20);
run('player.x = 50; player.y = DEPTH_ORIGIN + 700; player.direction = 1; world[player.y][51] = BLOCK_TYPES.PLATINUM; world[player.y][50] = BLOCK_TYPES.AIR; dig();');
check('при копании — сообщение, что выброшено и ради чего', notes.some(n => n.includes('Выбросил уголь') && n.includes('платина')));
check('и очки за новую руду начислены', run('stats.score') === 150);
fresh(); fill('COAL', 20);
run(`creatures.push(makeCreature('rat', 50, 100, { loot: 'silver' })); killCreature(creatures[0]);`);
check('пойманная крыса возвращает серебро даже в полный рюкзак (вместо угля)', run('backpack.silver') === 1 && run('backpack.coal') === 19);

console.log('Содержимое на виду');
fresh(); run('updateUI()');
check('пустой рюкзак — «пусто»', els.backpackList.textContent === 'пусто');
fill('GOLD', 2); fill('PLATINUM', 1); fill('COAL', 3); run('updateUI()');
check(`список от дорогой руды к дешёвой и стоимость: «${els.backpackList.textContent}»`,
    els.backpackList.textContent === 'платина 1 · золото 2 · уголь 3 ≈ 108 ¤');

console.log('Улучшения рюкзака');
fresh();
check('три рюкзака: 20 / 35 / 50 мест', JSON.stringify(run('BACKPACKS.map(b => b.capacity)')) === '[20,35,50]');
check('цены 200 и 700 руб.', run('BACKPACKS[1].price') === 200 && run('BACKPACKS[2].price') === 700);
check('без денег не купить', run('buyBackpack(1)') === false && run('backpackCapacity()') === 20);
run('stats.money = 250;');
check('кожаный ранец за 200 — 35 мест', run('buyBackpack(1)') === true && run('backpackCapacity()') === 35 && run('stats.money') === 50);
check('тот же или меньший не купить', run('buyBackpack(1)') === false && run('buyBackpack(0)') === false);
fill('COAL', 35);
check('в ранец влезает 35', run('backpackCount()') === 35 && run('addToBackpack(BLOCK_TYPES.COAL)') === 'full');
run('updateUI()');
check('в панели «35/35»', els.backpack.textContent === '35/35' && els.backpackFill.style.width === '100%');
fresh(); run('stats.money = 800;');
check('можно сразу короб за 700 — 50 мест', run('buyBackpack(2)') === true && run('backpackCapacity()') === 50);
fresh(); run('stats.money = 800; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
const item = name => els.shopList.children.find(c => c.innerHTML.includes(name)) || { innerHTML: '' };
check('в лавке ранец и короб с кнопками', item('Кожаный ранец').innerHTML.includes('buyBackpack(1)') && item('Шахтёрский короб').innerHTML.includes('buyBackpack(2)'));
run('buyBackpack(1)');
check('купленный — «На плечах»', item('Кожаный ранец').innerHTML.includes('На плечах'));
run('closeShop()');

console.log('Вес');
fresh();
check('пустой рюкзак не замедляет', run('walkFactor()') === 1 && run('jumpFactor()') === 1);
check('веса: платина 3, золото 2, серебро 1.5, уголь 1, камни 0.5',
    run('[BLOCK_TYPES.PLATINUM, BLOCK_TYPES.GOLD, BLOCK_TYPES.SILVER, BLOCK_TYPES.COAL, BLOCK_TYPES.DIAMOND, BLOCK_TYPES.RUBY, BLOCK_TYPES.EMERALD].map(b => ORES[b].weight).join()') === '3,2,1.5,1,0.5,0.5,0.5');
function walkSpeed() {
    run(`for (let y = 95; y <= 101; y++) for (let x = 5; x < 115; x++) world[y][x] = y === 101 ? BLOCK_TYPES.STONE : BLOCK_TYPES.AIR;
         player.x = 10; player.y = 100; player.vy = 0; player.onGround = true;
         keys = {KeyD: true}; for (let i = 0; i < 60; i++) updatePlayer(1/60); keys = {};`);
    return run('player.x') - 10;
}
check(`налегке — 3 блока/с (${walkSpeed().toFixed(2)})`, near(walkSpeed(), 3));
fill('PLATINUM', 20);
check(`20 платины (вес 60) — на 35% медленнее (${walkSpeed().toFixed(2)})`, near(walkSpeed(), 1.95));
fresh(); fill('DIAMOND', 20);
check(`20 алмазов (вес 10) — почти налегке (${walkSpeed().toFixed(2)})`, near(walkSpeed(), 3 * (1 - 0.35 * 10 / 60)));
fresh(); run('backpackTier = 2;'); fill('PLATINUM', 50);
check('больше предела не замедляет (вес 150 → те же −35%)', near(run('walkFactor()'), 0.65, 1e-9));
function jumpHeight() {
    run(`for (let y = 90; y <= 101; y++) for (let x = 40; x < 60; x++) world[y][x] = y === 101 ? BLOCK_TYPES.STONE : BLOCK_TYPES.AIR;
         player.x = 50; player.y = 100; player.vy = 0; player.onGround = true; globalThis.__top = 100;
         keys = {KeyW: true}; updatePlayer(1/60); keys = {};
         for (let i = 0; i < 120; i++) { updatePlayer(1/60); __top = Math.min(__top, player.y); }`);
    return 100 - run('__top');
}
const hHeavy = jumpHeight();
check(`с полной нагрузкой прыжок ниже (${hHeavy.toFixed(2)}), но уступ в 1 блок берётся`, hHeavy < 1.6 && hHeavy > 1.05);
run(`world[100][53] = BLOCK_TYPES.STONE; for (let x = 53; x < 60; x++) world[100][x] = BLOCK_TYPES.STONE;
     player.x = 50; player.y = 100; player.onGround = true;
     for (let i = 0; i < 240; i++) { keys = (i < 150 && i % 30 === 0) ? {KeyD: true, KeyW: true} : {KeyD: true}; updatePlayer(1/60); } keys = {};`);
check('и в самом деле запрыгивает на уступ с грузом', run('player.y') === 99 && run('player.x') > 53);
fresh(); fill('PLATINUM', 20);
run(`for (let y = 80; y <= 101; y++) for (let x = 45; x < 56; x++) world[y][x] = BLOCK_TYPES.STONE;
     for (let y = 85; y <= 100; y++) world[y][50] = BLOCK_TYPES.LADDER; player.x = 50; player.y = 100; player.vy = 0;
     keys = {KeyW: true}; for (let i = 0; i < 60; i++) updatePlayer(1/60); keys = {};`);
check(`по лестнице с грузом медленнее (${(100 - run('player.y')).toFixed(2)} блока/с)`, near(100 - run('player.y'), 1.95));
run('updateUI()');
check('в панели вес и замедление', els.backpackWeight.textContent === 'вес 60 · медленнее на 35%');
run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; sellBackpack(); updateUI();');
check('продал — снова налегке', run('walkFactor()') === 1 && els.backpackWeight.textContent === '');

console.log('Сохранения и смерть');
fresh(); run('backpackTier = 2;');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('рюкзак в сохранении', save.backpackTier === 2);
run('backpackTier = 0;'); run(`loadSaveData(${JSON.stringify(save)})`);
check('и восстанавливается', run('backpackCapacity()') === 50);
const old = Object.assign({}, save); delete old.backpackTier;
check('старое сохранение — холщовый мешок', run(`loadSaveData(${JSON.stringify(old)})`) && run('backpackTier') === 0);
check('мусор — холщовый мешок', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { backpackTier: 7 }))})`) && run('backpackTier') === 0);
run('backpackTier = 1; addToBackpack(BLOCK_TYPES.GOLD); die("тест");');
check('смерть: содержимое потеряно, а ранец остаётся', run('backpackCount()') === 0 && run('backpackTier') === 1);
confirmAnswer = true; run('newGame();'); confirmAnswer = false;
check('новая игра — холщовый мешок', run('backpackTier') === 0);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
