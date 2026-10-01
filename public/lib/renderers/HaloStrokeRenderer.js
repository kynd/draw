import * as THREE from 'three';
import { StrokeRenderer } from './StrokeRenderer.js';
import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';
import { RibbonStrokeRenderer } from './RibbonStrokeRenderer.js';
import { StrokeDef } from '../StrokeDef.js';
import { smoothByWidth } from '../curves.js';

/**
 * A ribbon with a soft silhouette around it, in one of two looks.
 *
 *   shadow  the silhouette dark and offset toward the lower right, so the
 *           mark reads as floating over the canvas.
 *   glow    the silhouette wide, bright, and centered.
 *
 * The silhouette here is a shader falloff on inflated geometry rather than
 * StrokeHalo's blurred render target, so the mark builds like any other and
 * needs no per-frame pass; the showcase keeps the target-blurred version.
 *
 * Both meshes render through the coverage layer: the silhouette so its folds
 * keep single coverage where the reach exceeds the curvature radius, and the
 * ribbon so it composites after the silhouette rather than under it (layered
 * marks draw after the main pass, in depth order among themselves).
 */
export class HaloStrokeRenderer extends StrokeRenderer {
    /**
     * @param {object} opts
     * @param {'shadow'|'glow'} [opts.mode]
     * @param {string} [opts.color]      The ribbon's color.
     * @param {string} [opts.haloColor]  The silhouette's color.
     * @param {number} [opts.opacity]    The silhouette's peak opacity.
     * @param {number} [opts.spread]     The silhouette's reach, in widths past the mark.
     */
    constructor({
        mode = 'shadow',
        color = '#46608a',
        haloColor = null,
        opacity = null,
        spread = null,
        cap = 'rounded',
        core = true,
        fadeLength = null,
    } = {}) {
        super();
        this.mode = mode;
        this.color = color;
        this.haloColor = haloColor ?? (mode === 'shadow' ? '#101014' : '#f5e9a8');
        this.opacity = opacity ?? (mode === 'shadow' ? 0.4 : 0.85);
        this.spread = spread ?? (mode === 'shadow' ? 0.8 : 1.6);
        this.cap = cap;
        // With `core` off the mark is the soft silhouette alone, no solid ribbon on top.
        this.core = core;
        // The length the silhouette fades over, when the mark is one piece of a longer
        // gesture (a split stroke); the drawn length of this piece when null.
        this.fadeLength = fadeLength;
    }

    build(def) {
        const group = new THREE.Group();
        const width = Math.max(def.maxWidth(), 1e-4);

        // Fade the silhouette in by length (the core keeps full opacity): zero through
        // the hold's arc, then ramping to full once the stroke is as long as it is wide,
        // so the halo starts from nothing when it first clears the hold and grows in.
        const HOLD = 0.06;
        const fadeLength = this.fadeLength ?? def.polylineLength;
        const fade = Math.min(Math.max((fadeLength - HOLD) / Math.max(width - HOLD, 1e-4), 0), 1);

        const halo = new SoftSilhouetteRenderer({
            color: this.haloColor,
            opacity: this.opacity * fade,
            inflate: 1 + this.spread,
            cap: this.cap,
        });
        // The silhouette is much wider than the core, so a turn the core takes cleanly
        // miters the wide offset into straight-edged notches. Rounding the halo's spine
        // to its own reach keeps its turns gentle relative to its width; the core keeps
        // the drawn spine, so only the soft halo rounds off a sharp corner.
        const reach = width * (1 + this.spread);
        const haloPoints = smoothByWidth(def.points, reach, { maxSpan: reach });
        const haloMesh = new StrokeDef({
            points: haloPoints, widthLeft: def.widthLeft, widthRight: def.widthRight,
            renderer: halo, seed: def.seed,
        }).build();
        if (this.mode === 'shadow') {
            haloMesh.position.x += width * 0.5;
            haloMesh.position.y -= width * 0.7;
        }
        haloMesh.position.z -= 0.002;
        group.add(haloMesh);

        if (!this.core) {
            group.userData.stats = { ...haloMesh.userData.stats };
            return group;
        }

        const ribbon = new RibbonStrokeRenderer({ cap: this.cap, color: this.color });
        const ribbonMesh = new StrokeDef({
            points: def.points, widthLeft: def.widthLeft, widthRight: def.widthRight,
            renderer: ribbon, seed: def.seed,
        }).build();
        ribbonMesh.userData.coverageLayer = true;
        group.add(ribbonMesh);

        const a = haloMesh.userData.stats, b = ribbonMesh.userData.stats;
        group.userData.stats = {
            sampleCount: a.sampleCount + b.sampleCount,
            vertexCount: a.vertexCount + b.vertexCount,
            triangleCount: a.triangleCount + b.triangleCount,
            length: b.length,
        };
        return group;
    }
}

/** The soft silhouette: opacity falls from the mark's edge to the geometry's. */
class SoftSilhouetteRenderer extends ShaderStrokeRenderer {
    constructor({ color, opacity, inflate, cap }) {
        super({ cap, inflate, depthWrite: false, singleCoverage: true, clampCapToLength: false });
        this.color = color;
        this.opacity = opacity;
    }

    uniforms() {
        return {
            uColor: { value: new THREE.Color(this.color) },
            uOpacity: { value: this.opacity },
        };
    }

    fragmentShader() {
        return /* glsl */`
            uniform vec3 uColor;
            uniform float uOpacity;
            void main() {
                float d = capDistance();
                float alpha = uOpacity * smoothstep(${this.inflate.toFixed(3)}, 0.55, d);
                if (alpha <= 0.004) discard;
                gl_FragColor = vec4(uColor, alpha);
            }
        `;
    }
}
