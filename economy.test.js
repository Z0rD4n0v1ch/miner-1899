// Проверки: монеты вместо «руб.», склейка одинаковых уведомлений, «хватит на N уровней»,
// золото глубже (стимул спускаться).
// Запуск: node economy.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const timers = [];
function makeEl() {
    return { _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [], offsetHeight: 40,
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() { this.removed = true; }, focus() {}, click() {},
        getContext() { return new Proxy({}, { get: (t, k) => k in t ? t[k] : () => ({ addColorStop() {} }), set: (t, k, v) => (t[k] = v, true) }); },
        width: 800, height: 600 };
}
const els = {}, notes = [];
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild(n) { notes.push(n); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {},
    setTimeout: (f) => { timers.push(f); return timers.length; }, clearTimeout: (id) => { timers[id - 1] = null; },
    confirm: () => false, console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = c => vm.runInContext(c, sandbox);
const el = id => els[id] || (els[id] = makeEl());
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

console.log('Монеты');
const visibleRub = script.split('\n').filter(l => /\d\s*\}?\s*руб\.|\bруб\.\s*[`<]|\$\{[^}]+\} руб/.test(l));
check('в игре больше нигде не пишется «руб.»', visibleRub.length === 0 && !/>0 руб\.</.test(html));
check('монета нарисована стилями — видна в любой системе', /\.coin \{[\s\S]*?border-radius: 50%[\s\S]*?radial-gradient/.test(html));
run('stats.money = 125; debt = 0; updateUI();');
check('в панели «125» и значок монеты', el('money').textContent === '125 ¤' && el('money').innerHTML === '125 <span class="coin" role="img" aria-label="монет"></span>');
run('showNotification("💰 Продано: 3 шт. за 24 ¤")');
const n = notes[notes.length - 1];
check('в уведомлении сумма с монетой', n.innerHTML.includes('24 <span class="coin"'));
check('текст уведомления экранирован', (() => { run('showNotification("<b>x</b> 5 ¤")'); return notes[notes.length - 1].innerHTML.startsWith('&lt;b&gt;x&lt;/b&gt;'); })());
run('player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
check('в лавке цены с монетой', el('shopList').children.some(c => c.innerHTML.includes('<span class="coin"')) && !el('shopList').children.some(c => c.innerHTML.includes('руб.')));
run('closeShop()');

console.log('Одинаковые уведомления — одно с «×N»');
notes.length = 0; run('liveNotifications.length = 0;');
run('for (let i = 0; i < 4; i++) showNotification("🎒 Выбросил уголь ради: золото");');
check('четыре одинаковых — одно уведомление', notes.length === 1);
check('с отметкой ×4', notes[0].textContent === '🎒 Выбросил уголь ради: золото ×4');
run('showNotification("⚠️ Потолок трещит!")');
check('другое сообщение — отдельно', notes.length === 2);
const firstTimer = timers.length;
run('showNotification("🎒 Выбросил уголь ради: золото")');
check('повтор продлевает показ (старый таймер отменён)', timers.filter(Boolean).length >= 2 && notes[0].textContent.endsWith('×5'));
timers.forEach(f => f && f());
check('по таймеру исчезают', run('liveNotifications.length') === 0);
run('showNotification("🎒 Выбросил уголь ради: золото")');
check('после исчезновения — снова без «×»', notes[notes.length - 1].textContent === '🎒 Выбросил уголь ради: золото');

console.log('Хватит на N уровней');
run('Object.assign(hero, { str: 3, end: 3, strPts: 298, endPts: 956 });');
check('сила 3, 298 очков — хватит на 2 уровня (120 + 160)', run("levelsAvailable('str')") === 2);
check('выносливость 3, 956 — на 2 уровня (300 + 400)', run("levelsAvailable('end')") === 2);
check('тоники на них: 360 + 480 = 840', run("tonicsCost('str')") === 840);
run('updateUI(); renderCharacter();');
check('в панели «↑2»', el('heroStats').textContent.includes('Сила 3 · 298/120 ↑2'));
check('в окне персонажа — «хватит ещё на 2 ур.» и цена тоников', el('characterInfo').innerHTML.includes('хватит ещё на 2 ур.') && el('characterInfo').innerHTML.includes('840<span class="coin"'));
run('hero.strPts = 10; updateUI();');
check('не хватает — без «↑»', !el('heroStats').textContent.includes('Сила 3 · 10/120 ↑'));
run('hero.str = 10; hero.strPts = 1e5;');
check('на 10 уровне — 0', run("levelsAvailable('str')") === 0);

console.log('Золото глубже');
const bands = run(`(() => { const b = [0, 0, 0, 0]; for (const seed of [1, 2, 3]) { generateWorld(seed);
    for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) { const o = ORES[world[y][x]]; if (!o) continue;
        const d = Math.floor((y - DEPTH_ORIGIN) / 100); if (d >= 0 && d < 4) b[d] += o.price; } } return b.map(v => Math.round(v / 3)); })()`);
check(`у поверхности руды меньше всего (по 100 м: ${bands.join(' / ')} монет)`, bands[0] < bands[1]);
check('в Глиняных штольнях (200–300 м) выгоднее, чем выше', bands[2] > bands[1]);
check('а ещё глубже — ещё выгоднее', bands[3] > bands[2]);
check('серебро подорожало: 20', run('ORES[BLOCK_TYPES.SILVER].price') === 20);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
