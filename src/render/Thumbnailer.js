(() => {
  'use strict';

  const { modelKit } = Hold;
  const FOV = 30;
  const VIEW_DIRECTION = new THREE.Vector3(0.9, 0.75, 1.4).normalize();
  const FIT_MARGIN = 1.08;

  /**
   * Draws single models into small images (icons, gallery cards) with the
   * page's existing renderer: it renders into the bottom-left corner of the
   * renderer's canvas and copies that region out before the frame is shown.
   * This keeps one WebGL context per page and costs one draw per image.
   * The renderer must be created with `alpha: true`.
   */
  class Thumbnailer {
    #scene = new THREE.Scene();
    #camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 100);
    #box = new THREE.Box3();
    #sphere = new THREE.Sphere();
    #clearColor = new THREE.Color();
    #size = new THREE.Vector2();

    constructor(renderer) {
      this.renderer = renderer;
      const sun = new THREE.DirectionalLight(0xfff4e0, 2.2);
      sun.position.set(3, 5, 4);
      this.#scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x8a7a5a, 1.4), sun);
    }

    /** Renders `object` and returns a PNG data URL `size` CSS pixels square. */
    render(object, size = 96) {
      const { renderer } = this;
      const ratio = renderer.getPixelRatio();
      const pixels = Math.round(size * ratio);
      const canvas = renderer.domElement;
      if (canvas.width < pixels || canvas.height < pixels) {
        throw new Error(`Renderer canvas is smaller than a ${size}px thumbnail`);
      }

      this.#frame(object);
      this.#scene.add(object);

      const clearAlpha = renderer.getClearAlpha();
      renderer.getClearColor(this.#clearColor);
      renderer.getSize(this.#size);
      renderer.setScissorTest(true);
      renderer.setScissor(0, 0, size, size);
      renderer.setViewport(0, 0, size, size);
      renderer.setClearColor(0x000000, 0);
      renderer.clear();
      renderer.render(this.#scene, this.#camera);

      const output = document.createElement('canvas');
      output.width = pixels;
      output.height = pixels;
      output.getContext('2d').drawImage(canvas, 0, canvas.height - pixels, pixels, pixels, 0, 0, pixels, pixels);

      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, this.#size.x, this.#size.y);
      renderer.setClearColor(this.#clearColor, clearAlpha);
      this.#scene.remove(object);
      return output.toDataURL('image/png');
    }

    #frame(object) {
      modelKit.visibleBounds(object, this.#box).getBoundingSphere(this.#sphere);
      const distance = (this.#sphere.radius / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * FIT_MARGIN;
      this.#camera.position.copy(this.#sphere.center).addScaledVector(VIEW_DIRECTION, distance);
      this.#camera.near = distance / 50;
      this.#camera.far = distance * 3;
      this.#camera.lookAt(this.#sphere.center);
      this.#camera.updateProjectionMatrix();
    }
  }

  Object.assign(Hold, { Thumbnailer });
})();
