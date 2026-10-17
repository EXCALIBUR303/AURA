// Isolated design entry. It is not imported by the production app or its build.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@aura/design-tokens";
import { AstraDesignPreview } from "./AstraDesignPreview.tsx";
import "./preview.css";

const root = document.getElementById("root");
if (!root) throw new Error("Design preview root is missing");
createRoot(root).render(<StrictMode><AstraDesignPreview /></StrictMode>);
