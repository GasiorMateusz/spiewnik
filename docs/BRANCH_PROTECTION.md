# Zasady Ochrony Gałęzi Głównej (Branch Protection Policy)

Dokument określa politykę bezpieczeństwa i reguły ochrony głównej gałęzi `master` w repozytorium `GasiorMateusz/spiewnik`.

---

## 1. Cel Polityki

Zapewnienie stabilności wdrożeń produkcyjnych na GitHub Pages oraz uniemożliwienie przypadkowych zmian i uszkodzeń bazy kodu:
- **Zakaz bezpośrednich wypchnięć (push)** na gałąź `master`.
- **Wymóg Pull Requestów (PR)** dla wszystkich zmian, nowych funkcji i poprawek.
- **Wymóg przejścia automatycznych testów CI** (`lint`, `build`, suite 497 testów) przed scaleniem.
- **Zakaz wymuszania wypchnięć (force push)** oraz usuwania gałęzi `master`.

---

## 2. Zalecana Konfiguracja GitHub Branch Protection

W ustawieniach repozytorium GitHub (**Settings -> Branches -> Add branch protection rule**):

| Parametr reguły | Wartość | Uzasadnienie |
|---|---|---|
| **Branch name pattern** | `master` | Dotyczy głównej gałęzi produkcyjnej. |
| **Require a pull request before merging** | **Zaznaczone** (Enabled) | Wymusza tworzenie PR dla każdej zmiany. |
| **Require approvals** | 1 (lub wg potrzeb) | Wymaga przeglądu kodu przed scaleniem. |
| **Dismiss stale pull request approvals when new commits are pushed** | **Zaznaczone** | Nowy commit unieważnia poprzednie zatwierdzenie. |
| **Require status checks to pass before merging** | **Zaznaczone** | Sprawdza status GitHub Actions workflow. |
| **Status checks that are required** | `build-and-test` (lub nazwa zadania w workflow) | Gwarantuje, że kod buduje się bez błędów TypeScript i przechodzi testy. |
| **Require branches to be up to date before merging** | **Zaznaczone** | PR musi być zsynchronizowany z aktualnym `master`. |
| **Do not allow bypassing the above settings** | **Zaznaczone** | Dotyczy także administratorów repozytorium. |
| **Restrict who can push to matching branches** | Tylko uprawnieni | Blokuje direct push. |

---

## 3. Konfiguracja przez GitHub CLI lub REST API

Dla administratora repozytorium regułę można wdrożyć również za pomocą polecenia `gh` lub API:

```bash
gh api \
  --method PUT \
  -H "Accept: application/vnd.github+json" \
  /repos/GasiorMateusz/spiewnik/branches/master/protection \
  -f required_status_checks='{"strict":true,"contexts":["deploy"]}' \
  -f enforce_admins=true \
  -f required_pull_request_reviews='{"dismiss_stale_reviews":true,"require_code_owner_reviews":false,"required_approving_review_count":1}' \
  -f restrictions=null
```

---

## 4. Standard Pracy dla Zmian w Kodzie (Workflow)

1. Stwórz nową gałąź z aktualnego `master`:
   ```bash
   git checkout master
   git pull origin master
   git checkout -b feat/nazwa-funkcji
   ```
2. Wprowadź zmiany i sprawdź testy lokalnie:
   ```bash
   npm run lint
   npx tsx tests/run_all_tests.ts
   npm run build
   ```
3. Zatwierdź commity zgodnie ze standardem **Conventional Commits**:
   ```bash
   git commit -m "feat(chords): add alternate fingering support"
   ```
4. Wypchnij gałąź do repozytorium i utwórz Pull Request:
   ```bash
   git push -u origin feat/nazwa-funkcji
   gh pr create --title "feat: add alternate fingering support" --body "Opis zmian..."
   ```
5. Po przejściu testów CI i akceptacji, scal PR metodą **Squash and merge** lub **Rebase and merge**.
