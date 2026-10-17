// Проверки бега (Shift) и лопаты в долг.
// Запуск: node credit.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
const els = {}, notes = [], handlers = {};
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener(type, fn) { handlers[type] = fn; } },
    requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => confirmAnswer, console, Date, Math, JSON, Object, Proxy, Number
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

const shovelItem = () => els.shopList.children.find(c => c.className === 'shop-item' || c.className === 'shop-item owned' ? c.innerHTML.includes('Лопата') : false) || { innerHTML: '' };
let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}

console.log('Бег');
// ровный коридор: пол на ряду 101
function corridor() {
    run(`for (let y = 95; y <= 101; y++) for (let x = 5; x < 115; x++)
             world[y][x] = y === 101 ? BLOCK_TYPES.STONE : BLOCK_TYPES.AIR;
         player.x = 10; player.y = 100; player.vx = 0; player.vy = 0; player.onGround = true;`);
}
function walk(keysObj, seconds = 1) {
    corridor();
    run(`keys = ${JSON.stringify(keysObj)}; for (let i = 0; i < ${Math.round(seconds * 60)}; i++) updatePlayer(1/60); keys = {};`);
    return run('player.x') - 10;
}
run('generateWorld(3)');
const normal = walk({ KeyD: true });
const sprintL = walk({ KeyD: true, ShiftLeft: true });
const sprintR = walk({ KeyD: true, ShiftRight: true });
check(`шаг: ${normal.toFixed(2)} блока/с`, Math.abs(normal - 3) < 0.05);
check(`бег с левым Shift в 1.8 раза быстрее (${sprintL.toFixed(2)})`, Math.abs(sprintL / normal - 1.8) < 0.02);
check('правый Shift тоже работает', Math.abs(sprintR - sprintL) < 0.01);
corridor();
run('player.x = 100; keys = {KeyA: true, ShiftLeft: true}; for (let i = 0; i < 60; i++) updatePlayer(1/60); keys = {};');
check('бег влево с той же скоростью', Math.abs((100 - run('player.x')) - sprintL) < 0.05);
check('Shift без направления — стоит на месте', Math.abs(walk({ ShiftLeft: true })) < 1e-9);
{
    corridor();
    run('world[100][20] = BLOCK_TYPES.STONE; keys = {KeyD: true, ShiftLeft: true}; for (let i = 0; i < 300; i++) updatePlayer(1/60); keys = {};');
    check('на бегу в стену не проваливается', run('player.x + PLAYER_W') <= 20);
}
{
    corridor();
    run('keys = {KeyW: true, ShiftLeft: true}; updatePlayer(1/60); keys = {ShiftLeft: true}; let top = 100; for (let i = 0; i < 120; i++) { updatePlayer(1/60); top = Math.min(top, player.y); } globalThis.__top = top; keys = {};');
    check('бег не меняет высоту прыжка', Math.abs((100 - run('__top')) - 1.667) < 0.05);
}

console.log('Лопата в долг');
function fresh(money = 0) {
    run(`stats.money = ${money}; shovelTier = 0; pickaxeTier = 0; debt = 0; backpack = emptyBackpack();
         gameState.paused = false; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1;`);
    notes.length = 0;
}
fresh(0);
check('в начале игры долга нет', run('debt') === 0);
run('openShop()');
check('без денег в лавке кнопка «в долг»', shovelItem().innerHTML.includes('takeShovelOnCredit(1)') &&
    shovelItem().innerHTML.includes('80'));
check('берём в долг', run('takeShovelOnCredit(1)') === true && run('shovelTier') === 1);
check('долг — двойная цена', run('debt') === 80);
check('деньги не списались', run('stats.money') === 0);
check('после этого лопата отмечена «Есть»', shovelItem().innerHTML.includes('Есть'));
check('в лавке видно долг', els.shopMoney.textContent.includes('долг лавке: 80'));
run('updateUI()');
check('в панели «0 руб. (долг 80)» и красным', els.money.textContent === '0 руб. (долг 80)' && els.money.classList.contains('full'));
check('второй раз в долг не дают', run('takeShovelOnCredit(1)') === false);
run('closeShop()');

console.log('Погашение');
run('for (let i = 0; i < 5; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();');   // 50 руб.
check('первая выручка 50 целиком ушла в долг', run('stats.money') === 0 && run('debt') === 30);
check('уведомление: сколько осталось', notes.some(n => n.includes('Осталось вернуть 30')));
run('for (let i = 0; i < 10; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();');  // 100 руб.
check('вторая выручка: 30 в долг, 70 себе', run('stats.money') === 70 && run('debt') === 0);
check('уведомление о погашении', notes.some(n => n.includes('Долг погашен')));
run('updateUI()');
check('долг пропал из панели', els.money.textContent === '70 руб.' && !els.money.classList.contains('full'));
run('for (let i = 0; i < 2; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();');
check('дальше выручка целиком своя', run('stats.money') === 90);
check('всего за лопату отдано 80 — вдвое больше цены', 50 + 100 + 20 - 90 === 80);

console.log('Ограничения');
fresh(40);
check('если денег хватает — в долг не дают', run('takeShovelOnCredit(1)') === false && run('debt') === 0);
run('openShop()');
check('и в лавке обычная покупка', shovelItem().innerHTML.includes('buyShovel(1)'));
run('closeShop()');
fresh(0);
run('shovelTier = 1;');
check('уже есть лопата — в долг не дают', run('takeShovelOnCredit(1)') === false);
fresh(0);
check('несуществующую в долг не дают', run('takeShovelOnCredit(0)') === false && run('takeShovelOnCredit(5)') === false);
fresh(0);
run('debt = 10;');
check('при непогашенном долге новый не дают', run('takeShovelOnCredit(1)') === false);
fresh(0);
run('stats.money = 500; debt = 80; pickaxeTier = 0;');
check('с долгом покупать на свои деньги можно', run('buyPickaxe(1)') === true && run('debt') === 80);

console.log('Сохранения');
fresh(0);
run('takeShovelOnCredit(1); for (let i = 0; i < 3; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('долг попадает в сохранение', save.debt === 50);
run('debt = 0;');
check('и восстанавливается', run(`loadSaveData(${JSON.stringify(save)})`) === true && run('debt') === 50);
const noDebt = Object.assign({}, save); delete noDebt.debt;
check('сохранение без поля долга — долга нет', run(`loadSaveData(${JSON.stringify(noDebt)})`) && run('debt') === 0);
check('мусор в долге — долга нет', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { debt: 'много' }))})`) && run('debt') === 0);
check('отрицательный долг не превращается в деньги', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { debt: -500 }))})`) && run('debt') === 0);
const v4 = Object.assign({}, save, { version: 4 }); delete v4.debt; delete v4.shovel;
check('сохранение v4 — без лопаты и без долга', run(`loadSaveData(${JSON.stringify(v4)})`) && run('debt') === 0 && run('shovelTier') === 0);
confirmAnswer = true; run('debt = 80; newGame();'); confirmAnswer = false;
check('новая игра — без долга', run('debt') === 0);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
