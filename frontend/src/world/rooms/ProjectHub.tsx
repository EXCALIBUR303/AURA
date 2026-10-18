import { ArchitectureBatch, Block, Portal } from "./Architecture.tsx";
import type { RoomShellProps } from "../types.ts";
export default function ProjectHub({children,travel,connected}:RoomShellProps){
  return <ArchitectureBatch><group position={[0,0,-11]}>
    <Block at={[0,-.08,0]} size={[12,.16,9]} color="#b4aca0"/>
    <Block at={[0,1.8,-4.59]} size={[12.36,3.6,.18]} color="#414b50"/>
    {[-6.09,6.09].map(x=><Block key={x} at={[x,1.8,0]} size={[.18,3.6,9]} color="#7e898a"/>)}
    {[-3.6,3.6].map(x=><Block key={x} at={[x,1.8,4.59]} size={[4.8,3.6,.18]} color="#a4aca7"/>)}
    <Block at={[0,3.28,4.59]} size={[2.4,.64,.18]} color="#a4aca7"/>
    <Block at={[0,3.69,0]} size={[12.36,.18,9.36]} color="#c3c6bf"/>
    {[-4.8,-4.5,-4.2,4.2,4.5,4.8].map(x=><Block key={x} at={[x,1.9,-4.46]} size={[.06,2.8,.08]} color="#90735d"/>)}
    <Portal side="south" at={[0,0,4.5]} open={connected.includes("atrium")} label="CENTRAL ATRIUM" detail="World map · Living · Gaming" onSelect={()=>travel("atrium")}/>
    {children}
  </group></ArchitectureBatch>;
}
