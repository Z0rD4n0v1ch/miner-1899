// Проверки режима «хардкор»: выбор режима, «одна жизнь», «суровый», только автосохранение,
// очки ×1.5, усложнения (без лечения, без клети, злые твари, темнота), сохранения.
// Запуск: node hardcore.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const timers = [], store = {}, fills = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => k === 'fillRect' ? (x, y, w, h) => fills.push([t.fillStyle, w, h]) :
        k === 'createRadialGradient' ? () => ({ stops: [], addColorStop(o, c) { this.stops.push(c); } }) : (k in t ? t[k] : () => {}),
    set: (t, k, v) => (t[k] = v, true)
});
function makeEl() {
    return { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', checked: false, style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {}, getContext() { return ctxStub; }, width: 800, height: 600 };
}
const els = {}, notes = [];
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {},
    setTimeout: f => { timers.push(f); return timers.length; }, clearTimeout() {},
    confirm: () => confirmAnswer, console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = c => vm.runInContext(c, sandbox);
const el = id => els[id] || (els[id] = makeEl());
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }
function start(hardcore, opts) {
    run(`generateWorld(8); creatures = []; resetHazards(); keys = {}; gameOver = false; resetRun(); stats.score = 0; stats.money = 0;
         Object.assign(hero, { str: 3, end: 4, strPts: 50, endPts: 70 }); backpack = emptyBackpack(); health = maxHealth();
         player.x = 50; player.y = DEPTH_ORIGIN + 300;`);
    run(`chooseMode(${hardcore}, ${JSON.stringify(opts || {})}); chooseGoal('free');`);
    el('finalModal').classList.remove('active');
    notes.length = 0;
}

console.log('Выбор режима');
timers.forEach(f => f && f());
check('при первом запуске сначала выбор режима', el('modeModal').classList.contains('active') && run('gameState.paused'));
check('две кнопки: обычная игра и хардкор', /chooseMode\(false\)/.test(html) && /showHardcoreOptions\(\)/.test(html));
run('showHardcoreOptions()');
check('хардкор — открываются варианты и усложнения', el('hcOptions').style.display === '');
el('hcHarsh').checked = true; el('hcNoCage').checked = true; el('hcDark').checked = true;
run('startHardcoreFromForm()');
check('форма: суровый, без клети, темнота — записано', run('mode.hardcore') && run('mode.variant') === 'harsh' && run('mode.noCage') && run('mode.dark') && !run('mode.noRegen') && !run('mode.fierce'));
check('после режима — выбор цели', !el('modeModal').classList.contains('active') && el('goalModal').classList.contains('active'));
run("chooseGoal('free')");
check('в обычной игре усложнений не бывает', (() => { run('chooseMode(false, { noCage: true, dark: true })'); return !run('mode.hardcore') && !run('mode.noCage') && !run('mode.dark'); })());
run("chooseGoal('free')");

console.log('Одна жизнь');
start(true, { variant: 'oneLife' });
store.miner_autosave = '{"x":1}';
run('for (let i = 0; i < 3; i++) addToBackpack(BLOCK_TYPES.GOLD); die("Лава");');
check('смерть — игра окончена', run('gameOver') && run('gameState.paused'));
check('экран «Шахта забрала тебя» с причиной', el('finalModal').classList.contains('active') && el('finalTitle').textContent.includes('Шахта забрала') && el('finalInfo').innerHTML.includes('Лава'));
check('кнопки «Играть дальше» нет', el('finalContinue').style.display === 'none');
check('«Играть дальше» не срабатывает', (() => { run('continueAfterFinal()'); return run('gameState.paused') && el('finalModal').classList.contains('active'); })());
check('автосохранение удалено — не вернуться', !('miner_autosave' in store));
run('autoSave()');
check('и новое не пишется', !('miner_autosave' in store));
check('в итогах режим «хардкор: одна жизнь»', el('finalInfo').innerHTML.includes('Хардкор: одна жизнь'));
timers.length = 0; run('newGameAfterFinal()'); timers.forEach(f => f && f());
check('«Новая игра» — снова выбор режима, игра не окончена', el('modeModal').classList.contains('active') && !run('gameOver'));

console.log('Суровый');
start(true, { variant: 'harsh' });
run('die("Обвал")');
check('игра продолжается', !run('gameOver') && !el('finalModal').classList.contains('active'));
check('очки сгорели, сила и выносливость −1', run('hero.str') === 2 && run('hero.end') === 3 && run('hero.strPts') === 0 && run('hero.endPts') === 0);
check('сообщение', notes.some(n => n.includes('Суровый хардкор')));
run('Object.assign(hero, { str: 1, end: 1 }); die("x");');
check('ниже первого уровня не падает', run('hero.str') === 1 && run('hero.end') === 1);
start(false);
run('die("Лава")');
check('в обычной игре всё как раньше', !run('gameOver') && run('hero.str') === 3 && run('hero.strPts') === 50);

console.log('Только автосохранение');
start(true, { variant: 'harsh' });
for (const fn of ['saveGame', 'loadGame', 'exportSave', 'importSave']) {
    notes.length = 0; run(`liveNotifications.length = 0; ${fn}()`);
    check(`${fn} в хардкоре — нельзя`, notes.some(n => n.includes('только автосохранение')));
}
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('режим в сохранении (SAVE_VERSION 10)', save.version === 10 && save.mode.hardcore === true && save.mode.variant === 'harsh');
start(false);
check('хардкор-сохранение из слота или файла не загружается', run(`loadSaveData(${JSON.stringify(save)})`) === false && notes.some(n => n.includes('только из автосохранения')));
check('из автосохранения — продолжается', run(`loadSaveData(${JSON.stringify(save)}, true)`) === true && run('mode.hardcore') && run('mode.variant') === 'harsh');
const v9 = Object.assign({}, save, { version: 9 }); delete v9.mode;
start(false);
check('сохранение v9 — обычная игра', run(`loadSaveData(${JSON.stringify(v9)})`) === true && !run('mode.hardcore'));

console.log('Очки ×1.5');
start(true, {});
run('player.x = 50; player.y = DEPTH_ORIGIN + 300; player.direction = 1; world[player.y][51] = BLOCK_TYPES.SILVER; world[player.y][50] = BLOCK_TYPES.AIR; dig();');
check('серебро: 25 × 1.5 = 38 очков', run('stats.score') === 38);
start(false);
run('player.x = 50; player.y = DEPTH_ORIGIN + 300; player.direction = 1; world[player.y][51] = BLOCK_TYPES.SILVER; world[player.y][50] = BLOCK_TYPES.AIR; dig();');
check('в обычной — 25', run('stats.score') === 25);

console.log('Усложнения');
start(true, { noRegen: true });
run('health = 50; hazardClock = 100; lastDamageAt = 0; for (let i = 0; i < 600; i++) updateHazards(1/60);');
check('без восстановления: здоровье не растёт', run('health') === 50);
run('bandages = 1; lastHealAt = -Infinity; heal();');
check('бинты работают', run('health') === 75);
start(true, { noCage: true });
check('клеть не ходит', run('openCage()') === false && run('callCage()') === false && notes.some(n => n.includes('клеть не ходит')));
start(true, { fierce: true });
run(`creatures.push(makeCreature('spider', player.x + 0.3, player.y)); creatures[0].bite = 0; tryBite(creatures[0]);`);
check('злые твари: паук кусает на 22.5 вместо 15', Math.abs(run('health') - (run('maxHealth()') - 22.5)) < 1e-9);
check('и чаще (перерыв 1 с вместо 1.5)', Math.abs(run('creatures[0].bite') - 1) < 1e-9);
start(true, { dark: true });
fills.length = 0; run('updateCamera(); render();');
check('темнота: поверх шахты — затемнение во весь экран', fills.some(f => f[1] === 800 && f[2] === 600 && typeof f[0] === 'object'));
run('player.y = SURFACE_Y - 1; updateCamera();'); fills.length = 0; run('render()');
check('на поверхности темноты нет', !fills.some(f => f[1] === 800 && f[2] === 600 && typeof f[0] === 'object'));
start(false, {}); run('player.y = DEPTH_ORIGIN + 300; updateCamera();'); fills.length = 0; run('render()');
check('в обычной игре темноты нет', !fills.some(f => f[1] === 800 && f[2] === 600 && typeof f[0] === 'object'));

console.log('Панель и итоги');
start(true, { variant: 'oneLife', dark: true }); run('updateUI()');
check('в панели цели — значок 💀', el('goalStat').textContent.startsWith('💀'));
check('название режима с усложнениями', run('modeTitle()') === '💀 Хардкор: одна жизнь · темнота');
run("chooseGoal('master'); hero.str = 10; hero.end = 10; updateGoal();");
check('цель в хардкоре: финальный экран с режимом', el('finalModal').classList.contains('active') && el('finalInfo').innerHTML.includes('Хардкор'));
check('и «Играть дальше» доступно — жизнь не кончилась', el('finalContinue').style.display === '');

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
