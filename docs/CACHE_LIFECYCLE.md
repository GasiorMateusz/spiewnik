# Cykl Życia Pamięci Podręcznej i Usuwanie Utworów (Cache Lifecycle)

Dokument opisuje mechanizm wersjonowania, buforowania offline (PWA) oraz usuwania utworów ze śpiewnika na urządzeniach użytkowników.

---

## 1. Dwa Rodzaje Utworów w Aplikacji

Aplikacja obsługuje dwa źródła piosenek:
1. **Utwory wbudowane (bundled)** – pliki tekstowe w katalogu `songs/*.txt` w repozytorium Gita, kompilowane do statycznego pakietu aplikacji.
2. **Utwory własne (custom songs)** – pliki wgrywane lub wpisywane przez użytkownika bezpośrednio na urządzeniu za pomocą modalnego okna dodawania utworu (`UploadModal`).

---

## 2. Utwory Wbudowane: Wersjonowanie i Czyszczenie Pamięci Podręcznej

### 2.1. Jak działa kompilacja i generowanie skrótów (hashy)
- Wszystkie pliki `songs/**/*.txt` są ładowane podczas budowania projektu przez Vite przy użyciu `import.meta.glob('../songs/**/*.txt', { eager: true, query: '?raw' })`.
- Każde zbudowanie aplikacji (`npm run build`) analizuje zawartość i tworzy zoptymalizowane fragmenty kodu JavaScript (chunks) z unikalnym skrótem w nazwie (np. `assets/index-DytjIc7x.js`, `assets/guitar-Dyqv0G9j.js`).
- Wtyczka `vite-plugin-pwa` (Workbox) automatycznie generuje manifest `sw.js` zawierający listę wszystkich zasobów wraz z ich hashami integralności.

### 2.2. Co się dzieje, gdy utwór zostanie usunięty lub zmieniony w repozytorium?
1. **Wdrożenie nowej wersji**:
   - Po usunięciu pliku z katalogu `songs/` i scaleniu zmian do gałęzi `master`, GitHub Actions uruchamia workflow budowania i wdraża nową wersję na GitHub Pages.
   - Vite tworzy nowy pakiet `index-[nowy-hash].js`, a stary plik `index-[stary-hash].js` przestaje istnieć na serwerze.
   - Workbox generuje nowy plik `sw.js` z uaktualnioną listą plików i sum kontrolnych.

2. **Wykrycie aktualizacji na telefonie użytkownika**:
   - Gdy użytkownik otworzy aplikację (będąc online), przeglądarka pobiera w tle zaktualizowany plik `sw.js`.
   - Nowy Service Worker instaluje się w tle i wstępnie pobiera (precache) zmienione zasoby.
   - Aplikacja nasłuchuje zdarzeń cyklu życia Service Workera (`registration.onupdatefound`) i wyświetla nieinwazyjny dymek informacyjny (`Toast`):
     > *"Nowe piosenki pobrane. Odśwież, aby zastosować."* [Odśwież]

3. **Aktywacja i usunięcie starej pamięci (Purge)**:
   - Po kliknięciu przycisku **„Odśwież”** lub przy kolejnym otwarciu aplikacji, nowy Service Worker przejmuje kontrolę (`clientsClaim`, `skipWaiting`).
   - Silnik Workbox automatycznie usuwa z przeglądarkowego magazynu `CacheStorage` wszystkie przestarzałe pliki (w tym stary chunk JS zawierający usunięty utwór).
   - Usunięty utwór całkowicie znika ze spisu piosenek, wyszukiwarki i pamięci urządzenia użytkownika.

---

## 3. Utwory Własne Użytkownika: Zarządzanie w `localStorage`

### 3.1. Przechowywanie
- Utwory dodane przez użytkownika są przechowywane w pamięci lokalnej przeglądarki (`localStorage`) pod kluczem `spiewnik_custom_songs`.
- Dane są serializowane w formacie JSON z typowaną walidacją (`validateCustomSongs`), chroniącą aplikację przed uszkodzonymi danymi.

### 3.2. Usuwanie utworu własnego
- W widoku utworu (`SongViewer`) przy piosenkach oznaczonych plakietką **„Własny”** dostępna jest ikona kosza (`TrashIcon`) z etykietą *"Usuń piosenkę"*.
- Po kliknięciu pojawia się natywne potwierdzenie:
  > *„Czy na pewno chcesz usunąć utwór [Tytuł]?”*
- Po zatwierdzeniu:
  1. Rekord zostaje usunięty z tablicy w `localStorage`.
  2. Utwór zostaje automatycznie usunięty z listy ulubionych (`spiewnik_favorites`), jeśli się w niej znajdował.
  3. Pojawia się komunikat Toast: *„Utwór został usunięty.”*
  4. Widok natychmiast wraca do katalogu głównego (`#/`).

### 3.3. Czyszczenie danych przeglądarki
- Jeśli użytkownik zresetuje dane witryny w ustawieniach przeglądarki lub odinstaluje aplikację PWA, pamięć `localStorage` jest automatycznie usuwana przez system operacyjny.

---

## 4. Podsumowanie Wymagań Pamięciowych i Wydajnościowych

- **Rozmiar pamięci cache**: Całość aplikacji wraz z bazami akordów na gitarę i ukulele zajmuje ~780 KB bez kompresji (<150 KB z kompresją gzip/brotli).
- **Zasoby offline**: 100% plików HTML, CSS, JS, manifestu oraz ikon jest przechowywanych w `CacheStorage`.
- **Brak wycieków pamięci**: Stare wersje plików są natychmiast usuwane przy każdej aktualizacji Service Workera.
