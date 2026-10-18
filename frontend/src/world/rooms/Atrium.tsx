import { ArchitectureBatch, Block, Portal } from "./Architecture.tsx";
import type { RoomShellProps } from "../types.ts";
export default function Atrium({travel,openMap,connected}:RoomShellProps){
  return <ArchitectureBatch><group>
    <Block at={[0,-.08,0]} size={[8,.16,8]} color="#b9b4a9"/>
    <Block at={[0,2.3,4.09]} size={[8.36,4.6,.18]} color="#b6b0a3"/>
    {[-2.6,2.6].map(x=><Block key={x} at={[x,2.3,-4.09]} size={[2.8,4.6,.18]} color="#ccc7ba"/>)}
    {[-4.09,4.09].flatMap(x=>[-2.6,2.6].map(z=><Block key={`${x}:${z}`} at={[x,2.3,z]} size={[.18,4.6,2.8]} color="#bfc0b6"/>))}
    {[-4.09,4.09].map(x=><Block key={x} at={[x,3.7,0]} size={[.18,1.8,2.4]} color="#bfc0b6"/>)}
    <Block at={[0,3.7,-4.09]} size={[2.4,1.8,.18]} color="#ccc7ba"/>
    {[-3.2,3.2].map(x=><Block key={x} at={[x,4.62,0]} size={[1.6,.16,8.36]} color="#c4c0b5"/>)}
    {[-3.2,3.2].map(z=><Block key={z} at={[0,4.62,z]} size={[4.8,.16,1.6]} color="#c4c0b5"/>)}
    <mesh position={[0,4.7,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[4.8,4.8]}/><meshBasicMaterial color="#c8d7e1" side={2}/></mesh>
    {[-2.4,-1.2,0,1.2,2.4].map(x=><Block key={x} at={[x,4.58,0]} size={[.045,.12,4.8]} color="#777c79"/>)}
    {[-3.65,3.65].flatMap(x=>[-3.65,3.65].map(z=><group key={`${x}:${z}`}><Block at={[x,2.15,z]} size={[.32,4.3,.32]} color="#979889"/><Block at={[x,4.3,z]} size={[.6,.18,.6]} color="#8c9188"/></group>))}
    <Block at={[0,.006,0]} size={[.035,.012,7.9]} color="#305a9d"/>
    <Block at={[0,.007,0]} size={[7.9,.012,.035]} color="#305a9d"/>
    <Portal side="north" at={[0,0,-4]} open={connected.includes("project-hub")} label="PROJECT HUB" detail="Hardware · Software · AI · GitHub" onSelect={()=>travel("project-hub")}/>
    <Portal side="west" at={[-4,0,0]} open={connected.includes("living")} label="PERSONAL LIVING" detail="A quieter place · Enter" onSelect={()=>travel("living")}/>
    <Portal side="east" at={[4,0,0]} open={connected.includes("gaming")} label="GAMING & ENTERTAINMENT" detail="Game library · Enter" onSelect={()=>travel("gaming")}/>
    <group position={[2.5,0,2.4]} onClick={e=>{e.stopPropagation();openMap();}}>
      <Block at={[0,.48,0]} size={[.85,.96,.35]} color="#80644c" metal={.6} rough={.4}/>
      <Block at={[0,1.02,0]} size={[1.2,.12,.5]} color="#305a9d"/>
      <Block at={[0,1.09,-.08]} size={[.1,.02,.25]} color="#d1e0e5"/>
      <Block at={[0,1.09,.025]} size={[.75,.02,.06]} color="#d1e0e5"/>
    </group>
  </group></ArchitectureBatch>;
}
