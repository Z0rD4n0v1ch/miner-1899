// Проверки существ: крысы, летучие мыши, пауки, саламандры; удар киркой, лампа, канарейка.
// Запуск: node creatures.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

const fills = [], texts = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => {
        if (k === 'fillRect') return (x, y, w, h) => fills.push([t.fillStyle, x, y, w, h]);
        if (k === 'fillText') return (s) => texts.push(s);
        return k in t ? t[k] : () => {};
    },
    set: (t, k, v) => (t[k] = v, true)
});
function makeEl() {
    return {
        _html: '', get innerHTML() { return this._html; },
        set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { on ? this._s.add(c) : this._s.delete(c); } },
        appendChild(ch) { this.children.push(ch); }, remove() {}, focus() {}, click() {},
        getContext() { return ctxStub; }, width: 800, height: 600
    };
}
const els = {}, notes = [];
let confirmAnswer = false;
const sandbox = {
    document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
        body: { appendChild(n) { notes.push(n.textContent); } } },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {} }, requestAnimationFrame() {}, setInterval() {}, setTimeout() {},
    confirm: () => confirmAnswer, console, Date, Math, JSON, Object, Proxy, Number, Set
};
vm.createContext(sandbox);
vm.runInContext(script, sandbox);
const run = code => vm.runInContext(code, sandbox);

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}

console.log('Расселение');
run('generateWorld(2024)');
const counts = run('Object.fromEntries(Object.keys(CREATURES).map(k => [k, creatures.filter(c => c.type === k).length]))');
check(`все виды на месте (${JSON.stringify(counts)})`, Object.keys(counts).every(k => counts[k] === run(`CREATURES.${k}.count`)));
check('каждый живёт в своём биоме', run('creatures.every(c => biomeAtBlock(Math.floor(c.x), Math.floor(c.y)) === CREATURES[c.type].biome)'));
check('у поверхности (выше 20 м) никого', run('creatures.every(c => c.y >= SURFACE_Y + 20)'));
check('саламандры — в лаве', run(`creatures.filter(c => c.type === 'salamander').every(c => world[c.home][Math.floor(c.x)] === BLOCK_TYPES.LAVA)`));
const webs = run('(() => { let n = 0, home = 0; for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) if (world[y][x] === BLOCK_TYPES.WEB) { n++; if (biomeAtBlock(x, y) === 2) home++; } return { n, home }; })()');
check(`у пауков сплетена паутина (${webs.n} клеток)`, webs.n > 20 && webs.home >= webs.n * 0.9);
const snap = run('JSON.stringify(creatures.map(c => [c.type, c.x, c.y]))');
run('generateWorld(2024)');
check('тот же seed — те же существа на тех же местах', run('JSON.stringify(creatures.map(c => [c.type, c.x, c.y]))') === snap);
const save = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
run('creatures = [];');
run(`loadSaveData(${JSON.stringify(save)})`);
check('после загрузки существа расселяются заново так же', run('JSON.stringify(creatures.map(c => [c.type, c.x, c.y]))') === snap);
check('и паутины не прибавилось', run('(() => { let n = 0; for (let y = 0; y < WORLD_HEIGHT; y++) for (let x = 0; x < WORLD_WIDTH; x++) if (world[y][x] === BLOCK_TYPES.WEB) n++; return n; })()') === webs.n);

// Закрытая комната на глубине depth: пол на ряду F+1, игрок в x = 45
function room(depth) {
    run(`generateWorld(31); resetHazards(); resetDig(); keys = {}; gameState.paused = false; debug.on = false; debug.fly = false;
         hazardRandom = () => 0.5; creatures = []; fireballs = []; hitCooldown = 0; lampTier = 0; lampLit = true; hasCanary = false;
         pickaxeTier = 0; backpack = emptyBackpack(); stats.score = 0; stats.money = 0; respawnTimer = 1e9;
         globalThis.F = DEPTH_ORIGIN + ${depth};
         for (let y = F - 6; y <= F + 2; y++) for (let x = 35; x <= 65; x++)
             world[y][x] = (y >= F - 4 && y <= F) ? BLOCK_TYPES.AIR : BLOCK_TYPES.STONE;
         player.x = 45; player.y = F; player.vx = 0; player.vy = 0; player.onGround = true; player.direction = 1;`);
    notes.length = 0;
}
function add(type, x, extra) { run(`creatures.push(makeCreature('${type}', ${x}, F + 0.4, ${JSON.stringify(extra || {})}))`); }
function tick(seconds, keysObj) {
    run(`keys = ${JSON.stringify(keysObj || {})}; for (let i = 0; i < ${Math.round(seconds * 60)}; i++) { updatePlayer(1/60); updateDigging(1/60); updateHazards(1/60); updateCreatures(1/60); } keys = {};`);
}

console.log('Крыса');
room(100);
add('rat', 50);
run('for (let i = 0; i < 3; i++) addToBackpack(BLOCK_TYPES.GOLD);');
tick(3);
check('крыса подбежала и утащила 1 руду', run('backpackCount()') === 2 && run("creatures[0].loot") === 'gold');
check('сообщение «Крыса утащила»', notes.some(n => n.includes('Крыса утащила')));
check('здоровье крыса не трогает', run('health') === 100);
tick(1);
check('и убегает', run('Math.abs(creatures[0].x - player.x)') > 2.5);
room(100); add('rat', 47);
tick(3);
check('с пустым рюкзаком крыса не пристаёт', run('Math.abs(creatures[0].x - player.x)') > 0.5 || run('health') === 100);
room(100); add('rat', 46.1, { loot: 'gold' });
const ratHits = (() => { let n = 0; for (; n < 10 && run('creatures[0].hp') > 0; n++) run('hitCooldown = 0; creatures[0].x = 46.1; tryAttack();'); return n; })();
check(`2 удара ржавой киркой — крыса поймана (${ratHits})`, ratHits === 2);
check('украденное вернулось в рюкзак', run('backpack.gold') === 1 && notes.some(n => n.includes('поймана')));
check('за пойманную +5 очков', run('stats.score') === 5);
room(650); add('rat', 50); run('world[F + 1][50] = BLOCK_TYPES.LAVA; world[F + 1][51] = BLOCK_TYPES.LAVA; creatures[0].dir = 1;');
tick(2);
check('крыса, упавшая в лаву, гибнет', run('creatures.length') === 0);

console.log('Летучая мышь');
room(300); run(`creatures.push(makeCreature('bat', 52, F - 4, { state: 'sleep' }))`);
tick(1);
check('вдали спит', run("creatures[0].state") === 'sleep');
run('player.x = 50;'); tick(3);
check('подошёл — проснулась и укусила (−5 за укус)', run("creatures[0].state") !== 'sleep' && run('health') < 100 && (100 - run('health')) % 5 < 0.01);
const hpBat = run('health');
check('кусает не чаще раза в 1.5 с', 100 - hpBat <= 10.01);
room(300); run(`lampTier = 2; lampLit = true; creatures.push(makeCreature('bat', 50, F - 3, { state: 'hunt' }))`);
tick(5);
check('с лампой летучая мышь не кусает', run('health') === 100);
check('и держится подальше', run('distToPlayer(creatures[0])') > 2.5);
room(300); run(`creatures.push(makeCreature('bat', 46.1, F, { state: 'hunt' }))`);
run('keys = {Space: true}; updateDigging(1/60); updateCreatures(1/60); keys = {};');
check('одного удара хватает', run('creatures.length') === 0);

console.log('Паук');
room(500); add('spider', 48);
tick(3);
check('паук бросается и кусает (−15)', run('health') <= 85 && run('health') >= 70);
room(500); run('lampTier = 2; lampLit = true;'); add('spider', 47.5);
tick(4);
check('с лампой паук пятится и не кусает', run('health') === 100 && run('distToPlayer(creatures[0])') > 2);
room(500); add('spider', 46.1); run('creatures[0].x = 46.1; pickaxeTier = 0;');
const spiderHits = (() => { let n = 0; for (; n < 10 && run('creatures[0].hp') > 0; n++) { run('hitCooldown = 0; creatures[0].x = 46.1; tryAttack();'); } return n; })();
check(`ржавой киркой паук — ${spiderHits} удара`, spiderHits === 4);
room(500); add('spider', 46.1); run('pickaxeTier = 3;');
const spiderHits3 = (() => { let n = 0; for (; n < 10 && run('creatures[0].hp') > 0; n++) { run('hitCooldown = 0; creatures[0].x = 46.1; tryAttack();'); } return n; })();
check(`киркой с алмазным жалом — ${spiderHits3} удара`, spiderHits3 === 2);
room(500); add('spider', 46.1); run('creatures[0].hp = 99; keys = {Space: true};');
run('for (let i = 0; i < 60; i++) { updateDigging(1/60); updateCreatures(1/60); creatures[0].x = 46.1; } keys = {};');
check('удары не чаще раза в 0.4 с (за секунду — 3)', run('99 - creatures[0].hp') === 3);

console.log('Паутина');
room(500);
tick(1, { KeyD: true });
const free = run('player.x') - 45;
room(500); run('for (let x = 45; x <= 50; x++) world[F][x] = BLOCK_TYPES.WEB;');
tick(1, { KeyD: true });
const webbed = run('player.x') - 45;
check(`в паутине в 3 раза медленнее (${free.toFixed(2)} → ${webbed.toFixed(2)})`, Math.abs(webbed / free - 0.3) < 0.05);
check('паутина не держит как стена', run('isBlocked(46, F)') === false);
room(500); run('world[F][46] = BLOCK_TYPES.WEB;'); tick(0.2, { Space: true });
check('пробелом паутина рвётся быстро и без очков', run('world[F][46]') === run('BLOCK_TYPES.AIR') && run('stats.score') === 0);

console.log('Саламандра');
room(700);
run(`for (let x = 50; x <= 54; x++) world[F + 1][x] = BLOCK_TYPES.LAVA;
     creatures.push(makeCreature('salamander', 52.1, F + 1, { state: 'hidden', home: F + 1, timer: 0 }));`);
run('player.x = 36;'); tick(1);
check('вдали прячется в лаве', run("creatures[0].state") === 'hidden' && run('fireballs.length') === 0);
run('keys = {Space: true}; player.x = 51.5; player.direction = 1; tryAttack(); keys = {};');
check('спрятавшуюся не ударить', run('creatures[0].hp') === 3);
run('player.x = 47;'); tick(0.05);
check('подошёл — выныривает и плюётся огнём', run("creatures[0].state") === 'up' && run('fireballs.length') === 1);
tick(1.2);
check('огненный плевок попал: −20', Math.abs(run('health') - 80) < 1.5);
room(700); run(`lampTier = 2; lampLit = true; for (let x = 50; x <= 54; x++) world[F + 1][x] = BLOCK_TYPES.LAVA;
     creatures.push(makeCreature('salamander', 52.1, F + 1, { state: 'hidden', home: F + 1, timer: 0 })); player.x = 47;`);
tick(0.05);
check('лампы саламандра не боится', run('fireballs.length') === 1);
room(700); run(`for (let x = 50; x <= 54; x++) world[F + 1][x] = BLOCK_TYPES.LAVA; world[F][48] = BLOCK_TYPES.STONE; world[F - 1][48] = BLOCK_TYPES.STONE;
     creatures.push(makeCreature('salamander', 52.1, F + 1, { state: 'hidden', home: F + 1, timer: 0 })); player.x = 44;`);
tick(2);
check(`за стеной плевок разбивается о камень (здоровье ${run('health').toFixed(1)} — только жар)`, run('health') > 98);

console.log('Удар вместо копания');
room(100); add('rat', 46.1); run('world[F][47] = BLOCK_TYPES.STONE; creatures[0].hp = 99;');
tick(1, { Space: true });
check('существо перед игроком — пробел бьёт его, камень за ним цел', run('world[F][47]') === run('BLOCK_TYPES.STONE') && run('creatures[0].hp') < 99);
room(100); add('rat', 43); run('world[F][46] = BLOCK_TYPES.STONE; creatures[0].hp = 99; player.direction = 1;');
tick(1, { Space: true });
check('существо за спиной не мешает копать', run('world[F][46]') === run('BLOCK_TYPES.AIR') && run('creatures[0].hp') === 99);

console.log('Канарейка');
room(500);
check('купить без денег нельзя', run('buyCanary()') === false && run('hasCanary') === false);
run('stats.money = 200;');
check('канарейка за 30 руб.', run('buyCanary()') === true && run('stats.money') === 170);
check('вторую не купить', run('buyCanary()') === false);
tick(0.1);
check('газа рядом нет — спокойна', run('canaryAlarm') === false);
run('world[F - 5][49] = BLOCK_TYPES.GAS;'); notes.length = 0; tick(0.1);
check('газ в 5 блоках — беспокоится', run('canaryAlarm') === true && notes.some(n => n.includes('Канарейка беспокоится')));
tick(1);
check('сообщение не повторяется каждый кадр', notes.filter(n => n.includes('беспокоится')).length === 1);
run('world[F - 5][49] = BLOCK_TYPES.STONE; world[F][46] = BLOCK_TYPES.GAS; dig();'); tick(0.1);
check('в облаке газа канарейка погибает', run('hasCanary') === false && notes.some(n => n.includes('погибла')));

console.log('Лампа и лавка');
room(100);
run('stats.money = 100;');
check('открытая лампа за 60 руб.', run('buyLamp(1)') === true && run('lampTier') === 1 && run('stats.money') === 40);
check('ту же второй раз не купить', run('buyLamp(1)') === false && run('stats.money') === 40);
run('stats.money = 500; lampTier = 0; hasCanary = false; player.x = SHOP_X + 1; player.y = SURFACE_Y - 1; openShop();');
const item = name => els.shopList.children.find(c => c.innerHTML.includes(name)) || { innerHTML: '' };
check('в лавке две лампы и канарейка', item('Открытая лампа').innerHTML.includes('buyLamp(1)') && item('Лампа Дэви').innerHTML.includes('buyLamp(2)') && item('Канарейка').innerHTML.includes('buyCanary()'));
run('buyLamp(2)');
check('купил лампу Дэви — обе отмечены «Есть»', item('Лампа Дэви').innerHTML.includes('Есть') && item('Открытая лампа').innerHTML.includes('Есть'));
run('closeShop(); updateUI();');
check('в панели «Снаряжение: лампа дэви»', els.gear.textContent === 'лампа дэви');

console.log('Сохранения и смерть');
room(100); run('lampTier = 2; lampLit = true; hasCanary = true;');
const s2 = JSON.parse(run('JSON.stringify(createSaveData("t"))'));
check('лампа и канарейка в сохранении', s2.lamp === 2 && s2.canary === true);
run('lampTier = 0; lampLit = true; hasCanary = false;'); run(`loadSaveData(${JSON.stringify(s2)})`);
check('и восстанавливаются', run('lampTier') === 2 && run('hasCanary'));
const old = Object.assign({}, s2); delete old.lamp; delete old.canary;
run(`loadSaveData(${JSON.stringify(old)})`);
check('в старом сохранении — без лампы и канарейки', run('lampTier') === 0 && !run('hasCanary'));
run('lampTier = 2; lampLit = true; hasCanary = true; die("тест");');
check('смерть их не отнимает', run('lampTier') === 2 && run('hasCanary'));
confirmAnswer = true; run('newGame();'); confirmAnswer = false;
check('новая игра — без них', run('lampTier') === 0 && !run('hasCanary'));

console.log('Возрождение');
room(100); run('generateWorld(31); creatures = creatures.filter(c => c.type !== "rat"); respawnTimer = 0.01; player.x = 60; player.y = DEPTH_ORIGIN + 100;');
tick(0.1);
check('если крыс стало мало, через 45 с появляется новая', run(`creatures.filter(c => c.type === 'rat').length`) === 1);
check('и не рядом с игроком', run(`creatures.filter(c => c.type === 'rat').every(c => Math.hypot(c.x - player.x, c.y - player.y) > 25)`));

console.log('Табличка и отрисовка');
run('player.y = DEPTH_ORIGIN + 450; currentBiome = 0; updateBiome(1000);'); texts.length = 0; run('renderBiomeBanner(2000)');
check('табличка Гранитных недр предупреждает о пауках', texts.some(t => t.includes('рудничный газ · пауки')));
room(300); run(`lampTier = 2; lampLit = true; hasCanary = true; canaryAlarm = true;
    creatures.push(makeCreature('rat', 47, F + 0.4, { loot: 'gold' })); creatures.push(makeCreature('bat', 48, F - 3, { state: 'hunt' }));
    creatures.push(makeCreature('bat', 50, F - 4, { state: 'sleep' })); creatures.push(makeCreature('spider', 49, F + 0.4));
    creatures.push(makeCreature('salamander', 51, F + 1, { state: 'up', home: F + 1 })); fireballs.push({ x: 47, y: F, vx: 1, vy: 0, life: 1 });
    updateCamera();`);
let threw = false; fills.length = 0; texts.length = 0;
try { run('render()'); } catch (e) { threw = String(e); }
check('все существа, лампа и канарейка рисуются без ошибок', threw === false && fills.length > 50);
check('у встревоженной канарейки — «!»', texts.includes('!'));
run('generateWorld(2024); player.x = 60; player.y = DEPTH_ORIGIN + 400;');
const t0 = Date.now(); run('for (let i = 0; i < 600; i++) updateCreatures(1/60);');
check(`10 с жизни всех существ считаются быстро (${Date.now() - t0} мс)`, Date.now() - t0 < 500);

console.log(`\n${passed}/${passed + failed} проверок пройдено`);
process.exit(failed ? 1 : 0);
