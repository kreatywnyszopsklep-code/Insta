# Kreator karuzeli na Instagram

Wgraj własny szablon graficzny (obraz), rozstaw na nim pola tekstowe, a potem
generuj kolejne slajdy karuzeli, podając tylko treść — pozycje, czcionki i
kolory zostają takie same na każdym slajdzie.

Dwa sposoby użycia, oparte na tym samym formacie `template.json`:

1. **Aplikacja webowa** (`web/`) — wgrywasz szablon, przeciągasz pola tekstowe
   myszką, wpisujesz treści i pobierasz gotowe grafiki PNG/ZIP. Działa
   całkowicie w przeglądarce, bez instalacji.
2. **Skrypt Pythona** (`scripts/generate.py`) — do generowania karuzeli
   z terminala (np. gdy poprosisz o to Claude'a, podając gotowe teksty).

## Szybki start — aplikacja webowa

```bash
cd web
python3 -m http.server 8000
```

Otwórz `http://localhost:8000` w przeglądarce (albo po prostu otwórz plik
`web/index.html` bezpośrednio — też zadziała).

### 1. Zakładka „Szablon”
- Wgraj obraz szablonu (np. eksport z Canvy/Figmy w proporcji karuzeli, np. 1080×1350).
- Kliknij „+ Dodaj pole tekstowe” albo „+ Dodaj pole na zdjęcie”, przeciągnij
  pole w docelowe miejsce, chwyć uchwyt w prawym dolnym rogu, żeby zmienić
  rozmiar. Oba typy pól używa się tak samo (przeciąganie/zmiana rozmiaru),
  różnią się tylko panelem właściwości.
- Dla pola tekstowego ustaw etykietę (np. „Nagłówek”, „Treść”), czcionkę,
  rozmiar, kolor, wyrównanie i interlinię. „Auto-dopasuj rozmiar” zmniejsza
  czcionkę, jeśli tekst się nie mieści. Dla pola na zdjęcie ustaw etykietę,
  sposób dopasowania (wypełnij/zmieść) i zaokrąglenie rogów — samo zdjęcie
  wgrywa się później, osobno dla każdego slajdu.
- Opcjonalnie włącz „Kropki postępu karuzeli” (np. ●●●○○○) — ich liczba
  dopasuje się automatycznie do liczby slajdów utworzonych w generatorze.
- Dla pola tekstowego możesz włączyć „Podkreślenie ostatniej linii” (np. pod
  nagłówkiem) i wybrać jego kolor.
- Możesz dodać „Warianty tła” (np. jaśniejszą i ciemniejszą wersję) — kolejne
  slajdy karuzeli będą je cyklicznie zmieniać, tak jak w naprzemiennych
  postach na Instagramie.
- Nadaj nazwę szablonowi i kliknij „Zapisz szablon (.json)” — powstanie jeden
  plik `.json` z osadzonym obrazem, w pełni przenośny.

### 2. Zakładka „Generuj karuzelę”
- Wczytaj zapisany `template.json`.
- Wypełnij pola dla każdego slajdu: teksty w polach tekstowych, a dla pól na
  zdjęcie — wgraj plik graficzny (przyciski „+ Nowy slajd” / „Usuń slajd”
  przełączają między slajdami). Do tekstu możesz też użyć „Wklej teksty dla
  wielu slajdów naraz” w formacie:
  ```
  Nagłówek: Tytuł slajdu 1
  Treść: Opis pierwszego slajdu...
  ---
  Nagłówek: Tytuł slajdu 2
  Treść: Opis drugiego slajdu...
  ```
- Pobierz pojedynczy slajd (PNG) albo całą karuzelę naraz (ZIP). Kropki
  postępu (jeśli włączone) same pokażą właściwy numer slajdu.

## Szybki start — skrypt Pythona

```bash
pip install -r requirements.txt
python3 scripts/generate.py --template szablon.json --content tresci.json --outdir output --zip
```

`content.json` zawiera treści dla kolejnych slajdów — klucze to etykiety pól
ustawione w edytorze (np. „Nagłówek”, „Treść”). Dla pól na zdjęcie podaje się
ścieżkę do pliku graficznego (względną wobec `content.json` albo bezwzględną):

```json
{
  "slides": [
    { "Nagłówek": "Tytuł slajdu 1", "Treść": "Treść...", "Zdjęcie": "zdjecia/slajd1.jpg" },
    { "Nagłówek": "Tytuł slajdu 2", "Treść": "Treść drugiego slajdu..." }
  ]
}
```

Pole na zdjęcie można w danym slajdzie pominąć (jak w drugim przykładzie
powyżej) — wtedy tło pozostaje bez zdjęcia.

Zobacz gotowe przykłady w `examples/`:
- `examples/template.json` + `content.json` — prosty szablon tekstowy (5 slajdów).
- `examples/kreatywnyszop/` — pełny przykład z polem na zdjęcie i kropkami
  postępu, zbudowany na podstawie stylu marki (beżowe tło, falująca linia,
  logo, strzałka). Uruchomienie `generate.py` na tych plikach odtwarza
  4-slajdową karuzelę w `examples/kreatywnyszop/output/`.

### Generowanie przez Claude'a

Wystarczy podać (lub wgrać) `template.json` zapisany w edytorze oraz treści
kolejnych slajdów — Claude uruchomi `scripts/generate.py` i odeśle gotowe
obrazy, bez potrzeby klikania w przeglądarce.

## Struktura repozytorium

```
web/                   aplikacja webowa (edytor + generator)
  index.html
  style.css
  app.js                logika edytora i generatora
  render.js              wspólna logika rysowania tekstu/zdjęć/kropek (wzorzec też dla generate.py)
  zip.js                 samodzielny zapis plików .zip (bez zależności)
scripts/
  generate.py            generator CLI w Pythonie (Pillow)
fonts/                   czcionki dołączone do repo (na potrzeby scripts/generate.py)
examples/
  template.png            przykładowy obraz szablonu
  template.json            przykładowy szablon (z osadzonym obrazem)
  content.json              przykładowe treści 5 slajdów
  kreatywnyszop/            przykład z polem na zdjęcie + kropkami postępu
requirements.txt
```

## Format `template.json`

```json
{
  "name": "Nazwa szablonu",
  "imageDataUrl": "data:image/png;base64,...",
  "width": 1080,
  "height": 1350,
  "textBoxes": [
    {
      "id": "naglowek",
      "label": "Nagłówek",
      "x": 0.08, "y": 0.37, "width": 0.84, "height": 0.13,
      "fontFamily": "Arial, sans-serif",
      "fontSize": 64, "minFontSize": 32,
      "color": "#ffffff",
      "align": "left", "valign": "top",
      "bold": true, "italic": false,
      "lineHeight": 1.15, "autoFit": true,
      "underline": true, "underlineColor": "#D2B069"
    }
  ],
  "imageBoxes": [
    {
      "id": "zdjecie",
      "label": "Zdjęcie",
      "x": 0.62, "y": 0.56, "width": 0.34, "height": 0.22,
      "fit": "cover", "cornerRadius": 0.06
    }
  ],
  "progressDots": {
    "enabled": true,
    "x": 0.08, "y": 0.958,
    "dotSize": 0.024, "gap": 0.010,
    "activeColor": "#D2B069", "inactiveColor": "#ffffff", "inactiveBorderColor": "#D2B069"
  },
  "backgroundVariants": ["data:image/png;base64,...", "data:image/png;base64,..."]
}
```

`x`, `y`, `width`, `height` są ułamkami (0–1) rozmiaru obrazu, więc szablon
działa niezależnie od rozdzielczości. `autoFit` zmniejsza czcionkę do
`minFontSize`, jeśli tekst nie mieści się w polu. `fit: "cover"` przycina
zdjęcie, żeby wypełniło całe pole (jak CSS `object-fit: cover`), `"contain"`
mieści całe zdjęcie bez przycinania. `progressDots` jest opcjonalny — liczba
kropek to zawsze liczba slajdów w danej karuzeli, a nie stała wartość.
`underline` rysuje podwójną kreskę pod ostatnią linią tekstu danego pola
(np. pod nagłówkiem), na wzór odręcznego podkreślenia. `backgroundVariants`
jest opcjonalny — lista dodatkowych teł, które cyklicznie zmieniają się co
slajd (np. naprzemiennie jasne/ciemne tło); bez niego używane jest zawsze
`imageDataUrl`.

## Czcionki (`scripts/generate.py`)

Skrypt Pythona mapuje nazwę czcionki z szablonu na dołączone pliki `.ttf`
(rodziny Liberation — metrycznie zgodne z Arial/Times New Roman/Courier New
— oraz DejaVu Sans), więc działa bez dostępu do internetu i niezależnie od
czcionek zainstalowanych w systemie. Aplikacja webowa używa czcionek
systemowych przeglądarki.
