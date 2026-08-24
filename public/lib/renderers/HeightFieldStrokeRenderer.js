import { ShaderStrokeRenderer } from './ShaderStrokeRenderer.js';

/**
 * Base for strokes that shade a surface rather than a fill.
 *
 * The mark is given a height field built from three things: how far the fragment sits
 * from the edge, which rounds the cross-section into a bead; noise stretched along the
 * path, which reads as liquid dragged by the brush; and the stroke's own seed, so two
 * strokes are not the same bead twice.
 *
 * The normal comes from finite differences of that height in the stroke's own frame,
 * not from `dFdx`. Screen-space derivatives are one instruction cheaper and wrong at
 * exactly the places that matter here, since they break down along the silhouette where
 * the bead turns over fastest.
 */
export class HeightFieldStrokeRenderer extends ShaderStrokeRenderer {
    constructor({
        dome = 1.0,
        noise = 0.22,
        stretch = 0.9,
        across = 2.0,
        edge = 0.10,
        samplesPerUnit = 90,
        inflate = 1.25,
        cap = 'rounded',
    } = {}) {
        super({ cap, inflate, samplesPerUnit });
        this.dome = dome;
        this.noise = noise;
        this.stretch = stretch;
        this.across = across;
        this.edge = edge;
    }

    uniforms() {
        return {
            uDome: { value: this.dome },
            uNoise: { value: this.noise },
            uStretch: { value: this.stretch },
            uAcross: { value: this.across },
            uEdge: { value: this.edge },
        };
    }

    /** Subclasses shade using `normal`, `height` and `body`. */
    shading() {
        throw new Error(`${this.constructor.name} must implement shading().`);
    }

    fragmentShader() {
        return HEIGHT_FIELD_CHUNK + this.shading();
    }
}

const HEIGHT_FIELD_CHUNK = /* glsl */`
    uniform float uDome;
    uniform float uNoise;
    uniform float uStretch;
    uniform float uAcross;
    uniform float uEdge;

    /**
     * Height in units of the stroke's half-width, so the gradient below comes out
     * dimensionless and needs no fudge factor to look right at any width.
     *
     * The bead is parabolic rather than a hemisphere. A hemisphere is the obvious
     * choice and its slope runs to infinity at the rim, which turns every fragment
     * near the edge into noise once a finite difference is taken across it.
     */
    float heightAt(float along, float lateral) {
        float a = min(abs(lateral), 1.0);
        float dome = 1.0 - a * a;
        // Liquid dragged by the brush: low frequency along the path, higher across it,
        // so the features stretch into streaks that follow the stroke.
        float liquid = fbm(vec2(along * uLength * uStretch, lateral * uAcross + uSeed * 19.0));
        return dome * uDome + (liquid - 0.5) * uNoise;
    }

    // Surface normal in world space, from finite differences in the stroke frame.
    vec3 surfaceNormal(out float height, out float body) {
        float along = vUv.x;
        float lateral = vCross;

        height = heightAt(along, lateral);
        float e = 0.015;
        float dLateral = (heightAt(along, lateral + e) - heightAt(along, lateral - e)) / (2.0 * e);
        float dAlong = (heightAt(along + e, lateral) - heightAt(along - e, lateral)) / (2.0 * e);

        // Height is measured in half-widths, and so is the lateral coordinate, so that
        // gradient is already per unit. The along coordinate spans the whole arc, so it
        // is converted into the same units before the two are combined.
        float dAlongWorld = dAlong * uWidth / max(uLength, 0.001);

        vec2 T = normalize(vTangent.xy);
        vec2 N2 = vec2(-T.y, T.x);
        vec2 slope = T * (-dAlongWorld) + N2 * (-dLateral);
        vec3 n = normalize(vec3(slope, 1.0));

        body = smoothstep(1.0, 1.0 - uEdge, capDistance());
        return n;
    }
`;
