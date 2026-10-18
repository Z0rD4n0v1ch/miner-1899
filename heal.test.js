// Проверки лечения (бинты, аптечки) и стальной лопаты.
// Запуск: node heal.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
    confirm: () => confirmAnswer, console, Date, Math, JSON, Object, Proxy, Number, Set
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);
const press = code => { handlers.keydown({ code, preventDefault() {} }); handlers.keyup({ code }); };

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
function fresh() {
    run(`generateWorld(3); creatures = []; resetHazards(); resetDig(); keys = {}; gameState.paused = false;
         bandages = 0; medkits = 0; stats.money = 0; hazardClock = 100; lastHealAt = -Infinity;
         pickaxeTier = 0; shovelTier = 0; debt = 0; player.x = 50; player.y = DEPTH_ORIGIN + 100;`);
    notes.length = 0;
}
const cool = () => run('hazardClock += 2;');

console.log('Лечение');
fresh(); run('health = 50;');
check('нечем лечиться — подсказка про лавку', run('heal()') === false && notes.some(n => n.includes('Нечем лечиться')));
fresh(); run('bandages = 2;');
check('при полном здоровье не тратится', run('heal()') === false && run('bandages') === 2 && notes.some(n => n.includes('и так здоров')));
run('health = 50;');
check('бинт: +25', run('heal()') === 'bandage' && run('health') === 75 && run('bandages') === 1);
check('не чаще раза в секунду', run('heal()') === false && run('bandages') === 1);
cool(); run('health = 90;'); run('heal()');
check('не выше 100', run('health') === 100 && run('bandages') === 0);
fresh(); run('bandages = 1; medkits = 1; health = 80;');
check('мало потерял — тратится бинт, аптечка бережётся', run('heal()') === 'bandage' && run('medkits') === 1 && run('health') === 100);
fresh(); run('bandages = 1; medkits = 1; health = 30;');
check('много потерял — аптечка: +60', run('heal()') === 'medkit' && run('health') === 90 && run('bandages') === 1);
fresh(); run('medkits = 1; health = 85;');
check('бинтов нет — аптечка и при малой потере', run('heal()') === 'medkit' && run('health') === 100);
fresh(); run('bandages = 1; health = 40;');
press('KeyH');
check('клавиша H лечит', run('health') === 65 && notes.some(n => n.includes('Бинт: +25')));
fresh(); run('bandages = 1; health = 40; gameState.paused = true;');
press('KeyH');
check('на паузе (в лавке) H не лечит', run('health') === 40);
fresh(); run(`health = 20; medkits = 1; globalThis.F = DEPTH_ORIGIN + 700;
     for (let y = F - 4; y <= F + 1; y++) for (let x = 40; x <= 60; x++) world[y][x] = y === F + 1 ? BLOCK_TYPES.STONE : BLOCK_TYPES.AIR;
     player.x = 50; player.y = F;`);
run('heal(); for (let i = 0; i < 60; i++) updateHazards(1/60);');
check('лечиться можно и в жару на Огненном дне', run('health') > 79 && run('health') < 80);

console.log('Покупка и интерфейс');
fresh(); run('stats.money = 100;');
check('бинт за 15', run("buyMed('bandage')") === true && run('bandages') === 1 && run('stats.money') === 85);
check('аптечка за 40', run("buyMed('medkit')") === true && run('medkits') === 1 && run('stats.money') === 45);
run('stats.money = 10;');
check('без денег не купить', run("buyMed('medkit')") === false && run('medkits') === 1);
run('updateUI()');
check('в панели «бинты 1 · аптечки 1»', els.meds.textContent === 'бинты 1 · аптечки 1');
run('bandages = 0; medkits = 0; updateUI();');
check('пусто — прочерк', els.meds.textContent === '—');
fresh(); run('stats.money = 1000; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
const item = name => els.shopList.children.find(c => c.innerHTML.includes(name)) || { innerHTML: '' };
check('в лавке бинт и аптечка', item('Бинт').innerHTML.includes("buyMed('bandage')") && item('Аптечка').innerHTML.includes("buyMed('medkit')"));
run('closeShop()');

console.log('Стальная лопата');
fresh();
check('две лопаты: обычная за 40, стальная за 300', run('SHOVELS.length') === 3 && run('SHOVELS[2].price') === 300 && run('SHOVELS[2].name') === 'Стальная лопата');
run('shovelTier = 2;');
check('копает землю за 0.08 с', Math.abs(run('digTime(BLOCK_TYPES.DIRT)') - 0.08) < 1e-9);
check('гравий за 0.2 с', Math.abs(run('digTime(BLOCK_TYPES.GRAVEL)') - 0.2) < 1e-9);
run('pickaxeTier = 3;');
check('даже с лучшей киркой мягкую породу копает лопата', run('toolFor(BLOCK_TYPES.GRAVEL)') === 'shovel' && run('toolFor(BLOCK_TYPES.DIRT)') === 'shovel');
check('камень по-прежнему киркой', run('toolFor(BLOCK_TYPES.STONE)') === 'pickaxe');
fresh(); run('stats.money = 350;');
check('можно купить сразу стальную', run('buyShovel(2)') === true && run('shovelTier') === 2 && run('stats.money') === 50);
check('обычную после стальной не купить', run('buyShovel(1)') === false);
fresh(); run('stats.money = 100; shovelTier = 1;');
check('с обычной на стальную — нужно 300', run('buyShovel(2)') === false && notes.some(n => n.includes('Не хватает 200')));
fresh();
check('стальную в долг не дают', run('takeShovelOnCredit(2)') === false && run('debt') === 0);
check('обычную в долг — по-прежнему можно', run('takeShovelOnCredit(1)') === true && run('debt') === 80);
fresh(); run('stats.money = 0; shovelTier = 1; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
const steel = item('Стальная лопата');
check('в лавке стальная: «в 10 раз быстрее ржавой кирки», без кнопки «в долг»',
    steel.innerHTML.includes('в 10 раз быстрее') && !steel.innerHTML.includes('В долг'));
run('closeShop(); shovelTier = 2; updateUI();');
check('в панели «Стальная лопата»', els.shovel.textContent === 'Стальная лопата');

console.log('Сохранения и смерть');
fresh(); run('bandages = 3; medkits = 2; shovelTier = 2;');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('лечение и стальная лопата в сохранении', save.bandages === 3 && save.medkits === 2 && save.shovel === 2);
run('bandages = 0; medkits = 0; shovelTier = 0;'); run(`loadSaveData(${JSON.stringify(save)})`);
check('и восстанавливаются', run('bandages') === 3 && run('medkits') === 2 && run('shovelTier') === 2);
const old = Object.assign({}, save); delete old.bandages; delete old.medkits;
check('старое сохранение — без бинтов и аптечек', run(`loadSaveData(${JSON.stringify(old)})`) && run('bandages') === 0 && run('medkits') === 0);
check('мусор — ноль', run(`loadSaveData(${JSON.stringify(Object.assign({}, save, { bandages: -1, medkits: 'много' }))})`) && run('bandages') === 0 && run('medkits') === 0);
run('bandages = 2; medkits = 1; die("тест");');
check('смерть бинты и аптечки не отнимает', run('bandages') === 2 && run('medkits') === 1);
confirmAnswer = true; run('newGame();'); confirmAnswer = false;
check('новая игра — без них', run('bandages') === 0 && run('medkits') === 0);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
