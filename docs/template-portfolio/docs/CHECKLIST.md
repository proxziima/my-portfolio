# Acceptance checklist

Open `reference/reel.html` in one tab and the dev server in another, and walk
this list. Each line is something that broke at least once while building it.

## Type and layout

- [ ] Text column measures **600px** (632 including gutters). Curious mode's
      width label reads the live value — it should say `600px`.
- [ ] `h1` name is weight 620, the role line 430, both 28px.
- [ ] Body copy is 15px/24px in `--ink-soft`; `<strong>` is 500 in `--ink`.
- [ ] Link underlines are 2px, 2.7px below the baseline, `--rule`, and sit on the
      inner `<span>` so the chip is not underlined.
- [ ] 64px between sections; 16px between bio paragraphs.
- [ ] Headline stays on one line: role + "and builder." — no wrap at desktop.

## The letter

- [ ] Switching role animates **only the words that differ**; "Hi, I'm Vinicius,
      a 🇧🇷 Brazilian" stays put.
- [ ] No stray space before punctuation (`plumber .` was the bug).
- [ ] No forced line break in the middle of a bold phrase.
- [ ] Scroll the wheel fast through all three roles: the bio never ends up
      half-rewritten.

## The drum and the wheel

- [ ] The headline role matches the letter. (AI and Civil were swapped for a
      while — the rotation sign.)
- [ ] Hover the role → three rows, current one in the middle on its plate.
- [ ] Wheel down goes se → ai → civil → se, and up reverses. No dead end.
- [ ] One step per detent, not five, on a trackpad flick.
- [ ] ←/→/↑/↓ work when the role is focused; Escape closes.

## The switch

- [ ] It animates through frames, not a CSS tilt — watch the rocker face.
- [ ] Click it fast: no jitter around the middle, every flip completes.
- [ ] The click sound is brighter going to light (1450 Hz) than to dark (1050 Hz).
- [ ] Theme change fades everything together for 380ms — chips, underlines,
      years and the 3D ink included. Nothing snaps while the rest fades.
- [ ] No flash of the wrong theme on reload with dark saved.

## The blowout

- [ ] Clicks 1–5: nothing unusual.
- [ ] Clicks 6–9: the room flickers, **the switch itself does not**.
- [ ] Click 10: bulb sample plays, flash, vignette closes from the switch.
- [ ] The switch falls, bounces off the floor with a thud per bounce, settles
      square, shards spray and fade.
- [ ] ~3.3s later: a puff of smoke at the mount, the switch pops back inside it,
      then the room returns slowly. Theme is the one you had before.
- [ ] Clicking during all of that does nothing.

## Curious mode

- [ ] The switch sits inside the word *curious* in the Ted Lasso line and
      survives a role change.
- [ ] Guides land on the actual column — not in the top-left corner. Resize the
      window and they follow.
- [ ] Section labels read bio / figure / work / projects; gaps say 64px.
- [ ] Formula notes change with the role: Little's law → cross-entropy →
      UDL/moment. (Needs the annotation geometry — see PORT-STATUS.md.)
- [ ] Below 1040px the side notes disappear rather than overlapping.

## The figure

- [ ] Morphs segment by segment rather than cross-fading.
- [ ] `se`: particles follow routes through the topology, not straight down.
- [ ] `ai`: three balls roll the descent path on the loss surface; activations
      pulse in the net above.
- [ ] `civil`: the truck crosses the deck and dips at mid-span; the river drifts.
- [ ] Drag rotates it; letting go, it drifts back.
- [ ] Ink colour matches the body text in both themes.

## Accessibility and degradation

- [ ] Turn on reduced motion: no morph, no physics, no flicker — everything still
      switches.
- [ ] Disable WebGL (`about:config` or a flag): the page still reads, the role
      still switches, the drum becomes plain text, the figure disappears.
- [ ] Tab through: the switch, the role, the wheel rows and every link take
      focus with a visible ring.
- [ ] Screen reader announces the role change (the `role="status"` line).
- [ ] With JavaScript off, the letter is still in the HTML and the switch shows
      its `<img>` state.
