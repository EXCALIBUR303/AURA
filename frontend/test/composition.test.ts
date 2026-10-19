import assert from "node:assert/strict";
import test from "node:test";
import { PerspectiveCamera, Vector3 } from "three";
import { ASTRA_HOME, ROOMS } from "../src/world/registry.ts";
import { STATIONS } from "../src/world/interactions/registry.ts";
import { zonePose } from "../src/world/registry.ts";

/** Supported desktop window sizes (CSS px). Aspect ratio is all the projection needs. */
const SIZES: [number, number][] = [[1100, 700], [1280, 800], [1440, 900], [1728, 1117]];
const hub = ROOMS["project-hub"];

function screenX(pose: { position: readonly number[]; target: readonly number[] }, [w, h]: [number, number], world: [number, number, number]) {
  const camera = new PerspectiveCamera(50, w / h, 0.05, 80);
  camera.position.set(pose.position[0]!, pose.position[1]!, pose.position[2]!);
  camera.lookAt(pose.target[0]!, pose.target[1]!, pose.target[2]!);
  camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  return (new Vector3(...world).project(camera).x * 0.5 + 0.5) * w;
}

test("Astra stands on the hub's centre axis, between the two front desks", () => {
  const frontDesks = STATIONS.filter(s => s.z < 0).map(s => s.x);
  assert.equal(ASTRA_HOME[0], (Math.min(...frontDesks) + Math.max(...frontDesks)) / 2);
  assert.equal(ASTRA_HOME[0], (hub.floor.minX + hub.floor.maxX) / 2);
  const astra = hub.colliders.find(c => c.id === "astra")!;
  assert.equal((astra.minX + astra.maxX) / 2, ASTRA_HOME[0]);
});

test("the overview frames Astra, her pedestal and both desks symmetrically at every desktop size", () => {
  for (const size of SIZES) {
    const centre = size[0] / 2;
    const [z] = [ASTRA_HOME[2]];
    const pedestal = [screenX(hub.introduction, size, [ASTRA_HOME[0] - 0.72, 0.12, z]), screenX(hub.introduction, size, [ASTRA_HOME[0] + 0.72, 0.12, z])];
    const body = [screenX(hub.introduction, size, [ASTRA_HOME[0] - 0.4, 1, z]), screenX(hub.introduction, size, [ASTRA_HOME[0] + 0.4, 1, z])];
    const desks = [screenX(hub.introduction, size, [-4.5, 0.8, -13.5]), screenX(hub.introduction, size, [4.5, 0.8, -13.5])];
    const mid = (a: number[]) => (a[0]! + a[1]!) / 2;
    assert.ok(Math.abs(mid(pedestal) - centre) <= 1, `${size}: pedestal ${mid(pedestal)} vs ${centre}`);
    assert.ok(Math.abs(mid(body) - centre) <= 1, `${size}: Astra ${mid(body)} vs ${centre}`);
    assert.ok(Math.abs(mid(desks) - centre) <= 1, `${size}: desks ${mid(desks)} vs ${centre}`);
  }
});

test("the companion close-up looks straight at Astra", () => {
  const pose = zonePose("companion");
  for (const size of SIZES) assert.ok(Math.abs(screenX(pose, size, [ASTRA_HOME[0], 1, ASTRA_HOME[2]]) - size[0] / 2) <= 1);
  assert.equal(pose.position[0], ASTRA_HOME[0]);
});
