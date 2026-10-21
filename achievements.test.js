// Проверки достижений: условия всех 20, общие для всех игр (не теряются при новой игре),
// счётчики, окно со списком, хранение отдельно от сохранений.
// Запуск: node achievements.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
function boot(store) {
    const els = {}, notes = [], handlers = {};
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild(n) { notes.push(n.textContent); } } },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        window: { addEventListener(t, f) { handlers[t] = f; } }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {},
        confirm: () => true, console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), el: id => els[id] || (els[id] = makeEl()), notes, handlers };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }
const store = {};
let g = boot(store);
const has = id => g.run(`!!ach.got['${id}']`);
function fresh() {
    g.run(`generateWorld(9); creatures = []; resetHazards(); keys = {}; gameState.paused = false; resetRun(); stats.money = 0; debt = 0;
           Object.assign(hero, { str: 1, end: 1, strPts: 0, endPts: 0 }); backpack = emptyBackpack(); backpackTier = 0; pickaxeTier = 3;
           Object.assign(mode, { hardcore: false, variant: 'oneLife' }); gameOver = false; Object.assign(goal, { id: 'free', amount: 0, done: false });
           player.x = 50; player.y = DEPTH_ORIGIN + 100; player.direction = 1; player.climbing = false; trip.maxDepth = 0; trip.gear = false;`);
}
const dig = block => g.run(`world[player.y][51] = BLOCK_TYPES.${block}; world[player.y][50] = BLOCK_TYPES.AIR; dig();`);

console.log('Список');
check('20 достижений в 6 группах', g.run('ACHIEVEMENTS.length') === 20 && new Set(g.run('ACHIEVEMENTS.map(a => a.group)')).size === 6);
check('сначала ни одного', g.run('Object.keys(ach.got).length') === 0);

console.log('Шахта');
fresh(); dig('STONE');
check('камень — не руда', !has('firstOre'));
dig('GOLD');
check('Первая жила — первая руда', has('firstOre') && g.notes.some(n => n === '🏅 Достижение: Первая жила'));
for (const [d, id] of [[200, 'clay'], [400, 'granite'], [600, 'fire'], [785, 'bottom']]) {
    g.run(`player.y = DEPTH_ORIGIN + ${d}; updateGoal();`);
    check(`${d} м — ${id}`, has(id));
}
fresh(); g.run('player.y = DEPTH_ORIGIN + 60; updateGoal(); player.y = DEPTH_ORIGIN + 20; updateGoal(); player.y = SURFACE_Y - 1; updateGoal();');
check('Ступенька за ступенькой — с 60 м наверх без снаряжения', has('stairs'));
g.run("delete ach.got.stairs;");
fresh(); g.run('player.y = DEPTH_ORIGIN + 60; updateGoal(); player.climbing = true; updateGoal(); player.climbing = false; player.y = SURFACE_Y - 1; updateGoal();');
check('по лестнице — не засчитывается', !has('stairs'));
fresh(); g.run('player.y = DEPTH_ORIGIN + 30; updateGoal(); player.y = SURFACE_Y - 1; updateGoal();');
check('с 30 м — мелко', !has('stairs'));
fresh(); g.run('player.y = DEPTH_ORIGIN + 80; updateGoal(); stats.money = 999; openCage(); rideCage(); updateGoal();');
check('клетью — не засчитывается', !has('stairs'));
fresh(); g.run('player.y = DEPTH_ORIGIN + 55; updateGoal(); player.y = SURFACE_Y - 1; updateGoal();');
check('снова сам с 55 м — засчитано', has('stairs'));

console.log('Руда');
fresh(); dig('DIAMOND'); dig('EMERALD');
check('Первый алмаз и Изумрудный блеск', has('diamond') && has('emerald') && !has('platinum'));
dig('PLATINUM');
check('Платиновая жила', has('platinum'));
fresh(); g.run('backpackTier = 1; for (let i = 0; i < 35; i++) addToBackpack(BLOCK_TYPES.COAL); sellBackpack();');
check('полный ранец — ещё не короб', !has('fullKorob'));
g.run('backpackTier = 2; for (let i = 0; i < 50; i++) addToBackpack(BLOCK_TYPES.COAL); sellBackpack();');
check('Полный короб — 50 штук за раз', has('fullKorob'));

console.log('Деньги и снаряжение');
fresh(); g.run('run.earned = 999; updateGoal();');
check('999 — ещё нет', !has('earn1000'));
g.run('run.earned = 1000; updateGoal();');
check('Первая тысяча', has('earn1000') && !has('earn10000'));
g.run('run.earned = 10000; updateGoal();');
check('Купец', has('earn10000'));
fresh(); g.run('debt = 80; for (let i = 0; i < 5; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();');
check('долг погашен не до конца — нет', !has('debtFree'));
g.run('for (let i = 0; i < 10; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();');
check('Без долгов', has('debtFree'));
fresh(); g.run('pickaxeTier = 2; Object.assign(hero, { str: 6, end: 5 }); stats.money = 5000; buyPickaxe(3);');
check('Алмазное жало', has('diamondPick'));
fresh(); g.run('Object.assign(hero, { str: 5, end: 4 }); updateGoal();');
check('сила 5, выносливость 4 — нет', !has('allRounder'));
g.run('hero.end = 5; updateGoal();');
check('Мастер на все руки', has('allRounder'));

console.log('Твари');
fresh();
for (let i = 0; i < 9; i++) g.run(`creatures.push(makeCreature('rat', 50, 100)); killCreature(creatures[creatures.length - 1]);`);
check('9 крыс — нет, счётчик 9', !has('rats') && g.run('ach.counters.rat') === 9);
g.run('openAchievements()');
check('в окне прогресс «9/10»', g.el('achievementsInfo').innerHTML.includes('(9/10)'));
g.run('closeAchievements()');
g.run(`creatures.push(makeCreature('rat', 50, 100)); killCreature(creatures[creatures.length - 1]);`);
check('Крысолов — 10 крыс', has('rats'));
for (let i = 0; i < 10; i++) g.run(`creatures.push(makeCreature('spider', 50, 100)); killCreature(creatures[creatures.length - 1]);`);
check('Гроза пауков', has('spiders'));
g.run(`creatures.push(makeCreature('salamander', 50, 100, { home: 100 })); killCreature(creatures[creatures.length - 1]);`);
check('Укротитель огня', has('salamander'));

console.log('Риск');
fresh(); g.run('health = 30; gasBlast(50, 100);');
check('взрыв убил — не «пережил»', !has('gasSurvivor'));
fresh(); g.run('health = 100; gasBlast(50, 100);');
check('Пережил газ', has('gasSurvivor'));
fresh(); g.run("Object.assign(mode, { hardcore: true, variant: 'harsh' }); goal.id = 'master'; goal.done = false; hero.str = 10; hero.end = 10; updateGoal();");
check('цель в «суровом» — не «Железный шахтёр»', !has('ironMiner'));
g.run('continueAfterFinal()');
fresh(); g.run("Object.assign(mode, { hardcore: true, variant: 'oneLife' }); goal.id = 'free'; hero.str = 10; hero.end = 10; updateGoal();");
check('свободная игра в хардкоре — нет', !has('ironMiner'));
g.run("goal.id = 'master'; goal.done = false; updateGoal();");
check('Железный шахтёр — цель в «одной жизни»', has('ironMiner'));
g.run('continueAfterFinal()');

console.log('Общие для всех игр');
const count = g.run('Object.keys(ach.got).length');
check(`получено ${count} из 20`, count === 20);
g.run('newGame(true)');
check('новая игра — достижения на месте', g.run('Object.keys(ach.got).length') === 20);
const g2 = boot(store);
check('после перезапуска — тоже (хранятся в браузере)', g2.run('Object.keys(ach.got).length') === 20 && g2.run('ach.counters.rat') === 10);
check('в сохранение игры не попадают', !('ach' in JSON.parse(g2.run('JSON.stringify(createSaveData("t"))'))) && !('achievements' in JSON.parse(g2.run('JSON.stringify(createSaveData("t"))'))));
g2.notes.length = 0; g2.run("unlock('firstOre')");
check('повторно не выдаются', g2.notes.length === 0);
const g3 = boot({ miner_achievements: '{"got":{"firstOre":123,"выдумка":5,"diamond":"вчера"},"counters":{"rat":-3,"spider":4}}' });
check('мусор отбрасывается', g3.run('Object.keys(ach.got).join()') === 'firstOre' && g3.run('ach.counters.spider') === 4 && g3.run('ach.counters.rat') === undefined);
check('битые — без ошибок', boot({ miner_achievements: 'не json' }).run('Object.keys(ach.got).length') === 0);

console.log('Окно');
g.run('openAchievements()');
check('открывается, игра на паузе', g.el('achievementsModal').classList.contains('active') && g.run('gameState.paused'));
check('«Получено 20 из 20», группы и даты', g.el('achievementsInfo').innerHTML.includes('Получено 20 из 20') && g.el('achievementsInfo').innerHTML.includes('🐀 Твари'));
g.handlers.keydown({ code: 'Escape', preventDefault() {} });
check('ESC закрывает', !g.el('achievementsModal').classList.contains('active') && !g.run('gameState.paused'));
check('кнопка «🏅 Достижения» под статистикой', /<div id="sideButtons">[\s\S]*?openAchievements\(\)">🏅 Достижения/.test(html));

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
