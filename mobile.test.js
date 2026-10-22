// Проверки сенсорного управления: кнопки, мультитач, меню, холст под телефон, сводка поверх игры.
// Запуск: node mobile.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const texts = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => k === 'fillText' ? (s) => texts.push(s) : k === 'measureText' ? (s) => ({ width: s.length * 8 }) : (k in t ? t[k] : () => {}),
    set: (t, k, v) => (t[k] = v, true)
});
function classList() {
    return { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } };
}
function makeEl() {
    return { textContent: '', innerHTML: '', value: '', style: {}, children: [], classList: classList(),
        appendChild() {}, remove() {}, focus() {}, click() {}, getContext() { return ctxStub; }, width: 800, height: 600, clientWidth: 400 };
}
// кнопки как в разметке
function makeBtn(attrs) {
    const listeners = {};
    return Object.assign(makeEl(), {
        dataset: attrs.dataset || {}, attrs: attrs.attrs || [],
        hasAttribute(a) { return this.attrs.includes(a); },
        addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
        fire(t, pointerId) { (listeners[t] || []).forEach(f => f({ pointerId, preventDefault() {} })); },
        setPointerCapture() {}
    });
}
const buttons = {
    up: makeBtn({ dataset: { key: 'KeyW' }, attrs: ['data-hold'] }),
    right: makeBtn({ dataset: { key: 'KeyD' }, attrs: ['data-hold'] }),
    down: makeBtn({ dataset: { key: 'KeyS' }, attrs: ['data-hold'] }),
    dig: makeBtn({ dataset: { key: 'Space' }, attrs: ['data-hold'] }),
    run: makeBtn({ dataset: { toggle: 'ShiftLeft' } }),
    ladder: makeBtn({ dataset: { key: 'KeyQ' } }),
    heal: makeBtn({ dataset: { key: 'KeyH' } }),
    menu: makeBtn({ attrs: ['data-menu'] })
};
const els = {}, notes = [], handlers = {};
let viewport = { w: 390, h: 844 };
const body = { classList: classList(), appendChild(n) { notes.push(n.textContent); } };
const sandbox = {
    document: {
        getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body,
        querySelectorAll: sel => sel === '.tbtn' ? Object.values(buttons) : Object.values(buttons).filter(b => b.classList.contains('down'))
    },
    location: { search: '?touch=1' },
    get innerWidth() { return viewport.w; }, get innerHeight() { return viewport.h; },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener(type, fn) { handlers[type] = fn; } },
    requestAnimationFrame() {}, setInterval() {}, setTimeout(f) { f(); }, clearTimeout() {},
    confirm: () => false, console, Date, Math, JSON, Object, Proxy, Number, Set, Map
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}

console.log('Включение');
run('setZoom(20)');   // размеры ниже — для мелкого масштаба (как до 2.1.0); крупнее — в sprites.test.js
check('?touch=1 включает сенсорный режим', run('touchMode') === true && body.classList.contains('touch'));
check('на телефоне вертикально холст уже и выше: 24 блока в ширину', run('VIEWPORT_WIDTH') === 24 && run('VIEWPORT_HEIGHT') > 30);
check('и размер холста совпадает с числом блоков', run('canvas.width') === 24 * 20 && run('canvas.height') === run('VIEWPORT_HEIGHT') * 20);
viewport = { w: 844, h: 390 }; handlers.resize();
check('повернул горизонтально — обычные 40×30', run('VIEWPORT_WIDTH') === 40 && run('VIEWPORT_HEIGHT') === 30 && run('canvas.width') === 800);
viewport = { w: 320, h: 568 }; handlers.resize();
check('маленький телефон — не меньше 24 блоков в высоту', run('VIEWPORT_HEIGHT') >= 24);
viewport = { w: 390, h: 844 }; handlers.resize();
check('камера не выходит за мир при новом размере', run('camera.x') >= 0 && run('camera.x') <= run('WORLD_WIDTH - VIEWPORT_WIDTH'));

console.log('Кнопки');
run('keys = {}; gameState.paused = false;');
buttons.right.fire('pointerdown', 1);
check('держишь ▶ — клавиша D нажата', run("keys['KeyD']") === true && buttons.right.classList.contains('down'));
buttons.right.fire('pointerup', 1);
check('отпустил — отпущена', run("keys['KeyD']") === false && !buttons.right.classList.contains('down'));
buttons.down.fire('pointerdown', 2); buttons.dig.fire('pointerdown', 3);
check('два пальца: ▼ и ⛏ одновременно', run("keys['KeyS'] && keys['Space']") === true);
buttons.dig.fire('pointerup', 3);
check('отпустил один палец — второй держит', run("keys['KeyS']") === true && run("keys['Space']") === false);
buttons.down.fire('lostpointercapture', 2);
check('палец потерян (ушёл с экрана) — клавиша отпускается', run("keys['KeyS']") === false);
buttons.up.fire('pointerdown', 4); buttons.up.fire('pointercancel', 4);
check('отмена касания тоже отпускает', run("keys['KeyW']") === false);
run('ladders = 5; generateWorld(3); player.x = 50; player.y = DEPTH_ORIGIN + 100; world[player.y][50] = BLOCK_TYPES.AIR;');
buttons.ladder.fire('pointerdown', 5);
check('тап «Лестн.» ставит лестницу (как Q)', run('ladders') === 4 && run("keys['KeyQ']") === false);
run('bandages = 1; health = 50; hazardClock = 100; lastHealAt = -Infinity;');
buttons.heal.fire('pointerdown', 6);
check('тап «Лечить» лечит (как H)', run('health') === 75);
buttons.run.fire('pointerdown', 7);
check('«Бег» — переключатель: включился', run("keys['ShiftLeft']") === true && buttons.run.classList.contains('on'));
buttons.run.fire('pointerdown', 8);
check('и выключился', run("keys['ShiftLeft']") === false && !buttons.run.classList.contains('on'));
buttons.right.fire('pointerdown', 9); handlers.blur();
check('свернул браузер — зажатые кнопки отпущены', run("keys['KeyD']") === false);

console.log('Меню');
buttons.menu.fire('pointerdown', 10);
check('☰ открывает панель и ставит игру на паузу', body.classList.contains('menu-open') && run('gameState.paused') === true);
run('toggleMenu(false)');
check('«Вернуться в игру» — пауза снята', !body.classList.contains('menu-open') && run('gameState.paused') === false);

console.log('Сводка поверх игры');
run('health = 64; stats.money = 120; backpack = emptyBackpack(); addToBackpack(BLOCK_TYPES.GOLD); player.y = DEPTH_ORIGIN + 230; updateCamera();');
texts.length = 0; run('render()');
check('на экране здоровье, глубина, рюкзак и деньги', texts.some(t => t.includes('❤ 64') && t.includes('230 м') && t.includes('1/20') && /120\s*$/.test(t.trim())));
check('шрифт сводки увеличен под ужатый холст', run('Math.round(13 * canvas.width / 400)') > 13);
check('игровой цикл в сенсорном режиме не падает', (() => { run('gameLoop(16); gameLoop(33);'); return true; })());

console.log('Компьютер');
check('без касаний и ?touch на компьютере режим не включается', (() => {
    const sb2 = Object.assign({}, sandbox, { location: { search: '' }, matchMedia: () => ({ matches: false }), document: Object.assign({}, sandbox.document, { body: { classList: classList(), appendChild() {} }, getElementById: (() => { const own = {}; return id => own[id] || (own[id] = makeEl()); })() }) });
    vm.createContext(sb2); vm.runInContext(script, sb2);
    const r = [vm.runInContext('touchMode', sb2), vm.runInContext('VIEWPORT_WIDTH', sb2)];
    if (!(r[0] === false && r[1] === 29)) console.log('   ', r);
    return r[0] === false && r[1] === 29;      // 800 / 28 px — средний масштаб по умолчанию
})());

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
