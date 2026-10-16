// Проверки кирок: копание с удержанием, твёрдость, уровни кирок, лавка, сохранения.
// Запуск: node pickaxe.test.js — гоняет настоящий index.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeEl() {
    return {
        _html: '', get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = v; if (v === '') this.children = []; },   // как в браузере: очистка убирает детей
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
const press = code => handlers.keydown({ code, preventDefault() {} });
const release = code => handlers.keyup({ code });

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
// игрок в x=50, y=100 смотрит вправо, цель — блок (51, 100)
function setup(block, tier = 0) {
    run(`generateWorld(99); pickaxeTier = ${tier}; stats.money = 0; backpack = emptyBackpack(); resetDig();
         gameState.paused = false; keys = {};
         player.x = 50; player.y = 100; player.direction = 1;
         world[100][50] = BLOCK_TYPES.AIR; world[101][50] = BLOCK_TYPES.STONE;
         world[100][51] = BLOCK_TYPES.${block};`);
    notes.length = 0;
}
// держать пробел seconds секунд при 60 FPS
function hold(seconds) {
    run('keys["Space"] = true;');
    for (let i = 0; i < Math.round(seconds * 60); i++) run('updateDigging(1/60)');
}
const target = () => run('world[100][51]');
const T = name => run(`BLOCK_TYPES.${name}`);

console.log('Копание с удержанием');
setup('STONE');
check('на старте ржавая кирка', run('pickaxeTier') === 0 && run('PICKAXES[pickaxeTier].name') === 'Ржавая');
hold(0.5);
check('камень ржавой киркой за 0.5 с ещё цел', target() === T('STONE'));
check('прогресс копания растёт', run('digState.progress') > 0.8);
hold(0.15);
check('за 0.65 с камень выкопан', target() === T('AIR'));
setup('STONE');
hold(0.4); run('keys["Space"] = false; updateDigging(1/60);');
check('отпустил пробел — прогресс сброшен', run('digState.progress') === 0);
hold(0.4);
check('и начинается заново', target() === T('STONE'));
setup('STONE');
hold(0.4); run('player.direction = -1; world[100][49] = BLOCK_TYPES.STONE; updateDigging(1/60);');
check('развернулся к другому блоку — прогресс сброшен', run('digState.progress') < 0.05);
setup('BEDROCK', 3);
hold(5);
check('коренная порода не копается никакой киркой', target() === T('BEDROCK'));
setup('STONE');
run('keys["Space"] = true; gameState.paused = true; for (let i = 0; i < 120; i++) gameLoop(i * 16.7);');
check('на паузе копание не идёт', target() === T('STONE'));
check('нажатие пробела не копает мгновенно', (() => { setup('DIRT'); press('Space'); release('Space'); return target() === T('DIRT'); })());

console.log('Твёрдость и скорость');
const times = {};
for (const [block, tier] of [['DIRT', 0], ['STONE', 0], ['GOLD', 0], ['STONE', 3], ['DIAMOND', 1], ['RUBY', 2]]) {
    setup(block, tier);
    let frames = 0;
    run('keys["Space"] = true;');
    while (target() === T(block) && frames < 600) { run('updateDigging(1/60)'); frames++; }
    times[block + tier] = frames / 60;
}
check(`земля быстрее камня (${times.DIRT0.toFixed(2)} < ${times.STONE0.toFixed(2)} с)`, times.DIRT0 < times.STONE0);
check(`золото дольше камня (${times.GOLD0.toFixed(2)} с)`, times.GOLD0 > times.STONE0);
check(`лучшая кирка копает камень в ~4.5 раза быстрее (${times.STONE3.toFixed(2)} с)`,
    Math.abs(times.STONE0 / times.STONE3 - 4.5) < 0.6);
check(`алмаз железной киркой (${times.DIAMOND1.toFixed(2)} с)`, times.DIAMOND1 < 2);
check(`рубин стальной киркой (${times.RUBY2.toFixed(2)} с)`, times.RUBY2 < 2);

console.log('Уровни кирок');
setup('DIAMOND', 0);
hold(5);
check('алмаз ржавой киркой не копается', target() === T('DIAMOND'));
check('подсказка, какая кирка нужна', notes.some(n => n.includes('железная')));
check('подсказка показана один раз, а не каждый кадр', notes.filter(n => n.includes('не поддаётся')).length === 1);
setup('RUBY', 1);
hold(5);
check('рубин железной киркой не копается', target() === T('RUBY') && notes.some(n => n.includes('стальная')));
setup('DIAMOND', 0);
run('dig()');
check('мгновенный dig() тоже уважает уровень кирки', target() === T('DIAMOND'));
setup('RUBY', 2);
hold(1);
check('рубин стальной киркой выкопан и в рюкзаке', target() === T('AIR') && run('backpack.ruby') === 1);

console.log('Покупка');
setup('STONE');
check('без денег не купить', run('buyPickaxe(1)') === false && run('pickaxeTier') === 0);
check('сообщает, сколько не хватает', notes.some(n => n.includes('Не хватает 100')));
run('stats.money = 150;');
check('железная за 100', run('buyPickaxe(1)') === true && run('pickaxeTier') === 1 && run('stats.money') === 50);
check('ту же кирку второй раз не купить', run('buyPickaxe(1)') === false && run('stats.money') === 50);
check('кирку хуже не купить', run('buyPickaxe(0)') === false && run('pickaxeTier') === 1);
run('stats.money = 5000;');
check('можно перескочить через уровень', run('buyPickaxe(3)') === true && run('pickaxeTier') === 3 && run('stats.money') === 3800);
check('несуществующую не купить', run('buyPickaxe(4)') === false && run('buyPickaxe(-1)') === false);
run('updateUI()');
check('в интерфейсе название кирки', els.pickaxe.textContent === 'С алмазным жалом');
check('цены растут', run('PICKAXES.every((p, i) => i === 0 || p.price > PICKAXES[i - 1].price && p.speed > PICKAXES[i - 1].speed)'));

console.log('Лавка');
setup('STONE');
run('player.y = 100;'); notes.length = 0;
press('KeyE'); release('KeyE');
check('E вдали от лавки — подсказка, игра не на паузе', run('gameState.paused') === false && notes.some(n => n.includes('Подойди к лавке')));
run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; stats.money = 120;');
press('KeyE'); release('KeyE');
check('E у лавки открывает её и ставит паузу', run('gameState.paused') === true && els.shopModal.classList.contains('active'));
check('в лавке 4 кирки', els.shopList.children.length === 4);
check('доступная кирка с кнопкой покупки', els.shopList.children[1].innerHTML.includes('buyPickaxe(1)'));
check('недоступная по деньгам — без кнопки', !els.shopList.children[2].innerHTML.includes('buyPickaxe(2)'));
check('показаны деньги', els.shopMoney.textContent.includes('120'));
run('buyPickaxe(1)');
check('после покупки список обновился', els.shopList.children.length === 4 && els.shopList.children[1].innerHTML.includes('В руках'));
press('Escape'); release('Escape');
check('ESC закрывает лавку', run('gameState.paused') === false && !els.shopModal.classList.contains('active'));

console.log('Сохранения');
check('SAVE_VERSION = 4', run('SAVE_VERSION') === 4);
setup('STONE', 2);
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('кирка попадает в сохранение', save.pickaxe === 2);
run('pickaxeTier = 0;');
check('и восстанавливается при загрузке', run(`loadSaveData(${JSON.stringify(save)})`) === true && run('pickaxeTier') === 2);
const v3 = Object.assign({}, save, { version: 3 }); delete v3.pickaxe;
run('pickaxeTier = 3;');
check('сохранение v3 загружается с ржавой киркой', run(`loadSaveData(${JSON.stringify(v3)})`) === true && run('pickaxeTier') === 0);
const v2 = Object.assign({}, save, { version: 2, stats: { gold: 1, gems: 1, score: 55 } }); delete v2.pickaxe; delete v2.backpack;
check('сохранение v2 проходит обе миграции', run(`loadSaveData(${JSON.stringify(v2)})`) === true &&
    run('pickaxeTier') === 0 && run('stats.score') === 55 && run('stats.money') === 0);
check('мусор в поле кирки даёт ржавую', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { pickaxe: 'abc' }))})`) && run('pickaxeTier') === 0);
check('слишком большой номер кирки даёт ржавую', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { pickaxe: 99 }))})`) && run('pickaxeTier') === 0);
confirmAnswer = true;
run('pickaxeTier = 3; newGame();');
confirmAnswer = false;
check('новая игра — снова ржавая кирка', run('pickaxeTier') === 0);

console.log('Отрисовка');
setup('STONE');
hold(0.3);
check('прогресс копания рисуется без ошибок', (() => { run('updateCamera(); render();'); return true; })());

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
