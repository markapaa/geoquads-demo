# GeoQuads

A daily geography puzzle. Sixteen words hide four groups of four: find all four groups before you run out of lives. Every solved group lights up on a world map.

**Play it:** https://geoquads.vercel.app/

![GeoQuads screenshot](docs/screenshot.png)

## How to play

1. Select four words you think belong together and press **Submit**.
2. Right: the group is revealed. Wrong: you lose a life (5 in total). *One away* means 3 of your 4 words were right.
3. Stuck? Tap the blurred **Spoiler** box for a gentle hint.
4. Keyboard: `Enter` submit, `Esc` clear, `R` shuffle.

## Features

- A new **daily puzzle** every day, an **archive** of past days and **practice** rounds
- **World map** that lights up the countries, cities, peaks and seas of every solved group
- **Stats**: played, win rate, streak, best streak and a chart of mistakes per quiz
- **Light and dark theme**, responsive layout for phones, installable as an app (PWA)
- Shareable emoji result, spoiler hints and a fun fact for each group
- **Anonymous play statistics** (optional, see below)

## Tech stack

- Vanilla **JavaScript** (ES modules), **HTML** and **CSS**: no framework, no build step
- Quizzes as **JSON** files, checked by a **Node.js** validation script
- Map drawn from **Natural Earth** data with a custom Node script
- **Supabase** (PostgreSQL) for anonymous statistics, with row-level security
- **Service worker** and web manifest (PWA), **Node test runner** for unit tests
- Hosted on **Vercel**

## Anonymous statistics

When a player finishes a daily or archive quiz, one record is saved: quiz date, solved or not, number of mistakes, the order the groups were found in and a random id created in the browser. There are no accounts, names or e-mails, and players can switch it off in the Stats window. The table is set up in [`supabase/setup.sql`](supabase/setup.sql); the public key can only add rows, never read them.

## Project structure

```
index.html            page
css/style.css         styles (all colours are CSS variables)
js/                   app.js (UI), logic.js (pure rules), storage.js, map.js,
                      telemetry.js (anonymous stats), sound.js, confetti.js
quizzes/2026/<month>/  one JSON file per daily quiz (e.g. quizzes/2026/october/2026-10-01.json)
quizzes/              practice quizzes and index.json
scripts/              validate-quizzes, build-index, build-map
data/, assets/        map data, icons, social preview image
supabase/setup.sql    database table and security policy
tests/                unit tests
```

## Run it locally

```bash
git clone https://github.com/markapaa/geoquads.git
cd geoquads
npm start        # then open the address shown in the terminal
npm test         # unit tests
npm run validate # checks every quiz file
```

## Add a quiz

1. Copy a quiz file and rename it to the date, e.g. `2026-11-01.json`. Put it in the folder for that year and month (`quizzes/2026/november/`, a new folder for a new month or year is fine). The `id` inside must match the file name.
2. Write four groups of four unique items and a `spoiler`.
3. Run `npm run build:index`, `npm run build:map` and `npm run validate`.

Countries light up on the map automatically. For cities, peaks and seas add a line to `data/places.json`.

## What this project shows

- Building and deploying a complete web app, from idea to live site with real players
- Separating pure game logic from the UI so it can be unit tested
- Designing a small database with security rules and collecting data responsibly (anonymous, opt-out)
- Turning geographic open data into an interactive map
- Accessibility and mobile-first design: light/dark theme, keyboard support, small screens

## Roadmap

- [ ] Automated checks on every push (GitHub Actions)
- [ ] Dashboard analysing the anonymous play data
- [ ] Revise mode: replay the groups you missed

## Credits

Country outlines: [Natural Earth](https://www.naturalearthdata.com) (public domain). Pin positions are approximate.

Made by [Margieta Kokkinou](https://github.com/markapaa).
