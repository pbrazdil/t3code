# Garden

Fork: <https://github.com/pbrazdil/t3code>. Upstream: <https://github.com/pingdotgg/t3code>.
Checkout: `/Users/petrbrazdil/Repos/garden/t3code`.

`main` je přesná kopie zaznamenaného `upstream/main`. Veškeré vlastní změny patří do
`custom`, která sleduje `origin/custom`. Jedna logická změna má jeden commit.
Pushujeme pouze do `origin`; upstream PR nevytváříme. Aktualizace a nasazení se
provádějí jen na pokyn, bez plánovače nebo automatického publikování.

## Prostředí

Před prací přečti [AGENTS.md](AGENTS.md), [vývojový postup](docs/operations/development.md)
a případné další pokyny pro měněné adresáře. Příkazy znovu ověř proti checkoutované
verzi, zejména `package.json`, `pnpm-workspace.yaml` a nápovědě dev runneru/builderu.

Při přípravě na upstream commitu `4bfa2c1c8044c5b853d937d516fa74cf91d39b0b` projekt
předepisoval Node `26.12.1`, pnpm `12.14.0` a Vite+ `1.4.0`. Vite+ se instaluje
postupem z [README](README.md#install-vp); verzi vybírej podle aktuálního katalogu.
Na tomto stroji je `vp` v `~/.local/share/vite-plus/bin` a jeho prostředí v
`~/.config/vite-plus/env`. Systémové nástroje mají jiné verze. V samostatném shellu
zvol projektové verze bez změny globálních výchozích verzí:

```sh
cd /Users/petrbrazdil/Repos/garden/t3code
. "$HOME/.config/vite-plus/env"
eval "$(vp env exec \
  --node "$(node -p 'require("./package.json").engines.node')" \
  --package-manager "$(node -p 'require("./package.json").packageManager')" \
  vp env print)"
node --version
pnpm --version
vp --version
vp i --frozen-lockfile
git diff --exit-code -- pnpm-lock.yaml
```

Příkaz `vp i` je předepsaná instalace; `--frozen-lockfile` navíc zakazuje nechtěnou
změnu lockfilu. Pokud instalace selže, nejprve ověř verze nástrojů. Neregeneruj
lockfile jen kvůli starému pnpm. Neinstaluj souběžně s živým PID z `.t3/setup-running`.
macOS balení používá také Xcode/Command Line Tools a Rust; respektuj aktuální
požadavky builderu. Instalátor Vite+ na tomto stroji nahlásil neúplnou automatickou
konfiguraci shellu, proto je načtení prostředí výše explicitní.

Lokální konfigurace repozitáře:

```sh
git remote get-url origin
# Expected: https://github.com/pbrazdil/t3code.git
git remote get-url upstream
# Expected: https://github.com/pingdotgg/t3code.git
git config --local rerere.enabled true
git config --local remote.pushDefault origin
```

## Oddělené spuštění a updater

Po nastavení prostředí výše spusť vývojový desktop:

```sh
T3CODE_DISABLE_AUTO_UPDATE=true \
  vp run dev:desktop --home-dir "$PWD/.t3/dev" --no-seed
```

`--home-dir` se předává přímo za názvem úlohy, bez oddělovače `--`. Databáze je
v `.t3/dev/userdata`; `--no-seed` zakazuje automatické kopírování živých dat.
Pro webový vývoj lze použít `vp run dev` se stejnými argumenty. Porty čti ze
skutečného výstupu `[dev-runner]`, protože obsazený port posune výběr.
Nenastavuj `VITE_HTTP_URL` ani `VITE_WS_URL`.

Pokud je potřeba vzdálený webový přístup, použij dokumentované `vp run dev --share`
se stejným `--home-dir` a `--no-seed`. Ověř jeho privátní Tailscale Serve mapování
a předej vypsanou HTTPS pairing URL; token necommituj. Zachovej ostatní Serve
mapování a nepovoluj Funnel. Desktop dev režim `--share` nepodporuje.

Nativní `Garden.app` lze spustit přímo z Finderu. Bez konfigurace používá vlastní
home `~/.garden`: databázi pod `userdata` a profily Electronu pod `electron`.
Explicitní `T3CODE_HOME` tento home nahradí; dev runner do této proměnné převádí
`--home-dir`. Tím jsou oddělené Chromium databáze, cookies i zámek jedné instance.
Nic z živého profilu T3 Code se nemigruje; potřebná přihlášení se provedou samostatně.

T3 Connect je v sestavení dostupný jen s veřejnou konfigurací v gitignorovaném
`.env` (`cp .env.example .env`). Bez něj Garden přihlášení k T3 Connect nenabízí.
Soubor se necommituje; po novém checkoutu jej vytvoř znovu před sestavením.

Inbox čte zprávy přes desktopovou část Garden podle `~/.garden/inbox/channels.json`.
Každý kanál má `id`, `label`, `channel` (`telegram`, `zulip`), `color` a `command`;
Garden k příkazu přidá `--limit N` a pro starší stránky `--before <ISO čas>` a čeká
JSON pole zpráv od nejnovější (`id`, `sender`, `conversation`, `conversationId`,
`text`, `receivedAt`, `unread`, volitelně `media` s `label` a náhledem `image` jako data URL a profilové obrázky `senderAvatar` a `conversationAvatar` jako data URL). Pro zobrazení jednoho chatu přidá `--chat=<conversationId>`. Ve vývojovém webu (`vp run dev`) čte stejnou konfiguraci Vite dev server na `/__garden/inbox`, jen pro stránku otevřenou z `localhost`. Bez konfigurace a v sestaveném webu Inbox ukazuje ukázková data. Skript pro
Telegram, jeho přihlašovací údaje a session leží mimo repozitář v
`/Users/petrbrazdil/Repos/garden/telegram`. Skript pro Zulip (Braiins) a jeho `zuliprc` s API klíčem leží
v `/Users/petrbrazdil/Repos/garden/zulip`.

Úkoly z Inboxu se ukládají po prostředích do `~/.garden/inbox/tasks/<id prostředí>.json` (název, stav, odkazy na PR, výňatky přiřazených zpráv). Ve vývojovém webu je čte a zapisuje stejný dev endpoint.

Widget kalendáře v Inboxu ukazuje dnešní události z iCal adresy v `~/.garden/inbox/calendar.json` (`{"url": "…"}`). Tajná adresa kalendáře je přístupový údaj, soubor má práva 600 a zůstává mimo repozitář. Opakované události rozbaluje knihovna `ical.js`. Bez souboru se widget nezobrazí.

Fork má vlastní název `Garden` a bundle ID `com.pbrazdil.garden`, aby jej
macOS odlišil od oficiální aplikace i při přístupu k šifrovacímu klíči Electronu
v Klíčence. Vnitřní název zabalené aplikace je `garden`; také ten musí zůstat
odlišný, protože Electron vybírá položku Klíčenky před asynchronní inicializací
desktopu. Nepodepsané nové sestavení přesto může při další aktualizaci vyžadovat
ruční potvrzení přístupu k vlastní položce Klíčenky; stabilní podepisování není
součástí této přípravy. Viz [Electron: code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing).
Případný systémový dialog řeší uživatel; šifrování nevypínej.

Pro vlastní instalační artefakty použij existující preview verzi, která v builderu
vypíná update feed i při zděděné konfiguraci GitHubu:

```sh
fork_version="$(node -p 'require("./apps/server/package.json").version.split("-")[0]')-preview.$(date -u +%Y%m%d).$(date +%s)"
vp run dist:desktop:dmg \
  --build-version "$fork_version" \
  --output-dir "$PWD/release/$fork_version"
```

Příkaz sestaví server, web i Electron a na tomto arm64 Macu vytvoří DMG a ZIP.
Jde o lokální sestavení bez distribučního podpisu a notarizace; nevydává GitHub
release. Před každým použitím ověř `publish: null` v balicí konfiguraci a
nepřítomnost `Contents/Resources/app-update.yml` ve výsledné aplikaci. Mock updates
nezapínej. Kontrolu prováděj i po změnách upstream builderu.

ZIP rozbal do nového adresáře mimo `/Applications`, například:

```sh
mkdir -p "release/$fork_version/app"
ditto -x -k "release/$fork_version/Garden-$fork_version-arm64.zip" \
  "release/$fork_version/app"
open "release/$fork_version/app/Garden.app"
```

Aplikaci lze také zkopírovat jako `/Applications/Garden.app`, pokud tam již není
jiná instalace; stávající aplikaci nejprve ověř a zachovej. Pro oddělené ověření
zabaleného klienta z terminálu použij například:

```sh
env -u ELECTRON_RUN_AS_NODE -u T3CODE_CLI_PATH -u T3CODE_THREAD_ID \
  T3CODE_HOME="$PWD/.t3/desktop" T3CODE_DISABLE_AUTO_UPDATE=true \
  "release/$fork_version/app/Garden.app/Contents/MacOS/Garden"
```

Zabalený Electron používá `T3CODE_HOME`; `--home-dir` je zde příkaz dev runneru
a serverového CLI, nikoli přepínač desktopové aplikace. Pro běžné používání je
výchozí `~/.garden` bezpečně oddělené od T3 Code. Pro dev a ověření používej
explicitní různá home. Garden automaticky neinstaluje globální příkaz `t3` ani
nemění PATH. Lokální launcher pod `<home>/bin` zůstává dostupný; ruční instalace
přes Settings je samostatné rozhodnutí uživatele.
Odstranění zděděného `ELECTRON_RUN_AS_NODE` je nutné při spouštění z agenta uvnitř
T3 Code; jinak se binárka spustí jako Node místo desktopu. Dev launcher to řeší sám.

Desktopový updater bez feedu zůstává vypnutý; `T3CODE_DISABLE_AUTO_UPDATE=true`
je další existující pojistka při spuštění. Neměníme aktualizace agentních
providerů. Nepoužívej oficiální `t3 update`, service update ani přeinstalaci
z Homebrew/npm k aktualizaci forku: vlastní kód aktualizuje níže uvedený Git postup.

macOS sestavení používají vlastní [ikonu Garden](assets/garden/icon.png).
Builder z ní vytváří všechny velikosti ICNS; upstream `icons:export` ji nepřepisuje.
Pro čisté záhlaví bez vesmírného pozadí je v klientském profilu Garden nastaveno
**Settings → Appearance → Interface → Advanced → Environment identification → None**.
U nového profilu tuto existující volbu nastav znovu; jde o nastavení klienta,
nikoli serveru, ke kterému je připojený.

## Garden jako klient běžícího T3 Code

Pro běžné používání je Garden připojený k existujícímu serveru T3 Code na tomto
Macu. V Garden je v **Settings → Environments** vypnuté **Local environment**
a zapnuté připojení **Petr’s Mac Studio** přes **This device**. Spuštění:

```sh
open /Applications/Garden.app
```

T3 Code musí zůstat běžet. Jedině jeho server vlastní `~/.t3/userdata`; Garden
čte projekty a historii a odesílá změny přes serverové API. Klientský profil
a uložené připojení Garden zůstávají pod `~/.garden`. Nenastavuj Garden
`T3CODE_HOME=~/.t3`, nesymlinkuj datové adresáře a nespouštěj druhý server nad
živými daty. Původní samostatná data Garden zachovej; tento režim je neslučuje.

Při novém párování vytvoř v T3 Code v **Settings → Sharing & access** jednorázový
odkaz pro **This machine** s popisem `Garden desktop`. V Garden jej přidej přes
**Settings → Environments → Add environment**, ověř připojení a teprve potom
vypni **Local environment**. Jeho vypnutí restartuje Garden a zastaví jeho vlastní
agenty a terminály; předem ověř, že zde neběží potřebná práce. Párovací kódy ani
uložené přihlašovací údaje necommituj. Není potřeba měnit síťové sdílení serveru.

Po aktualizaci ověř také opětovné připojení po spuštění, dostupnost existujícího
projektu a vlákna a vypnuté **Local environment**. Klient a server mohou mít různé
verze, proto samotné úspěšné sestavení nepotvrzuje jejich kompatibilitu. V tomto
režimu se používá serverový kód T3 Code; serverové změny forku testuj s vlastním
serverem a odděleným home podle postupu výše. Přechod vlastnictví živých dat na
server Garden je samostatná migrace, nikoli součást aktualizace klienta.

## Aktualizace upstreamu: a–h

Kroky prováděj v tomto pořadí v jednom samostatném Bash shellu. Při jakékoli
nesplněné podmínce zastav a vyřeš příčinu; další bloky nejsou pokračování po chybě.
Necommituj a nestashuj automaticky práci jiného člověka nebo agenta.

### a) Čistý pracovní strom a žádná rozpracovaná operace

```bash
set -euo pipefail
cd /Users/petrbrazdil/Repos/garden/t3code
test -z "$(git status --porcelain=v1)"
for state in MERGE_HEAD CHERRY_PICK_HEAD REVERT_HEAD rebase-merge rebase-apply sequencer; do
  test ! -e "$(git rev-parse --git-path "$state")"
done
git worktree list
git switch custom
test "$(git remote get-url origin)" = 'https://github.com/pbrazdil/t3code.git'
test "$(git remote get-url --push origin)" = 'https://github.com/pbrazdil/t3code.git'
test "$(git remote get-url upstream)" = 'https://github.com/pingdotgg/t3code.git'
```

Je-li `main` či `custom` otevřená v jiném worktree, koordinuj práci s jeho
vlastníkem. Nepoužívej `--ignore-other-worktrees` a neobcházej zámky.

### b) Fetch a záznam přesných SHA

```bash
git fetch origin
git fetch upstream
custom_before=$(git rev-parse 'custom^{commit}')
origin_custom_before=$(git rev-parse 'origin/custom^{commit}')
target_upstream=$(git rev-parse 'upstream/main^{commit}')
origin_main_before=$(git rev-parse 'origin/main^{commit}')
old_base=$(git merge-base "$custom_before" "$target_upstream")
update_id="$(date -u +%Y%m%dT%H%M%SZ)-$(uuidgen | tr '[:upper:]' '[:lower:]')"
record_dir=$(git rev-parse --git-path "fork-updates/$update_id")
mkdir -p "$record_dir"
declare -p custom_before origin_custom_before target_upstream origin_main_before old_base update_id \
  > "$record_dir/refs.sh"
cat "$record_dir/refs.sh"
```

Tento záznam uchovej do konce aktualizace. Případný další fetch nesmí změnit
`origin_custom_before` použité pro lease ani cílový upstream commit.

### c) Lokální custom musí obsahovat origin/custom

```bash
git merge-base --is-ancestor "$origin_custom_before" "$custom_before"
```

Pokud kontrola selže, prohlédni `git log --left-right --graph custom...origin/custom`.
Zjisti, zda někdo přidal změny, přepsal historii nebo zda lokální větev jen zaostává.
Případné fast-forward nebo sjednocení historie proveď vědomě a začni znovu od a).
Odlišnou historii nepřekrývej force pushem.

### d) Unikátní záložní větev

```bash
backup="backup/custom-$update_id"
git branch "$backup" "$custom_before"
declare -p backup >> "$record_dir/refs.sh"
test "$(git rev-parse "$backup")" = "$custom_before"
```

### e) Přesná synchronizace main a běžný push

```bash
git merge-base --is-ancestor main "$target_upstream"
git merge-base --is-ancestor "$origin_main_before" "$target_upstream"
git switch main
git merge --ff-only "$target_upstream"
test "$(git rev-parse main)" = "$target_upstream"
test "$(git rev-parse main)" = "$(git rev-parse upstream/main)"
git push origin main:refs/heads/main
test "$(git ls-remote origin refs/heads/main | cut -f1)" = "$target_upstream"
```

Samotné `--ff-only` neprokazuje shodu: lokální `main` může obsahovat další commity.
Pokud první ancestry kontrola selže, zastav. Zachovej tip `main` v unikátní větvi
`rescue/main-<id>`, prohlédni rozdíl a přenes potřebné vlastní commity do `custom`
podle jejich smyslu. Teprve po ověření lze původní `main` přejmenovat na rescue
a vytvořit novou `main` ze společného předka s upstreamem; odtud lze udělat
fast-forward. Potom začni celý postup znovu. Nepoužívej slepý reset.

Pokud vlastní nebo přepsané commity obsahuje také `origin/main`, zachovej i její
tip jako rescue a zastav aktualizaci. Přesnou shodu nelze v takové situaci obnovit
běžným pushem; vyžaduje to samostatné rozhodnutí o vzdálené historii. Tento postup
nedává oprávnění vynutit přepis `origin/main`.

### f) Rebase custom na zaznamenaný commit

```bash
git switch custom
git rebase "$target_upstream"
```

Konflikty řeš podle zamýšleného chování jednotlivých commitů. Nepřebírej plošně
`ours` ani `theirs`; při rebase mají navíc odlišný význam než při běžném merge.
Výsledek `rerere` vždy prohlédni, označ vyřešené soubory a použij
`git rebase --continue`. Přerušený rebase dokonči nebo abortuj před další prací.

### g) Kontrola změn, instalace a ověření

```bash
git range-diff "$old_base..$custom_before" "$target_upstream..custom"
git diff --stat "$target_upstream" custom
git diff "$target_upstream" custom
git diff --check
```

Každý vypuštěný nebo změněný vlastní commit musí mít vysvětlení. Znovu zvol verze
nástrojů podle nového `package.json` postupem z oddílu Prostředí. Pak spusť:

```bash
vp i --frozen-lockfile
git diff --exit-code -- pnpm-lock.yaml
test "$(git rev-parse upstream/main)" = "$target_upstream"
vp run check:changed upstream/main
```

Doplň cílené testy měněného chování. Pro současnou izolaci profilů a updater jsou
relevantní tyto existující sady:

```bash
vp test run \
  apps/desktop/src/app/DesktopEnvironment.test.ts \
  apps/desktop/src/app/DesktopUserData.test.ts \
  apps/desktop/src/app/DesktopAppIdentity.test.ts \
  apps/desktop/src/app/DesktopClerk.test.ts \
  apps/desktop/src/updates/DesktopUpdates.test.ts \
  apps/desktop/src/updates/remoteUpdateFlow.test.ts \
  apps/server/src/provider/providerMaintenanceRunner.test.ts
vp test run scripts/build-desktop-artifact.test.ts -t 'omits update feeds'
vp test run scripts/dev-runner.test.ts -t 'prefers an explicit --home-dir'
```

Pro používaný macOS klient spusť výše uvedený `vp run dist:desktop:dmg` s preview
verzí a novým výstupním adresářem. Nepoužívej staré bundly přes `--skip-build`.
Nespouštěj plošné kontroly, které aktuální `AGENTS.md` přenechává CI.

Ověř skutečné spuštění vývojové i zabalené verze. Ověř také start `Garden.app`
bez `T3CODE_HOME`, který musí použít `~/.garden` a nesmí instalovat globální `t3`.
Pro ověření zabalené verze s testovacími konverzacemi použij
nové `.t3/verify-<id>`; jako nesenzitivní data lze do jeho `userdata/statev2.sqlite`
zkopírovat `scripts/fixtures/desktop-launch/statev2.sqlite`. Ve skutečném klientu
otevři vlákno „Release launch check“ a zkontroluj jeho zprávu. Ověř:

- databázi a logy pod zvoleným home, Electron profil pod `<home>/electron`;
- souběh s běžnou instalací bez zásahu do jejího procesu, profilu a dat;
- vypnutý desktopový updater, chybějící update feed a zachované ovládání providerů;
- relevantní vlastní funkce, případně další klienty a vstupní body dle `AGENTS.md`.

Procesy zastavuj pouze podle PID zachyceného při jejich spuštění. Nepoužívej
`pkill` ani vyhledávání a zabíjení procesů podle názvu. Před prvním spuštěním nové
verze proti používaným datům forku zastav jen fork a zálohuj celé jeho home mimo
tento home, například do `.t3/data-backups/<id>`. Živá data běžné instalace nepoužívej.
Zaznamenej verze, výsledky kontrol, cestu a SHA-256 artefaktu a použitý testovací
home do lokálního záznamu aktualizace. Úspěšný rebase není důkaz funkčnosti.

### h) Push až po úspěšném ověření

Opravy nutné během ověření nejprve projdi, commitni jako srozumitelné změny na
`custom` a znovu ověř dotčené chování. Nikdy nepřibírej cizí práci. Potom:

```bash
test -z "$(git status --porcelain=v1)"
test "$(git branch --show-current)" = custom
git merge-base --is-ancestor "$target_upstream" custom
git push --force-with-lease="refs/heads/custom:$origin_custom_before" \
  origin custom:refs/heads/custom
git branch --set-upstream-to=origin/custom custom
test "$(git rev-parse custom)" = "$(git ls-remote origin refs/heads/custom | cut -f1)"
```

Nikdy nepoužívej prosté `--force` ani lease bez explicitního očekávaného SHA.
Pokud lease selže, prozkoumej nové vzdálené změny; nepřepiš pouze proměnnou novým
SHA a neopakuj push. Zachovej rozpracovaný výsledek, sjednoť práci a opakuj celý
postup se zálohou a ověřením. Záložní větev nemaž při předání.

## Přerušení a návrat

Při rozpracovaném rebase použij `git rebase --abort`. Vrátí větev do stavu před
rebasem; následně ověř tip proti záznamu a pracovní strom. Po abortu zůstává
`main` na novém upstreamu, což je v pořádku.

Po dokončeném rebase zachovej jeho výsledek a starý kód otevři bezpečně v nové
větvi, například `git switch -c "recovery/custom-$update_id" "$backup"`. Neprováděj
`reset --hard`. Má-li se starý tip opět jmenovat `custom`, nejprve zachovej novou
`custom` pod unikátním názvem a teprve potom vytvoř `custom` ze zálohy. Obnovený
kód znovu ověř; případný vzdálený návrat musí mít nové výslovné očekávané SHA
`origin/custom` a vlastní kontrolu souběžných změn.

**Návrat kódu nevrací databázové migrace.** Starý build nespouštěj proti databázi,
kterou už migrovala novější verze. Pro návrat použij kopii celého home ze zálohy
před aktualizací do nového adresáře a explicitně jej zvol při spuštění. Novější
data zachovej zvlášť; jejich sloučení nebo downgrade vyžaduje samostatné posouzení.
