// The catalog of drawing tools: every stroke and fill on the site, wired to the
// parameters it randomizes. The drawing tool component takes a registry in this
// shape; this file is the shared master list, and a demo picks the subset for
// its page with `pickTools`.

import { RibbonStrokeRenderer } from '../renderers/RibbonStrokeRenderer.js';
import { BrushStrokeRenderer } from '../renderers/BrushStrokeRenderer.js';
import { WatercolorStrokeRenderer } from '../renderers/WatercolorStrokeRenderer.js';
import { WetBrushStrokeRenderer } from '../renderers/WetBrushStrokeRenderer.js';
import { OilStrokeRenderer } from '../renderers/OilStrokeRenderer.js';
import { ChromeStrokeRenderer } from '../renderers/ChromeStrokeRenderer.js';
import { PixelStrokeRenderer } from '../renderers/PixelStrokeRenderer.js';
import { ShapedBlobRenderer } from '../renderers/ShapedBlobRenderer.js';
import { PaintBlobRenderer } from '../renderers/PaintBlobRenderer.js';
import { WashBlobRenderer } from '../renderers/WashBlobRenderer.js';
import { MaterialBlobRenderer } from '../renderers/MaterialBlobRenderer.js';
import { StoneBlobRenderer } from '../renderers/StoneBlobRenderer.js';
import { TubeStrokeRenderer } from '../renderers/TubeStrokeRenderer.js';
import { TriangleStrokeRenderer } from '../renderers/TriangleStrokeRenderer.js';
import { SmearStrokeRenderer } from '../renderers/SmearStrokeRenderer.js';
import { MirrorStrokeRenderer } from '../renderers/MirrorStrokeRenderer.js';
import { GlassStrokeRenderer } from '../renderers/GlassStrokeRenderer.js';
import { PolygonStrokeRenderer } from '../renderers/PolygonStrokeRenderer.js';
import { LineStrokeRenderer } from '../renderers/LineStrokeRenderer.js';
import { DryMediaStrokeRenderer } from '../renderers/DryMediaStrokeRenderer.js';
import { DebossStrokeRenderer } from '../renderers/DebossStrokeRenderer.js';
import { CloudStrokeRenderer } from '../renderers/CloudStrokeRenderer.js';
import { RoundedSquareStrokeRenderer } from '../renderers/RoundedSquareStrokeRenderer.js';
import { SpikeStrokeRenderer } from '../renderers/SpikeStrokeRenderer.js';
import { PatternStrokeRenderer } from '../renderers/PatternStrokeRenderer.js';
import { WetPatternStrokeRenderer } from '../renderers/WetPatternStrokeRenderer.js';

export const toolRegistry = [
    { id: 'ribbon', kind: 'stroke', params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => new RibbonStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, gradient: ctx.colorB, gradientAxis: v.axis,
        }) },
    { id: 'ribbon-ragged', kind: 'stroke', params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => new RibbonStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, gradient: ctx.colorB, gradientAxis: v.axis,
        }) },
    { id: 'brush', kind: 'stroke',
        params: [{ key: 'bristles', min: 6, max: 50, step: 1 }, { key: 'rough', min: 0, max: 1 }, { key: 'dry', min: 0, max: 0.7 }],
        make: (v, ctx) => new BrushStrokeRenderer({
            cap: 'ragged', colorA: ctx.colorA, colorB: ctx.colorB,
            bristles: v.bristles, rough: v.rough, dry: v.dry,
        }) },
    { id: 'watercolor', kind: 'stroke',
        params: [{ key: 'pigment', min: 0.2, max: 1 }, { key: 'rim', min: 0, max: 1 },
            { key: 'bleed', min: 0, max: 1 }],
        make: (v, ctx) => new WatercolorStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture, blurred: ctx.texture,
            pigment: v.pigment, rim: v.rim, bleed: v.bleed,
        }) },
    { id: 'wet-brush', kind: 'stroke',
        params: [{ key: 'drag', min: 10, max: 160 }, { key: 'pigment', min: 0.2, max: 1 }],
        make: (v, ctx) => new WetBrushStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture, blurred: ctx.texture,
            drag: v.drag, pigment: v.pigment,
        }) },
    { id: 'oil', kind: 'stroke',
        params: [{ key: 'paint', min: 0.5, max: 1 }, { key: 'drag', min: 0, max: 120 }, { key: 'noise', min: 0.1, max: 1 }],
        make: (v, ctx) => new OilStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture,
            paint: v.paint, drag: v.drag, noise: v.noise,
        }) },
    { id: 'chrome', kind: 'stroke',
        params: [{ key: 'noise', min: 0, max: 0.7 }, { key: 'specular', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new ChromeStrokeRenderer({ cap: 'rounded', noise: v.noise, specular: v.specular }) },
    { id: 'pixels', kind: 'stroke',
        params: [{ key: 'cell', min: 0.02, max: 0.08 }, { key: 'jitter', min: 0, max: 0.4 }],
        make: (v, ctx) => new PixelStrokeRenderer({ cell: v.cell, jitter: v.jitter, colors: ctx.colors }) },
    { id: 'spiky-blob', kind: 'blob',
        params: [{ key: 'spikeAmp', min: 0.06, max: 0.3 }, { key: 'sharp', min: 1.5, max: 10 },
            { key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => {
            const [gradientFrom, gradientTo] = gradPoints(ctx, v.axis);
            return new ShapedBlobRenderer({
                color: ctx.colorA, colorB: ctx.colorB, gradientFrom, gradientTo,
                spikes: 14, spikeAmp: v.spikeAmp, sharp: v.sharp,
            });
        } },
    { id: 'knife-oil', kind: 'blob',
        params: [{ key: 'relief', min: 0.3, max: 1.5 }, { key: 'gloss', min: 0.1, max: 1.1 }],
        make: (v, ctx) => new PaintBlobRenderer({
            color: ctx.colorA, colorB: ctx.colorB, fade: 0.05, relief: v.relief, swell: 0.5,
            knife: true, split: 1, gloss: v.gloss, edgeSoft: 0.008, noiseFreq: 3.5,
        }) },
    { id: 'wash', kind: 'blob',
        params: [{ key: 'pigment', min: 0.3, max: 1 }, { key: 'wet', min: 0.1, max: 0.9 }, { key: 'flow', min: 0.01, max: 0.09 }],
        make: (v, ctx) => new WashBlobRenderer({
            color: ctx.colorA, background: ctx.texture,
            pigment: v.pigment, feather: 0.05, rim: 0.2, flow: v.flow, wet: v.wet,
        }) },
    { id: 'metal', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 0.9 }],
        make: (v, ctx) => new MaterialBlobRenderer({ mode: 'metal', relief: v.relief }) },
    { id: 'rock', kind: 'blob',
        params: [{ key: 'relief', min: 0.2, max: 1 }],
        make: (v, ctx) => new StoneBlobRenderer({
            mode: 'rock', color: ctx.colorA, colorB: ctx.colorB, relief: v.relief,
        }) },
    { id: 'tube-candy', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'stripes', min: 2, max: 10 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'candy', colors: ctx.colors.slice(0, 4),
            twist: v.twist, stripes: v.stripes, depth: v.depth,
        }) },
    { id: 'tube-wobble', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'wobbleFreq', min: 8, max: 20 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'wobble', colorA: ctx.colorA, colorB: ctx.colorB,
            twist: v.twist, wobbleFreq: v.wobbleFreq, depth: v.depth,
        }) },
    { id: 'tube-metal', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'bend', min: 0.2, max: 0.6 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TubeStrokeRenderer({
            mode: 'metal', background: ctx.texture, tint: ctx.tintLight,
            twist: v.twist, bend: v.bend, depth: v.depth,
        }) },
    { id: 'tri-facets', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'spacing', min: 0.35, max: 1.2 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'facets', colorA: ctx.colorA,
            twist: v.twist, spacing: v.spacing, depth: v.depth,
        }) },
    { id: 'tri-grain', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'spacing', min: 0.35, max: 1.2 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'grain', colorA: ctx.colorA, colorB: ctx.colorB,
            twist: v.twist, spacing: v.spacing, depth: v.depth,
        }) },
    { id: 'tri-metal', kind: 'stroke',
        params: [{ key: 'twist', min: 1, max: 12 }, { key: 'bend', min: 0.2, max: 0.6 }, { key: 'depth', min: 0.04, max: 0.24 }],
        make: (v, ctx) => new TriangleStrokeRenderer({
            mode: 'metal', background: ctx.texture, tint: ctx.tintLight,
            twist: v.twist, bend: v.bend, depth: v.depth,
        }) },
    { id: 'ribbon-square', kind: 'stroke', params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => new RibbonStrokeRenderer({
            cap: 'square', color: ctx.colorA, gradient: ctx.colorB, gradientAxis: v.axis,
        }) },
    { id: 'smear', kind: 'stroke',
        params: [{ key: 'drag', min: 20, max: 220 }, { key: 'variation', min: 0, max: 1 }],
        make: (v, ctx) => new SmearStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, background: ctx.texture,
            drag: v.drag, variation: v.variation,
        }) },
    { id: 'mirror', kind: 'stroke',
        params: [{ key: 'strength', min: 0.008, max: 0.07 }, { key: 'specular', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new MirrorStrokeRenderer({
            cap: 'rounded', background: ctx.texture, strength: v.strength, specular: v.specular,
        }) },
    { id: 'glass-stroke', kind: 'stroke',
        params: [{ key: 'refract', min: 0.02, max: 0.14 }, { key: 'specular', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new GlassStrokeRenderer({
            cap: 'rounded', background: ctx.texture, refract: v.refract,
            reflect: v.refract * 0.4, specular: v.specular,
        }) },
    { id: 'polygons', kind: 'stroke',
        params: [{ key: 'facets', min: 4, max: 50, step: 1 }, { key: 'jitter', min: 0, max: 0.9 }],
        make: (v, ctx) => new PolygonStrokeRenderer({ facets: v.facets, jitter: v.jitter, colors: ctx.colors }) },
    { id: 'lanes', kind: 'stroke',
        params: [{ key: 'lanes', min: 2, max: 20, step: 1 }, { key: 'duty', min: 0.15, max: 1 }],
        make: (v, ctx) => new LineStrokeRenderer({ lanes: v.lanes, duty: v.duty, colors: ctx.colors }) },
    { id: 'pencil', kind: 'stroke',
        params: [{ key: 'grain', min: 0.3, max: 0.8 }, { key: 'pressure', min: 0.2, max: 0.7 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, grain: v.grain, pressure: v.pressure,
            tooth: 2.0, softness: 0.35, edge: 0.08, opacity: 1,
        }) },
    { id: 'charcoal', kind: 'stroke',
        params: [{ key: 'grain', min: 0.4, max: 0.9 }, { key: 'pressure', min: 0.2, max: 0.7 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, grain: v.grain, pressure: v.pressure,
            tooth: 4.5, softness: 0.5, edge: 0.3, opacity: 0.92,
        }) },
    { id: 'pastel', kind: 'stroke',
        params: [{ key: 'grain', min: 0.5, max: 1 }, { key: 'pressure', min: 0.2, max: 0.6 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, grain: v.grain, pressure: v.pressure,
            tooth: 7.0, softness: 0.65, edge: 0.55, opacity: 0.95,
        }) },
    { id: 'pencil-rainbow', kind: 'stroke',
        params: [{ key: 'grain', min: 0.3, max: 0.8 }, { key: 'pressure', min: 0.2, max: 0.7 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, colors: ctx.colors.slice(0, 4), blend: 'along',
            grain: v.grain, pressure: v.pressure,
            tooth: 2.0, softness: 0.35, edge: 0.08, opacity: 1,
        }) },
    { id: 'charcoal-multi', kind: 'stroke',
        params: [{ key: 'grain', min: 0.4, max: 0.9 }, { key: 'pressure', min: 0.2, max: 0.7 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, colors: ctx.colors.slice(0, 4), blend: 'grain',
            grain: v.grain, pressure: v.pressure,
            tooth: 4.5, softness: 0.5, edge: 0.3, opacity: 0.92,
        }) },
    { id: 'pastel-multi', kind: 'stroke',
        params: [{ key: 'grain', min: 0.5, max: 1 }, { key: 'pressure', min: 0.2, max: 0.6 }],
        make: (v, ctx) => new DryMediaStrokeRenderer({
            cap: 'ragged', color: ctx.colorA, colors: ctx.colors.slice(0, 4), blend: 'grain',
            grain: v.grain, pressure: v.pressure,
            tooth: 7.0, softness: 0.65, edge: 0.55, opacity: 0.95,
        }) },
    { id: 'deboss', kind: 'stroke',
        params: [{ key: 'bevel', min: 0.2, max: 1 }, { key: 'amount', min: 0.3, max: 1.4 }],
        make: (v, ctx) => new DebossStrokeRenderer({
            cap: 'rounded', color: ctx.colorA, bevel: v.bevel, amount: v.amount,
        }) },
    { id: 'cloud', kind: 'stroke',
        params: [{ key: 'blob', min: 0.35, max: 0.8 }, { key: 'offset', min: 0.1, max: 0.6 }],
        make: (v, ctx) => new CloudStrokeRenderer({ color: ctx.colorA, blob: v.blob, offset: v.offset }) },
    { id: 'squares', kind: 'stroke',
        params: [{ key: 'cell', min: 0.08, max: 0.28 }, { key: 'blend', min: 0.1, max: 0.6 }],
        make: (v, ctx) => new RoundedSquareStrokeRenderer({ color: ctx.colorA, cell: v.cell, blend: v.blend }) },
    { id: 'spikes', kind: 'stroke',
        params: [{ key: 'spikes', min: 1, max: 10, step: 0.5 }, { key: 'amp', min: 0.3, max: 1.8 }, { key: 'sharp', min: 1.5, max: 10 }],
        make: (v, ctx) => new SpikeStrokeRenderer({ color: ctx.colorA, spikes: v.spikes, amp: v.amp, sharp: v.sharp }) },
    { id: 'pattern-dashes', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }],
        make: (v, ctx) => new PatternStrokeRenderer({ mode: 'dashes', color: ctx.colorA, size: v.size }) },
    { id: 'pattern-dots', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }],
        make: (v, ctx) => new PatternStrokeRenderer({ mode: 'dots', color: ctx.colorA, size: v.size }) },
    { id: 'pattern-strips', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }],
        make: (v, ctx) => new PatternStrokeRenderer({ mode: 'strips', color: ctx.colorA, size: v.size }) },
    { id: 'wet-dashes', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }, { key: 'drag', min: 10, max: 90 }],
        make: (v, ctx) => new WetPatternStrokeRenderer({
            mode: 'dashes', color: ctx.colorA, size: v.size, drag: v.drag, background: ctx.texture }) },
    { id: 'wet-dots', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }, { key: 'drag', min: 10, max: 90 }],
        make: (v, ctx) => new WetPatternStrokeRenderer({
            mode: 'dots', color: ctx.colorA, size: v.size, drag: v.drag, background: ctx.texture }) },
    { id: 'wet-strips', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }, { key: 'drag', min: 10, max: 90 }],
        make: (v, ctx) => new WetPatternStrokeRenderer({
            mode: 'strips', color: ctx.colorA, size: v.size, drag: v.drag, background: ctx.texture }) },
    { id: 'feather', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }, { key: 'angle', min: 25, max: 65 }],
        make: (v, ctx) => new PatternStrokeRenderer({
            mode: 'feather', color: ctx.colorA, colorB: ctx.colorB, size: v.size, angle: v.angle }) },
    { id: 'leaves', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }, { key: 'angle', min: 25, max: 65 }],
        make: (v, ctx) => new PatternStrokeRenderer({
            mode: 'leaves', color: ctx.colorA, colorB: ctx.colorB, size: v.size, angle: v.angle }) },
    { id: 'fringe', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }, { key: 'angle', min: 25, max: 65 }],
        make: (v, ctx) => new PatternStrokeRenderer({
            mode: 'fringe', color: ctx.colorA, colorB: ctx.colorB, size: v.size, angle: v.angle }) },
    { id: 'wet-fringe', kind: 'stroke',
        params: [{ key: 'size', min: 0.6, max: 1.6 }, { key: 'angle', min: 25, max: 65 },
            { key: 'drag', min: 10, max: 90 }],
        make: (v, ctx) => new WetPatternStrokeRenderer({
            mode: 'fringe', color: ctx.colorA, colorB: ctx.colorB, size: v.size, angle: v.angle,
            drag: v.drag, background: ctx.texture }) },
    { id: 'flat-blob', kind: 'blob',
        params: [{ key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => {
            const [gradientFrom, gradientTo] = gradPoints(ctx, v.axis);
            return new ShapedBlobRenderer({ color: ctx.colorA, colorB: ctx.colorB, gradientFrom, gradientTo });
        } },
    { id: 'wobbly-blob', kind: 'blob',
        params: [{ key: 'wobble', min: 0.02, max: 0.12 }, { key: 'axis', pick: ['along', 'across'] }],
        make: (v, ctx) => {
            const [gradientFrom, gradientTo] = gradPoints(ctx, v.axis);
            return new ShapedBlobRenderer({
                color: ctx.colorA, colorB: ctx.colorB, gradientFrom, gradientTo, wobble: v.wobble,
            });
        } },
    { id: 'dry-brush', kind: 'blob',
        params: [{ key: 'dry', min: 0.3, max: 1 }],
        make: (v, ctx) => new PaintBlobRenderer({
            color: ctx.colorA, colorB: ctx.colorB, fade: 0.5, relief: 0.12, swell: 0.8,
            gloss: 0.1, edgeSoft: 0.03, dry: v.dry, noiseFreq: 3.5,
        }) },
    { id: 'flat-paint', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 1 }],
        make: (v, ctx) => new PaintBlobRenderer({
            color: ctx.colorA, colorB: ctx.colorB, fade: 0.12, relief: v.relief, gloss: 0.4, edgeSoft: 0.02,
        }) },
    { id: 'gouache', kind: 'blob',
        params: [{ key: 'flow', min: 0.02, max: 0.14 }],
        make: (v, ctx) => new WashBlobRenderer({
            color: ctx.colorA, background: ctx.texture,
            pigment: 1.1, feather: 0.012, rim: 0.1, flow: v.flow, wet: 0.08, bristle: 0.05,
        }) },
    { id: 'glass-blob', kind: 'blob',
        params: [{ key: 'bend', min: 0.02, max: 0.12 }],
        make: (v, ctx) => new MaterialBlobRenderer({
            mode: 'glass', background: ctx.texture, bend: v.bend, tint: '#dff0f5',
        }) },
    { id: 'facet-glass', kind: 'blob',
        params: [{ key: 'bend', min: 0.02, max: 0.12 }, { key: 'relief', min: 0.15, max: 0.9 }],
        make: (v, ctx) => new MaterialBlobRenderer({
            mode: 'facet', background: ctx.texture, bend: v.bend, relief: v.relief, tint: '#e5eef2',
        }) },
    { id: 'marble', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 1 }],
        make: (v, ctx) => new StoneBlobRenderer({
            mode: 'marble', color: ctx.colorA, colorB: ctx.colorB, relief: v.relief,
        }) },
    { id: 'sand', kind: 'blob',
        params: [{ key: 'relief', min: 0.1, max: 1 }],
        make: (v, ctx) => new StoneBlobRenderer({
            mode: 'sand', color: ctx.colorA, colorB: ctx.colorB, relief: v.relief,
        }) },
];


/** The registry entries with the given ids, in the given order. */
export function pickTools(ids) {
    return ids.map(id => {
        const entry = toolRegistry.find(e => e.id === id);
        if (!entry) throw new Error(`unknown tool id: ${id}`);
        return entry;
    });
}

// The two world points a flat tool's gradient runs between: the drawn chord for
// 'along', its perpendicular through the middle for 'across'.
function gradPoints(ctx, axis) {
    const a = ctx.start, b = ctx.end;
    if (axis !== 'across') return [[a.x, a.y], [b.x, b.y]];
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.max(Math.hypot(dx, dy), 0.2);
    const px = -dy / len, py = dx / len;
    const r = Math.max(len * 0.25, 0.15);
    return [[mx - px * r, my - py * r], [mx + px * r, my + py * r]];
}


export function randomValues(entry) {
    return Object.fromEntries(entry.params.map(p => {
        if (p.pick) return [p.key, p.pick[Math.floor(Math.random() * p.pick.length)]];
        const v = p.min + Math.random() * (p.max - p.min);
        return [p.key, p.step >= 1 ? Math.round(v) : v];
    }));
}

export function toolLabel(entry) {
    return entry.id.replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());
}
