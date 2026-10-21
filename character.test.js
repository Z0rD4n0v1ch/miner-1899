// Проверки персонажа: сила и выносливость, очки за дело, тоники, требования кирок, сохранения.
// Запуск: node character.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
const el = id => els[id] || (els[id] = makeEl());
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }
const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
function fresh() {
    run(`generateWorld(4); creatures = []; resetHazards(); resetDig(); keys = {}; gameState.paused = false;
         Object.assign(hero, { str: 1, end: 1, strPts: 0, endPts: 0 }); stats.money = 0; debt = 0; pickaxeTier = 0; shovelTier = 0;
         backpack = emptyBackpack(); backpackTier = 0; health = maxHealth();`);
    notes.length = 0;
}

console.log('Начало');
fresh();
check('сила и выносливость — 1, очков нет', run('hero.str') === 1 && run('hero.end') === 1 && run('hero.strPts') === 0);
check('на первом уровне всё как раньше: вес 60, удар ×1, копание ×1, здоровье 100',
    run('weightCap()') === 60 && run('hitMult()') === 1 && run('digMult()') === 1 && run('maxHealth()') === 100);

console.log('Очки силы — за вес проданной руды');
fresh(); run('for (let i = 0; i < 5; i++) addToBackpack(BLOCK_TYPES.GOLD); addToBackpack(BLOCK_TYPES.PLATINUM); player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; checkShop();');
check('5 золота (вес 2) + платина (3) — 13 очков силы', run('hero.strPts') === 13);
fresh(); run('for (let i = 0; i < 20; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();');
check('очков хватило на уровень — подсказка купить тоник', run('hero.strPts') === 40 && notes.some(n => n.includes('очков хватает на уровень 2')));

console.log('Очки выносливости — за копание');
fresh();
run('player.x = 50; player.y = DEPTH_ORIGIN + 100; player.direction = 1; world[player.y][51] = BLOCK_TYPES.STONE; world[player.y][50] = BLOCK_TYPES.AIR; dig();');
check('камень — 1 очко', run('hero.endPts') === 1);
run('world[player.y][51] = BLOCK_TYPES.SAND; dig();');
check('мягкая порода — 0.5', run('hero.endPts') === 1.5);
run('world[player.y][51] = BLOCK_TYPES.LADDER; dig(); world[player.y][51] = BLOCK_TYPES.WEB; dig();');
check('снять лестницу или порвать паутину — не работа, очков нет', run('hero.endPts') === 1.5);

console.log('Тоники');
fresh(); run('hero.strPts = 39; stats.money = 1000;');
check('мало очков — тоник не выпить', run("buyTonic('str')") === false && run('hero.str') === 1 && notes.some(n => n.includes('Мало очков')));
run('hero.strPts = 45; stats.money = 100;');
check('мало денег — нельзя', run("buyTonic('str')") === false && notes.some(n => n.includes('Не хватает 20')));
run('stats.money = 1000;');
check('тоник силы: 120 руб., уровень 2, остаток очков сохранился', run("buyTonic('str')") === true && run('hero.str') === 2 && run('stats.money') === 880 && run('hero.strPts') === 5);
check('следующий уровень дороже: 240 руб. и 80 очков', run("tonicPrice('str')") === 240 && run("pointsToNext('str')") === 80);
check('выносливости нужно больше очков: 100 на уровень', run("pointsToNext('end')") === 100);
run('hero.str = 10; hero.strPts = 1e4;');
check('выше 10 нельзя', run("buyTonic('str')") === false && run('hero.str') === 10);
fresh(); run('hero.endPts = 100; stats.money = 200; health = 100;');
run("buyTonic('end')");
check('тоник выносливости: макс. здоровье 110 и +10 сразу', run('maxHealth()') === 110 && run('health') === 110);

console.log('Что дают характеристики');
fresh(); run('hero.str = 10; hero.end = 10;');
check('сила 10: вес 150, удар ×1.9', run('weightCap()') === 150 && near(run('hitMult()'), 1.9));
check('выносливость 10: копание ×1.45, здоровье 190', near(run('digMult()'), 1.45) && run('maxHealth()') === 190);
run('pickaxeTier = 0;');
check('камень копается быстрее в 1.45 раза', near(run('digTime(BLOCK_TYPES.STONE)'), run('rawDigTime(BLOCK_TYPES.STONE)') / 1.45));
check('снять лестницу — как раньше', run('digTime(BLOCK_TYPES.LADDER)') === 0.15);
run('for (let i = 0; i < 20; i++) addToBackpack(BLOCK_TYPES.PLATINUM);');
check(`груз 60 при силе 10 замедляет меньше (${run('walkFactor()').toFixed(2)} против 0.65)`, run('walkFactor()') > 0.8);
run(`creatures.push(makeCreature('spider', player.x + 1.1, player.y)); hitCooldown = 0; tryAttack();`);
check('удар по пауку ржавой киркой: 1 × 1.9', near(run('creatures[0].hp'), 4 - 1.9));
fresh(); run('hero.end = 5; health = 140; hazardClock = 100; lastDamageAt = 0;'); run('for (let i = 0; i < 600; i++) updateHazards(1/60);');
check('здоровье восстанавливается до нового максимума (140)', run('health') === 140);
fresh(); run('hero.end = 3; health = 50; bandages = 1; medkits = 1; hazardClock = 100; lastHealAt = -Infinity;');
run('heal()');
check('аптечка при потере 70 из 120 (лечит до 110)', run('health') === 110);

console.log('Требования кирок');
fresh(); run('stats.money = 10000;');
check('железной нужна сила 2', run('pickReqText(1)') === 'сила 2' && run('buyPickaxe(1)') === false && notes.some(n => n.includes('слишком тяжела')));
run('hero.str = 2;');
check('сила 2 — железная куплена', run('buyPickaxe(1)') === true);
check('стальной нужны сила 4 и выносливость 3', run('pickReqText(2)') === 'сила 4, выносливость 3' && run('buyPickaxe(2)') === false);
run('hero.str = 4; hero.end = 2;');
check('сила есть, выносливости мало — нельзя', run('buyPickaxe(2)') === false);
run('hero.end = 3;');
check('всё есть — стальная', run('buyPickaxe(2)') === true);
check('с алмазным жалом: сила 6, выносливость 5', run('pickReqText(3)') === 'сила 6, выносливость 5');
fresh(); run('stats.money = 10000; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
const item = name => el('shopList').children.find(c => c.innerHTML.includes(name)) || { innerHTML: '' };
check('в лавке у кирки — «Нужна сила 2» вместо кнопки', item('Железная').innerHTML.includes('Нужна сила 2') && !item('Железная').innerHTML.includes('buyPickaxe(1)'));
check('в лавке тоники: пока «Очки 0/40»', item('Тоник силы').innerHTML.includes('Очки 0/40') && item('Тоник выносливости').innerHTML.includes('Очки 0/100'));
run('hero.strPts = 40; renderShopList();');
check('очков хватает — кнопка «Выпить за 120 руб.»', item('Тоник силы').innerHTML.includes("buyTonic('str')"));
run('closeShop()');

console.log('Окно персонажа и панель');
fresh(); handlers.keydown({ code: 'KeyP', preventDefault() {} });
check('P открывает окно, игра на паузе', el('characterModal').classList.contains('active') && run('gameState.paused'));
check('в окне обе характеристики и требования кирок', el('characterInfo').innerHTML.includes('Сила') && el('characterInfo').innerHTML.includes('Выносливость') && el('characterInfo').innerHTML.includes('стальная — сила 4'));
handlers.keydown({ code: 'Escape', preventDefault() {} });
check('ESC закрывает', !el('characterModal').classList.contains('active') && !run('gameState.paused'));
run('hero.strPts = 13; updateUI();');
check('в панели «Сила 1 · 13/40»', el('heroStats').textContent.includes('Сила 1 · 13/40'));
check('кнопка «Персонаж (P)» — под статистикой, а не на панели сохранений', /<div id="sideButtons">\s*<button[^>]*onclick="openCharacter\(\)">👷 Персонаж \(P\)/.test(html) && !/<div id="savePanel">[\s\S]*?openCharacter[\s\S]*?<\/div>/.test(html.split('<div id="radioPanel">')[0].split('<div id="savePanel">')[1] ? '<div id="savePanel">' + html.split('<div id="savePanel">')[1].split('</div>')[0] + '</div>' : ''));

console.log('Смерть и сохранения');
fresh(); run('hero.str = 3; hero.end = 4; hero.strPts = 22; hero.endPts = 77; die("тест");');
check('при смерти ничего не теряется', run('hero.str') === 3 && run('hero.end') === 4 && run('hero.strPts') === 22 && run('hero.endPts') === 77);
check('после смерти здоровье — полный новый максимум (130)', run('health') === 130);
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('SAVE_VERSION = 10, характеристики в сохранении', save.version === 10 && save.hero.str === 3 && save.hero.endPts === 77);
run('Object.assign(hero, { str: 1, end: 1, strPts: 0, endPts: 0 }); health = 50;');
run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { health: 125 }))})`);
check('восстанавливаются, и здоровье выше 100 не обрезается', run('hero.end') === 4 && run('hero.strPts') === 22 && run('health') === 125);
const v7 = Object.assign({}, save, { version: 7 }); delete v7.hero;
check('сохранение v7 — характеристики с первого уровня', run(`loadSaveData(${JSON.stringify(v7)})`) && run('hero.str') === 1 && run('hero.endPts') === 0);
check('мусор — первый уровень', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { hero: { str: 99, end: -1, strPts: 'много' } }))})`) && run('hero.str') === 1 && run('hero.end') === 1 && run('hero.strPts') === 0);
confirmAnswer = true; run('hero.str = 5; newGame();'); confirmAnswer = false;
check('новая игра — с первого уровня', run('hero.str') === 1);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
