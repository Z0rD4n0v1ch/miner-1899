// Проверки особой руды биомов: уголь, серебро, изумруд, платина.
// Запуск: node ores.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
        _html: '', get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [],
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {},
        getContext() { return ctxStub; }, width: 800, height: 600
    };
}
const els = {}, notes = [];
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => false, console, Date, Math, JSON, Object, Proxy, Number
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
const SPECIAL = ['COAL', 'SILVER', 'EMERALD', 'PLATINUM'];

console.log('Таблица руды');
check('у каждого биома своя особая руда', JSON.stringify(run('BIOMES.map(b => b.ore)')) === JSON.stringify(SPECIAL));
const info = run(`[${SPECIAL.map(k => `ORES[BLOCK_TYPES.${k}]`).join(',')}]`);
check('названия: уголь, серебро, изумруд, платина', info.map(o => o.name).join() === 'Уголь,Серебро,Изумруд,Платина');
check('цены 5 / 25 / 75 / 150 руб.', info.map(o => o.price).join() === '5,25,75,150');
check('у новых блоков свои цвета', new Set(SPECIAL.map(k => run(`BLOCK_COLORS[BLOCK_TYPES.${k}]`))).size === 4 &&
    SPECIAL.every(k => !run(`BIOMES.some(b => b.rock === BLOCK_COLORS[BLOCK_TYPES.${k}] || b.cave === BLOCK_COLORS[BLOCK_TYPES.${k}])`)));

console.log('Генерация');
const gen = run(`(() => {
    const r = {};
    for (const k of ${JSON.stringify(SPECIAL)}) r[k] = { n: 0, home: 0 };
    for (const seed of [11, 12]) {
        generateWorld(seed);
        for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) {
            for (const k of ${JSON.stringify(SPECIAL)}) if (world[y][x] === BLOCK_TYPES[k]) {
                r[k].n++;
                if (BIOMES[biomeAtBlock(x, y)].ore === k) r[k].home++;
            }
        }
    }
    return r;
})()`);
SPECIAL.forEach((k, i) => {
    check(`${info[i].name}: в среднем ${(gen[k].n / 2).toFixed(0)} блоков на мир`, gen[k].n / 2 > 80);
    check(`${info[i].name} — только в своём биоме`, gen[k].home === gen[k].n);
});
check('угля больше всего — он дешёвый', gen.COAL.n > gen.SILVER.n && gen.COAL.n > gen.PLATINUM.n);
run('generateWorld(11)'); const a = run('JSON.stringify(world)'); run('generateWorld(11)');
check('тот же seed — та же руда', run('JSON.stringify(world)') === a);

console.log('Копание');
function setup(block, pick = 0, depth = 100) {
    run(`pickaxeTier = ${pick}; shovelTier = 0; backpack = emptyBackpack(); stats.money = 0; stats.score = 0; debt = 0;
         resetDig(); keys = {}; gameState.paused = false;
         player.x = 50; player.direction = 1; player.y = DEPTH_ORIGIN + ${depth};
         world[player.y][50] = BLOCK_TYPES.AIR; world[player.y + 1][50] = BLOCK_TYPES.STONE; world[player.y][51] = BLOCK_TYPES.${block};`);
    notes.length = 0;
}
function hold(seconds) {
    run('keys["Space"] = true;');
    for (let i = 0; i < Math.round(seconds * 60); i++) run('updateDigging(1/60)');
    run('keys = {}');
}
const gone = b => run('world[player.y][51]') !== run(`BLOCK_TYPES.${b}`);
setup('COAL'); hold(0.45);
check('уголь ржавой киркой за 0.45 с ещё цел', !gone('COAL'));
hold(0.1);
check('за 0.55 с выкопан и в рюкзаке', gone('COAL') && run('backpack.coal') === 1);
setup('SILVER', 0, 300); hold(1);
check('серебро копается ржавой киркой', gone('SILVER') && run('backpack.silver') === 1);
setup('EMERALD', 0, 500); hold(3);
check('изумруд ржавой киркой не поддаётся', !gone('EMERALD') && notes.some(n => n.includes('железная')));
setup('EMERALD', 1, 500); hold(1);
check('изумруд железной киркой — да', gone('EMERALD') && run('backpack.emerald') === 1);
setup('PLATINUM', 1, 700); hold(3);
check('платина железной киркой не поддаётся', !gone('PLATINUM') && notes.some(n => n.includes('стальная')));
setup('PLATINUM', 2, 700); hold(1);
check('платина стальной киркой — да', gone('PLATINUM') && run('backpack.platinum') === 1);
check('твёрдость биома руду не замедляет', Math.abs(run('digTime(BLOCK_TYPES.COAL, 50, DEPTH_ORIGIN + 700)') - run('digTime(BLOCK_TYPES.COAL, 50, DEPTH_ORIGIN + 100)')) < 1e-9);
setup('COAL'); run('dig()');
check('за уголь начисляются очки по цене', run('stats.score') === 5);

console.log('Рюкзак и продажа');
setup('STONE');
run('addToBackpack(BLOCK_TYPES.COAL); addToBackpack(BLOCK_TYPES.COAL); addToBackpack(BLOCK_TYPES.SILVER); addToBackpack(BLOCK_TYPES.EMERALD); addToBackpack(BLOCK_TYPES.PLATINUM);');
check('новая руда занимает место в рюкзаке', run('backpackCount()') === 5);
check('стоимость считается: 5+5+25+75+150 = 260', run('backpackValue()') === 260);
run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; sellBackpack();');
check('лавка покупает по этим ценам', run('stats.money') === 260 && run('backpackCount()') === 0);
setup('COAL');
run('for (let i = 0; i < BACKPACK_CAPACITY; i++) addToBackpack(BLOCK_TYPES.COAL);');
check('20 угля заполняют рюкзак: ещё уголь не берётся', run('addToBackpack(BLOCK_TYPES.COAL)') === 'full');
run('dig()');
check('при полном рюкзаке понятное сообщение', notes.some(n => n.includes('Нет места') && n.includes('уголь')));
check('полный рюкзак угля — 100 руб., хватит на долг за лопату', run('backpackValue()') === 100);

console.log('Сохранения');
setup('STONE');
run('addToBackpack(BLOCK_TYPES.SILVER); addToBackpack(BLOCK_TYPES.PLATINUM);');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('новая руда попадает в сохранение', save.backpack.silver === 1 && save.backpack.platinum === 1);
run('backpack = emptyBackpack();');
run(`loadSaveData(${JSON.stringify(save)})`);
check('и восстанавливается', run('backpack.silver') === 1 && run('backpack.platinum') === 1);
const old = Object.assign({}, save, { backpack: { gold: 3, diamond: 1, ruby: 0 } });
run(`loadSaveData(${JSON.stringify(old)})`);
check('старый рюкзак без новой руды загружается, новая — по нулям', run('backpack.gold') === 3 && run('backpack.coal') === 0 && run('backpackCount()') === 4);
run('generateWorld(4); world[300][7] = BLOCK_TYPES.PLATINUM; world[300][8] = BLOCK_TYPES.COAL;');
const w = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
run('world[300][7] = BLOCK_TYPES.AIR; world[300][8] = BLOCK_TYPES.AIR;');
run(`loadSaveData(${JSON.stringify(w)})`);
check('руда в мире переживает сохранение', run('world[300][7]') === run('BLOCK_TYPES.PLATINUM') && run('world[300][8]') === run('BLOCK_TYPES.COAL'));

console.log('Интерфейс');
check('в легенде четыре новые руды', ['Уголь', 'Серебро', 'Изумруды', 'Платина'].every(n => html.includes(`<span>${n}</span>`)));
run('player.y = DEPTH_ORIGIN + 250; currentBiome = 0; updateBiome(1000);');
texts.length = 0; run('renderBiomeBanner(2000)');
check('табличка биома называет его руду', texts.some(t => t.includes('здесь: серебро')));
run('player.y = DEPTH_ORIGIN + 5; updateBiome(5000);');
texts.length = 0; run('renderBiomeBanner(6000)');
check('у Песчаного пласта — уголь', texts.some(t => t.includes('здесь: уголь')));
run('stats.money = 0; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
check('в лавке у железной кирки указаны изумруды', els.shopList.children.some(c => c.innerHTML.includes('Железная') && c.innerHTML.includes('изумруды')));
check('у стальной — платина', els.shopList.children.some(c => c.innerHTML.includes('Стальная') && c.innerHTML.includes('платина')));
run('closeShop()');
run('generateWorld(4); player.x = 60; player.y = DEPTH_ORIGIN + 50; updateCamera(); world[DEPTH_ORIGIN + 50][62] = BLOCK_TYPES.COAL;');
fills.length = 0; run('render()');
check('на угле светлые искры, чтобы не сливался с пещерой', fills.some(f => f[0] === 'rgba(210, 215, 225, 0.7)'));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
