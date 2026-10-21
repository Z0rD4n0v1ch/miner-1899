// Проверки целей и финального экрана: выбор цели, прогресс в панели, выполнение каждой цели,
// итоги игры, «играть дальше» и «новая игра», сохранения.
// Запуск: node goals.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const timers = [];
function makeEl() {
    return { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); },
        width: 800, height: 600 };
}
const els = {}, notes = [];
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
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
function fresh(goalId, amount) {
    run(`generateWorld(6); creatures = []; resetHazards(); keys = {}; gameState.paused = false; resetRun(); stats.money = 0; stats.score = 0; debt = 0;
         Object.assign(hero, { str: 1, end: 1, strPts: 0, endPts: 0 }); backpack = emptyBackpack(); backpackTier = 2;
         player.x = SHOP_X + 1; player.y = SURFACE_Y - 1;`);
    run(`chooseGoal(${JSON.stringify(goalId)}, ${amount || 0})`);
    el('finalModal').classList.remove('active');
    notes.length = 0;
}
const frame = () => run('updateGoal()');

console.log('Выбор цели');
check('первая игра без сохранения — сразу предлагается выбрать цель', timers.length >= 1);
timers.forEach(f => f && f());
check('сначала — выбор режима', el('modeModal').classList.contains('active') && run('gameState.paused'));
run('chooseMode(false)');
check('обычная игра — дальше окно выбора цели, игра на паузе', !el('modeModal').classList.contains('active') && el('goalModal').classList.contains('active') && run('gameState.paused'));
const opts = el('goalOptions').innerHTML;
check('пять вариантов: платина, дно, состояние, мастер, свободная', ['Платина наверх', 'Дно шахты', 'Состояние', 'Мастер', 'Свободная игра'].every(t => opts.includes(t)));
check('для «Состояния» три суммы: 10 000, 15 000, 25 000', opts.includes("chooseGoal('wealth', 10000)") && opts.includes("chooseGoal('wealth', 15000)") && opts.includes("chooseGoal('wealth', 25000)"));
check('суммы с монетой', opts.includes('<span class="coin"'));
run("chooseGoal('wealth', 25000)");
check('выбрал — окно закрыто, пауза снята, цель записана', !el('goalModal').classList.contains('active') && !run('gameState.paused') && run('goal.id') === 'wealth' && run('goal.amount') === 25000);
check('сообщение о цели', notes.some(n => n.includes('Цель: Состояние: 25')));
check('чужая сумма не принимается — 15 000', (() => { run("chooseGoal('wealth', 123)"); return run('goal.amount') === 15000; })());
check('неизвестная цель — нет', run("chooseGoal('луна')") === false);

console.log('Состояние');
fresh('wealth', 10000);
run('for (let i = 0; i < 20; i++) addToBackpack(BLOCK_TYPES.PLATINUM); sellBackpack(); updateUI();');
check('продал на 1600 — в панели «Заработано 1 600 / 10 000»', el('goalStat').textContent.includes('Заработано 1') && el('goalStat').textContent.includes('600 / 10'));
frame();
check('пока не выполнена', !run('goal.done'));
run('debt = 500; for (let i = 0; i < 20; i++) addToBackpack(BLOCK_TYPES.PLATINUM); sellBackpack();');
check('выручка в счёт долга тоже считается заработком', run('run.earned') === 3200);
run('run.earned = 9990; for (let i = 0; i < 2; i++) addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();'); frame();
check('набрал 10 000 — цель выполнена, финальный экран', run('goal.done') && el('finalModal').classList.contains('active') && run('gameState.paused'));

console.log('Финальный экран');
const fin = el('finalInfo').innerHTML;
check('итоги: цель, время, глубина, заработано, очки, смерти, твари, кирка, характеристики',
    ['Цель', 'Время игры', 'Глубже всего', 'Заработано', 'Очки', 'Смертей', 'Побеждено тварей', 'Кирка', 'Сила / выносливость'].every(t => fin.includes(t)));
run('continueAfterFinal()');
check('«Играть дальше» — игра идёт, экран закрыт', !el('finalModal').classList.contains('active') && !run('gameState.paused'));
frame(); run('updateUI()');
check('второй раз финал не показывается, в панели «выполнена ✓»', !el('finalModal').classList.contains('active') && el('goalStat').textContent.includes('выполнена ✓'));

console.log('Платина наверх');
fresh('platinum');
run('addToBackpack(BLOCK_TYPES.GOLD); sellBackpack();'); frame();
check('продал золото — ещё нет', !run('goal.done'));
run('addToBackpack(BLOCK_TYPES.PLATINUM); sellBackpack();'); frame();
check('продал платину — выполнена', run('goal.done') && el('finalModal').classList.contains('active'));

console.log('Дно шахты');
fresh('bottom');
run('player.y = DEPTH_ORIGIN + 500;'); frame(); run('updateUI()');
check('на 500 м — прогресс «500/780 м»', el('goalStat').textContent.includes('500/780 м') && !run('goal.done'));
run('player.y = DEPTH_ORIGIN + 785;'); frame();
check('дно взято — подсказка подниматься', run('run.reachedBottom') && notes.some(n => n.includes('живым наверх')) && !run('goal.done'));
run('die("тест")');
check('погиб после дна — дно не засчитано, смерть посчитана', !run('run.reachedBottom') && run('run.deaths') === 1);
frame();
check('после смерти на поверхности — не выполнена', !run('goal.done'));
run('player.y = DEPTH_ORIGIN + 785;'); frame(); run('player.y = SURFACE_Y - 1;'); frame();
check('снова дно и живым наверх — выполнена', run('goal.done'));
check('глубже всего — 785 м', run('run.maxDepth') === 785);

console.log('Мастер');
fresh('master');
run('hero.str = 10; hero.end = 9;'); frame();
check('сила 10, выносливость 9 — ещё нет', !run('goal.done'));
run('hero.end = 10;'); frame();
check('обе 10 — выполнена', run('goal.done'));

console.log('Свободная игра и счётчики');
fresh('free');
run('run.earned = 1e6; hero.str = 10; hero.end = 10; player.y = SURFACE_Y - 1; run.reachedBottom = true;'); frame();
check('свободная игра не заканчивается', !run('goal.done') && !el('finalModal').classList.contains('active'));
run(`creatures.push(makeCreature('rat', 50, 100)); killCreature(creatures[0]);`);
check('побеждённые твари считаются', run('run.kills') === 1);

console.log('Новая игра и сохранения');
fresh('wealth', 15000); run('run.earned = 777; run.kills = 3; run.maxDepth = 321;');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('SAVE_VERSION = 10: цель и итоги в сохранении', save.version === 10 && save.goal.id === 'wealth' && save.goal.amount === 15000 && save.run.earned === 777);
run("chooseGoal('free'); resetRun();"); run(`loadSaveData(${JSON.stringify(save)})`);
check('восстанавливаются', run('goal.id') === 'wealth' && run('goal.amount') === 15000 && run('run.kills') === 3 && run('run.maxDepth') === 321);
const v8 = Object.assign({}, save, { version: 8 }); delete v8.goal; delete v8.run;
check('сохранение v8 — свободная игра, итоги с нуля', run(`loadSaveData(${JSON.stringify(v8)})`) && run('goal.id') === 'free' && run('run.earned') === 0);
check('мусор — свободная игра', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { goal: { id: 'x' }, run: { earned: -5 } }))})`) && run('goal.id') === 'free' && run('run.earned') === 0);
timers.length = 0; confirmAnswer = true; run('newGame();'); confirmAnswer = false;
check('новая игра — итоги с нуля, свободная до выбора', run('run.earned') === 0 && run('goal.id') === 'free');
timers.forEach(f => f && f()); run('chooseMode(false)');
check('и сразу выбор режима, затем цели', el('goalModal').classList.contains('active'));
run("chooseGoal('bottom')");
fresh('platinum'); run('goal.done = true; showFinal();'); timers.length = 0;
run('newGameAfterFinal()'); timers.forEach(f => f && f());
check('«Новая игра» на финальном экране — без лишнего вопроса, сразу выбор режима', !el('finalModal').classList.contains('active') && el('modeModal').classList.contains('active') && run('run.earned') === 0);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
