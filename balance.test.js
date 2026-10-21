// Проверки баланса v1.8: цены, руда глубже в биомах, пояса и лимит лечения, две лампы,
// урон от падения, верёвка-переправа, свойства рюкзаков, миграция сохранений.
// (Клеть с ожиданием проверяется в climb.test.js.)
// Запуск: node balance.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeEl() {
    return { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); },
        width: 800, height: 600 };
}
const els = {}, notes = [], handlers = {};
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener(t, f) { handlers[t] = f; } }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => confirmAnswer, console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = c => vm.runInContext(c, sandbox);
const press = code => { handlers.keydown({ code, preventDefault() {} }); handlers.keyup({ code }); };
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

// Закрытая комната: пол на ряду F+1, игрок в x = 45
function room(depth, h = 5) {
    run(`generateWorld(12); creatures = []; resetHazards(); resetDig(); keys = {}; gameState.paused = false; debug.on = false; debug.fly = false;
         hazardRandom = () => 0.99; respawnTimer = 1e9; cageCall = null; fallTop = null;
         backpack = emptyBackpack(); backpackTier = 0; lampTier = 0; lampLit = true; beltTier = 0; bandages = 0; medkits = 0;
         stats.money = 0; stats.score = 100; ropes = 3; pickaxeTier = 3;
         globalThis.F = DEPTH_ORIGIN + ${depth};
         for (let y = F - 30; y <= F + 3; y++) for (let x = 30; x <= 70; x++)
             world[y][x] = (y >= F - ${h - 1} && y <= F) ? BLOCK_TYPES.AIR : BLOCK_TYPES.STONE;
         player.x = 45; player.y = F; player.vx = 0; player.vy = 0; player.onGround = true; player.direction = 1;`);
    notes.length = 0;
}
function tick(seconds, keysObj) {
    run(`keys = ${JSON.stringify(keysObj || {})}; for (let i = 0; i < ${Math.round(seconds * 60)}; i++) { updatePlayer(1/60); updateHazards(1/60); updateCreatures(1/60); } keys = {};`);
}
// уронить игрока с высоты drop блоков на пол комнаты
function drop(n) {
    run(`for (let y = F - ${n} - 2; y <= F; y++) world[y][45] = BLOCK_TYPES.AIR; player.x = 45; player.y = F - ${n}; player.vy = 0; player.onGround = false; fallTop = null;`);
    tick(2.5);
}

console.log('Цены');
check('руда: уголь 4, золото 8, серебро 20, алмаз 30, изумруд 35, рубин 55, платина 80',
    run("['COAL','GOLD','SILVER','DIAMOND','EMERALD','RUBY','PLATINUM'].map(k => ORES[BLOCK_TYPES[k]].price).join()") === '4,8,20,30,35,55,80');
check('кирки дороже: 150 / 900 / 2500', run('PICKAXES.map(p => p.price).join()') === '0,150,900,2500');
check('рюкзаки: 200 / 700, стальная лопата 300', run('BACKPACKS[1].price') === 200 && run('BACKPACKS[2].price') === 700 && run('SHOVELS[2].price') === 300);
check('очки за руду прежние — рекорды сравнимы', run('ORES[BLOCK_TYPES.PLATINUM].score') === 150);
check('полный рюкзак изумрудов (700) не окупает стальную кирку (900)', 20 * run('ORES[BLOCK_TYPES.EMERALD].price') < run('PICKAXES[2].price'));

console.log('Ценная руда глубже');
const depths = run(`(() => { const r = {}; for (const seed of [1, 2, 3]) { generateWorld(seed);
    for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) for (const k of ['COAL','SILVER','EMERALD','PLATINUM'])
        if (world[y][x] === BLOCK_TYPES[k]) { const d = y - DEPTH_ORIGIN; r[k] = r[k] || { min: 1e9, n: 0 }; r[k].min = Math.min(r[k].min, d); r[k].n++; } }
    return r; })()`);
check(`серебро не выше 250 м (с ${depths.SILVER.min} м)`, depths.SILVER.min >= 250);
check(`изумруды не выше 470 м (с ${depths.EMERALD.min} м)`, depths.EMERALD.min >= 470);
check(`платина не выше 670 м (с ${depths.PLATINUM.min} м)`, depths.PLATINUM.min >= 670);
check(`изумрудов стало меньше: ${Math.round(depths.EMERALD.n / 3)} на мир`, depths.EMERALD.n / 3 < 200 && depths.EMERALD.n / 3 > 40);

console.log('Пояс и лимит лечения');
room(100); run('stats.money = 1000;');
check('без пояса: 2 бинта', run("buyMed('bandage')") && run("buyMed('bandage')") && run("buyMed('bandage')") === false && run('bandages') === 2);
check('и сообщение про пояс', notes.some(n => n.includes('На поясе нет места')));
check('без пояса: 1 аптечка', run("buyMed('medkit')") && run("buyMed('medkit')") === false && run('medkits') === 1);
check('кожаный пояс за 60 — 4 бинта и 2 аптечки', run('buyBelt(1)') === true && run('medLimit("bandage")') === 4 && run('medLimit("medkit")') === 2);
run("buyMed('bandage'); buyMed('bandage'); buyMed('medkit');");
check('теперь можно докупить', run('bandages') === 4 && run('medkits') === 2);
check('патронташ за 200 — 6 и 3', run('buyBelt(2)') === true && run('medLimit("bandage")') === 6 && run('medLimit("medkit")') === 3);
check('пояс хуже не купить', run('buyBelt(1)') === false);
run('updateUI()');
check('пояс виден в «Снаряжении»', els.gear.textContent.includes('патронташ шахтёра'));
run('stats.money = 1000; beltTier = 0; bandages = 0; medkits = 0; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
const item = name => els.shopList.children.find(c => c.innerHTML.includes(name)) || { innerHTML: '' };
check('в лавке пояса', item('Кожаный пояс').innerHTML.includes('buyBelt(1)') && item('Патронташ шахтёра').innerHTML.includes('buyBelt(2)'));
run('closeShop()');

console.log('Падение');
room(200, 30);
drop(5);
check('с 5 блоков — без вреда', run('health') === 100);
room(200, 30); drop(10);
check(`с 10 блоков — урон ${100 - run('health')} (4 блока сверх 6 × 6)`, run('health') === 76);
check('сообщение о причине', run('lastDamageAt') > -Infinity);
room(200, 30); run('addToBackpack(BLOCK_TYPES.GOLD);'); drop(26);
check('с 26 блоков — смерть, рюкзак потерян', notes.some(n => n.includes('Падение с высоты')) && run('backpackCount()') === 0);
room(200, 30); run('for (let y = F - 14; y <= F; y++) world[y][45] = BLOCK_TYPES.LADDER; player.x = 45; player.y = F - 14; fallTop = null;'); tick(6, { KeyS: true });
check('по лестнице вниз — без урона', run('health') === 100 && run('player.y') > run('F - 1'));
room(200, 30); run('for (let y = F - 14; y <= F; y++) world[y][45] = BLOCK_TYPES.ROPE;');
run('player.x = 45; player.y = F - 14;'); tick(5, { KeyS: true });
check('по верёвке вниз — без урона', run('health') === 100 && run('player.y') > run('F - 1'));
room(200, 30); tick(0.05, { KeyW: true }); tick(2);
check('прыжок на месте — без урона', run('health') === 100);
room(200, 30); run('debug.on = true; debug.fly = true; player.y = F - 20;'); tick(1); run('debug.fly = false; debug.on = false;'); tick(0.05);
check('после полёта отладки — не считается падением', run('health') === 100);

console.log('Две лампы');
room(200, 30); run('lampTier = 1; lampLit = true;'); drop(10);
check('открытая лампа гаснет при падении', run('lampLit') === false && notes.some(n => n.includes('погасла')));
check('погасшая лампа не светит и не пугает', run('lampShines()') === false && run('lampRadius()') === 0);
run('updateUI()');
check('в панели «(погасла)»', els.gear.textContent.includes('погасла'));
run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; checkShop();');
check('у лавки зажигают снова', run('lampLit') === true);
room(200, 30); run('lampTier = 2; lampLit = true;'); drop(10);
check('лампа Дэви при падении не гаснет', run('lampLit') === true);
check('радиус: открытая 4, Дэви 3', run('LAMPS[1].radius') === 4 && run('LAMPS[2].radius') === 3);
room(500); run(`lampTier = 1; lampLit = true; world[F][47] = BLOCK_TYPES.GAS; world[F - 1][47] = BLOCK_TYPES.GAS; world[F][46] = BLOCK_TYPES.STONE; world[F - 1][48] = BLOCK_TYPES.STONE;`);
run('dig()');
check('открытая лампа поджигает газ: взрыв −40', run('health') === 60 && notes.some(n => n.includes('подожгла')));
check('облака нет — газ сгорел', run('gasClouds.length') === 0);
check('взрыв обрушил породу рядом', run('getBlock(48, F - 1)') === run('BLOCK_TYPES.AIR'));
check('и лампа погасла', run('lampLit') === false);
room(500); run(`lampTier = 2; lampLit = true; world[F][47] = BLOCK_TYPES.GAS; world[F][46] = BLOCK_TYPES.STONE;`);
run('dig()');
check('лампа Дэви газ не поджигает — обычное облако', run('gasClouds.length') === 1 && run('health') === 100);
room(500); run(`lampTier = 1; lampLit = false; world[F][47] = BLOCK_TYPES.GAS; world[F][46] = BLOCK_TYPES.STONE;`);
run('dig()');
check('погасшая открытая лампа тоже не взрывает', run('gasClouds.length') === 1);
room(100); run('stats.money = 300;');
check('открытая 60, Дэви 180; Дэви поверх открытой', run('buyLamp(1)') && run('buyLamp(2)') && run('lampTier') === 2 && run('stats.money') === 60);

console.log('Верёвка-переправа');
// пропасть: пол убран в x 48..53, ниже — лава
room(600, 5);
run(`for (let x = 48; x <= 53; x++) { world[F + 1][x] = BLOCK_TYPES.AIR; world[F + 2][x] = BLOCK_TYPES.AIR; world[F + 3][x] = BLOCK_TYPES.LAVA; }
     player.x = 46.9; player.direction = 1;`);
press('KeyT');
check('T у края — переправа на 6 блоков до той стороны', run('(() => { let n = 0; for (let x = 48; x <= 53; x++) if (world[F + 1][x] === BLOCK_TYPES.BRIDGE) n++; return n; })()') === 6 && run('ropes') === 2);
tick(4, { KeyD: true });
check('прошёл по переправе на ту сторону, не упав', run('player.x') > 54 && Math.abs(run('player.y') - run('F')) < 0.01);
run('for (let x = 48; x <= 53; x++) world[F + 3][x] = BLOCK_TYPES.STONE; player.x = 50; player.y = F;'); tick(0.6, { KeyS: true });
check('S на переправе — спрыгнул вниз', run('player.y') > run('F') + 0.5);
room(600, 5); run(`for (let x = 48; x <= 53; x++) world[F + 1][x] = BLOCK_TYPES.BRIDGE; player.x = 46.9; player.direction = 1; world[F][48] = BLOCK_TYPES.AIR;`);
run('breakBlock(50, F + 1);');
check('пробелом переправа сматывается целиком, верёвка вернулась', run('(() => { for (let x = 48; x <= 53; x++) if (world[F + 1][x] === BLOCK_TYPES.BRIDGE) return false; return true; })()') && run('ropes') === 4);
room(600, 5); run(`for (let x = 47; x <= 65; x++) world[F + 1][x] = BLOCK_TYPES.AIR; player.x = 45.9; player.direction = 1;`);
check('слишком широко (больше 12) — не тянется, верёвка цела', run('deployBridge()') === 0 && run('ropes') === 3 && notes.some(n => n.includes('Не дотянуть')));
room(600, 5);
check('не у края — подсказка', run('deployBridge()') === 0 && notes.some(n => n.includes('край пропасти')));
check('на телефоне есть кнопка «Перепр.»', /data-key="KeyT"/.test(html));

console.log('Свойства рюкзаков');
room(100); run(`backpackTier = 1; for (let i = 0; i < 3; i++) addToBackpack(BLOCK_TYPES.GOLD); creatures.push(makeCreature('rat', 46.2, F));`);
tick(2);
check('кожаный ранец: крыса не может украсть', run('backpack.gold') === 3 && notes.some(n => n.includes('застёжки')));
room(100); run(`backpackTier = 0; for (let i = 0; i < 3; i++) addToBackpack(BLOCK_TYPES.GOLD); creatures.push(makeCreature('rat', 46.2, F));`);
tick(2);
check('из холщового мешка — крадёт, как раньше', run('backpack.gold') === 2);
room(100); run('backpackTier = 2; for (let i = 0; i < 7; i++) addToBackpack(BLOCK_TYPES.SILVER); for (let i = 0; i < 4; i++) addToBackpack(BLOCK_TYPES.PLATINUM); die("тест");');
check('короб: при смерти половина руды цела (7→3, 4→2)', run('backpack.silver') === 3 && run('backpack.platinum') === 2);
check('сообщение про короб', notes.some(n => n.includes('половина уцелела')));
room(100); run('backpackTier = 2; for (let i = 0; i < 20; i++) addToBackpack(BLOCK_TYPES.PLATINUM);');
const korob = run('walkFactor()');
run('backpackTier = 1;');
check(`в коробе тот же груз замедляет меньше (${korob.toFixed(3)} > ${run('walkFactor()').toFixed(3)})`, korob > run('walkFactor()'));

console.log('Сохранения');
room(100); run('lampTier = 1; lampLit = false; beltTier = 2;');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('SAVE_VERSION = 9, лампа, её огонь и пояс сохраняются', save.version === 9 && save.lamp === 1 && save.lampLit === false && save.belt === 2);
run('lampTier = 0; lampLit = true; beltTier = 0;'); run(`loadSaveData(${JSON.stringify(save)})`);
check('и восстанавливаются', run('lampTier') === 1 && run('lampLit') === false && run('beltTier') === 2);
const v6 = Object.assign({}, save, { version: 6, lamp: true }); delete v6.lampLit; delete v6.belt;
run(`loadSaveData(${JSON.stringify(v6)})`);
check('сохранение v6 с лампой — открытая лампа, зажжена, без пояса', run('lampTier') === 1 && run('lampLit') === true && run('beltTier') === 0);
confirmAnswer = true; run('newGame();'); confirmAnswer = false;
check('новая игра — без лампы и пояса', run('lampTier') === 0 && run('beltTier') === 0);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
