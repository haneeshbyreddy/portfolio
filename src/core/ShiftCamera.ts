import { PerspectiveCamera, Vector2 } from 'three';

/**
 * A perspective camera with a shift lens (like an architectural tilt-shift
 * lens). Lets us frame a monitor off-centre to make room for the project
 * panel without rotating the camera — verticals stay straight.
 */
export class ShiftCamera extends PerspectiveCamera {
  /** Lens shift in NDC units. +x moves the subject right on screen. */
  shift = new Vector2();

  override updateProjectionMatrix() {
    super.updateProjectionMatrix();
    if (!this.shift) return; // called by the base constructor before fields exist
    const e = this.projectionMatrix.elements;
    e[8] -= this.shift.x;
    e[9] -= this.shift.y;
    this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
  }
}
