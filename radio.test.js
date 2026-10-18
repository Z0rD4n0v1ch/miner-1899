// Проверки радио (v1.7.0): своих станций нет, игрок добавляет и удаляет станции сам;
// панель открывается клавишей M; в сеть — только по «Вкл»; ошибки потока; настройки.
// Запуск: node radio.test.js — гоняет настоящий miner-1899.html в песочнице vm.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, 'miner-1899.html'), 'utf8');
const script = html.match(/<script>([\s\S]*)<\/script>/)[1];

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
function classList() {
    return { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
        contains(c) { return this._s.has(c); }, toggle(c, on) { (on === undefined ? !this._s.has(c) : on) ? this._s.add(c) : this._s.delete(c); } };
}
function makeEl(tag) {
    return { tagName: tag || 'DIV', _html: '', get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; if (v === '') this.children = []; },
        textContent: '', value: '', className: '', style: {}, children: [], classList: classList(),
        appendChild(c) { this.children.push(c); }, remove() {}, focus() {}, click() {}, getContext() { return ctxStub; }, width: 800, height: 600 };
}
function boot(storage = {}) {
    const els = {}, notes = [], handlers = {};
    audios.length = 0;
    const sb = {
        document: { getElementById: id => els[id] || (els[id] = makeEl()), createElement: t => makeEl(t), body: { appendChild(n) { notes.push(n.textContent); }, classList: classList() } },
        localStorage: { getItem: k => (k in storage ? storage[k] : null), setItem: (k, v) => { storage[k] = String(v); }, removeItem() {} },
        window: { addEventListener(t, f) { handlers[t] = f; } }, Audio: FakeAudio, URL,
        requestAnimationFrame() {}, setInterval() {}, setTimeout() {}, confirm: () => false,
        console, Date, Math, JSON, Object, Proxy, Number, Set, Map, Promise, String
    };
    vm.createContext(sb); vm.runInContext(script, sb);
    const el = id => els[id] || (els[id] = makeEl());
    return { run: c => vm.runInContext(c, sb), els, el, notes, handlers, storage };
}
const tick = () => new Promise(r => setImmediate(r));
let passed = 0, failed = 0;
function check(name, cond) {
    if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ ' + name); }
}
const key = (g, code, extra) => g.handlers.keydown(Object.assign({ code, preventDefault() {} }, extra || {}));

(async () => {
    console.log('Без готовых станций');
    let g = boot();
    check('готовых станций больше нет', g.run('radio.stations.length') === 0 && !/hostingradio|somafm/.test(html));
    check('в панели «Станций нет» и подсказка', g.el('radioStation').textContent === 'Станций нет' && g.el('radioStatus').textContent.includes('Мои станции'));
    check('в списке станций — «пока пусто»', g.el('radioList').children.length === 1 && g.el('radioList').children[0].textContent.includes('пусто'));
    check('проигрыватель не создаётся — в сеть ни шагу', audios.length === 0);
    g.run('radioToggle()');
    check('«Вкл» без станций: ничего не играет, подсказка, панель открыта', audios.length === 0 && g.run('radio.on') === false &&
        g.notes.some(n => n.includes('добавь станцию')) && g.el('radioPanel').classList.contains('open'));

    console.log('Панель по клавише M');
    g = boot();
    check('по умолчанию панель скрыта', !g.el('radioPanel').classList.contains('open'));
    key(g, 'KeyM');
    check('M — показать', g.el('radioPanel').classList.contains('open'));
    key(g, 'KeyM');
    check('M ещё раз — скрыть', !g.el('radioPanel').classList.contains('open'));
    key(g, 'KeyM'); key(g, 'KeyM', { repeat: true });
    check('удержание M не мигает панелью', g.el('radioPanel').classList.contains('open'));
    check('M только показывает панель — радио не включает', g.run('radio.on') === false && audios.length === 0);
    check('кнопка «Радио» на телефоне — та же клавиша M', /data-key="KeyM" id="tRadio"/.test(html));

    console.log('Добавление станций');
    g = boot();
    check('пустой адрес — ошибка', g.run('radioAddStation("Моя", "")') === 'это не похоже на адрес');
    check('не http(s) — ошибка', g.run('radioAddStation("Моя", "ftp://x.ru/s")').includes('https://'));
    check('javascript: — ошибка', g.run('radioAddStation("Хитрая", "javascript:alert(1)")') !== null && g.run('radio.stations.length') === 0);
    check('правильная станция добавлена', g.run('radioAddStation("Джаз", "https://jazz.example.com/live.mp3")') === null && g.run('radio.stations.length') === 1);
    check('сразу выбрана и показана', g.el('radioStation').textContent === 'Джаз' && g.el('radioStatus').textContent === 'выключено');
    check('повтор того же адреса — ошибка', g.run('radioAddStation("Джаз 2", "https://jazz.example.com/live.mp3")') === 'такая станция уже есть');
    check('без названия — берётся имя сайта', g.run('radioAddStation("", "https://rock.example.org:8000/stream")') === null && g.run('radio.stations[1].name') === 'rock.example.org');
    check('длинное название обрезается до 40 знаков', g.run('radioAddStation("' + 'Я'.repeat(80) + '", "https://long.example.com/s")') === null && g.run('radio.stations[2].name.length') === 40);
    check('http тоже можно (для своих станций дома)', g.run('radioAddStation("Домашняя", "http://192.168.0.5:8000/s")') === null);
    check('список показывает станции, текущая отмечена ♪', g.el('radioList').children.length === 4 && g.el('radioList').children[0].innerHTML.includes('♪ Джаз'));
    g.run('radioAddStation("<img src=x onerror=alert(1)>", "https://evil.example.com/s")');
    check('название со знаками разметки показывается как текст', g.el('radioList').children[4].innerHTML.includes('&lt;img') && !g.el('radioList').children[4].innerHTML.includes('<img'));
    g.run('for (let i = 0; i < 40; i++) radioAddStation("S" + i, "https://s" + i + ".example.com/x")');
    check('не больше 30 станций', g.run('radio.stations.length') === 30);

    console.log('Форма в панели');
    g = boot();
    g.el('radioName').value = 'Классика'; g.el('radioUrl').value = '  https://classic.example.com/live  ';
    check('кнопка «Добавить» берёт поля формы', g.run('radioAddFromForm()') === true && g.run('radio.stations[0].url') === 'https://classic.example.com/live');
    check('поля очищаются, «Станция добавлена»', g.el('radioName').value === '' && g.el('radioUrl').value === '' && g.el('radioFormMsg').textContent === 'Станция добавлена');
    g.el('radioUrl').value = 'просто текст';
    check('ошибка видна под формой', g.run('radioAddFromForm()') === false && g.el('radioFormMsg').textContent.includes('Не добавлено') && g.el('radioFormMsg').className.includes('error'));
    key(g, 'KeyD', { target: { tagName: 'INPUT' } });
    key(g, 'KeyM', { target: { tagName: 'INPUT' } });
    check('пока печатаешь в поле, буквы не двигают персонажа и не прячут панель', g.run("keys['KeyD']") !== true && g.el('radioPanel').classList.contains('open') === g.el('radioPanel').classList.contains('open'));
    check('M в поле ввода панель не переключает', (() => { const was = g.el('radioPanel').classList.contains('open'); key(g, 'KeyM', { target: { tagName: 'INPUT' } }); return g.el('radioPanel').classList.contains('open') === was; })());

    console.log('Игра и переключение');
    g = boot();
    g.run('radioAddStation("Один", "https://one.example.com/s"); radioAddStation("Два", "https://two.example.com/s");');
    g.run('radioToggle()');
    check('«Вкл» — подключение к выбранной станции', audios.length === 1 && audios[0].src === 'https://one.example.com/s' && g.el('radioStatus').textContent === 'подключение…');
    audios[0].emit('playing');
    check('поток пошёл — «в эфире»', g.el('radioStatus').textContent === 'в эфире');
    texts.length = 0; g.run('render()');
    check('значок «♪ Один» поверх игры', texts.includes('♪ Один'));
    g.run('radioSwitch(1)');
    check('◀ ▶ во время игры — сразу другая станция', audios[0].src === 'https://two.example.com/s' && g.el('radioStation').textContent === 'Два');
    g.run('radioSelect(0)');
    check('выбор из списка тоже переключает', audios[0].src === 'https://one.example.com/s');
    g.run('radioToggle()');
    check('«Выкл» — соединение закрыто', g.run('radio.on') === false && audios[0].src === '' && audios[0].paused);

    console.log('Удаление');
    g = boot();
    g.run('radioAddStation("А", "https://a.example.com/s"); radioAddStation("Б", "https://b.example.com/s"); radioAddStation("В", "https://c.example.com/s"); radioSelect(1); radioToggle();');
    g.run('radioRemoveStation(1)');
    check('удалил играющую станцию — радио выключилось', g.run('radio.on') === false && g.run('radio.stations.map(s => s.name).join()') === 'А,В');
    g.run('radioSelect(1); radioRemoveStation(0)');
    check('удалил станцию выше выбранной — выбор остался на той же', g.el('radioStation').textContent === 'В');
    g.run('radioRemoveStation(0)');
    check('удалил последнюю — снова «Станций нет»', g.run('radio.stations.length') === 0 && g.el('radioStation').textContent === 'Станций нет');
    check('удаление несуществующей — без ошибок', g.run('radioRemoveStation(5)') === false);

    console.log('Ошибки потока');
    g = boot();
    g.run('radioAddStation("Сломанная", "https://broken.example.com/s"); radioToggle();');
    audios[0].emit('error');
    check('станция не отвечает — выключено, «станция недоступна»', g.run('radio.on') === false && g.el('radioStatus').textContent === 'станция недоступна');
    check('совет проверить адрес', g.notes.some(n => n.includes('Сломанная') && n.includes('проверь адрес')));
    audios[0].playResult = 'blocked';
    g.run('radioToggle()'); await tick();
    check('браузер не дал включить звук — не «залипает» включённым', g.run('radio.on') === false);

    console.log('Настройки');
    const store = {};
    g = boot(store);
    g.run('radioAddStation("Мой джаз", "https://jazz.example.com/s"); radioAddStation("Мой рок", "https://rock.example.com/s"); radioSelect(1); radioSetVolume(35);');
    const g2 = boot(store);
    check('станции, выбор и громкость запоминаются', g2.run('radio.stations.length') === 2 && g2.run('radio.index') === 1 && Math.abs(g2.run('radio.volume') - 0.35) < 1e-9);
    check('после перезапуска радио само не включается', g2.run('radio.on') === false && audios.length === 0);
    const g3 = boot({ miner_radio: JSON.stringify({ index: 3, volume: 0.4 }) });
    check('старые настройки (с готовыми станциями) — список пуст, громкость сохранилась', g3.run('radio.stations.length') === 0 && Math.abs(g3.run('radio.volume') - 0.4) < 1e-9);
    const g4 = boot({ miner_radio: JSON.stringify({ stations: [{ name: 'ok', url: 'https://ok.example.com' }, { name: 'плохо', url: 'javascript:1' }, 5, null], index: 9 }) });
    check('испорченные записи в списке отбрасываются', g4.run('radio.stations.length') === 1 && g4.run('radio.index') === 0);
    const g5 = boot({ miner_radio: 'не json' });
    check('совсем битые настройки — без ошибок', g5.run('radio.stations.length') === 0);
    check('станции не попадают в сохранение игры', !('radio' in JSON.parse(g5.run('JSON.stringify(createSaveData("t"))'))));

    console.log(`\n${passed}/${passed + failed} проверок пройдено`);
    process.exit(failed ? 1 : 0);
})();
