import { Component, Suspense, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { ReactNode, Ref, RefObject } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import * as THREE from "three";
import type { CompanionState, WindowState, ZoneId } from "@aura/contracts";
import { World } from "./World.tsx";
import { Astra } from "./Astra.tsx";
import { getZone, ZONES } from "./zones.ts";
import type { FrameSample, Report } from "./diagnostics.ts";
import { bridge, useBridgeEvent } from "../platform/bridge.ts";
import { ArrowIcon } from "../components/Icon.tsx";
import { ZoneIcon } from "../components/ZoneIcon.tsx";

class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override componentDidCatch() { this.props.onError(); }
  override render() { return this.state.failed ? null : this.props.children; }
}

export type CameraPose = { position: [number, number, number]; target: [number, number, number] };
export type StudioCameraHandle = { capture: () => CameraPose | undefined };
function CameraRig({ zone, revision, reducedMotion, report, restorePose, cameraHandle }: { zone: ZoneId; revision: number; reducedMotion: boolean; report: Report; restorePose?: CameraPose | null; cameraHandle?: Ref<StudioCameraHandle> }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const moving = useRef(true);
  const destination = useRef(new THREE.Vector3());
  const target = useRef(new THREE.Vector3());
  const { camera } = useThree();
  useImperativeHandle(cameraHandle, () => ({ capture: () => controls.current ? { position: camera.position.toArray(), target: controls.current.target.toArray() } : undefined }), [camera]);
  useEffect(() => {
    const pose = getZone(zone);
    destination.current.fromArray(restorePose?.position ?? pose.camera);
    target.current.fromArray(restorePose?.target ?? pose.target);
    moving.current = true;
    report({ zone, cameraSettled: false, cameraRevision: revision });
    if (controls.current) {
      controls.current.enabled = false;
      controls.current.minDistance = zone === "studio" ? 7 : 2.1;
      controls.current.maxDistance = zone === "studio" ? 22 : 9;
      const azimuth = Math.atan2(pose.camera[0] - pose.target[0], pose.camera[2] - pose.target[2]);
      controls.current.minAzimuthAngle = azimuth - 0.8;
      controls.current.maxAzimuthAngle = azimuth + 0.8;
    }
  }, [zone, revision, report, restorePose]);
  useFrame((_, delta) => {
    const orbit = controls.current;
    if (!orbit || !moving.current) return;
    const blend = reducedMotion ? 1 : 1 - Math.exp(-6 * Math.min(delta, 0.1));
    camera.position.lerp(destination.current, blend);
    orbit.target.lerp(target.current, blend);
    orbit.update();
    if (camera.position.distanceTo(destination.current) < 0.012 && orbit.target.distanceTo(target.current) < 0.012) {
      camera.position.copy(destination.current);
      orbit.target.copy(target.current);
      moving.current = false;
      orbit.enabled = true;
      report({ cameraSettled: true, cameraSampledAt: Date.now(), camera: { position: camera.position.toArray(), target: orbit.target.toArray(), fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined } });
    }
  });
  return <OrbitControls ref={controls} makeDefault enablePan={false} enableDamping={!reducedMotion}
    minPolarAngle={0.24} maxPolarAngle={1.4} rotateSpeed={0.5} zoomSpeed={0.7} />;
}

function Measurements({ zone, throttled, report, lowerDpr }: { zone: ZoneId; throttled: boolean; report: Report; lowerDpr: () => void }) {
  const { gl } = useThree();
  const elapsed = useRef(0);
  const frames = useRef(0);
  const slow = useRef(0);
  const sinceZone = useRef(0);
  const stableWindow = useRef(true);
  const samples = useRef<Partial<Record<ZoneId, FrameSample[]>>>({});
  const gpu = useRef<{ vendor: string; renderer: string } | null>(null);
  useEffect(() => {
    elapsed.current = 0; frames.current = 0; slow.current = 0; sinceZone.current = 0; stableWindow.current = true;
  }, [zone, throttled]);
  useFrame(({ camera, controls }, delta) => {
    if (gl.getContext().isContextLost() || document.hidden) {
      frames.current = 0; elapsed.current = 0; sinceZone.current = 0; stableWindow.current = true; return;
    }
    const diagnostics = window.__AURA_DIAGNOSTICS__;
    const ready = diagnostics?.status === "loaded" && diagnostics.context === "ready" && diagnostics.cameraSettled;
    if (!ready) { sinceZone.current = 0; stableWindow.current = false; }
    elapsed.current += delta;
    sinceZone.current += delta;
    frames.current++;
    if (elapsed.current < 1) return;
    const fps = Math.round(frames.current / elapsed.current);
    const sample = { fps, drawCalls: gl.info.render.calls, triangles: gl.info.render.triangles,
      pixelRatio: gl.getPixelRatio(), sampledAt: Date.now() };
    // A deliberately reduced background rate is neither a sample nor a reason to lower the DPR.
    if (ready && stableWindow.current && sinceZone.current > 2 && !throttled) {
      samples.current[zone] = [...(samples.current[zone] ?? []), sample].slice(-30);
      slow.current = fps < 55 ? slow.current + 1 : 0;
      if (slow.current >= 3) { lowerDpr(); slow.current = 0; }
    }
    // getParameter is a synchronous GPU round-trip (it waits for queued frames),
    // so read the constant renderer strings once rather than every second.
    if (!gpu.current) {
      const context = gl.getContext();
      const extension = context.getExtension("WEBGL_debug_renderer_info");
      gpu.current = {
        vendor: String(context.getParameter(extension ? extension.UNMASKED_VENDOR_WEBGL : context.VENDOR)),
        renderer: String(context.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : context.RENDERER)),
      };
    }
    const orbit = controls as OrbitControlsImpl | null;
    report({ fps, drawCalls: sample.drawCalls, sceneTriangles: sample.triangles, perZone: { ...samples.current },
      cameraSampledAt: Date.now(), camera: { position: camera.position.toArray(), target: orbit?.target.toArray() ?? [0, 0, 0],
        fov: camera instanceof THREE.PerspectiveCamera ? camera.fov : undefined },
      renderer: { webgl2: gl.capabilities.isWebGL2, pixelRatio: sample.pixelRatio,
        maxTextureSize: gl.capabilities.maxTextureSize, ...gpu.current } });
    elapsed.current = 0; frames.current = 0; stableWindow.current = true;
  });
  return null;
}

function ContextEvents({ report, restored }: { report: Report; restored: () => void }) {
  const gl = useThree((state) => state.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event) => { event.preventDefault(); report({ context: "lost", cameraSettled: false }); };
    const restore = () => { report({ context: "restoring" }); restored(); };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restore);
    return () => { canvas.removeEventListener("webglcontextlost", lost); canvas.removeEventListener("webglcontextrestored", restore); };
  }, [gl, report, restored]);
  return null;
}

type ScreenRect = { left: number; right: number; top: number; bottom: number };
const overlaps = (a: ScreenRect, b: ScreenRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

function ProjectHotspots({ buttons, zone }: { buttons: RefObject<Map<ZoneId, HTMLButtonElement>>; zone: ZoneId }) {
  const point = useRef(new THREE.Vector3());
  const time = useRef(0);
  const anchor = getZone(zone).anchor;
  const nearby = zone === "studio" ? ZONES : ZONES.filter((item) => item.id !== zone && item.id !== "studio")
    .sort((a, b) => a.anchor.reduce((sum, value, i) => sum + (value - anchor[i]!) ** 2, 0) - b.anchor.reduce((sum, value, i) => sum + (value - anchor[i]!) ** 2, 0))
    .slice(0, zone === "companion" ? 1 : 2);
  const visible = new Set(nearby.map((item) => item.id));
  useFrame(({ camera, size, gl }, delta) => {
    time.current += delta;
    if (time.current < 0.07) return;
    time.current = 0;
    const viewport = gl.domElement.closest(".viewport");
    if (!viewport) return;
    const origin = viewport.getBoundingClientRect();
    const occupied: ScreenRect[] = [...viewport.querySelectorAll(".command-dock, .viewport-heading, .companion-pill, .viewport-tools, .diagnostics, .scene-message"), ...document.querySelectorAll('.companion-workspace[data-layout="compact"][data-visible="true"]')].map((element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left - origin.left - 8, right: rect.right - origin.left + 8,
        top: rect.top - origin.top - 8, bottom: rect.bottom - origin.top + 8 };
    });
    // Project the human-scale companion silhouette, not just its centre point.
    const silhouette = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };
    for (const x of [-0.45, 0.45]) for (const y of [0.13, 1.88]) {
      point.current.set(x, y, 0).project(camera);
      const px = (point.current.x + 1) * size.width / 2;
      const py = (1 - point.current.y) * size.height / 2;
      silhouette.left = Math.min(silhouette.left, px - 12); silhouette.right = Math.max(silhouette.right, px + 12);
      silhouette.top = Math.min(silhouette.top, py - 12); silhouette.bottom = Math.max(silhouette.bottom, py + 12);
    }
    occupied.push(silhouette);
    // Read all dimensions before writing transforms to avoid repeated layout work.
    const dimensions = new Map([...buttons.current].map(([id, button]) => [id, { width: button.offsetWidth, height: button.offsetHeight }]));
    for (const zone of ZONES) {
      const button = buttons.current.get(zone.id);
      const dimension = dimensions.get(zone.id);
      if (!button || !dimension) continue;
      if (!visible.has(zone.id)) { button.style.visibility = "hidden"; continue; }
      point.current.fromArray(zone.anchor).project(camera);
      const behind = point.current.z > 1 || point.current.z < -1;
      const anchorX = (point.current.x + 1) * size.width / 2;
      const anchorY = (1 - point.current.y) * size.height / 2;
      const halfWidth = dimension.width / 2, halfHeight = dimension.height / 2;
      const candidates = [{ x: THREE.MathUtils.clamp(anchorX, halfWidth + 10, size.width - halfWidth - 10),
        y: THREE.MathUtils.clamp(anchorY, halfHeight + 10, size.height - halfHeight - 10) }];
      for (let y = halfHeight + 10; y < size.height - halfHeight - 10; y += 36) {
        for (let x = halfWidth + 10; x < size.width - halfWidth - 10; x += 36) candidates.push({ x, y });
      }
      candidates.sort((a, b) => (a.x - anchorX) ** 2 + (a.y - anchorY) ** 2 - ((b.x - anchorX) ** 2 + (b.y - anchorY) ** 2));
      const position = behind ? undefined : candidates.find(({ x, y }) => !occupied.some((rect) => overlaps(rect,
        { left: x - halfWidth - 5, right: x + halfWidth + 5, top: y - halfHeight - 5, bottom: y + halfHeight + 5 })));
      button.style.visibility = position ? "visible" : "hidden";
      if (position) {
        button.style.transform = `translate(${Math.round(position.x)}px, ${Math.round(position.y)}px) translate(-50%, -50%)`;
        occupied.push({ left: position.x - halfWidth - 5, right: position.x + halfWidth + 5,
          top: position.y - halfHeight - 5, bottom: position.y + halfHeight + 5 });
      }
    }
  });
  return null;
}

/** Frame rate while AURA's window is visible but another app is active. */
const BACKGROUND_FPS = 30;

/** Drives a frameloop="demand" canvas at BACKGROUND_FPS while enabled. */
function BackgroundFrames({ enabled }: { enabled: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setInterval(() => invalidate(), 1000 / BACKGROUND_FPS);
    return () => window.clearInterval(timer);
  }, [enabled, invalidate]);
  return null;
}

export function Studio({ zone, revision, reducedMotion, maxDpr, state, speechLevel, report, navigate, restart, focusCompanion, restorePose, cameraHandle }: {
  zone: ZoneId; revision: number; reducedMotion: boolean; maxDpr: number; state: CompanionState; speechLevel: number;
  report: Report; navigate: (zone: ZoneId) => void; restart: () => void; focusCompanion: () => void;
  restorePose?: CameraPose | null; cameraHandle?: Ref<StudioCameraHandle>;
}) {
  const buttons = useRef(new Map<ZoneId, HTMLButtonElement>());
  const startedAt = useRef(performance.now());
  const [adaptiveDpr, setAdaptiveDpr] = useState(maxDpr);
  const [active, setActive] = useState(!document.hidden);
  // Native window state (Phase 3A, pending Codex review). Full rate while AURA is
  // active, BACKGROUND_FPS while its window is only visible, nothing while hidden or minimized.
  const [hostWindow, setHostWindow] = useState<WindowState>({ active: true, visible: true });
  useBridgeEvent("app.windowStateChanged", setHostWindow);
  useEffect(() => {
    let live = true;
    void bridge.call("app.getWindowState", {}).then((value) => { if (live) setHostWindow(value); }).catch(() => {});
    return () => { live = false; };
  }, []);
  useEffect(() => { setAdaptiveDpr(maxDpr); }, [maxDpr]);
  useEffect(() => {
    const update = () => setActive(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const dpr = Math.max(1, Math.min(maxDpr, adaptiveDpr));
  const rendering = active && hostWindow.visible;
  const throttled = rendering && !hostWindow.active;
  return <>
    <SceneBoundary onError={() => report({ context: "ready", status: "error", error: "The renderer could not start. Check WebGL2 support and retry the scene." })}>
      <Canvas className="scene-canvas" shadows="percentage" camera={{ position: getZone("studio").camera, fov: 39, near: 0.05, far: 250 }} dpr={[1, dpr]}
        frameloop={!rendering ? "never" : throttled ? "demand" : "always"}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        fallback={<p>WebGL2 is unavailable. Your workstation and companion controls remain accessible.</p>}
        onCreated={() => report({ context: "ready" })}>
        <color attach="background" args={["#eef0ed"]} />
        <fog attach="fog" args={["#eef0ed", 24, 52]} />
        <hemisphereLight args={["#fffdf5", "#bac9cf", 1.8]} />
        <directionalLight position={[-3, 8, 6]} color="#fff4e5" intensity={2.6} castShadow shadow-mapSize={[1024, 1024]}
          shadow-camera-left={-8} shadow-camera-right={8} shadow-camera-top={6} shadow-camera-bottom={-6} shadow-bias={-0.001} />
        <directionalLight position={[5, 5, -3]} intensity={1.1} color="#d7e5ef" />
        <World zone={zone} navigate={navigate} focusCompanion={focusCompanion} />
        <mesh position={[0, 0.132, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.17, 1.21, 64]} />
          <meshBasicMaterial color={state === "error" ? "#a15c55" : state === "thinking" ? "#887b9b" : state === "speaking" || state === "listening" ? "#56888c" : "#a2b1ad"} />
        </mesh>
        <SceneBoundary onError={() => report({ status: "error", error: "Astra could not load. Check the model file and retry the scene." })}>
          <Suspense fallback={null}><Astra startedAt={startedAt.current} state={state} speechLevel={speechLevel} reducedMotion={reducedMotion} report={report} /></Suspense>
        </SceneBoundary>
        <CameraRig zone={zone} revision={revision} reducedMotion={reducedMotion} report={report} restorePose={restorePose} cameraHandle={cameraHandle} />
        <BackgroundFrames enabled={throttled} />
        <Measurements zone={zone} throttled={throttled} report={report} lowerDpr={() => setAdaptiveDpr((value) => Math.max(1, value - 0.25))} />
        <ContextEvents report={report} restored={restart} />
        <ProjectHotspots buttons={buttons} zone={zone} />
      </Canvas>
    </SceneBoundary>
    <nav className="hotspots" aria-label="Spatial zone navigation">
      {ZONES.map((item) => <button key={item.id} ref={(node) => { if (node) buttons.current.set(item.id, node); else buttons.current.delete(item.id); }}
        className={`hotspot ${zone === item.id ? "selected" : ""}`} style={{ visibility: "hidden", borderLeftColor: item.accent }}
        onClick={() => navigate(item.id)} aria-label={`Travel to ${item.label}`} aria-pressed={zone === item.id}>
        <span className="hotspot-icon" style={{ color: item.accent }}><ZoneIcon zone={item.id} /></span><span>{item.shortLabel}<small>Explore zone <ArrowIcon /></small></span>
      </button>)}
    </nav>
  </>;
}
