import { ArchitectureBatch, Block, Portal, Sign } from "./Architecture.tsx";
import { FloorSurface } from "./Surfaces.tsx";
import { STATIONS } from "../interactions/registry.ts";
import type { RoomShellProps } from "../types.ts";
export default function ProjectHub({children,travel,connected}:RoomShellProps){
  return <ArchitectureBatch><group position={[0,0,-11]}>
    <Block at={[0,-.08,0]} size={[12,.16,9]} color="#273341"/>
    <Block at={[0,1.8,-4.59]} size={[12.36,3.6,.18]} color="#1e3040"/>
    {[-6.09,6.09].map(x=><Block key={x} at={[x,1.8,0]} size={[.18,3.6,9]} color="#33475a"/>)}
    {[-3.6,3.6].map(x=><Block key={x} at={[x,1.8,4.59]} size={[4.8,3.6,.18]} color="#344657"/>)}
    <Block at={[0,3.28,4.59]} size={[2.4,.64,.18]} color="#344657"/>
    <Block at={[0,3.69,0]} size={[12.36,.18,9.36]} color="#263646"/>
    {[-4.8,-4.5,-4.2,4.2,4.5,4.8].map(x=><Block key={x} at={[x,1.9,-4.46]} size={[.06,2.8,.08]} color="#7b6953"/>)}
    <Portal side="south" at={[0,0,4.5]} open={connected.includes("atrium")} label="CENTRAL ATRIUM" detail="World map · Living · Gaming" onSelect={()=>travel("atrium")}/>
    <FloorSurface size={[12,9]} color="#687d8d"/>
    {STATIONS.map(s=><group key={s.id} position={[s.x,0,s.z]} rotation={[0,s.z>0?Math.PI:0,0]}>
      <mesh position={[0,.009,.25]} rotation={[-Math.PI/2,0,0]} receiveShadow><planeGeometry args={[2.9,2.6]}/><meshStandardMaterial color={s.id==="hardware"?"#244653":s.id==="software"?"#2a405f":s.id==="ai-lab"?"#403952":"#304b47"} roughness={1}/></mesh>
      <Sign label={s.label.toUpperCase()} detail={s.id==="hardware"?"Design · build · understand":s.id==="software"?"Code · projects · craft":s.id==="ai-lab"?"Models · context · conversation":"Repositories · commits · projects"} position={[0,2.48,-1.91]} rotation={0}/>
      <Block at={[0,1.91,-1.75]} size={[2.35,.04,.32]} color="#5a5c60"/>
      <Block at={[0,2.10,-1.89]} size={[2.3,.13,.035]} color={s.accent}/>
    </group>)}
    {children}
  </group></ArchitectureBatch>;
}
