import * as THREE from 'three';

/**
 * The surface strokes are drawn onto.
 *
 * A CanvasBuffer owns an offscreen render target, its own scene, and an orthographic
 * camera framing a fixed region of world space. Strokes are added to it, rendered into
 * the target, and the target is then presented to the visible canvas.
 *
 * Going through a buffer rather than rendering strokes straight to the screen costs one
 * extra full-screen blit, and buys two things: the drawing exists as a texture that
 * later stages can read, and `autoClear = false` turns the buffer into an accumulating
 * canvas where each frame's strokes are laid over what is already there.
 *
 * World space is orthographic, so depth is linear: the very small Z offsets a 2D stroke
 * uses to order its own overlaps resolve exactly, with no Z-fighting.
 */
export class CanvasBuffer {
    /**
     * @param {object}  opts
     * @param {number}  opts.width          Target width in pixels.
     * @param {number}  opts.height         Target height in pixels.
     * @param {string} [opts.background]    Paper color.
     * @param {number} [opts.extent]        Half-height of the visible world region when
     *                                      no `fit` is given.
     * @param {{width:number,height:number}} [opts.fit]
     *                                      Half-extents of a region that must stay fully
     *                                      visible at any aspect ratio. The camera grows
     *                                      whichever axis is short, so the region is never
     *                                      cropped and the slack shows as more paper —
     *                                      never as letterbox bars.
     * @param {boolean}[opts.autoClear]     Clear to `background` before each render.
     * @param {number} [opts.samples]       MSAA sample count on the target. The
     *                                      renderer's own `antialias` flag only covers
     *                                      the default framebuffer, which never receives
     *                                      geometry here — everything is drawn into this
     *                                      target and blitted, so without this the edges
     *                                      come out hard. 0 disables.
     */
    constructor({ width, height, background = '#ffffff', extent = 1, fit = null, autoClear = true, samples = 4 } = {}) {
        this.width = width;
        this.height = height;
        this.extent = extent;
        this.fit = fit;
        this.autoClear = autoClear;
        this.background = new THREE.Color(background);

        this.target = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            depthBuffer: true,
            samples,
        });
        this.target.texture.colorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();

        this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
        this.camera.position.z = 2;
        this._frame();

        this._presentScene = new THREE.Scene();
        this._presentCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        this._presentMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(2, 2),
            new THREE.MeshBasicMaterial({ map: this.target.texture, depthTest: false })
        );
        this._presentScene.add(this._presentMesh);
    }

    /** Half-width of the visible world region. */
    get extentX() { return this.camera.right; }

    /** Half-height of the visible world region. */
    get extentY() { return this.camera.top; }

    /** Sets the camera frustum from the current pixel size and framing rule. */
    _frame() {
        const aspect = this.width / this.height;
        const halfHeight = this.fit
            ? Math.max(this.fit.height, this.fit.width / aspect)
            : this.extent;
        const halfWidth = halfHeight * aspect;

        this.camera.left = -halfWidth;
        this.camera.right = halfWidth;
        this.camera.top = halfHeight;
        this.camera.bottom = -halfHeight;
        this.camera.updateProjectionMatrix();
    }

    add(object) { this.scene.add(object); return object; }

    remove(object) { this.scene.remove(object); return object; }

    /** Clears the target to the background color without drawing anything. */
    clear(renderer) {
        const previous = renderer.getRenderTarget();
        renderer.setRenderTarget(this.target);
        renderer.setClearColor(this.background, 1);
        renderer.clear(true, true, false);
        renderer.setRenderTarget(previous);
    }

    /**
     * Draws the buffer's scene into the offscreen target.
     *
     * The renderer's own autoClear is forced off for the duration: clearing is this
     * buffer's decision, so that `autoClear = false` really does accumulate.
     */
    render(renderer) {
        const previousTarget = renderer.getRenderTarget();
        const previousAuto = renderer.autoClear;
        renderer.autoClear = false;
        renderer.setRenderTarget(this.target);
        if (this.autoClear) {
            renderer.setClearColor(this.background, 1);
            renderer.clear(true, true, false);
        } else {
            renderer.clear(false, true, false);
        }
        renderer.render(this.scene, this.camera);
        renderer.setRenderTarget(previousTarget);
        renderer.autoClear = previousAuto;
    }

    /** Blits the target onto the visible canvas. */
    present(renderer) {
        const previousAuto = renderer.autoClear;
        renderer.autoClear = false;
        renderer.setRenderTarget(null);
        renderer.render(this._presentScene, this._presentCamera);
        renderer.autoClear = previousAuto;
    }

    /**
     * Resizes the target and reframes the camera.
     *
     * With a `fit` region the drawing stays whole at any window shape: a narrow window
     * pulls the camera back rather than cropping the sides off. Without one, the
     * half-height is held fixed and a wider window simply reveals more paper.
     */
    resize(width, height) {
        if (width === this.width && height === this.height) return;
        this.width = width;
        this.height = height;
        this.target.setSize(width, height);
        this._frame();
    }

    dispose() {
        this.target.dispose();
        this._presentMesh.geometry.dispose();
        this._presentMesh.material.dispose();
    }
}
