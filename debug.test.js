// Проверки режима отладки.
// Запуск: node debug.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeEl() {
    return {
        textContent: '', innerHTML: '', value: '', style: {},
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } },
        appendChild() {}, remove() {}, focus() {}, click() {},
        getContext() { return ctxStub; }, width: 800, height: 600
    };
}
const drawn = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => k in t ? t[k] : (k === 'fillText' ? (s) => drawn.push(s) : () => {}),
    set: (t, k, v) => (t[k] = v, true)
});
const els = {}, notes = [], handlers = {};
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener(type, fn) { handlers[type] = fn; } },
    requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => false, console, Date, Math, JSON, Object, Proxy,
    location: { search: '?debug=1' }      // режим отладки доступен только по этому адресу
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

function press(code) {
    let prevented = false;
    handlers.keydown({ code, preventDefault() { prevented = true; } });
    handlers.keyup({ code });
    return prevented;
}

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}

run('generateWorld(4242); player.x = WORLD_WIDTH / 2; player.y = SURFACE_Y - 1;');

console.log('Включение');
check('по умолчанию выключен', run('debug.on') === false);
check('без отладки PageDown ничего не делает', !press('PageDown') && run('currentDepth()') === 0);
check('без отладки цифры ничего не делают', !press('Digit5') && run('currentDepth()') === 0);
check('` включает', press('Backquote') && run('debug.on') === true);
run('gameState.paused = true;');
press('Backquote');
check('на паузе (ввод названия сохранения) ` игнорируется', run('debug.on') === true);
run('gameState.paused = false;');

console.log('Телепорт');
press('PageDown');
check('PgDn — на 50 м вниз', run('currentDepth()') === 50);
check('клетка игрока свободна', run('getBlock(player.x, player.y)') === run('BLOCK_TYPES.AIR'));
press('PageDown');
check('PgDn ещё раз — 100 м', run('currentDepth()') === 100);
press('PageUp');
check('PgUp — 50 м', run('currentDepth()') === 50);
press('Digit9');
check('9 — самое дно', run('currentDepth()') === run('MAX_DEPTH') && run('MAX_DEPTH') === 788);
check('под игроком на дне — коренная порода', run('getBlock(player.x, player.y + 1)') === run('BLOCK_TYPES.BEDROCK'));
press('PageDown');
check('ниже дна не проваливается', run('currentDepth()') === 788);
press('Numpad0');
check('0 на цифровой клавиатуре — поверхность', run('currentDepth()') === 0 && run('player.y') === run('SURFACE_Y - 1'));
check('на поверхности яма не вырублена', run('getBlock(player.x, SURFACE_Y)') !== run('BLOCK_TYPES.AIR'));
run('player.x = SHOP_X + 1;'); press('Digit0');
check('после телепорта наверх у лавки — isAtShop', run('isAtShop()') === true);
press('Digit3');
check('3 — треть шахты', run('currentDepth()') === Math.round(788 * 3 / 9));
run('player.x = 60.5;');
press('Digit5');
check('при дробном x вырублены обе клетки',
    run('getBlock(60, player.y)') === run('BLOCK_TYPES.AIR') && run('getBlock(61, player.y)') === run('BLOCK_TYPES.AIR'));

console.log('Полёт');
press('KeyG');
check('G включает полёт', run('debug.fly') === true);
run(`player.x = 60; player.y = 300; setBlock(60, 301, BLOCK_TYPES.STONE); setBlock(60, 302, BLOCK_TYPES.STONE);
     keys = { KeyS: true }; updatePlayer(0.1); keys = {};`);
check('летит вниз сквозь камень', run('player.y') === 302);
run('const yBefore = player.y; updatePlayer(0.1); globalThis.__same = player.y === yBefore;');
check('без клавиш висит на месте (нет гравитации)', run('__same') === true);
run('player.y = 790; keys = { KeyS: true }; for (let i = 0; i < 20; i++) updatePlayer(0.1); keys = {};');
check('не вылетает за дно', run('player.y') === run('WORLD_HEIGHT - BEDROCK_ROWS - 1'));
run('player.x = 2; keys = { KeyA: true }; for (let i = 0; i < 5; i++) updatePlayer(0.1); keys = {};');
check('не вылетает за левый край', run('player.x') === 0);
run('player.y = 400; setBlock(0, 400, BLOCK_TYPES.LAVA); updatePlayer(0.1);');
check('в полёте лава не убивает', run('player.y') === 400);
press('KeyG');
check('G выключает полёт', run('debug.fly') === false);
press('KeyG'); press('Backquote');
check('выключение отладки выключает и полёт', run('debug.on') === false && run('debug.fly') === false);

console.log('Панель');
press('Backquote');
run('debugFrame(16, 0.5, 0); for (let i = 1; i <= 60; i++) debugFrame(i === 30 ? 40 : 16.7, 0.5, i * 16.7);');
check('FPS считается', run('debug.fps') >= 58 && run('debug.fps') <= 62);
check('худший кадр запомнен', run('debug.worstShown') === 40);
drawn.length = 0;
run('drawDebugOverlay()');
check('панель рисуется', drawn.some(s => s.startsWith('FPS:')) && drawn.some(s => s.startsWith('глубина:')));
press('Backquote');
drawn.length = 0;
run('drawDebugOverlay()');
check('выключенная панель не рисуется', drawn.length === 0);
check('игровой цикл с отладкой не падает', (() => { press('Backquote'); run('gameLoop(16); gameLoop(33);'); return true; })());

console.log('Сохранения');
check('состояние отладки не попадает в сохранение', !('debug' in JSON.parse(run('JSON.stringify(createSaveData("t"))'))));

console.log('Доступ по адресу');
function sandboxWith(search) {
    const h = {}, e = {};
    const sb = Object.assign({}, sandbox, {
        location: search === null ? undefined : { search },
        window: { addEventListener(t, f) { h[t] = f; } },
        document: Object.assign({}, sandbox.document, { getElementById: id => e[id] || (e[id] = makeEl()), body: { appendChild() {}, classList: makeEl().classList } })
    });
    if (search === null) delete sb.location;
    vm.createContext(sb); vm.runInContext(script, sb);
    h.keydown({ code: 'Backquote', preventDefault() {} });
    return { on: vm.runInContext('debug.on', sb), help: e.debugHelp ? e.debugHelp.style.display : 'none' };
}
const plain = sandboxWith('');
check('обычный адрес: Ё не включает отладку', plain.on === false);
check('и подсказки про отладку не видно', plain.help === 'none' || plain.help === undefined);
check('открыт как файл без адреса — тоже выключено', sandboxWith(null).on === false);
check('?touch=1 — выключено', sandboxWith('?touch=1').on === false);
check('?debug=0 и ?debug=10 — выключено', sandboxWith('?debug=0').on === false && sandboxWith('?debug=10').on === false);
const dbg = sandboxWith('?debug=1');
check('?debug=1 — включается, подсказка видна', dbg.on === true && dbg.help === '');
check('?touch=1&debug=1 — тоже', sandboxWith('?touch=1&debug=1').on === true);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
