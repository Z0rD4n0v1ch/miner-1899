#!/usr/bin/env bash
# Объединение истории miner-1899: локальная история становится главной,
# а изменения, сделанные через сайт GitHub, переносятся в неё.
# Запуск из папки репозитория в Git Bash:  bash fix-history.sh

set -e

ask() { read -r -p "$1 (y/N): " a; [[ "$a" == "y" || "$a" == "Y" ]]; }

echo "== 1. Проверки"
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Это не git-репозиторий."; exit 1; }
[[ "$(git branch --show-current)" == "main" ]] || { echo "Переключись на ветку main: git checkout main"; exit 1; }
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
    echo "Есть незакоммиченные изменения. Закоммить или отмени их и запусти снова."
    git status --short --untracked-files=no
    exit 1
fi
git fetch origin
OLD_REMOTE=$(git rev-parse origin/main)

echo "== 2. Резервные копии"
git branch -f backup/github-old origin/main
git branch -f backup/local-before-merge main
git push -q origin backup/github-old
echo "Старая история GitHub сохранена в ветке backup/github-old (и у тебя, и на GitHub)."
echo "Локальная история до изменений — в ветке backup/local-before-merge."

echo "== 3. Перенос изменений с GitHub"
if [[ -f sync.sh ]] && ! git ls-files --error-unmatch sync.sh >/dev/null 2>&1; then
    cp sync.sh sync.sh.local-backup
    echo "Твой локальный sync.sh сохранён как sync.sh.local-backup."
fi
git checkout origin/main -- README.md LICENSE sync.sh
git rm -q --ignore-unmatch GITHUB_SETUP.md .github/workflows/deploy.yml
cat > .gitattributes << 'ATTR'
* text=auto
*.sh text eol=lf
ATTR
git add .gitattributes README.md LICENSE sync.sh
git commit -q -m "Перенос изменений с GitHub" \
    -m "- README.md, LICENSE, sync.sh — версии с GitHub
- удалены GITHUB_SETUP.md и .github/workflows/deploy.yml (как на GitHub)
- .gitattributes: скрипты .sh всегда с окончаниями LF"
# переписать .sh на диске с LF, чтобы bash их не ломал
for f in $(git ls-files '*.sh'); do rm -f "$f"; git checkout -- "$f"; done
echo "Коммит создан: $(git log -1 --oneline)"

echo "== 4. Тег v1.2.0"
if git rev-parse -q --verify refs/tags/v1.2.0 >/dev/null; then
    echo "Тег v1.2.0 уже есть."
else
    C=""
    for h in $(git rev-list main -- index.html); do
        if git show "$h:index.html" 2>/dev/null | grep -q "GAME_VERSION = '1.2.0'"; then C=$h; break; fi
    done
    if [[ -n "$C" ]]; then
        git tag -a v1.2.0 "$C" -m "Miner 1899 v1.2.0"
        echo "Тег v1.2.0 поставлен на: $(git log -1 --oneline "$C")"
    else
        echo "Коммит с версией 1.2.0 не найден, тег пропущен."
    fi
fi

echo "== 5. Что уйдёт на GitHub"
git log --oneline --decorate -12 main
echo
echo "Ветка main на GitHub будет ЗАМЕНЕНА этой историей."
echo "Старая остаётся в ветке backup/github-old."
if ! ask "Отправить?"; then
    echo "Ничего не отправлено. Локальные изменения остались; откатить: git reset --hard backup/local-before-merge"
    exit 0
fi
git push -u --force-with-lease=main:"$OLD_REMOTE" origin main
git push origin --tags

echo
echo "Готово. GitHub и твой компьютер синхронизированы."
