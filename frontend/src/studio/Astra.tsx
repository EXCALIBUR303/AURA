import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import * as THREE from "three";
import type { CompanionState } from "@aura/contracts";
import { AVATAR_URL } from "../validation/AvatarProbe.tsx";
import type { Report } from "./diagnostics.ts";
import type { VoiceSamples } from "../companion/voice/VoiceController.ts";

export function Astra({ state, speechLevel, reducedMotion, report, startedAt, voiceSamples, active = true }: {
  state: CompanionState; speechLevel: number; reducedMotion: boolean; report: Report; startedAt: number;
  voiceSamples?: VoiceSamples; active?: boolean;
}) {
  // Both decoder flags are explicit: no remote Draco or Meshopt assets.
  const gltf = useGLTF(AVATAR_URL, false, false);
  const jawLevel = useRef(0);
  const rig = useMemo(() => {
    const scene = clone(gltf.scene);
    scene.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(scene, true);
    const height = bounds.max.y - bounds.min.y;
    const scale = 1.75 / height;
    const center = bounds.getCenter(new THREE.Vector3());
    const group = new THREE.Group();
    group.scale.setScalar(scale);
    group.add(scene);
    // Offset outside the animated hierarchy so the idle clip cannot reset it.
    group.position.set(-center.x * scale, 0.13 - bounds.min.y * scale, -center.z * scale);
    const bones = new Set<string>();
    let triangles = 0;
    let skinnedMeshes = 0;
    const materials = new Set<string>();
    const textures = new Set<string>();
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.castShadow = true;
      object.frustumCulled = false;
      triangles += (object.geometry.index?.count ?? object.geometry.getAttribute("position").count) / 3;
      if (object instanceof THREE.SkinnedMesh) {
        skinnedMeshes++;
        object.skeleton.bones.forEach((bone) => bones.add(bone.uuid));
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material.type);
        for (const value of Object.values(material)) {
          if (value instanceof THREE.Texture) textures.add(value.name || "embedded texture");
        }
      }
    });
    const head = scene.getObjectByName("CC_Base_Head_039");
    const eyes = [scene.getObjectByName("CC_Base_L_Eye_047"), scene.getObjectByName("CC_Base_R_Eye_046")];
    const jaw = scene.getObjectByName("CC_Base_JawRoot_041");
    const mixer = new THREE.AnimationMixer(scene);
    const idle = gltf.animations.find((clip) => clip.name === "Idle02_F");
    if (idle) mixer.clipAction(idle).setLoop(THREE.LoopRepeat, Infinity).play();
    return { group, scene, mixer, idle, head, eyes, jaw, height: height * scale,
      facts: { bones: bones.size, triangles, skinnedMeshes, materials: [...materials], textures: [...textures] },
      headPosition: new THREE.Vector3(), localTarget: new THREE.Vector3(), delta: new THREE.Quaternion(),
      look: new THREE.Euler(0, 0, 0, "YXZ"),
      // Save animation results before layering; restore next frame to avoid accumulation.
      bases: new Map([head, ...eyes, jaw].filter((bone): bone is THREE.Object3D => !!bone).map((bone) => [bone, bone.quaternion.clone()])),
    };
  }, [gltf]);

  useEffect(() => {
    report({ ...rig.facts, status: "loaded", heightMeters: Number(rig.height.toFixed(3)),
      loadMs: Math.round(performance.now() - startedAt), morphTargets: 0,
      clips: gltf.animations.map((clip) => ({ name: clip.name, durationSec: clip.duration, tracks: clip.tracks.length })),
      playingClip: rig.idle?.name,
      rig: { head: !!rig.head, eyes: rig.eyes.every(Boolean), jaw: !!rig.jaw, jawAngle: 0, headYaw: 0, headPitch: 0 } });
    return () => { rig.mixer.stopAllAction(); rig.mixer.uncacheRoot(rig.scene); };
  }, [gltf.animations, report, rig, startedAt]);

  // StrictMode replays effects; activate the action on each setup.
  useEffect(() => {
    if (rig.idle) rig.mixer.clipAction(rig.idle).play();
  }, [rig]);

  useFrame(({ camera }, delta) => {
    if (!active) return;
    rig.bases.forEach((base, bone) => bone.quaternion.copy(base));
    rig.mixer.update(reducedMotion ? 0 : Math.min(delta, 0.1));
    rig.bases.forEach((base, bone) => base.copy(bone.quaternion));
    rig.group.updateMatrixWorld(true);
    let headYaw = 0;
    let headPitch = 0;
    if (rig.head && !reducedMotion) {
      rig.head.getWorldPosition(rig.headPosition);
      rig.localTarget.copy(camera.position);
      rig.head.parent?.worldToLocal(rig.localTarget);
      rig.localTarget.sub(rig.head.position).normalize();
      // Small additive rotations in the head's local axes; never replace the clip pose.
      const yaw = THREE.MathUtils.clamp(Math.atan2(rig.localTarget.x, Math.abs(rig.localTarget.z)), -0.32, 0.32);
      const pitch = THREE.MathUtils.clamp(-rig.localTarget.y * 0.15 + (state === "thinking" ? 0.07 : 0), -0.13, 0.13);
      headYaw = yaw * (state === "listening" ? 1 : 0.65);
      headPitch = pitch;
      rig.look.set(headPitch, headYaw, 0);
      rig.delta.setFromEuler(rig.look);
      rig.head.quaternion.multiply(rig.delta);
      rig.eyes.forEach((eye) => { if (eye) { rig.look.set(pitch * 0.3, yaw * 0.25, 0); eye.quaternion.multiply(rig.delta.setFromEuler(rig.look)); } });
    }
    const level = voiceSamples ? voiceSamples.phase === "speaking" ? voiceSamples.output : 0 : speechLevel;
    jawLevel.current = reducedMotion ? 0 : THREE.MathUtils.damp(jawLevel.current, level, 18, delta);
    if (rig.jaw) {
      rig.look.set(jawLevel.current * 0.18, 0, 0);
      rig.jaw.quaternion.multiply(rig.delta.setFromEuler(rig.look));
    }
    const diagnostics = window.__AURA_DIAGNOSTICS__;
    if (diagnostics) {
      diagnostics.animationTime = rig.idle ? rig.mixer.existingAction(rig.idle)?.time : undefined;
      if (diagnostics.rig) {
        diagnostics.rig.jawAngle = jawLevel.current * 0.18;
        diagnostics.rig.headYaw = headYaw;
        diagnostics.rig.headPitch = headPitch;
      }
    }
  });

  return <primitive object={rig.group} dispose={null} />;
}
