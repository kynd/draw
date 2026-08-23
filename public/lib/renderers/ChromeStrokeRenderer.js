import * as THREE from 'three';
import { HeightFieldStrokeRenderer } from './HeightFieldStrokeRenderer.js';

/**
 * Metal lit by an assumed environment rather than a real one.
 *
 * The environment is two tones split at a horizon, which is the whole trick behind a
 * chrome look: a mirror shows mostly a bright sky and a dark ground, and the eye reads
 * the boundary sweeping across a curved surface as metal. A full environment map would
 * add cost and detail the shape does not need.
 */
export class ChromeStrokeRenderer extends HeightFieldStrokeRenderer {
    constructor({
        sky = '#f2f2f2',
        ground = '#141414',
        tint = '#ffffff',
        specular = 0.85,
        shininess = 48,
        ...rest
    } = {}) {
        super(rest);
        this.sky = sky;
        this.ground = ground;
        this.tint = tint;
        this.specular = specular;
        this.shininess = shininess;
    }

    uniforms(def) {
        return {
            ...super.uniforms(def),
            uSky: { value: new THREE.Color(this.sky) },
            uGround: { value: new THREE.Color(this.ground) },
            uTint: { value: new THREE.Color(this.tint) },
            uSpecular: { value: this.specular },
            uShininess: { value: this.shininess },
        };
    }

    shading() {
        return /* glsl */`
            uniform vec3 uSky;
            uniform vec3 uGround;
            uniform vec3 uTint;
            uniform float uSpecular;
            uniform float uShininess;

            void main() {
                float height, body;
                vec3 n = surfaceNormal(height, body);
                if (body <= 0.001) discard;

                vec3 view = vec3(0.0, 0.0, 1.0);
                vec3 r = reflect(-view, n);

                // Horizon split, softened just enough to stay smooth on the bead.
                float horizon = smoothstep(-0.06, 0.06, r.y);
                vec3 env = mix(uGround, uSky, horizon);
                // A second, dimmer band keeps the dark side from reading as flat paint.
                env = mix(env, uSky, smoothstep(0.55, 0.95, abs(r.x)) * 0.25);

                vec3 light = normalize(vec3(-0.45, 0.75, 0.55));
                vec3 halfVec = normalize(light + view);
                float spec = pow(max(dot(n, halfVec), 0.0), uShininess) * uSpecular;

                vec3 color = env * uTint + vec3(spec);
                gl_FragColor = vec4(color, body);
            }
        `;
    }
}
