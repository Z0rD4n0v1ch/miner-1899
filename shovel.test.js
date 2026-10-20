// Проверки лопаты и мягкой породы: генерация, время копания, выбор инструмента, лавка, сохранения.
// Запуск: node shovel.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
        getContext() { return ctxStub; }, width: 800, height: 600
    };
}
const rects = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => k === 'fillRect' ? (x, y, w, h) => rects.push([t.fillStyle, x, y, w, h]) : (k in t ? t[k] : () => {}),
    set: (t, k, v) => (t[k] = v, true)
});
const els = {}, notes = [];
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
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
const T = name => run(`BLOCK_TYPES.${name}`);

console.log('Генерация');
run('generateWorld(2024)');
const stats = run(`(() => {
    const T = BLOCK_TYPES, stoneTop = SURFACE_Y + DIRT_DEPTH, bottom = WORLD_HEIGHT - BEDROCK_ROWS;
    const r = { solid: 0, soft: 0, sandDepth: [], gravelDepth: [], clayDepth: [], softInCrust: 0, softInBedrock: 0 };
    for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) {
        const v = world[y][x], d = (y - stoneTop) / (bottom - stoneTop);
        const soft = v === T.SAND || v === T.CLAY || v === T.GRAVEL;
        if (soft && y < stoneTop) r.softInCrust++;
        if (soft && y >= bottom) r.softInBedrock++;
        if (y >= stoneTop && y < bottom && v !== T.AIR && v !== T.LAVA) { r.solid++; if (soft) r.soft++; }
        if (v === T.SAND) r.sandDepth.push(d);
        if (v === T.CLAY) r.clayDepth.push(d);
        if (v === T.GRAVEL) r.gravelDepth.push(d);
    }
    const avg = a => a.reduce((s, v) => s + v, 0) / a.length;
    return { share: r.soft / r.solid, sand: avg(r.sandDepth), clay: avg(r.clayDepth), gravel: avg(r.gravelDepth),
             counts: [r.sandDepth.length, r.clayDepth.length, r.gravelDepth.length],
             crust: r.softInCrust, bedrock: r.softInBedrock };
})()`);
check(`мягкой породы заметная доля (${(stats.share * 100).toFixed(1)}%)`, stats.share > 0.1 && stats.share < 0.35);
check(`есть все три вида (${stats.counts.join(' / ')})`, stats.counts.every(n => n > 100));
check(`песок у поверхности, глина в середине, гравий внизу (${stats.sand.toFixed(2)} < ${stats.clay.toFixed(2)} < ${stats.gravel.toFixed(2)})`,
    stats.sand < stats.clay && stats.clay < stats.gravel);
check('земляная корка у поверхности не тронута', stats.crust === 0);
check('в коренной породе мягкой нет', stats.bedrock === 0);
const snap = run('JSON.stringify(world)');
run('generateWorld(2024)');
check('тот же seed — тот же мир', run('JSON.stringify(world)') === snap);

console.log('Время копания');
function setup(block, pick = 0, shovel = 0) {
    run(`pickaxeTier = ${pick}; shovelTier = ${shovel}; stats.money = 0; stats.score = 0; backpack = emptyBackpack();
         resetDig(); gameState.paused = false; keys = {};
         player.x = 50; player.y = 100; player.direction = 1;
         world[100][50] = BLOCK_TYPES.AIR; world[101][50] = BLOCK_TYPES.STONE; world[100][51] = BLOCK_TYPES.${block};`);
    notes.length = 0;
}
function timeToDig(block, pick, shovel) {
    setup(block, pick, shovel);
    run('keys["Space"] = true;');
    let frames = 0;
    while (run('world[100][51]') === T(block) && frames < 1200) { run('updateDigging(1/60)'); frames++; }
    run('keys = {}');
    return frames / 60;
}
const dirtNoShovel = timeToDig('DIRT', 0, 0), dirtShovel = timeToDig('DIRT', 0, 1);
check(`землю ржавой киркой копать долго (${dirtNoShovel.toFixed(2)} с)`, dirtNoShovel > 0.7);
check(`лопатой в 4 раза быстрее (${dirtShovel.toFixed(2)} с)`, Math.abs(dirtNoShovel / dirtShovel - 4) < 0.5);
const soft = {};
for (const b of ['SAND', 'CLAY', 'GRAVEL']) soft[b] = timeToDig(b, 0, 1);
check(`песок < глина < гравий лопатой (${soft.SAND.toFixed(2)} / ${soft.CLAY.toFixed(2)} / ${soft.GRAVEL.toFixed(2)} с)`,
    soft.SAND < soft.CLAY && soft.CLAY < soft.GRAVEL);
check('гравий без лопаты ржавой киркой — 2 с', Math.abs(timeToDig('GRAVEL', 0, 0) - 2) < 0.05);
const stoneNo = timeToDig('STONE', 0, 0), stoneYes = timeToDig('STONE', 0, 1);
check('камень лопата не ускоряет', Math.abs(stoneNo - stoneYes) < 0.02);
check('золото лопата не ускоряет', Math.abs(timeToDig('GOLD', 0, 0) - timeToDig('GOLD', 0, 1)) < 0.02);

console.log('Выбор инструмента');
setup('DIRT', 0, 0);
check('без лопаты землю копает кирка', run('toolFor(BLOCK_TYPES.DIRT)') === 'pickaxe');
setup('DIRT', 0, 1);
check('с лопатой землю копает лопата', run('toolFor(BLOCK_TYPES.DIRT)') === 'shovel');
check('камень всегда кирка', run('toolFor(BLOCK_TYPES.STONE)') === 'pickaxe');
setup('DIRT', 3, 1);
check('лучшая кирка на земле обгоняет лопату — берётся она', run('toolFor(BLOCK_TYPES.DIRT)') === 'pickaxe');
check('и время — лучшее из двух', run('digTime(BLOCK_TYPES.DIRT)') < run('SOFT[BLOCK_TYPES.DIRT] / SHOVELS[1].speed'));
setup('GRAVEL', 1, 1);
check('железная кирка на гравии медленнее лопаты', run('toolFor(BLOCK_TYPES.GRAVEL)') === 'shovel');

console.log('Добыча');
setup('SAND', 0, 1);
run('dig()');
check('песок даёт 1 очко', run('stats.score') === 1);
check('мягкая порода не занимает рюкзак', run('backpackCount()') === 0);
check('мягкая порода не требует особой кирки', run('canDig(BLOCK_TYPES.GRAVEL) && canDig(BLOCK_TYPES.CLAY)'));

console.log('Покупка');
setup('STONE');
check('без денег лопату не купить', run('buyShovel(1)') === false && run('shovelTier') === 0);
check('сообщает, сколько не хватает', notes.some(n => n.includes('Не хватает 40')));
run('stats.money = 100;');
check('лопата за 40', run('buyShovel(1)') === true && run('shovelTier') === 1 && run('stats.money') === 60);
check('вторую не купить', run('buyShovel(1)') === false && run('stats.money') === 60);
check('несуществующую не купить', run('buyShovel(0)') === false && run('buyShovel(3)') === false);
run('updateUI()');
check('лопата в панели статистики', els.shovel.textContent === 'Лопата');
setup('STONE');
run('stats.money = 50; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
check('в лавке лопата идёт первой с кнопкой покупки', shovelItem().innerHTML.includes('buyShovel(1)'));
run('buyShovel(1)');
check('после покупки — «Есть»', shovelItem().innerHTML.includes('Есть'));
run('closeShop()');

console.log('Сохранения');
check('SAVE_VERSION = 8', run('SAVE_VERSION') === 8);
setup('STONE', 1, 1);
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('лопата попадает в сохранение', save.shovel === 1);
run('shovelTier = 0;');
check('и восстанавливается', run(`loadSaveData(${JSON.stringify(save)})`) === true && run('shovelTier') === 1);
const v4 = Object.assign({}, save, { version: 4 }); delete v4.shovel;
check('сохранение v4 загружается без лопаты, кирка остаётся', run(`loadSaveData(${JSON.stringify(v4)})`) === true &&
    run('shovelTier') === 0 && run('pickaxeTier') === 1);
const v2 = Object.assign({}, save, { version: 2, stats: { gold: 0, gems: 0, score: 7 } });
delete v2.shovel; delete v2.pickaxe; delete v2.backpack;
check('сохранение v2 проходит три миграции', run(`loadSaveData(${JSON.stringify(v2)})`) === true &&
    run('shovelTier') === 0 && run('pickaxeTier') === 0 && run('stats.score') === 7);
check('мусор в поле лопаты — без лопаты', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { shovel: 'x' }))})`) && run('shovelTier') === 0);
run('generateWorld(5); world[200][10] = BLOCK_TYPES.GRAVEL; world[200][11] = BLOCK_TYPES.CLAY;');
const withSoft = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
run('world[200][10] = BLOCK_TYPES.STONE; world[200][11] = BLOCK_TYPES.STONE;');
run(`loadSaveData(${JSON.stringify(withSoft)})`);
check('мягкая порода переживает сжатие мира в сохранении', run('world[200][10]') === T('GRAVEL') && run('world[200][11]') === T('CLAY'));
confirmAnswer = true; run('shovelTier = 1; newGame();'); confirmAnswer = false;
check('новая игра — без лопаты', run('shovelTier') === 0);

console.log('Отрисовка');
rects.length = 0;
run('drawSpeckles(0, 0, 33, 444, "c", 1)');
const first = JSON.stringify(rects.slice());
rects.length = 0;
run('drawSpeckles(0, 0, 33, 444, "c", 1)');
check('крапинки одинаковые от кадра к кадру', JSON.stringify(rects) === first && rects.length === 4);
check('крапинки внутри блока', rects.every(([, x, y, w, h]) => x >= 2 && y >= 2 && x + w <= 18 && y + h <= 18));
setup('DIRT', 0, 1);
rects.length = 0;
run('keys["Space"] = true; updateCamera(); render(); keys = {};');
check('при копании лопатой рисуется её штык', rects.some(([c]) => c === '#B0B0B0'));
rects.length = 0;
run('updateCamera(); render();');
check('без копания штыка нет', !rects.some(([c]) => c === '#B0B0B0'));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
