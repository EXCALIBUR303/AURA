// Design checkpoint only. Not imported by the application or production build.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@aura/design-tokens";
import "../studio.css";
import "../experience.css";
import { bridge } from "../platform/bridge.ts";
import { VoiceDesignPreview } from "./VoiceDesignPreview.tsx";
import "./voice-design.css";

const root = document.getElementById("root");
if (!root) throw new Error("Voice design preview root is missing");
createRoot(root).render(<StrictMode>{bridge.transportKind === "mock"
  ? <VoiceDesignPreview />
  : <main className="voice-design-blocked"><h1>Browser design study only</h1><p>Open the main AURA page to use the native application. This prototype does not run against native services.</p></main>}</StrictMode>);
