// Read-only inspection of locally authored/approved GLBs. No image decoding or network.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const [file,output]=process.argv.slice(2);if(!file)throw Error('Usage: node inspect.mjs file.glb [output.json]');
const bytes=await readFile(file);if(bytes.readUInt32LE(0)!==0x46546c67||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw Error('Invalid GLB');
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));const uris=['images','buffers'].flatMap(k=>(gltf[k]??[]).flatMap(e=>e.uri?[e.uri]:[]));if(uris.length)throw Error('Production GLB must be fully embedded');
const models={};for(const node of gltf.nodes??[]){if(node.mesh===undefined)continue;const name=node.name.split('__')[0];models[name]=(models[name]??0)+gltf.meshes[node.mesh].primitives.reduce((n,p)=>n+gltf.accessors[p.indices??p.attributes.POSITION].count/3,0);}
const result={schemaVersion:1,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),models,triangles:Object.values(models).reduce((a,b)=>a+b,0),primitives:gltf.meshes.reduce((n,m)=>n+m.primitives.length,0),materials:gltf.materials.map(m=>m.name),images:(gltf.images??[]).length,externalURIs:uris,extensionsRequired:gltf.extensionsRequired??[],generator:gltf.asset.generator};
if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
