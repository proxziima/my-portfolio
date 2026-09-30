# Port status — what is wired, what is not

Written by the person who wrote the original, so this is honest rather than
optimistic. **The port has not been run against `npm install`** (this package was
assembled without a node_modules), so treat it as a strong scaffold that needs one
pass of `npm run typecheck` and a browser, not as a finished app.

## Done — translated and believed correct

| Piece | File | Notes |
|---|---|---|
| Content | `lib/roles.ts` | Generated from the original `data1.js`; all three roles, work, projects, class cards, sigils. |
| Stylesheet | `app/globals.css` | Verbatim, 320 lines. Only the two font-family declarations changed, to `var(--font-inter)` / `var(--font-caveat)`. |
| Word morph | `lib/morph.ts` + `components/Bio.tsx` | Tokenizer, LCS, the two-phase swap, the pending-flush guard. Imperative on purpose. |
| Geometry | `lib/models.ts` | Pure, no three.js. Verified: it builds (343 / 588 / 244 segments, resampled to 760). |
| Figure | `components/Plate.tsx` | Morph, flow, truck, orbit, colour glide, resize. |
| Drum | `components/Reel.tsx` | Atlas-free; canvas textures per face, front-side culling, the face-index self-heal. |
| Wheel | `components/Wheel.tsx` | Three copies, renormalisation, 170ms cooldown, keyboard. |
| Wall switch | `components/WallSwitch.tsx` | Atlas validation, the snap-on-interrupt rule, the rapid 115ms flip. |
| Click + bulb + thud | `lib/audio.ts` | The reference's exact synth constants. |
| Blowout | `components/Blowout.tsx` | Threshold, flicker levels, physics, shards, puff, recovery. |
| Curious mode | `components/CuriousMode.tsx` | Lifted near-verbatim; guides, notes, self-healing layout. |
| No-FOUC theme | `app/layout.tsx` | Blocking inline script. |

## Not done — you will need to finish these

1. **Annotation geometry on the figure.** `plate1.js` builds a separate
   `LineSegments` per role for the curious-mode formulas (λ arrows, the loss
   bracket, the UDL + moment diagram). That block was *not* carried into
   `Plate.tsx` — lift `ANN`/`annMeshes` from `reference/parts/plate1.js`
   (search for "curious mode: engineering annotations") and hook it to
   `hooks.current.annot`.
2. **`components/CuriousMode.tsx` needs a TypeScript pass.** It is JavaScript
   lifted into a `useEffect` with the obvious annotations added. Expect a handful
   of `strict` complaints (implicit `any` on the DOM helpers, the `MODEL_NOTES`
   index). Either finish the types or add `// @ts-nocheck` at the top and move on.
3. **`lib/models.ts` is untyped inside.** The extracted functions have no
   parameter types. `strict` will complain. Same choice as above.
4. **The blowout's `useBlowout` hook is instantiated inside `WallSwitch`**, so
   `blowout.active()` is only visible there. If anything else needs to know, lift
   it into the `RoleContext`.
5. **The reduced-motion flag** is read in `Portfolio` and passed down, but
   `Blowout` and `CuriousMode` also query `matchMedia` directly. Harmless, but
   worth consolidating.
6. **`Wheel`'s effect has no dependency array** (it re-binds every render). It
   works, it is not elegant.
7. **Mobile.** The original hides the curious-mode notes below 1040px and moves
   the switch to `position: fixed` below 900px. That CSS came across; it has not
   been re-tested in the React tree.

## Deliberate differences from the single file

- **The MP3 is a real file**, fetched and decoded, not a 56 KB base64 data URI.
  That alone cuts the page weight by a third.
- **three.js is an npm dependency** at 0.171 rather than r128 from a CDN. Both
  `Reel` and `Plate` set `THREE.ColorManagement.enabled = false`, because modern
  three would otherwise convert these hex values into a different sRGB and the
  ink would come out lighter than the text beside it.
- **Work and projects are plain React** (`Lists.tsx`). Only the bio needs the
  imperative morph.
- **The first paint is server-rendered** from `lib/roles.ts`, so the letter is in
  the HTML for crawlers; hydration takes over and can rewrite it.

## Suggested order of work

1. `npm install && npm run dev` — get it on screen.
2. `npm run typecheck`, fix or silence (2) and (3).
3. Compare side by side with `reference/reel.html` open in another tab.
4. Lift the annotation geometry (1).
5. Replace the placeholder prose in `lib/roles.ts` with yours — keeping the three
   bios parallel, which is the whole trick.
