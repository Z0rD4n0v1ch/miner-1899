// Проверки спрайтов и масштаба: все кадры есть и валидны, позы шахтёра, твари, масштаб
// «мелко / средне / крупно», чёткость на экранах с высокой плотностью, запасные фигуры.
// Запуск: node sprites.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
const draws = [];
function fakeCtx() {
    return new Proxy({}, { get: (t, k) => k === 'drawImage' ? (...a) => draws.push(a) : (k in t ? t[k] : () => ({ addColorStop() {} })), set: (t, k, v) => (t[k] = v, true) });
}
function makeEl() {
    return { textContent: '', innerHTML: '', value: '', style: {}, children: [], dataset: {},
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {}, getContext: () => fakeCtx(), width: 800, height: 600 };
}
class FakeImage { constructor() { this.complete = true; this.naturalWidth = 80; } }
function boot({ dpr, image = true, store = {} } = {}) {
    const els = {};
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(), body: { appendChild() {}, classList: makeEl().classList }, querySelectorAll: () => [] },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem() {} },
        window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, clearTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, URL, encodeURIComponent
    };
    if (dpr) sb.devicePixelRatio = dpr;
    if (image) sb.Image = FakeImage;
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), els, store };
}
let passed = 0, failed = 0;
function check(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); } }

console.log('Кадры');
let g = boot();
const sprites = g.run('Object.fromEntries(Object.entries(SPRITES).map(([k, v]) => [k, v.length]))');
check('шахтёр: стоит 1, идёт 4, копает 2, лезет 2', sprites['miner.idle'] === 1 && sprites['miner.walk'] === 4 && sprites['miner.dig'] === 2 && sprites['miner.climb'] === 2);
check('твари: крыса, мышь (летит и спит), паук, саламандра (ползёт и в лаве) — по 2 кадра',
    ['rat.run', 'bat.fly', 'bat.hang', 'spider.crawl', 'salamander.crawl', 'salamander.hidden'].every(k => sprites[k] === 2));
const svgs = g.run('Object.values(SPRITES).flat()');
check(`все ${svgs.length} кадров — SVG (клетка 40×40, лавка 60×60) с закрытым тегом`, svgs.every(s => s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"') && /viewBox="0 0 (40 40|60 60)"/.test(s) && s.trim().endsWith('</svg>')));
check('в SVG нет внешних ссылок — всё внутри файла игры', svgs.every(s => !/href=|url\(/.test(s)));
check('кадры загружаются как картинки', g.run('Object.keys(spriteImg).length') === svgs.length);

console.log('Позы шахтёра');
g.run('generateWorld(5); player.x = 50; player.y = DEPTH_ORIGIN + 100; player.climbing = false; player.onGround = true; player.vx = 0; keys = {}; digState.progress = 0;');
check('стоит', g.run('minerPose()[0]') === 'miner.idle');
g.run('player.vx = 3;');
check('идёт', g.run('minerPose()[0]') === 'miner.walk');
const walk = new Set(); for (let i = 0; i < 8; i++) { g.run(`player.x = 50 + ${i} * 0.2`); walk.add(g.run('minerPose()[1]')); }
check('кадры ходьбы меняются по мере шагов', walk.size >= 3);
g.run("keys = { Space: true }; digState.progress = 0.4;");
check('копает (пробел и прогресс)', g.run('minerPose()[0]') === 'miner.dig');
g.run('player.climbing = true;');
check('лезет — главнее всего', g.run('minerPose()[0]') === 'miner.climb');
g.run("player.climbing = false; player.x = 50; keys = { Space: true }; digState.progress = 0.4; player.direction = 1; world[player.y][51] = BLOCK_TYPES.SAND; shovelTier = 1;");
check('копает песок лопатой — в руках лопата', g.run('minerPose()[0]') === 'miner.shovel');
g.run("world[player.y][51] = BLOCK_TYPES.STONE;");
check('камень — кирка', g.run('minerPose()[0]') === 'miner.dig');
check('в кадре лопаты — штык и ручка черенка', g.run("SPRITES['miner.shovel'][0]").includes('h7.4 v4.5') && !g.run("SPRITES['miner.dig'][0]").includes('h7.4 v4.5'));
g.run('player.climbing = false; keys = {}; digState.progress = 0; player.vx = 0; player.direction = -1;');
g.run('renderPlayerSprite(100, 100)'); draws.length = 0; g.run('renderPlayerSprite(100, 100)');   // первый раз кадр растеризуется в кеш
check('смотрит влево — кадр отражён', draws.length === 1 && draws[0][1] === 0 && draws[0][2] === 0);
g.run('player.direction = 1;'); draws.length = 0; g.run('renderPlayerSprite(100, 100)');
check('смотрит вправо — рисуется на месте (по центру клетки)', draws.length === 1 && draws[0][1] === 99 && draws[0][2] === 100);

console.log('Твари');
const pick = (type, state) => { draws.length = 0; return g.run(`(() => { const c = makeCreature('${type}', 50, 100); ${state ? `c.state = '${state}';` : ''} c.hurt = 0; return renderCreatureSprite(c, 40, 60, 1.234); })()`); };
check('крыса, паук, саламандра, мышь — спрайтами', pick('rat') && pick('spider') && pick('salamander') && pick('bat', 'fly'));
check('мышь спит на потолке — кадр «висит»', (() => { pick('bat', 'sleep'); return g.run("spriteCache && Object.keys(spriteCache).some(k => k.startsWith('bat.hang'))"); })());
check('саламандра в лаве — кадр «прячется»', (() => { pick('salamander', 'hidden'); return g.run("Object.keys(spriteCache).some(k => k.startsWith('salamander.hidden'))"); })());

console.log('Канарейка');
g.run('player.climbing = false; keys = {}; digState.progress = 0; hasCanary = false;'); draws.length = 0;
check('нет канарейки — не рисуется', g.run('renderCanarySprite(100, 100)') === false);
g.run('hasCanary = true; canaryAlarm = false;');
check('есть — клетка с птицей над плечом', g.run('renderCanarySprite(100, 100)') === true && g.run("Object.keys(spriteCache).some(k => k.startsWith('canary.calm'))"));
g.run('canaryAlarm = true;');
check('газ рядом — тревожные кадры', g.run('renderCanarySprite(100, 100)') === true && g.run("Object.keys(spriteCache).some(k => k.startsWith('canary.alarm'))"));
check('канарейка — 2 спокойных и 2 тревожных кадра', g.run("SPRITES['canary.calm'].length") === 2 && g.run("SPRITES['canary.alarm'].length") === 2);

console.log('Лестницы, верёвки, паутина, огонь, лавка');
g.run('generateWorld(5);');
check('спрайты есть: лестница, верёвка (2), переправа, паутина, огонь (2), лавка',
    ['tile.ladder', 'tile.bridge', 'tile.web', 'shop'].every(k => g.run(`SPRITES['${k}'].length`) === 1) && g.run("SPRITES['tile.rope'].length") === 2 && g.run("SPRITES['fire'].length") === 2);
check('лестница, переправа, паутина рисуются спрайтом', ['LADDER', 'BRIDGE', 'WEB'].every(b => g.run(`drawTileSprite(BLOCK_TYPES.${b}, 0, 0, 50, 100)`) === true));
g.run('world[100][50] = BLOCK_TYPES.ROPE; world[101][50] = BLOCK_TYPES.ROPE; world[102][50] = BLOCK_TYPES.AIR;');
g.run('drawTileSprite(BLOCK_TYPES.ROPE, 0, 0, 50, 100); drawTileSprite(BLOCK_TYPES.ROPE, 0, 0, 50, 101);');
check('у верёвки узелок только на нижнем конце', g.run("Object.keys(spriteCache).some(k => k.startsWith('tile.rope.0'))") && g.run("Object.keys(spriteCache).some(k => k.startsWith('tile.rope.1'))"));
check('камень — не спрайт', g.run('drawTileSprite(BLOCK_TYPES.STONE, 0, 0, 50, 100)') === false);
check('лавка — сруб 3×3 клетки', g.run("drawSpriteBox('shop', 0, 0, 0, 60, 60)") === true && g.run("SPRITES.shop[0]").includes('viewBox="0 0 60 60"'));
check('огонь саламандры — 2 кадра, мерцает', g.run("drawSpriteBox('fire', 1, 0, 0, 14, 14)") === true);

console.log('Масштаб');
g = boot();
check('по умолчанию — средне, 28 px (клетка ×1.4)', g.run('settings.zoom') === 28 && Math.abs(g.run('ZOOM') - 1.4) < 1e-9);
check('на компьютере 800×600 видно 29×22 блока', g.run('VIEWPORT_WIDTH') === 29 && g.run('VIEWPORT_HEIGHT') === 22);
g.run('setZoom(20)');
check('мелко — 40×30, как раньше', g.run('VIEWPORT_WIDTH') === 40 && g.run('VIEWPORT_HEIGHT') === 30);
g.run('setZoom(36)');
check('крупно — 23×17', g.run('VIEWPORT_WIDTH') === 23 && g.run('VIEWPORT_HEIGHT') === 17);
check('чужой масштаб — нет', g.run('setZoom(50)') === false && g.run('settings.zoom') === 36);
check('масштаб запоминается', boot({ store: g.store }).run('settings.zoom') === 36);
check('битое значение — средне', boot({ store: { miner_settings: '{"zoom":99}' } }).run('settings.zoom') === 28);
check('в настройках три кнопки масштаба', /data-zoom="20"[\s\S]*data-zoom="28"[\s\S]*data-zoom="36"/.test(html));
g.run('setZoom(28); generateWorld(5); player.x = 2; player.y = 50; updateCamera();');
check('камера не выезжает за край мира', g.run('camera.x') === 0);
g.run('player.x = WORLD_WIDTH - 1; updateCamera();');
check('у правого края мира край виден целиком (камера между клетками)', Math.abs(g.run('(WORLD_WIDTH - camera.x) * TILE_SIZE * ZOOM') - g.run('LW')) < 1e-6);
g.run('player.y = WORLD_HEIGHT - 2; updateCamera();');
check('и нижний край — дно мира', Math.abs(g.run('(WORLD_HEIGHT - camera.y) * TILE_SIZE * ZOOM') - g.run('LH')) < 1e-6);
g.run('setZoom(36); player.x = WORLD_WIDTH - 1; updateCamera();');
check('на крупном масштабе тоже', Math.abs(g.run('(WORLD_WIDTH - camera.x) * TILE_SIZE * ZOOM') - g.run('LW')) < 1e-6);
g.run('setZoom(20); player.x = WORLD_WIDTH - 1; updateCamera();');
check('на мелком камера по-прежнему по целым клеткам', Number.isInteger(g.run('camera.x')));
g.run('setZoom(28);');

console.log('Чёткость');
g = boot({ dpr: 2 });
check('экран ×2 — холст 1600×1200, логически 800×600', g.run('canvas.width') === 1600 && g.run('canvas.height') === 1200 && g.run('LW') === 800 && g.run('LH') === 600);
check('блоков видно столько же', g.run('VIEWPORT_WIDTH') === 29);
check('кадр спрайта растеризуется под размер: 20 × 1.4 × 2 = 56 px', (() => { g.run("spriteFrame('miner.idle', 0, Math.round(TILE_SIZE * ZOOM * RENDER_SCALE))"); return g.run("Object.keys(spriteCache).includes('miner.idle.0@56')"); })());
g = boot({ dpr: 3.5 });
check('больше ×2 не бывает — бережём телефон', g.run('RENDER_SCALE') === 2);
g = boot({ dpr: 1.25 });
check('экран 125% (Windows) — холст 1000×750', g.run('canvas.width') === 1000 && g.run('canvas.height') === 750);

console.log('Запасной вариант');
g = boot({ image: false });
check('нет картинок — спрайты не рисуются, остаются фигуры', g.run('loadSprites()') === false && g.run("drawSprite('miner.idle', 0, 0, 0, false)") === false);
check('кадр рендера без картинок не падает', (() => { g.run('generateWorld(5); player.x = 50; player.y = 20; updateCamera(); render();'); return true; })());

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
