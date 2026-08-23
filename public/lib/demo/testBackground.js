import * as THREE from 'three';

/**
 * The test pattern the background-sampling demos draw onto.
 *
 * A stroke that reads the background can only be judged against something with edges
 * and contrast in it. Flat paper would hide every one of these effects. The left
 * quarter is white and the next quarter black, which shows how far an effect reaches
 * and which way it drags. The remaining half is a grid of palette colors, which shows
 * what the effect does to hue rather than only to value.
 */
export class TestBackground {
    /**
     * @param {Palette} palette
     * @param {object}  [opts]
     * @param {number}  [opts.columns]  Grid columns across the right half.
     * @param {number}  [opts.rows]
     * @param {number}  [opts.blur]     Blur radius in pixels for the soft copy.
     */
    constructor(palette, { columns = 6, rows = 4, blur = 14 } = {}) {
        this.columns = columns;
        this.rows = rows;
        this.blur = blur;
        this.canvas = document.createElement('canvas');
        this.blurCanvas = document.createElement('canvas');
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.blurred = new THREE.CanvasTexture(this.blurCanvas);
        for (const t of [this.texture, this.blurred]) {
            t.colorSpace = THREE.SRGBColorSpace;
            t.minFilter = THREE.LinearFilter;
            t.magFilter = THREE.LinearFilter;
            t.wrapS = THREE.ClampToEdgeWrapping;
            t.wrapT = THREE.ClampToEdgeWrapping;
        }
        this.paint(palette, 1280, 720);
    }

    paint(palette, width, height) {
        this.canvas.width = width;
        this.canvas.height = height;
        const ctx = this.canvas.getContext('2d');

        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width / 4, height);
        ctx.fillStyle = '#000000';
        ctx.fillRect(width / 4, 0, width / 4, height);

        const gridX = width / 2;
        const cellW = (width / 2) / this.columns;
        const cellH = height / this.rows;
        const entries = palette.entries;
        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.columns; c++) {
                ctx.fillStyle = entries[Math.floor(Math.random() * entries.length)].hex;
                ctx.fillRect(gridX + c * cellW, r * cellH, cellW + 1, cellH + 1);
            }
        }

        // A pre-blurred copy, so a watercolor stroke reads one texel instead of
        // gathering a wide neighbourhood per fragment.
        this.blurCanvas.width = width;
        this.blurCanvas.height = height;
        const bctx = this.blurCanvas.getContext('2d');
        bctx.filter = `blur(${this.blur}px)`;
        bctx.drawImage(this.canvas, 0, 0);
        bctx.filter = 'none';

        this.texture.needsUpdate = true;
        this.blurred.needsUpdate = true;
    }

    /** A plane that covers the visible world region, showing the sharp pattern. */
    createPlane(extentX, extentY) {
        const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ map: this.texture, depthWrite: false })
        );
        mesh.position.z = 0;
        this.resizePlane(mesh, extentX, extentY);
        return mesh;
    }

    resizePlane(mesh, extentX, extentY) {
        mesh.scale.set(extentX * 2, extentY * 2, 1);
    }
}
