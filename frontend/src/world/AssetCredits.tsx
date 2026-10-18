import { Modal } from "../components/ui.tsx";
export function AssetCredits({close}:{close:()=>void}){
 return <Modal title="World asset credits" subtitle="AURA / ORIGINALS & SOURCES" close={close}><div className="ui-dialog-body asset-credits">
  <section><h3>GlamVelvetSofa</h3><p>Eric Chadwick for Wayfair, LLC · © 2021 · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0</a> · <a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/GlamVelvetSofa" target="_blank" rel="noreferrer">Source</a>.</p><p>Original GLB unchanged. Runtime recentering, source light disabled; Living upholstery is recolored forest or terracotta.</p></section>
  <section><h3>Sheen Chair</h3><p>Eric Chadwick for Wayfair, LLC · © 2020 · <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noreferrer">CC0 1.0</a> · <a href="https://github.com/KhronosGroup/glTF-Sample-Assets/tree/edc7c9e67c639d230715049ee31f9a96a6babbbe/Models/SheenChair" target="_blank" rel="noreferrer">Source</a>. Original file unchanged; recentered to the floor.</p></section>
  <section><h3>Original AURA objects</h3><p>Workstation equipment, room furniture, arcade, curtains, plants, original artwork and window study are authored for this project. Source and provenance accompany the project; no third-party logos, games or textures.</p></section>
  <p>The original Astra Lumen II by XRProfXR retains its separate CC BY 4.0 credit in the application footer.</p>
 </div></Modal>;
}
