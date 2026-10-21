// Проверки рюкзака и лавки (v1.3.0).
// Запуск: node inventory.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeEl() {
    return {
        textContent: '', innerHTML: '', value: '', style: {}, onclick: null,
        classList: { _s: new Set(),
            add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); },
            toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } },
        appendChild() {}, remove() {}, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => {}, set: (t, k, v) => (t[k] = v, true) }); },
        width: 800, height: 600
    };
}
const els = {};
const notes = [];
const store = {};
const sandbox = {
    document: {
        getElementById: id => els[id] || (els[id] = makeEl()),
        createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } }
    },
    localStorage: {
        getItem: k => (k in store ? store[k] : null),
        setItem: (k, v) => { store[k] = String(v); },
        removeItem: k => { delete store[k]; }
    },
    window: { addEventListener() {} },
    requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => false, console, Date, Math, JSON, Object, Proxy
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); }
    else { failed++; console.log('  ✗ ' + name); }
}
function reset() {
    run(`backpack = emptyBackpack(); stats.money = 0; stats.score = 0; pickaxeTier = 0;
         player.x = WORLD_WIDTH / 2; player.y = SURFACE_Y - 1; player.direction = 1;
         keys = {};`);
    notes.length = 0;
}

console.log('Рюкзак');
reset();
check('пустой рюкзак на старте', run('backpackCount()') === 0);
check('золото кладётся', run('addToBackpack(BLOCK_TYPES.GOLD)') === 'added' && run('backpack.gold') === 1);
check('алмаз и рубин кладутся', run('addToBackpack(BLOCK_TYPES.DIAMOND)') === 'added' && run('addToBackpack(BLOCK_TYPES.RUBY)') === 'added');
check('земля и камень не кладутся',
    run('addToBackpack(BLOCK_TYPES.DIRT)') === 'not-ore' && run('addToBackpack(BLOCK_TYPES.STONE)') === 'not-ore' && run('backpackCount()') === 3);
check('стоимость считается по ценам', run('backpackValue()') === 8 + 30 + 55);
reset();
run('for (let i = 0; i < BACKPACK_CAPACITY; i++) addToBackpack(BLOCK_TYPES.GOLD)');
check('рюкзак заполняется до ёмкости', run('backpackCount()') === run('BACKPACK_CAPACITY'));
check('сверх ёмкости руда не дороже самой дешёвой — full', run('addToBackpack(BLOCK_TYPES.GOLD)') === 'full' && run('backpack.gold') === run('BACKPACK_CAPACITY'));

console.log('Копание');
reset();
run(`player.y = 100; player.x = 50;
     setBlock(51, 100, BLOCK_TYPES.GOLD); dig();`);
check('выкопанное золото попадает в рюкзак', run('backpack.gold') === 1);
check('за руду начисляются очки', run('stats.score') === 10);
check('блок исчезает', run('getBlock(51, 100)') === run('BLOCK_TYPES.AIR'));
run('setBlock(51, 100, BLOCK_TYPES.STONE); dig();');
check('камень даёт очки, но не место в рюкзаке', run('stats.score') === 12 && run('backpackCount()') === 1);
reset();
run(`for (let i = 0; i < BACKPACK_CAPACITY; i++) addToBackpack(BLOCK_TYPES.RUBY);   // рубины дороже алмаза
     pickaxeTier = 1;   // алмаз копается только железной киркой
     player.y = 100; player.x = 50; setBlock(51, 100, BLOCK_TYPES.DIAMOND); dig();`);
check('при полном рюкзаке блок всё равно выкапывается', run('getBlock(51, 100)') === run('BLOCK_TYPES.AIR'));
check('при полном рюкзаке руда пропадает и очков нет', run('backpack.diamond') === 0 && run('stats.score') === 0);
check('при полном рюкзаке есть уведомление', notes.some(n => n.includes('Нет места')));
reset();
run(`for (let i = 0; i < BACKPACK_CAPACITY - 1; i++) addToBackpack(BLOCK_TYPES.GOLD);
     player.y = 100; player.x = 50; setBlock(51, 100, BLOCK_TYPES.GOLD); dig();`);
check('уведомление в момент заполнения', notes.some(n => n.includes('Рюкзак полон')));

console.log('Лавка');
reset();
check('на старте игрок не у лавки', run('isAtShop()') === false);
run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1;');
check('у лавки на поверхности — isAtShop', run('isAtShop()') === true);
run('player.y = SURFACE_Y + 3;');
check('под лавкой в шахте — не у лавки', run('isAtShop()') === false);
run('player.x = SHOP_X - 0.5; player.y = SURFACE_Y - 1;');
check('касание краем считается', run('isAtShop()') === true);
run('player.x = SHOP_X - 1;');
check('вплотную слева, без перекрытия — не у лавки', run('isAtShop()') === false);
reset();
run(`addToBackpack(BLOCK_TYPES.GOLD); addToBackpack(BLOCK_TYPES.RUBY);
     player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; checkShop();`);
check('продажа при подходе: деньги начислены', run('stats.money') === 63);
check('после продажи рюкзак пуст', run('backpackCount()') === 0);
check('уведомление о продаже', notes.some(n => n.includes('63 ¤')));
notes.length = 0;
run('checkShop()');
check('пустой рюкзак не продаётся повторно', notes.length === 0 && run('stats.money') === 63);
reset();
run('addToBackpack(BLOCK_TYPES.GOLD); player.y = 100; checkShop();');
check('вдали от лавки ничего не продаётся', run('stats.money') === 0 && run('backpack.gold') === 1);

console.log('Интерфейс');
reset();
run('addToBackpack(BLOCK_TYPES.GOLD); stats.money = 70; updateUI();');
check('счётчик рюкзака', els.backpack.textContent === '1/20');
check('полоска рюкзака', els.backpackFill.style.width === '5%');
check('деньги', els.money.textContent === '70 ¤');
run('for (let i = 0; i < 19; i++) addToBackpack(BLOCK_TYPES.GOLD); updateUI();');
check('полный рюкзак подсвечен', els.backpack.classList.contains('full') && els.backpackFill.classList.contains('full'));

console.log('Сохранения');
check('SAVE_VERSION = 9', run('SAVE_VERSION') === 9);
reset();
run(`generateWorld(12345);
     addToBackpack(BLOCK_TYPES.GOLD); addToBackpack(BLOCK_TYPES.DIAMOND);
     stats.money = 240; stats.score = 77;`);
const save = run('JSON.stringify(createSaveData("t"))');
check('в сохранении есть рюкзак и деньги', JSON.parse(save).backpack.diamond === 1 && JSON.parse(save).stats.money === 240);
run('backpack = emptyBackpack(); stats.money = 0; stats.score = 0;');
check('загрузка текущей версии проходит', run(`loadSaveData(JSON.parse(${JSON.stringify(save)}))`) === true);
check('рюкзак восстановлен', run('backpack.gold') === 1 && run('backpack.diamond') === 1);
check('деньги и очки восстановлены', run('stats.money') === 240 && run('stats.score') === 77);
const v2 = JSON.parse(save);
v2.version = 2; delete v2.backpack; v2.stats = { gold: 5, gems: 3, score: 900 };
check('сохранение v2 загружается через миграцию', run(`loadSaveData(${JSON.stringify(v2)})`) === true);
check('после миграции: рюкзак пуст, денег 0, очки сохранены',
    run('backpackCount()') === 0 && run('stats.money') === 0 && run('stats.score') === 900);
check('мир из v2 сохранения на месте', run('world.length') === run('WORLD_HEIGHT'));
const v1 = JSON.parse(save); v1.version = 1;
check('сохранение v1 по-прежнему отклоняется', run(`loadSaveData(${JSON.stringify(v1)})`) === false);
check('битые поля рюкзака дают 0, а не NaN',
    run(`(() => { const s = JSON.parse(${JSON.stringify(save)}); s.backpack = { gold: 2 }; loadSaveData(s); return backpack.diamond === 0 && backpack.gold === 2; })()`));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
