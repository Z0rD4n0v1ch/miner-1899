// Проверки: спички зажигают погасшую лампу (в газу — взрыв); в игре с отладкой достижения не выдаются.
// Запуск: node matches.test.js — гоняет настоящий miner-1899.html в песочнице vm.
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
const els = {}, notes = [], handlers = {}, store = {};
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
    window: { addEventListener(t, f) { handlers[t] = f; } }, location: { search: '?debug=1' },
    requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => true,
    console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = c => vm.runInContext(c, sandbox);
const el = id => els[id] || (els[id] = makeEl());
const press = code => { handlers.keydown({ code, preventDefault() {} }); handlers.keyup({ code }); };
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }
function fresh() {
    run(`generateWorld(3); creatures = []; resetHazards(); keys = {}; gameState.paused = false; resetRun(); debug.on = false; debug.fly = false;
         lampTier = 1; lampLit = false; matches = 0; stats.money = 100; health = maxHealth(); player.x = 50; player.y = DEPTH_ORIGIN + 300;`);
    notes.length = 0; run('liveNotifications.length = 0;');
}

console.log('Спички');
fresh();
check('спичек нет — подсказка купить', run('lightLamp()') === false && notes.some(n => n.includes('Спичек нет')));
check('коробок: 10 спичек за 8 монет', run('buyMatches()') && run('matches') === 10 && run('stats.money') === 92);
press('KeyL');
check('L — лампа зажжена прямо в шахте, спичка потрачена', run('lampLit') && run('matches') === 9);
check('горит — вторую не тратит', run('lightLamp()') === false && run('matches') === 9);
run('lampTier = 0; lampLit = false;');
check('без лампы — нечего зажигать', run('lightLamp()') === false && run('matches') === 9);
fresh(); run('matches = 3; gasClouds.push({ x: player.x + 0.5, y: player.y + 0.5, radius: 3, age: 0 });');
const hp = run('health');
run('lightLamp()');
check('чиркнул спичкой в облаке газа — взрыв', run('health') < hp && notes.some(n => n.includes('подожгла рудничный газ')) && run('gasClouds.length') === 0);
check('лампа после взрыва не горит, спичка потрачена', !run('lampLit') && run('matches') === 2);
fresh(); run('lampTier = 1; lampLit = true; matches = 2; for (let y = player.y - 12; y <= player.y + 1; y++) world[y][50] = BLOCK_TYPES.AIR; world[player.y + 2][50] = BLOCK_TYPES.STONE; player.y = player.y - 10; player.vy = 0; player.onGround = false; fallTop = null;');
run('for (let i = 0; i < 150; i++) updatePlayer(1/60);');
check('погасла от падения — подсказка «зажги спичкой (L)»', !run('lampLit') && notes.some(n => n.includes('зажги спичкой (L)')));
fresh(); run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
check('в лавке «Спички ×10»', el('shopList').children.some(c => c.innerHTML.includes('Спички ×10') && c.innerHTML.includes('buyMatches()')));
run('closeShop(); matches = 4;');
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
run('matches = 0;'); run(`loadSaveData(${JSON.stringify(save)})`);
check('спички в сохранении', save.matches === 4 && run('matches') === 4);
check('на телефоне кнопка 🔥 (клавиша L)', /data-key="KeyL" id="tLight"/.test(html));
run('matches = 5; die("тест");');
check('смерть спички не отнимает', run('matches') === 5);
run('newGame(true)');
check('новая игра — без спичек', run('matches') === 0);

console.log('Отладка и достижения');
fresh(); run('ach.got = {}; ach.counters = {};');
press('Backquote');
check('включил отладку — игра помечена, сообщение', run('debug.on') && run('run.debugUsed') && notes.some(n => n.includes('достижения в ней не выдаются')));
run('player.y = DEPTH_ORIGIN + 785; updateGoal();');
check('телепорт на дно в отладке — «Дно мира» не выдано', !run('ach.got.bottom'));
press('Backquote');
check('выключил отладку — в этой игре всё равно не выдаются', !run('debug.on') && run("unlock('firstOre')") === false && !run('ach.got.firstOre'));
run(`creatures.push(makeCreature('rat', 50, 100)); killCreature(creatures[0]);`);
check('и счётчики не растут', !run('ach.counters.rat'));
const s2 = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('отметка «была отладка» сохраняется — загрузкой не обойти', s2.run.debugUsed === true);
run('newGame(true)');
check('новая игра — снова честная, достижения выдаются', !run('run.debugUsed') && run("unlock('firstOre')") === true);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
