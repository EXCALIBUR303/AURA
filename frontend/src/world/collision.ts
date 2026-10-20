import type { Collider, Point, Rect } from "./types.ts";
import { connectionFor, contains, ROOMS, roomAt } from "./registry.ts";
import type { RoomId } from "./types.ts";

export function safePoint(p:Point,floors:readonly Rect[],colliders:readonly Collider[],radius=.26,body=true){
  if(!p.every(Number.isFinite)||!floors.some(f=>contains(f,p)))return false;
  const minY=body?0:p[1]-radius,maxY=body?1.78:p[1]+radius;
  return !colliders.some(c=>maxY>c.minY&&minY<c.maxY&&p[0]>c.minX-radius&&p[0]<c.maxX+radius&&p[2]>c.minZ-radius&&p[2]<c.maxZ+radius);
}
/** Small bounded steps, with separate axes for sliding. No movement after a stalled frame. */
export function movePlayer(position:Point,dx:number,dz:number,floors:readonly Rect[],colliders:readonly Collider[]):Point{
  if(!Number.isFinite(dx)||!Number.isFinite(dz))return [...position];
  const distance=Math.hypot(dx,dz);const factor=distance>.12?.12/distance:1;dx*=factor;dz*=factor;
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.04));const next:Point=[...position];
  for(let i=0;i<steps;i++){
    const x:Point=[next[0]+dx/steps,1.62,next[2]];if(safePoint(x,floors,colliders))next[0]=x[0];
    const z:Point=[next[0],1.62,next[2]+dz/steps];if(safePoint(z,floors,colliders))next[2]=z[2];
  }return [next[0],1.62,next[2]];
}
export function clearSegment(a:Point,b:Point,floors:readonly Rect[],colliders:readonly Collider[],radius=.12){
  const distance=Math.hypot(...a.map((v,i)=>v-b[i]!));const n=Math.max(1,Math.ceil(distance/.05));
  for(let i=0;i<=n;i++){const t=i/n;const p=a.map((v,j)=>v+(b[j]!-v)*t) as Point;if(!safePoint(p,floors,colliders,radius,false))return false;}return true;
}
/** Bounded grid route through available floors. World floor is level; no triangle mesh physics. */
export function cameraPath(a:Point,b:Point,floors:readonly Rect[],colliders:readonly Collider[]):Point[]{
  if(clearSegment(a,b,floors,colliders))return [b];
  const step=.35;const key=(x:number,z:number)=>`${x},${z}`;
  const start=[Math.round(a[0]/step),Math.round(a[2]/step)] as const;
  const goal=[Math.round(b[0]/step),Math.round(b[2]/step)] as const;
  const queue:[number,number][]=[[...start]],prev=new Map<string,string|null>([[key(...start),null]]);
  let finish:string|undefined;
  for(let index=0;index<queue.length&&index<12000;index++){
    const [x,z]=queue[index]!;const k=key(x,z);const p:Point=[x*step,1.62,z*step];
    if(Math.hypot(x-goal[0],z-goal[1])<=1.5&&clearSegment(p,b,floors,colliders)){finish=k;break;}
    for(const [xx,zz] of [[x+1,z],[x-1,z],[x,z+1],[x,z-1]]){
      const kk=key(xx!,zz!);if(prev.has(kk))continue;const q:Point=[xx!*step,1.62,zz!*step];
      if(!safePoint(q,floors,colliders,.18,false)||!clearSegment(index===0?a:p,q,floors,colliders,.18))continue;
      prev.set(kk,k);queue.push([xx!,zz!]);
    }
  }
  if(!finish)return [];
  const path:Point[]=[b];let k:string|null|undefined=finish;
  while(k){const [x,z]=k.split(",").map(Number);path.unshift([x!*step,1.62,z!*step]);k=prev.get(k);}
  // Keep only checked, visible connectors; never smooth a curve through a corner.
  const out:Point[]=[];let from=a;
  for(let i=0;i<path.length;){let furthest=i;for(let j=i;j<path.length;j++){if(clearSegment(from,path[j]!,floors,colliders))furthest=j;}const p=path[furthest]!;out.push(p);from=p;i=furthest+1;}
  if(!out.every((p,i)=>clearSegment(i?out[i-1]!:a,p,floors,colliders)))return [];
  return out;
}
export function safeLanding(position:Point,loaded:readonly RoomId[]):{room:RoomId;position:Point}{
  const room=roomAt(position,loaded)??loaded.reduce((best,id)=>Math.hypot(position[0]-ROOMS[id].landing[0],position[2]-ROOMS[id].landing[2])<Math.hypot(position[0]-ROOMS[best].landing[0],position[2]-ROOMS[best].landing[2])?id:best,loaded[0]??"project-hub");
  return {room,position:[...ROOMS[room].landing]};
}
/**
 * A walk between rooms that goes through the middle of each doorway, at eye height plus a
 * little: the camera never grazes a door frame or hugs a wall the way a grid route can. Each
 * leg is a checked straight line, or a grid route when something stands in the way; empty if
 * the rooms are not joined.
 */
/** Each passage a walk through `rooms` crosses, as [entry, exit] in travel order, at the walk's height. */
export function passagesFor(rooms:readonly RoomId[]):[Point,Point][]{
  const out:[Point,Point][]=[];
  for(let i=0;i<rooms.length-1;i++){
    const e=connectionFor(rooms[i]!,rooms[i+1]!);if(!e)return [];
    const [near,far]=e.from===rooms[i]?[e.fromPoint,e.toPoint]:[e.toPoint,e.fromPoint];
    out.push([[near[0],1.72,near[2]],[far[0],1.72,far[2]]]);
  }
  return out;
}
export function doorwayPath(a:Point,b:Point,rooms:readonly RoomId[],floors:readonly Rect[],colliders:readonly Collider[]):Point[]{
  const marks:Point[]=[];const passages=passagesFor(rooms);if(rooms.length>1&&!passages.length)return [];
  for(let i=0;i<passages.length;i++){
    marks.push([...passages[i]![0]],[...passages[i]![1]]);
    // In a room the walk only passes through (a journey's intermediate room), cross its open centre:
    // the turn towards the next doorway then happens in open space, not inside the passage.
    if(i+2<rooms.length){const o=ROOMS[rooms[i+1]!].origin;marks.push([o[0],1.72,o[2]]);}
  }
  marks.push([...b]);
  const out:Point[]=[];let from=a;
  for(const mark of marks){
    if(clearSegment(from,mark,floors,colliders))out.push(mark);
    else{const leg=cameraPath(from,mark,floors,colliders);if(!leg.length)return [];out.push(...leg);}
    from=mark;
  }
  return out;
}
