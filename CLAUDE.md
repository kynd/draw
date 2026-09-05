# draw

A log site documenting the development of a drawing tool. Built with Astro; the page
structure and CSS are adapted from the `geom` project, on a white background.

## Project Goal

Build a reusable library for drawing with strokes, on top of Three.js, and keep a public
working log of how it is designed. The log and the library are developed together — the
site is both the documentation and the evidence.

---

## Library Rules

These are the rules that matter most. Read them before writing any demo code.

### 1. Demos never own logic

**Define classes and reuse the same code across every demo.** A demo page is a thin
harness: it composes library classes, wires up controls, and renders. If a demo contains
logic that another demo could plausibly want, that logic belongs in the library, not the
demo.

Library code lives in `public/lib/`. Demo code lives in `public/demos/<demo-name>/`.
A demo imports from the library by relative path; the library never imports from a demo.

### 2. Structure classes logically, and keep doing it

Before adding a class, ask where it belongs in the shape of the library as a whole — not
just where it is convenient to put it right now. When a new class makes the existing
structure wrong, restructure it and update the affected demos. Do not accumulate
one-off classes to avoid a rename.

Group related classes into a directory when there are two or more of them
(`public/lib/renderers/`, for example). Give the group a base class or a documented
contract so the members stay interchangeable.

### 3. Every structural change updates the documentation

**Never consider a coding task complete until the documentation is in sync.** This is not
optional and not deferred to a later pass. If you add a parameter, rename a class, change
a default, or alter a contract, update the relevant documentation page in the same change.

### 4. One documentation page per major class or group of classes

Each major class — or each group of closely related classes — gets its own page under
`src/content/pages/documentation/`. Add it to the `Documentation` section of the nav in
`src/layouts/PageLayout.astro`, and link it from `src/content/pages/documentation.md`.

Do not consolidate several unrelated classes onto one page, and do not put demo-specific
notes on a library documentation page — those belong on the demo's own page.

### 5. One CSS component system, shared by every demo

All demo chrome comes from the `dp-*` classes in `public/styles/demo-ui.css`. Do not
restyle a control per demo and do not invent a second name for something that already
has one. If a style applies to more than one demo it belongs in that file; a per-demo
`<style>` block is only for that demo's own stage — its grid shape, a specialty canvas,
a layout nothing else has.

When a demo needs a control the system does not have, add it to `demo-ui.css` as a new
`dp-*` component and use it from there, rather than styling it inline "just this once".

Layout is fixed for every demo: **stage on the left, a narrow `.dp-panel` on the right.**
Controls live in that panel, never floating over the drawing.

### 6. Record what is common across a group, not just what each member does

When a group of related classes shares behaviour — every renderer resampling adaptively,
every renderer honouring the same UV convention, every generator taking a seed — write
that shared behaviour down **once**, as a "common features" section on the group's
documentation page. Then document only the differences per class.

When you add a new member to a group, check it against that common section. If it cannot
honour the shared contract, either fix the class or change the contract deliberately and
update every other member — do not quietly let the group drift apart.

---

## Documentation Structure

```
src/content/pages/
  index.md                             Intro
  documentation.md                     Documentation (section index)
  documentation/
    stroke-definition.md               one page per class or class group
    renderers.md
    palette.md  path-effects.md  curves.md
    writing-style.md                   how every explanation on this site is written
src/pages/
  palette-maker.astro                  demo/log pages, written as .astro for embeds
  strokes.astro  more-strokes.astro  shaped-strokes.astro
  fills.astro  stroke-processing.astro  pen-pressure.astro             every stroke demo, one section each
  drawing-tool.astro                    the combined instrument demo
public/lib/                            library code
  StrokeDef.js  Palette.js  color.js  CanvasBuffer.js  random.js  pathEffects.js
  StrokeHalo.js  curves.js
  renderers/    StrokeRenderer.js      base + shared resampling
                RibbonStrokeRenderer.js
                ShaderStrokeRenderer.js       base for shader-shaded ribbons
                BrushStrokeRenderer.js
                WatercolorStrokeRenderer.js  SmearStrokeRenderer.js
                WetBrushStrokeRenderer.js
                HeightFieldStrokeRenderer.js base for surface materials
                ChromeStrokeRenderer.js  MirrorStrokeRenderer.js
                GlassStrokeRenderer.js  OilStrokeRenderer.js
                DryMediaStrokeRenderer.js  DebossStrokeRenderer.js
                CloudStrokeRenderer.js  RoundedSquareStrokeRenderer.js
                SpikeStrokeRenderer.js
                BlobRenderer.js  ShapedBlobRenderer.js  PaintBlobRenderer.js
                WashBlobRenderer.js  MaterialBlobRenderer.js  StoneBlobRenderer.js
                PixelStrokeRenderer.js  PolygonStrokeRenderer.js
                LineStrokeRenderer.js
                Stroke3DRenderer.js  TubeStrokeRenderer.js
                TriangleStrokeRenderer.js
  demo/         viewport.js  stage.js  panel.js  strokePaths.js  drawInput.js
                drawingBoard.js  drawCycle.js  blobShowcase.js
                pressure.js  testBackground.js  midi.js  dial.js  latch.js
                strokeRecorder.js  toolRegistry.js  drawingTool.js
                                       shared demo support, still library code
                                       drawingTool.js is the reusable instrument:
                                       it takes any tool registry and builds the
                                       whole interface; every try-drawing demo and
                                       the drawing tool demo are thin harnesses
                                       over it, with toolRegistry.js as the master
                                       tool catalog
public/demos/<name>/                   index.html + main.js per demo
src/pages/experimental/<name>.astro    experimental pages, local only
public/demos/experimental/<name>/      demos for experimental pages, local only
```

## Experimental Pages

Experimental pages live under `src/pages/experimental/` with their demos under
`public/demos/experimental/`. Their nav entries in `PageLayout.astro` go inside the
`import.meta.env.DEV` spread with `sketch: true`, so they appear only in the dev
server. The deploy workflow removes `dist/experimental` and `dist/demos/experimental`
after the build, so the published site carries neither the pages nor the demos.

- **Documentation pages** describe the library: contracts, parameters, defaults, and the
  reasoning behind them. No demo narrative.
- **Log/demo pages** describe what was built and what was learned. They embed demos and
  may reference documentation pages, but do not restate the API.

## Nav

`src/layouts/PageLayout.astro` holds the whole nav tree. `children` are real child pages;
`subLinks` are in-page anchors for the current page only. Every new page must be added
there — nothing is discovered automatically.

## Writing Style

**Read `src/content/pages/documentation/writing-style.md` before writing or editing any
explanation** (page prose, documentation, demo panel notes, a caption). It is the
authority, and it is derived from corrections actually made to drafted text, so skipping
it reproduces mistakes that have already been fixed once.

The rules in brief, none of which replace reading the page:

- No em-dash asides. Parentheses for a gloss or example, a comma for a trailing clause,
  a full stop to start a new sentence.
- Stop when the fact is stated. No clause explaining why it matters, no restatement.
- Describe library features only. Never narrate a demo's arbitrary decisions (its test
  path's shape, its constants, how its colors happen to be picked).
- Open a page with a plain description of what the thing is, not an aphorism or a hook.
- Headings are short noun phrases naming the topic.
- American spelling. Plain verbs, no intensifiers, contractions are fine.
- Name the standard term (z-fighting) instead of deriving the mechanism. Bold labels
  end with a colon. One fact per labeled item.
- English paragraph first, then its Japanese counterpart in a `<div class="jp">`,
  mirroring the English structure including its parentheses.

When the user rewrites text, treat the diff as new rules: extract what changed and why,
add it to the writing-style page, and apply it from then on.

## Demos

- Three.js via the import map in each demo's `index.html`, pinned to one version.
- **One page per topic, not per demo.** Related demos live as sections on one page, each
  with a short visible description and the rest inside a `<details>` collapsible. Do not
  give a demo its own page just because it has its own renderer.
- **Demos are never a fixed size.** Full size, a demo fills the browser window and keeps
  filling it as the window changes. Only the embedded view is fixed, at 960×540, because
  the page's iframe reserves exactly that. Use `Viewport` from `public/lib/demo/viewport.js`;
  it reads `?embedded`, sizes the canvas, and fires a resize callback. Anything holding a
  render target or a camera must implement a `resize(width, height)` and be wired to it.
- **The world scale is fixed to CSS pixels.** One world unit is `PIXELS_PER_UNIT`
  (200) CSS pixels, exported from `CanvasBuffer`. A resize crops or reveals paper
  instead of rescaling the drawing, and `DrawingBoard` carries the baked raster
  across resizes by blitting it back into the world rectangle it covered. World
  coordinates stay compact (not raw pixels) so the seeded shader hashes keep their
  float precision. `fit`-mode framing still exists on `CanvasBuffer` but no stroke
  demo uses it.
- Shared demo chrome lives in `public/styles/demo-ui.css` — see rule 5.
- Strokes are drawn into a `CanvasBuffer` render target, so the renderer's own
  `antialias` flag does nothing. Antialiasing comes from the target's `samples`
  (default 4). Leave it on unless there is a measured reason not to.
- Prefer deterministic geometry and color over random — the same settings produce the
  same drawing, so two runs can be compared. Where a copied class offers a random helper,
  call the deterministic overload instead of removing the helper.
- Every renderer takes a random seed. Anything random in a mark must derive from that
  seed (through hash functions in shaders), so the same seed with the same parameters
  reproduces the exact same result. This is a global design rule, documented in the
  renderers page's common section.
- The presented frame flips world y, so a light that should read as shining from the
  top of the screen has negative world y. Every lit shader follows this; reflection
  horizons sample -r.y for the sky side.

## Git

- Never `git push` unless the user explicitly asks.
