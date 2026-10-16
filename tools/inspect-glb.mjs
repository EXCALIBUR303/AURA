#!/usr/bin/env node
// Prints what a .glb actually contains (asset metadata, meshes, textures,
// skeleton, animation clips) by parsing the container directly — no
// dependencies, no rendering. Exits non-zero if the file is missing or invalid.
//
//   node tools/inspect-glb.mjs path/to/model.glb [--json]

import { readFileSync, existsSync } from "node:fs";

const [path, flag] = process.argv.slice(2);
if (!path) {
  console.error("usage: node tools/inspect-glb.mjs <file.glb> [--json]");
  process.exit(2);
}
if (!existsSync(path)) {
  console.error(`missing: ${path}\nSee docs/ASSETS.md for where to obtain this file.`);
  process.exit(1);
}

const data = readFileSync(path);
if (data.toString("latin1", 0, 4) !== "glTF") {
  console.error("not a binary glTF (bad magic)");
  process.exit(1);
}

const chunks = [];
for (let offset = 12; offset < data.length; ) {
  const length = data.readUInt32LE(offset);
  chunks.push({ type: data.toString("latin1", offset + 4, offset + 8).replace("\0", ""), start: offset + 8, length });
  offset += 8 + length;
}
const jsonChunk = chunks.find((c) => c.type === "JSON");
const binChunk = chunks.find((c) => c.type === "BIN");
const gltf = JSON.parse(data.toString("utf8", jsonChunk.start, jsonChunk.start + jsonChunk.length));

function imageSize(view) {
  const b = data.subarray(binChunk.start + (view.byteOffset ?? 0), binChunk.start + (view.byteOffset ?? 0) + view.byteLength);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length; ) {
      const marker = b[i + 1];
      if (marker >= 0xc0 && marker <= 0xc2) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return [null, null];
}

const accessors = gltf.accessors ?? [];
const report = {
  file: path,
  bytes: data.length,
  asset: gltf.asset,
  extensionsUsed: gltf.extensionsUsed ?? [],
  extensionsRequired: gltf.extensionsRequired ?? [],
  meshes: (gltf.meshes ?? []).map((mesh) => ({
    name: mesh.name,
    primitives: mesh.primitives.length,
    triangles: mesh.primitives.reduce(
      (sum, p) => sum + Math.floor(accessors[p.indices ?? p.attributes.POSITION].count / 3),
      0,
    ),
    attributes: [...new Set(mesh.primitives.flatMap((p) => Object.keys(p.attributes)))].sort(),
    morphTargets: Math.max(0, ...mesh.primitives.map((p) => p.targets?.length ?? 0)),
  })),
  materials: (gltf.materials ?? []).map((m) => ({
    name: m.name,
    textures: [
      ...Object.keys(m.pbrMetallicRoughness ?? {}).filter((k) => k.endsWith("Texture")),
      ...Object.keys(m).filter((k) => k.endsWith("Texture")),
    ],
    extensions: Object.keys(m.extensions ?? {}),
    alphaMode: m.alphaMode ?? "OPAQUE",
  })),
  images: (gltf.images ?? []).map((image, index) => {
    const view = image.bufferView !== undefined ? gltf.bufferViews[image.bufferView] : null;
    const [width, height] = view ? imageSize(view) : [null, null];
    return { index, mimeType: image.mimeType, uri: image.uri ?? null, bytes: view?.byteLength ?? null, width, height };
  }),
  skins: (gltf.skins ?? []).map((skin) => ({
    name: skin.name ?? null,
    joints: skin.joints.map((j) => gltf.nodes[j].name),
  })),
  animations: (gltf.animations ?? []).map((animation) => ({
    name: animation.name,
    channels: animation.channels.length,
    durationSec: Math.max(...animation.samplers.map((s) => accessors[s.input].max?.[0] ?? 0)),
    paths: [...new Set(animation.channels.map((c) => c.target.path))].sort(),
  })),
};

if (flag === "--json") {
  console.log(JSON.stringify(report, null, 2));
} else {
  const mb = (n) => `${(n / 1048576).toFixed(1)} MB`;
  console.log(`${report.file} (${mb(report.bytes)})`);
  console.log(`asset: ${JSON.stringify(report.asset)}`);
  console.log(`extensions: used=${report.extensionsUsed.join(",") || "-"} required=${report.extensionsRequired.join(",") || "-"}`);
  for (const m of report.meshes)
    console.log(`mesh "${m.name}": ${m.triangles} tris, ${m.primitives} primitive(s), attrs ${m.attributes.join(",")}, morph targets ${m.morphTargets}`);
  for (const m of report.materials) console.log(`material "${m.name}": ${m.textures.join(",")} ext=${m.extensions.join(",") || "-"} alpha=${m.alphaMode}`);
  for (const i of report.images) console.log(`image #${i.index}: ${i.mimeType} ${i.width}×${i.height} ${i.bytes ? mb(i.bytes) : i.uri}`);
  for (const s of report.skins) {
    console.log(`skin: ${s.joints.length} joints`);
    console.log(`  ${s.joints.join(", ")}`);
  }
  if (report.animations.length === 0) console.log("animations: none");
  for (const a of report.animations)
    console.log(`animation "${a.name}": ${a.durationSec.toFixed(2)} s, ${a.channels} channels (${a.paths.join(",")})`);
}
