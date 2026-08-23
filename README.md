# draw

A working log for building a drawing tool, and the library it documents.

Live at **https://www.kynd.info/draw/**

The site is both the documentation and the evidence: every page is a thin harness over
shared library code, so what the writing claims can be checked against what the demo
does.

## Layout

```
public/lib/          library code
  StrokeDef.js       a stroke: points, per-side width, and a renderer reference
  Palette.js         OKLCH palette generation and selection
  CanvasBuffer.js    the offscreen surface strokes are drawn into
  renderers/         one geometry or shading strategy per class
  demo/              shared demo scaffolding
public/demos/<name>/ index.html + main.js per demo
src/                 the Astro site
```

Library code never imports from a demo. Demos compose library classes and own no drawing
logic of their own.

## Running it

```
npm install
npm run dev
```

The site is served under a base path, so open `http://localhost:4321/draw/`.

`npm run build` writes a static site to `dist/`. Pushing to `main` builds and publishes
it through GitHub Actions.

## Credits

`Palette.js` and `color.js` were copied from the stroke_designer project rather than
rewritten, and the ragged cap and hue ring follow its implementations.

## License

Code and writing: [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) —
Kenichi Yoneda (Kynd).
