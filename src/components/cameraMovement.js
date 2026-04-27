import * as THREE from 'three';

export const keysPressed = {
  ArrowUp: false,
  ArrowDown: false,
  ArrowLeft: false,
  ArrowRight: false,
  w: false,
  a: false,
  s: false,
  d: false,
};

const keyPressOrder = {
  ArrowUp: 0,
  ArrowDown: 0,
  ArrowLeft: 0,
  ArrowRight: 0,
  w: 0,
  a: 0,
  s: 0,
  d: 0,
};

let keyPressSequence = 0;

export const setMovementKeyState = (key, pressed) => {
  if (!(key in keysPressed)) return;

  keysPressed[key] = pressed;
  keyPressOrder[key] = pressed ? ++keyPressSequence : 0;
};

const getAxisFromKeys = (positiveKeys, negativeKeys) => {
  const positiveOrder = Math.max(...positiveKeys.map((key) => (keysPressed[key] ? keyPressOrder[key] : 0)));
  const negativeOrder = Math.max(...negativeKeys.map((key) => (keysPressed[key] ? keyPressOrder[key] : 0)));

  if (!positiveOrder && !negativeOrder) return 0;
  if (positiveOrder === negativeOrder) return 0;

  return positiveOrder > negativeOrder ? 1 : -1;
};

const resolveMovementInput = (rawX, rawY) => {
  const deadzone = 0.001;
  const x = Math.abs(rawX) < deadzone ? 0 : rawX;
  const y = Math.abs(rawY) < deadzone ? 0 : rawY;

  const length = Math.hypot(x, y);
  if (length <= 1) return { x, y };
  if (length === 0) return { x: 0, y: 0 };

  // Keep diagonal speed consistent with single-axis movement.
  return { x: x / length, y: y / length };
};

export const updateMovement = (delta, controls, camera, walls, analogInput = { x: 0, y: 0 }) => {
  const moveSpeed = 5 * delta;
  const previousPosition = camera.position.clone();
  const keyboardX = getAxisFromKeys(['ArrowRight', 'd'], ['ArrowLeft', 'a']);
  const keyboardY = getAxisFromKeys(['ArrowDown', 's'], ['ArrowUp', 'w']);
  const rawX = keyboardX || analogInput.x;
  const rawY = keyboardY || analogInput.y;
  const movementInput = resolveMovementInput(rawX, rawY);

  if (movementInput.x > 0.1) {
    const scale = keyboardX > 0 ? 1 : Math.abs(movementInput.x);
    controls.moveRight(moveSpeed * scale);
  }
  if (movementInput.x < -0.1) {
    const scale = keyboardX < 0 ? 1 : Math.abs(movementInput.x);
    controls.moveRight(-moveSpeed * scale);
  }
  if (movementInput.y < -0.1) {
    const scale = keyboardY < 0 ? 1 : Math.abs(movementInput.y);
    controls.moveForward(moveSpeed * scale);
  }
  if (movementInput.y > 0.1) {
    const scale = keyboardY > 0 ? 1 : Math.abs(movementInput.y);
    controls.moveForward(-moveSpeed * scale);
  }

  if (checkCollision(camera, walls)) {
    camera.position.copy(previousPosition);
  }
};

export const getMovementInput = (analogInput = { x: 0, y: 0 }) => {
  const keyboardX = getAxisFromKeys(['ArrowRight', 'd'], ['ArrowLeft', 'a']);
  const keyboardY = getAxisFromKeys(['ArrowDown', 's'], ['ArrowUp', 'w']);
  const rawX = keyboardX || analogInput.x;
  const rawY = keyboardY || analogInput.y;

  return resolveMovementInput(rawX, rawY);
};

export const checkCollision = (camera, walls) => {
  const playerBoundingBox = new THREE.Box3();
  const cameraWorldPosition = new THREE.Vector3();
  camera.getWorldPosition(cameraWorldPosition);
  playerBoundingBox.setFromCenterAndSize(cameraWorldPosition, new THREE.Vector3(1, 1, 1));

  for (let i = 0; i < walls.children.length; i += 1) {
    const wall = walls.children[i];
    if (playerBoundingBox.intersectsBox(wall.BoundingBox)) {
      return true;
    }
  }

  return false;
};
