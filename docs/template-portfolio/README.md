# Reel Portfolio

One letter, three disciplines. A portfolio that rewrites itself — word by word —
when you change role, with a photographic light switch, a 3D figure that morphs
to match, and a bulb you can break.

## Start here

1. **`CONTEXT.md`** — the full spec: design tokens measured off the reference
   site, how each of the six interactive systems works, the exact audio and
   animation constants, and the porting checklist. Read this first.
2. **`reference/reel.html`** — the complete working implementation as one file.
   Open it in a browser; it runs with no build step. **This is the source of
   truth.** If the port and this file disagree, the file is right.
3. **`docs/CHECKLIST.md`** — what to verify once the port is up.

## Run the Next.js port

```sh
npm install
npm run dev
```

The port is a faithful but *partial* translation — see `docs/PORT-STATUS.md` for
exactly what is wired and what still needs doing. Everything not yet ported is
in `reference/reel.html`, working, ready to lift.

## Layout

```
CONTEXT.md              the spec — start here
reference/
  reel.html             the working single-file implementation
  parts/                the nine parts it is concatenated from
app/
  layout.tsx            fonts + the no-FOUC theme script
  page.tsx              server component; renders the first role's prose
  globals.css           the stylesheet, verbatim from the original
components/             Portfolio, Reel, Wheel, Bio, WallSwitch, Blowout,
                        CuriousMode, Plate, Lists
lib/                    roles (content), morph (the LCS diff), models
                        (pure geometry), audio (one AudioContext), types
hooks/                  useRole (context), useTheme
public/
  theme-switch/         the 17-frame rocker atlas + two state images
  sound/                the bulb
docs/                   checklist, port status
```

## Licence / credit

The visual language (column, type scale, spacing, link treatment, the rocker
switch behaviour and its click synthesis) is modelled on
[pedromarques.me](https://pedromarques.me) — measured, then reimplemented.
The rocker images in `public/theme-switch/` were supplied by you; check you have
the right to ship them before publishing. `public/sound/bulb-explode.mp3` is by
Alex Jauk (Pixabay, id 199063). All prose is placeholder.
