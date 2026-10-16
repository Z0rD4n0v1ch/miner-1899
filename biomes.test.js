// Проверки биомов: границы, цвета камня и пещер, табличка при входе, слои мягкой породы.
// Запуск: node biomes.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const fills = [], texts = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => {
        if (k === 'fillRect') return (x, y, w, h) => fills.push([t.fillStyle, x, y]);
        if (k === 'fillText') return (s) => texts.push(s);
        return k in t ? t[k] : () => {};
    },
    set: (t, k, v) => (t[k] = v, true)
});
function makeEl() {
    return {
        textContent: '', innerHTML: '', value: '', style: {}, children: [],
        classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
        appendChild() {}, remove() {}, focus() {}, click() {},
        getContext() { return ctxStub; }, width: 800, height: 600
    };
}
const els = {};
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild() {} } },
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

console.log('Таблица биомов');
const biomes = run('BIOMES');
check('четыре биома', biomes.length === 4);
check('названия как в таблице', JSON.stringify(biomes.map(b => b.name)) ===
    JSON.stringify(['Песчаный пласт', 'Глиняные штольни', 'Гранитные недра', 'Огненное дно']));
check('границы 0 / 200 / 400 / 600 м', JSON.stringify(biomes.map(b => b.from)) === '[0,200,400,600]');
check('у каждого биома камень отличается от пещер', biomes.every(b => b.rock !== b.cave));
check('у всех биомов разный камень', new Set(biomes.map(b => b.rock)).size === 4);
check('глина не сливается ни с одним камнем', !biomes.some(b => b.rock.toLowerCase() === run('BLOCK_COLORS[BLOCK_TYPES.CLAY]').toLowerCase()));

console.log('Границы');
const at = d => run(`biomeIndexAt(${d})`);
check('0 м — Песчаный пласт', at(0) === 0);
check('199 м — ещё Песчаный пласт', at(199.9) === 0);
check('200 м — Глиняные штольни', at(200) === 1);
check('400 м — Гранитные недра', at(400) === 2);
check('600 м и дно — Огненное дно', at(600) === 3 && at(788) === 3);
check('выше поверхности — первый биом', at(-5) === 0);
const edge = run(`(() => { const r = []; for (let x = 0; x < WORLD_WIDTH; x++) r.push(biomeAtBlock(x, DEPTH_ORIGIN + 195)); return r; })()`);
check('граница волнистая: на 195 м местами уже второй биом', edge.includes(0) && edge.includes(1));
const farOk = run(`(() => { for (let x = 0; x < WORLD_WIDTH; x++) {
    if (biomeAtBlock(x, DEPTH_ORIGIN + 200 - BIOME_WAVE - 1) !== 0) return false;
    if (biomeAtBlock(x, DEPTH_ORIGIN + 200 + BIOME_WAVE + 1) !== 1) return false; } return true; })()`);
check('но не дальше чем на BIOME_WAVE метров', farOk);
check('граница одна и та же каждый кадр', JSON.stringify(edge) ===
    JSON.stringify(run(`(() => { const r = []; for (let x = 0; x < WORLD_WIDTH; x++) r.push(biomeAtBlock(x, DEPTH_ORIGIN + 195)); return r; })()`)));

console.log('Цвета на экране');
run('generateWorld(77); player.x = 60;');
function frameAt(depth, setup) {
    run(`player.y = DEPTH_ORIGIN + ${depth}; ${setup || ''} updateCamera();`);
    fills.length = 0;
    run('render()');
    return new Set(fills.map(f => String(f[0]).toUpperCase()));
}
const up = s => s.toUpperCase();
let colors = frameAt(100, 'for (let y = DEPTH_ORIGIN + 90; y < DEPTH_ORIGIN + 110; y++) { world[y][50] = BLOCK_TYPES.STONE; world[y][51] = BLOCK_TYPES.AIR; }');
check('на 100 м камень — песчаник', colors.has(up(biomes[0].rock)));
check('и пещеры песчаного пласта', colors.has(up(biomes[0].cave)));
check('чужих камней на 100 м нет', ![1, 2, 3].some(i => colors.has(up(biomes[i].rock))));
colors = frameAt(300, 'for (let y = DEPTH_ORIGIN + 290; y < DEPTH_ORIGIN + 310; y++) { world[y][50] = BLOCK_TYPES.STONE; world[y][51] = BLOCK_TYPES.AIR; }');
check('на 300 м — известняк и сине-серые пещеры', colors.has(up(biomes[1].rock)) && colors.has(up(biomes[1].cave)));
colors = frameAt(700, 'for (let y = DEPTH_ORIGIN + 690; y < DEPTH_ORIGIN + 710; y++) { world[y][50] = BLOCK_TYPES.STONE; world[y][51] = BLOCK_TYPES.AIR; }');
check('на 700 м — базальт и красные пещеры', colors.has(up(biomes[3].rock)) && colors.has(up(biomes[3].cave)));
colors = frameAt(-1);
check('небо по-прежнему голубое', colors.has(up(run('BLOCK_COLORS[BLOCK_TYPES.AIR]'))));
check('земляная корка прежнего цвета', colors.has(up(run('BLOCK_COLORS[BLOCK_TYPES.DIRT]'))));
colors = frameAt(450, 'world[DEPTH_ORIGIN + 450][62] = BLOCK_TYPES.GOLD;');
check('руда своего цвета в любом биоме', colors.has(up(run('BLOCK_COLORS[BLOCK_TYPES.GOLD]'))));

console.log('Мягкая порода по биомам');
const layers = run(`(() => {
    const T = BLOCK_TYPES, r = { sand: [0, 0], clay: [0, 0], gravel: [0, 0] };
    for (const seed of [1, 2, 3]) {
        generateWorld(seed);
        for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) {
            const v = world[y][x], m = y - DEPTH_ORIGIN;
            if (v === T.SAND)   { r.sand[0]++;   if (m < 240) r.sand[1]++; }
            if (v === T.CLAY)   { r.clay[0]++;   if (m >= 160 && m < 440) r.clay[1]++; }
            if (v === T.GRAVEL) { r.gravel[0]++; if (m >= 360) r.gravel[1]++; }
        }
    }
    return r;
})()`);
check('песок — в Песчаном пласте', layers.sand[0] > 0 && layers.sand[1] / layers.sand[0] > 0.98);
check('глина — в Глиняных штольнях', layers.clay[0] > 0 && layers.clay[1] / layers.clay[0] > 0.98);
check('гравий — в Гранитных недрах и ниже', layers.gravel[0] > 0 && layers.gravel[1] / layers.gravel[0] > 0.98);

console.log('Табличка при входе');
run('generateWorld(77); player.x = 60; player.y = SURFACE_Y - 1; currentBiome = 0; biomeBanner = { index: 0, shownAt: -Infinity };');
run('updateBiome(1000);');
check('на старте таблички нет', run('biomeBanner.shownAt') === -Infinity);
run('player.y = DEPTH_ORIGIN + 250; updateBiome(5000);');
check('спустился на 250 м — табличка «Глиняные штольни»', run('biomeBanner.index') === 1 && run('biomeBanner.shownAt') === 5000);
run('player.y = DEPTH_ORIGIN + 260; updateBiome(5500);');
check('внутри того же биома заново не показывается', run('biomeBanner.shownAt') === 5000);
texts.length = 0; run('renderBiomeBanner(6000)');
check('через секунду табличка на экране', texts.includes('Глиняные штольни') && texts.some(t => t.includes('200 м')));
texts.length = 0; run('renderBiomeBanner(9000)');
check('через 4 секунды исчезла', texts.length === 0);
run('player.y = DEPTH_ORIGIN + 10; updateBiome(10000);');
check('поднялся — табличка Песчаного пласта', run('biomeBanner.index') === 0 && run('biomeBanner.shownAt') === 10000);
run('debugTeleport(700); updateBiome(11000);');
check('телепорт на дно — «Огненное дно»', run('biomeBanner.index') === 3);

console.log('Интерфейс');
run('player.y = DEPTH_ORIGIN + 450; updateUI();');
check('под глубиной написан биом', els.biome.textContent === 'Гранитные недра');
run('debug.on = true;'); texts.length = 0; run('drawDebugOverlay(); debug.on = false;');
check('биом и в панели отладки', texts.some(t => t.includes('Гранитные недра')));
check('игровой цикл с биомами не падает', (() => { run('gameLoop(16); gameLoop(33);'); return true; })());

console.log('Твёрдость');
check('твёрдость растёт с глубиной: 1 / 1.3 / 1.7 / 2.2', JSON.stringify(biomes.map(b => b.hardness)) === '[1,1.3,1.7,2.2]');
// копаем камень в середине каждого биома и меряем время
function digSeconds(depth, block, pick, shovel) {
    run(`pickaxeTier = ${pick}; shovelTier = ${shovel || 0}; resetDig(); keys = {}; gameState.paused = false;
         player.x = 50; player.direction = 1; player.y = DEPTH_ORIGIN + ${depth};
         world[player.y][50] = BLOCK_TYPES.AIR; world[player.y + 1][50] = BLOCK_TYPES.STONE;
         world[player.y][51] = BLOCK_TYPES.${block}; keys['Space'] = true;`);
    let f = 0;
    while (run('world[player.y][51]') === run(`BLOCK_TYPES.${block}`) && f < 1000) { run('updateDigging(1/60)'); f++; }
    run('keys = {}');
    return f / 60;
}
const mids = [100, 300, 500, 700];
const rusty = mids.map(d => digSeconds(d, 'STONE', 0));
mids.forEach((d, i) => check(`ржавой киркой камень на ${d} м — ${rusty[i].toFixed(2)} с (ожидалось ${(0.6 * biomes[i].hardness).toFixed(2)})`,
    Math.abs(rusty[i] - 0.6 * biomes[i].hardness) < 0.03));
const best = digSeconds(700, 'STONE', 3);
check(`лучшей киркой на дне — ${best.toFixed(2)} с`, Math.abs(best - 0.6 * 2.2 / 4.5) < 0.03);
check('глубже копать дольше', rusty.every((t, i) => i === 0 || t > rusty[i - 1]));
check('золото на дне копается так же, как у поверхности', Math.abs(digSeconds(700, 'GOLD', 0) - digSeconds(100, 'GOLD', 0)) < 0.02);
check('гравий на дне — по-прежнему по таблице лопаты', Math.abs(digSeconds(700, 'GRAVEL', 0, 1) - 0.5) < 0.03);
const sameAsColor = run(`(() => {
    for (let x = 0; x < WORLD_WIDTH; x++) for (let m = 185; m <= 215; m++) {
        const y = DEPTH_ORIGIN + m;
        const t = digTime(BLOCK_TYPES.STONE, x, y) * PICKAXES[pickaxeTier].speed / HARDNESS[BLOCK_TYPES.STONE];
        if (Math.abs(t - BIOMES[biomeAtBlock(x, y)].hardness) > 1e-9) return false;
    }
    return true;
})()`);
check('на волнистой границе твёрдость совпадает с цветом камня', sameAsColor);
check('без координат — прежнее время камня', Math.abs(run('pickaxeTier = 0; digTime(BLOCK_TYPES.STONE)') - 0.6) < 1e-9);
run('player.y = DEPTH_ORIGIN + 250; currentBiome = 0; updateBiome(20000);');
texts.length = 0; run('renderBiomeBanner(21000)');
check('табличка сообщает, что камень твёрже', texts.some(t => t.includes('твёрже ×1.3')));
run('player.y = DEPTH_ORIGIN + 10; updateBiome(30000);');
texts.length = 0; run('renderBiomeBanner(31000)');
check('у Песчаного пласта про твёрдость не пишется', texts.some(t => t.includes('глубина от 0 м')) && !texts.some(t => t.includes('твёрже')));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
