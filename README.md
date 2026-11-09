# ms-senate-2026

County-by-county look at the 2026 Mississippi Senate race. Colom vs Hyde-Smith, lined up against her 2020 race against Espy.

Live page: https://daresthedevil.github.io/ms-senate-2026/

## What's in here

- `index.html`, `app.js`, `page.css`: the page. Every number on it is computed from the data file.
- `data/counties.csv` and `data/counties.json`: all 82 counties. 2026 and 2020 Senate votes, plus 2020 Census Black population share.
- `meridian/`: my design system tokens and the few components the page uses.

## Data

- 2026 and 2020 county returns from civicAPI, read off Poliwave's Mississippi Senate page on Nov 9, 2026 at 11:41 a.m. CT. Unofficial. Every county's candidate votes add up to its total.
- Black population share from the 2020 Census, via Census Dots.

Counties certify Nov 13. Numbers will move until then.

## Run it locally

It fetches `data/counties.json`, so opening the file directly won't work. Serve the folder:

```
python3 -m http.server
```
