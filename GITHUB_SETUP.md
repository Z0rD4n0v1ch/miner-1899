# Привязка проекта к GitHub — пошагово

Руководство для публикации Miner 1899 в репозитории `Z0rD4n0v1ch/miner-1899`.

Делать нужно **на своём компьютере в терминале**, не в веб-интерфейсе GitHub и не в чате с ИИ.

---

## Шаг 0. Что должно быть готово

| Что | Как проверить |
|---|---|
| Git установлен | `git --version` → должно вывести версию, например `git version 2.43.0` |
| Аккаунт на GitHub | войти на github.com |
| Архив проекта | `miner-1899.zip` скачан |
| Терминал | macOS — Terminal.app; Linux — любой; Windows — **Git Bash** |

Если `git --version` пишет «command not found» — установи Git с <https://git-scm.com/downloads> и **перезапусти терминал**.

### Терминал на Windows

В PowerShell команды `unzip` нет. Использовать **Git Bash** (ставится вместе с Git) либо аналог в PowerShell:

```powershell
Expand-Archive miner-1899.zip -DestinationPath .
```

Дальше все команды одинаковы для всех систем.

---

## Шаг 1. Настроить Git (один раз за всю жизнь)

```bash
git config --global user.name "Z0rD4n0v1ch"
git config --global user.email "твоя@почта"
```

Почта должна совпадать с той, что привязана к аккаунту GitHub — иначе коммиты не будут к тебе привязаны в истории.

Проверить:

```bash
git config --global --list
```

---

## Шаг 2. Создать пустой репозиторий на GitHub

1. Открой <https://github.com/new>
2. **Repository name:** `miner-1899` — ровно так, иначе ссылки в README разъедутся с реальностью
3. **Public** (или Private — на инструкцию не влияет)
4. **НЕ ставь галочки** на «Add a README file», «Add .gitignore», «Choose a license»

Галочки важны: если GitHub создаст первый коммит, `git push` упрётся в ошибку «remote contains work you do not have».

5. **Create repository** — откроется страница с командами, их выполнять не нужно, у нас свои.

---

## Шаг 3. Распаковать проект

```bash
cd ~/Downloads
unzip miner-1899.zip
cd miner-1899
```

На Windows архив обычно в `C:\Users\ТЫ\Downloads` — в Git Bash это `cd ~/Downloads`.

Проверить, что мы в нужной папке:

```bash
ls -a
```

Ожидаемый вывод: `index.html  README.md  CHANGELOG.md  LICENSE  .gitignore  .github  .git`

Наличие `.git` означает, что история коммитов и теги уже внутри архива — заново инициализировать не нужно.

---

## Шаг 4. Настроить авторизацию

Выбери **один** из трёх способов. SSH — самый надёжный, рекомендую его.

### Вариант A — SSH-ключ (рекомендуется)

Токены истекают, ключ — нет.

```bash
ssh-keygen -t ed25519 -C "твоя@почта"
```

На все вопросы просто нажимай Enter (пароль на ключ можно не ставить).

```bash
cat ~/.ssh/id_ed25519.pub
```

Скопируй **весь** вывод целиком, начиная с `ssh-ed25519`.

Далее: GitHub → аватар → **Settings** → **SSH and GPG keys** → **New SSH key** → Title любой → вставить ключ → **Add SSH key**.

Проверка связи:

```bash
ssh -T git@github.com
```

Ожидаемый ответ: `Hi Z0rD4n0v1ch! You've successfully authenticated...` Сообщение «does not provide shell access» — это нормально, доступ не нужен.

### Вариант B — HTTPS с Personal Access Token

GitHub → аватар → **Settings** → **Developer settings** → **Personal access tokens** → **Tokens (classic)** → **Generate new token (classic)**.

- **Note:** любое, например `miner-1899 push`
- **Expiration:** 90 дней
- **Scopes:** обязательно галочка **`repo`** (для публичного репозитория хватит `public_repo`, но `repo` надёжнее)

**Generate token** → скопировать токен сразу (второй раз он не покажется, только `ghp_...` однажды).

При первом push git спросит:
- **Username:** `Z0rD4n0v1ch`
- **Password:** вставить **токен**, не пароль от аккаунта

### Вариант C — GitHub CLI

Самый простой: авторизация и настройка git в одной команде.

```bash
gh auth login
```

Отвечать на вопросы: `GitHub.com` → `SSH` → `Yes` → `Login with a web browser` → вписать код в браузере.

---

## Шаг 5. Привязать репозиторий и запушить

Выбери адрес под свой способ авторизации.

**Для SSH (вариант A или C):**

```bash
git remote add origin git@github.com:Z0rD4n0v1ch/miner-1899.git
```

**Для HTTPS (вариант B):**

```bash
git remote add origin https://github.com/Z0rD4n0v1ch/miner-1899.git
```

Затем — сам push:

```bash
git push -u origin main --tags
```

Разбор флагов:
- `-u` — связать локальную `main` с `origin/main`, дальше достаточно просто `git push`
- `--tags` — **обязательно**, иначе теги `v1.1.0` и `v1.1.1` останутся локально и релизы на GitHub не появятся

Если авторизация была настроена неверно, git спросит логин/пароль прямо сейчас.

**Если подставить адрес забыл и `origin` уже есть:**

```bash
git remote set-url origin git@github.com:Z0rD4n0v1ch/miner-1899.git
```

---

## Шаг 6. Проверить результат

```bash
git remote -v          # какой адрес привязан
git log --oneline      # история: 2 коммита
git tag                # теги: v1.1.0 и v1.1.1
git ls-remote --tags origin   # какие теги доехали до GitHub
```

Открой `https://github.com/Z0rD4n0v1ch/miner-1899` — файлы на месте, теги видны на странице **Releases** (пока как теги, без описания).

---

## Шаг 7. Включить GitHub Pages

Без этого шага workflow отработает, но сайт не поднимется.

1. Репозиторий → **Settings** → **Pages**
2. **Source:** `GitHub Actions` (не «Deploy from a branch»)
3. Вернуться на вкладку **Actions** — там должен идти или уже завершиться workflow «Deploy to GitHub Pages»

Через 1–2 минуты игра будет доступна по адресу:

```
https://Z0rD4n0v1ch.github.io/miner-1899/
```

---

## Шаг 8. Оформить релиз (по желанию)

1. Репозиторий → **Releases** → **Draft a new release**
2. **Choose a tag:** `v1.1.1`
3. **Release title:** `Miner 1899 v1.1.1`
4. **Describe this release:** скопировать раздел `[1.1.1]` из `CHANGELOG.md`
5. **Publish release**

Так история версий становится видимой для тех, кто зайдёт на репозиторий.

---

## Шаг 9. Как выпускать обновления дальше

Цикл из пяти действий:

```bash
# 1. Что-то поменял в index.html

# 2. Добавил запись в CHANGELOG.md

# 3. Коммит
git add -A
git commit -m "feat: улучшаемые кирки"

# 4. Тег (по SemVer: MAJOR.MINOR.PATCH)
git tag -a v1.2.0 -m "Release 1.2.0 — кирки"

# 5. Отправить
git push --tags
```

Что выбирать для тега:

| Ситуация | Пример версии |
|---|---|
| Починил баг | `1.2.0` → `1.2.1` |
| Добавил функцию | `1.2.1` → `1.3.0` |
| Сломал совместимость сохранений | `1.3.0` → `2.0.0` |

После push workflow сам передеплоит сайт — отдельно ничего запускать не нужно.

**Правило про сохранения:** `SAVE_VERSION` в `index.html` поднимается **только** если старые сохранения перестают читаться. Добавил руду — версия игры растёт, `SAVE_VERSION` стоит на месте.

---

## Частые ошибки

| Ошибка | Причина и решение |
|---|---|
| `Permission to ... denied` / `403` | Токен без scope `repo`. Пересоздать токен с галочкой `repo`. Либо git подставляет старый токен из кэша — сбросить: Windows → Диспетчер учётных данных → удалить `git:https://github.com`; macOS → `git credential-osxkeychain erase` + две пустые строки; Linux → `git config --global --unset credential.helper && rm -f ~/.git-credentials` |
| `Authentication failed` (`401`) | Неверный токен или вместо токена введён пароль от аккаунта |
| `Repository not found` | Репозиторий не создан, или опечатка в нике/имени |
| `remote origin already exists` | `git remote set-url origin <адрес>` вместо `add` |
| `src refspec main does not match any` | Ты не в папке проекта, либо архив распакован без `.git` |
| `remote contains work you do not have` | При создании репозитория была поставлена галочка «Add a README». Лечится: `git pull --rebase origin main` → затем push |
| `unzip: command not found` | Windows PowerShell — использовать `Expand-Archive` или Git Bash |
| Pages открывает 404 | В Settings → Pages источник не переключён на GitHub Actions |
| Сайт открылся, но пустой / старый | Workflow ещё идёт — смотреть вкладку **Actions** |
| Push прошёл, тегов нет | Забыт флаг `--tags`: `git push --tags` |

---

## Безопасность

- Токен и SSH-ключ — как пароль. Не отправлять в мессенджеры, в чаты, в скриншоты.
- Токен, попавший в чужой интерфейс, считается утёкшим: отозвать в **Settings → Developer settings → Personal access tokens** и создать новый.
- Проверить права токена не раскрывая его:

```bash
read -s -p "Токен: " TOKEN; echo
curl -sS -o /dev/null -D - -H "Authorization: token $TOKEN" \
  https://api.github.com/user | grep -i x-oauth-scopes
```

Вывод покажет только список прав, сам токен нигде не печатается.

---

## Весь путь одной шпаргалкой (SSH)

```bash
# один раз
git config --global user.name "Z0rD4n0v1ch"
git config --global user.email "твоя@почта"
ssh-keygen -t ed25519 -C "твоя@почта"      # потом добавить ключ на GitHub
ssh -T git@github.com                       # проверка

# для проекта
cd ~/Downloads
unzip miner-1899.zip
cd miner-1899
git remote add origin git@github.com:Z0rD4n0v1ch/miner-1899.git
git push -u origin main --tags

# затем в браузере: Settings → Pages → Source: GitHub Actions
```
