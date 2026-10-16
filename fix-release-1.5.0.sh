#!/usr/bin/env bash
# Исправление выпуска v1.5.0: в тег не попали биомы, особая руда и опасности.
# Скрипт делает коммит с недостающим и переносит тег v1.5.0 на него.
# Запуск из папки репозитория в Git Bash:  bash fix-release-1.5.0.sh
# Перед запуском положи в папку: miner-1899.html, biomes.test.js, ores.test.js, hazards.test.js

set -e
ask() { read -r -p "$1 (y/N): " a; [[ "$a" == "y" || "$a" == "Y" ]]; }

echo "== 1. Проверки"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Это не git-репозиторий."; exit 1; }
[[ "$(git branch --show-current)" == "main" ]] || { echo "Переключись на main: git checkout main"; exit 1; }
for f in miner-1899.html biomes.test.js ores.test.js hazards.test.js; do
    [[ -f "$f" ]] || { echo "Нет файла $f — положи его в папку и запусти снова."; exit 1; }
done
grep -q "GAME_VERSION = '1.5.0'" miner-1899.html || { echo "В miner-1899.html не версия 1.5.0 — возьми файл из последнего сообщения Claude."; exit 1; }
grep -q "function updateHazards" miner-1899.html || { echo "В miner-1899.html нет опасностей — это старый файл."; exit 1; }
git rev-parse -q --verify refs/tags/v1.5.0 >/dev/null || { echo "Тега v1.5.0 нет — исправлять нечего, выпускай обычно."; exit 1; }
git fetch -q origin
[[ "$(git rev-list --count main..origin/main)" == "0" ]] || { echo "На GitHub есть коммиты, которых нет у тебя. Остановился — пришли вывод Claude."; exit 1; }

echo "== 2. Тесты"
if command -v node >/dev/null 2>&1; then
    FAILED=""
    for t in *.test.js; do node "$t" >/dev/null 2>&1 && echo "  ✓ $t" || { echo "  ✗ $t"; FAILED="$FAILED $t"; }; done
    [[ -z "$FAILED" ]] || { echo "Упали:$FAILED — остановился."; exit 1; }
else
    echo "Node.js не найден, тесты пропущены."
fi

echo "== 3. Коммит"
# картинки-превью из переписки в репозитории не нужны
for img in shop.png ores-preview.png hazards-preview.png biomes-preview.png; do
    git ls-files --error-unmatch "$img" >/dev/null 2>&1 && git rm -q "$img" && echo "  убрал $img"
done
git add miner-1899.html biomes.test.js ores.test.js hazards.test.js
git commit -q -m "feat: биомы — вид, твёрдость, особая руда, опасности; здоровье" \
    -m "Догоняет выпуск 1.5.0: эти изменения описаны в CHANGELOG, но не попали в первый тег v1.5.0."
echo "  $(git log -1 --oneline)"

echo "== 4. Перенос тега v1.5.0"
echo "Сейчас v1.5.0 указывает на: $(git log -1 --oneline v1.5.0)"
echo "Будет указывать на:         $(git log -1 --oneline HEAD)"
if ! ask "Перенести тег и отправить на GitHub?"; then
    echo "Коммит остался локально, тег не тронут. Отменить коммит: git reset --soft HEAD~1"
    exit 0
fi
git tag -d v1.5.0 >/dev/null
git tag -a v1.5.0 -m "Miner 1899 v1.5.0 — лопата, долг, бег, биомы, здоровье и опасности"
git push -q origin main
git push -q origin :refs/tags/v1.5.0
git push -q origin v1.5.0
echo "  ✓ v1.5.0 теперь на $(git log -1 --oneline v1.5.0)"

echo "== 5. Лишний тег v1.3.1"
if git rev-parse -q --verify refs/tags/v1.3.1 >/dev/null; then
    echo "Выпуска 1.3.1 в CHANGELOG нет: его исправления вошли в 1.4.0."
    if ask "Удалить тег v1.3.1 у себя и на GitHub?"; then
        git tag -d v1.3.1 >/dev/null
        git push -q origin :refs/tags/v1.3.1
        echo "  ✓ v1.3.1 удалён"
    fi
fi

echo
echo "Готово. Проверка: git status -sb  и  git log --oneline -3"
