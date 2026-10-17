// Проверки радио: выключено по умолчанию и в сеть не ходит, включение, станции, громкость,
// ошибки потока, настройки, значок поверх игры, кнопка на телефоне.
// Запуск: node radio.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

// Поддельный проигрыватель: запоминает, что с ним делали
const audios = [];
class FakeAudio {
    constructor() { this.src = ''; this.volume = 1; this.paused = true; this.listeners = {}; this.loads = 0; this.playResult = 'ok'; audios.push(this); }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); }
    emit(t) { (this.listeners[t] || []).forEach(f => f()); }
    play() { this.paused = false; return this.playResult === 'ok' ? Promise.resolve() : Promise.reject(new Error('blocked')); }
    pause() { this.paused = true; }
    removeAttribute(a) { if (a === 'src') this.src = ''; }
    load() { this.loads++; }
}
const texts = [];
const ctxStub = new Proxy({}, {
    get: (t, k) => k === 'fillText' ? (s) => texts.push(s) : k === 'measureText' ? (s) => ({ width: s.length * 7 }) : (k in t ? t[k] : () => {}),
    set: (t, k, v) => (t[k] = v, true)
});
function makeEl() {
    return { textContent: '', innerHTML: '', value: '', style: {}, children: [],
        classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
            contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } },
        appendChild() {}, remove() {}, focus() {}, click() {}, getContext() { return ctxStub; }, width: 800, height: 600 };
}
function boot(storage = {}) {
    const els = {}, notes = [], handlers = {};
    audios.length = 0;
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: () => makeEl(),
            body: { appendChild(n) { notes.push(n.textContent); } } },
        localStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem() {} },
        window: { addEventListener(t, f) { handlers[t] = f; } }, Audio: FakeAudio,
        requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, Promise
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    return { run: c => vm.runInContext(c, sb), els, notes, handlers, storage };
}
const tick = () => new Promise(r => setImmediate(r));

let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}

(async () => {
    console.log('По умолчанию');
    let g = boot();
    check('при запуске игры проигрыватель даже не создаётся — в сеть ни шагу', audios.length === 0 && g.run('radio.on') === false);
    check('в панели «выключено» и первая станция', g.els.radioStatus.textContent === 'выключено' && g.els.radioStation.textContent === 'Радио Рекорд');
    check('8 станций, все по https', g.run('RADIO_STATIONS.length') === 8 && g.run('RADIO_STATIONS.every(s => s.url.startsWith("https://"))'));
    g.run('gameLoop(16); gameLoop(33);');
    check('и после игровых кадров — тоже ничего', audios.length === 0);

    console.log('Включение и выключение');
    g.handlers.keydown({ code: 'KeyM', preventDefault() {} });
    check('M включает: создан проигрыватель, адрес станции', audios.length === 1 && audios[0].src === g.run('RADIO_STATIONS[0].url') && !audios[0].paused);
    check('статус «подключение…»', g.els.radioStatus.textContent === 'подключение…' && g.els.radioToggle.textContent === '■ Выкл');
    audios[0].emit('playing');
    check('поток пошёл — «в эфире», зелёным', g.els.radioStatus.textContent === 'в эфире' && g.els.radioStatus.classList.contains('live'));
    texts.length = 0; g.run('render()');
    check('поверх игры значок «♪ Радио Рекорд»', texts.some(t => t === '♪ Радио Рекорд'));
    g.handlers.keydown({ code: 'KeyM', preventDefault() {} });
    check('M ещё раз — выключено, соединение закрыто', g.run('radio.on') === false && audios[0].paused && audios[0].src === '' && audios[0].loads === 1);
    texts.length = 0; g.run('render()');
    check('значка больше нет', !texts.some(t => t.startsWith('♪')));
    g.run('gameState.paused = true;'); g.handlers.keydown({ code: 'KeyM', preventDefault() {} });
    check('при вводе названия сохранения (пауза) буква М радио не трогает', g.run('radio.on') === false);
    g.run('gameState.paused = false;');

    console.log('Станции');
    g.run('radioSwitch(1)');
    check('переключение без звука — только название', g.els.radioStation.textContent === 'Рекорд Rock' && audios[0].paused);
    g.run('radioToggle(); radioSwitch(1);');
    check('во время игры — сразу новая станция', audios[0].src === g.run('RADIO_STATIONS[2].url') && g.run('radio.on'));
    g.run('radioSwitch(-3)');
    check('по кругу назад: с 3-й на 8-ю', g.run('radio.index') === 7 && g.els.radioStation.textContent === 'SomaFM Drone Zone');
    g.run('radioSwitch(1)');
    check('и вперёд с последней — на первую', g.run('radio.index') === 0);

    console.log('Громкость');
    g.run('radioSetVolume(25)');
    check('громкость 25% — проигрывателю 0.25', Math.abs(audios[0].volume - 0.25) < 1e-9);
    g.run('radioSetVolume(500)');
    check('больше 100% не бывает', audios[0].volume === 1);
    g.run('radioSetVolume(40)');

    console.log('Ошибки');
    audios[0].emit('error');
    check('станция не отвечает — радио выключается, «станция недоступна»', g.run('radio.on') === false && g.els.radioStatus.textContent === 'станция недоступна' && g.els.radioStatus.classList.contains('error'));
    check('и сообщение с советом', g.notes.some(n => n.includes('недоступна') && n.includes('другую станцию')));
    g.run('radioSwitch(1)');
    check('переключил станцию — надпись об ошибке сброшена', g.els.radioStatus.textContent === 'выключено');
    audios[0].playResult = 'blocked';
    g.run('radioToggle()'); await tick();
    check('браузер не дал включить звук — радио не «залипает» включённым', g.run('radio.on') === false && g.els.radioStatus.textContent === 'станция недоступна');

    console.log('Настройки');
    const saved = JSON.parse(g.storage.miner_radio);
    check('станция и громкость запоминаются', saved.index === 1 && Math.abs(saved.volume - 0.4) < 1e-9);
    const g2 = boot(g.storage);
    check('при следующем запуске — та же станция и громкость', g2.run('radio.index') === 1 && Math.abs(g2.run('radio.volume') - 0.4) < 1e-9 && g2.els.radioVolume.value === 40);
    check('но радио само не включается', g2.run('radio.on') === false && audios.length === 0);
    const g3 = boot({ miner_radio: '{"index": 99, "volume": "громко"}' });
    check('испорченные настройки — значения по умолчанию', g3.run('radio.index') === 0 && g3.run('radio.volume') === 0.6);
    const g4 = boot({ miner_radio: 'не json' });
    check('совсем битые — тоже не падает', g4.run('radio.index') === 0);
    check('настройки радио не попадают в сохранение игры', !('radio' in JSON.parse(g4.run('JSON.stringify(createSaveData("t"))'))));

    console.log('Телефон');
    check('на сенсорной панели есть кнопка «Радио» (клавиша M)', /data-key="KeyM" id="tRadio"/.test(html));
    const g5 = boot();
    g5.run('radioToggle()');
    check('кнопка подсвечивается, пока играет', g5.els.tRadio.classList.contains('on'));
    g5.run('radioToggle()');
    check('и гаснет, когда выключено', !g5.els.tRadio.classList.contains('on'));

    console.log(`\n${passed}/${passed + failed} проверок пройдено`);
    process.exit(failed ? 1 : 0);
})();
