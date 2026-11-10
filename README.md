# Śpiewnik PWA 🎸📖

Nowoczesny, mobilny śpiewnik offline stworzony z myślą o muzykach, gitarzystach i wokalistach. Działa w 100% w trybie offline jako aplikacja PWA (Progressive Web App), bez potrzeby stałego dostępu do internetu.

[![Wdrożenie GitHub Pages](https://github.com/GasiorMateusz/spiewnik/actions/workflows/deploy.yml/badge.svg)](https://github.com/GasiorMateusz/spiewnik/actions/workflows/deploy.yml)
[![PWA Ready](https://img.shields.io/badge/PWA-100%25%20Offline-success.svg)](https://gasiormateusz.github.io/spiewnik/)
[![React 19](https://img.shields.io/badge/React-19.0-blue.svg)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org)
[![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4.0-38bdf8.svg)](https://tailwindcss.com)

🔗 **Aplikacja na żywo (Live Demo)**: [https://gasiormateusz.github.io/spiewnik/](https://gasiormateusz.github.io/spiewnik/)

---

## 📱 Instalacja na Telefonie (PWA)

Aplikację można zainstalować bezpośrednio na ekranie głównym smartfona lub tabletu:

### Android (Google Chrome / Edge)
1. Otwórz adres [https://gasiormateusz.github.io/spiewnik/](https://gasiormateusz.github.io/spiewnik/).
2. Rozwiń menu przeglądarki (trzy kropki w prawym górnym rogu).
3. Wybierz opcję **„Zainstaluj aplikację”** lub **„Dodaj do ekranu głównego”**.
4. Aplikacja otworzy się w pełnym oknie bez pasków przeglądarki i będzie działać bez dostępu do sieci.

### iOS / iPadOS (Safari)
1. Otwórz adres [https://gasiormateusz.github.io/spiewnik/](https://gasiormateusz.github.io/spiewnik/) w przeglądarce **Safari**.
2. Stuknij ikonę **Udostępnij** (kwadrat ze strzałką w górę na dolnym pasku).
3. Przewiń w dół i wybierz **„Do ekranu początkowego”** (*Add to Home Screen*).
4. Kliknij **Dodaj** w prawym górnym rogu.

---

## ✨ Główne Funkcje

- 📶 **100% Offline (PWA Service Worker)**: Wszystkie pliki, style, skrypty oraz bazy chwytów są buforowane na urządzeniu przy pierwszym uruchomieniu. Działa w lesie, na ognisku i w schronisku bez zasięgu.
- 🔤 **Atomowe zawijanie chwytów i sylab**: Chwyty są powiązane kolumnowo z konkretnymi sylabami tekstu w elastycznych kontenerach (`flex-wrap`). Nawet na małych ekranach (360px) chwyty nigdy nie odrywają się od tekstu i nie tworzą poziomego paska przewijania.
- 🎼 **Polska notacja muzyczna i transpozycja**:
  - Błyskawiczny przełącznik notacji polskiej (`H`, `B`, `Cis`, `Dis`) i międzynarodowej (`B`, `Bb`).
  - Pełna transpozycja w górę i w dół o dowolną liczbę półtonów z zachowaniem preferencji znaków chromatycznych (`#`).
  - Przycisk natychmiastowego resetu do tonacji oryginalnej.
- 🎸 **Interaktywne diagramy chwytów (Gitara i Ukulele)**:
  - Stuknięcie w dowolny chwyt (w górnym pasku lub w tekście) otwiera wektorowy gryf SVG w natywnym oknie dialogowym.
  - Obsługa 6-strunowej gitary (standardowy strój EADGBE) oraz 4-strunowego ukulele (standardowy strój GCEA).
  - Karuzela wariantów pozycji (np. `1 z 4`) z wizualizacją poprzeczek barre, pustych i tłumionych strun oraz progu bazowego.
- 📜 **Płynne automatyczne przewijanie (Auto-Scroll)**:
  - 60 FPS oparte na `requestAnimationFrame` z regulacją prędkości (15–120 px/s).
  - **Inteligentne wstrzymywanie dotykiem**: dotknięcie lub przesunięcie palcem natychmiast zatrzymuje przewijanie, a po 3 sekundach bezczynności przewijanie wznawia się automatycznie.
  - Przycisk szybkiego powrotu na samą górę.
- 💡 **Screen Wake Lock API**: Ekran telefonu nie wygasza się i nie przechodzi w uśpienie podczas wyświetlania piosenki. Blokada zwalnia się automatycznie po wyjściu z utworu lub zminimalizowaniu karty.
- ➕ **Wgrywanie i tworzenie własnych piosenek**:
  - Wgrywanie plików `.txt` z automatycznym odczytem metadanych frontmatter lub wprowadzanie ręczne.
  - Bezpieczne przechowywanie utworów w pamięci `localStorage` urządzenia.
  - Możliwość edycji i usuwania utworów własnych jednym kliknięciem.
- 🔍 **Katalog z błyskawicznym wyszukiwaniem**:
  - Trzy widoki katalogu: **Piosenki** (alfabetycznie), **Wykonawcy** (z liczbą utworów i filtrem) oraz **Ulubione** (oznaczone gwiazdką).
  - Wyszukiwanie niewrażliwe na wielkość liter i polskie znaki diakrytyczne.
  - **Kontekstowy podgląd wersu**: jeśli zapytanie pasuje do tekstu piosenki, na liście wyświetlany jest dokładnie pasujący fragment.
  - Filtry tagów (np. *poezja*, *turystyczne*, *rock*, *ognisko*).
- 🌙 **Wysokokontrastowy motyw nocny (OLED) i dzienny**: Domyślny ciemny motyw minimalizuje zużycie baterii na ekranach OLED i nie oślepia na scenie. Przełącznik pozwala na wygodną pracę w pełnym słońcu.

---

## 📄 Format Pliku Piosenki (`songs/*.txt`)

Utwory wbudowane zapisywane są jako proste pliki tekstowe w katalogu `songs/`. Format wykorzystuje nagłówek YAML frontmatter oraz chwyty w nawiasach kwadratowych `[...]`:

```txt
---
title: Przykładowa Piosenka
artist: Zespół Muzyczny
key: G
tags:
  - rock
  - ognisko
---

[G]                      [C]
To jest pierwsza linijka tekstu,
[D]                    [G]
gdzie chwyt przypada na słowo.
```

Obsługiwana jest również tradycyjna notacja dwuliniowa (linia chwytów nad linią tekstu) – parser automatycznie rozpoznaje układ i wiąże chwyty z odpowiednimi sylabami.

---

## 🛠️ Architektura i Zasada Zero Zbędnych Zależności (Ponytail)

Projekt powstał w oparciu o zasady minimalizmu inżynieryjnego. Zastąpiono ciężkie pakiety `npm` natywnymi mechanizmami przeglądarki i zwięzłym kodem TypeScript:

| Funkcja | Rozwiązanie w projekcie | Alternatywa npm (wyeliminowana) | Oszczędność |
|---|---|---|---|
| Nawigacja | `useSyncExternalStore` + hash routing | `react-router-dom` | ~400 KB |
| Parsowanie piosenek | `songParser.ts` (~80 linii) | `chordsheetjs` | ~350 KB |
| Odczyt nagłówków | `parseFrontmatter` (~15 linii) | `gray-matter`, `js-yaml` | ~850 KB |
| Ikony interfejsu | Wektorowe komponenty SVG w `Icons.tsx` | `lucide-react` | ~36.8 MB na dysku |
| Gryfy akordów | Czysty komponent SVG `ChordSvg.tsx` | `react-chords` | Eliminuje przestarzałe zależności |
| Baza chwytów | Dynamiczne ładowanie chunków JSON na żądanie | Włączanie całego słownika do głównego bundle | ~450 KB mniej w inicjalnym ładowaniu |

### Rozmiar i Wymagania Sprzętowe
- **Całkowity rozmiar pamięci podręcznej PWA**: ~780 KB (poniżej 150 KB z kompresją gzip).
- **Czas pierwszego załadowania**: <200 ms przy połączeniu 4G.
- **Obciążenie procesora**: bliskie 0% podczas spoczynku; płynne 60 FPS podczas autoscrolla dzięki `requestAnimationFrame`.

---

## 💻 Instrukcja dla Programistów

### Wymagania
- Node.js w wersji 20+
- npm w wersji 10+

### Uruchomienie lokalne
```bash
# Klonowanie repozytorium
git clone https://github.com/GasiorMateusz/spiewnik.git
cd spiewnik

# Instalacja zależności
npm install

# Uruchomienie serwera deweloperskiego
npm run dev
```

Aplikacja będzie dostępna pod adresem: `http://localhost:5173/`

### Dostępne skrypty
- `npm run dev` – uruchamia lokalny serwer Vite z HMR (Hot Module Replacement).
- `npm run lint` – uruchamia linter TypeScript (`tsc --noEmit`).
- `npm test` – uruchamia kompletny pakiet 497 testów jednostkowych, integracyjnych i E2E (Chrome CDP).
- `npm run build` – kompiluje produkcyjny pakiet PWA do katalogu `dist/` wraz z generowaniem Service Workera.
- `npm run preview` – uruchamia lokalny podgląd wersji produkcyjnej.

---

## 🚀 Proces Wdrażania i Bezpieczeństwo (CI/CD)

1. **Automatyczne Wdrożenie**: Każde zatwierdzenie w gałęzi `master` uruchamia GitHub Actions workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), który:
   - Sprawdza poprawność typów TypeScript (`npm run lint`).
   - Uruchamia pełny zestaw testów automatycznych.
   - Buduje zoptymalizowany pakiet produkcyjny.
   - Wdraża witrynę do środowiska GitHub Pages.
2. **Utrzymanie Zależności (Dependabot)**: Narzędzie `.github/dependabot.yml` automatycznie monitoruje aktualizacje pakietów npm oraz akcji GitHub Actions, tworząc bezpieczne Pull Requesty.
3. **Zasady Ochrony Gałęzi**: Szczegółowe zalecenia dotyczące ochrony gałęzi `master` (blokada direct push, wymóg PR i status checków) opisano w dokumencie [`docs/BRANCH_PROTECTION.md`](docs/BRANCH_PROTECTION.md).
4. **Cykl Życia Pamięci Cache**: Zasady czyszczenia nieaktualnych piosenek z pamięci telefonów użytkowników opisano w [`docs/CACHE_LIFECYCLE.md`](docs/CACHE_LIFECYCLE.md).

---

## 📜 Licencja

Projekt udostępniany na licencji MIT.
