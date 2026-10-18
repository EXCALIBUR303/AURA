"""Original AURA room objects. Blender 4.3+, no third-party inputs or addons.
Run with -- --output frontend/public/world/room-kit.glb (metres, glTF Y up/front +Z).
"""
import bpy, math, sys, argparse
from mathutils import Vector
args=argparse.ArgumentParser();args.add_argument('--output',required=True)
out=args.parse_args(sys.argv[sys.argv.index('--')+1:]).output
bpy.ops.object.select_all(action='SELECT');bpy.ops.object.delete(use_global=False)
M={}
def material(name,hexcolor,metal=0,rough=.5,alpha=1,emit=0):
    h=hexcolor.lstrip('#'); rgb=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    # CSS/sRGB palette -> linear PBR base color.
    rgb=[v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    m=bpy.data.materials.new(name);m.diffuse_color=(*rgb,alpha);m.use_nodes=True
    p=m.node_tree.nodes.get('Principled BSDF');p.inputs['Base Color'].default_value=(*rgb,alpha);p.inputs['Metallic'].default_value=metal;p.inputs['Roughness'].default_value=rough;p.inputs['Alpha'].default_value=alpha
    if emit:p.inputs['Emission Color'].default_value=(*rgb,1);p.inputs['Emission Strength'].default_value=emit
    if alpha<1:m.surface_render_method='DITHERED';m.use_transparency_overlap=False
    M[name]=m;return m
material('Graphite','#263239',.05,.48);material('Aluminium','#a4b0b2',1,.35);material('Copper','#ad7755',1,.4)
material('Walnut','#8d6546',0,.62);material('Fabric','#3f6365',0,.96);material('Rubber','#161e25',0,.85)
material('Porcelain','#d7d9ce',0,.52);material('Circuit','#28564b',0,.7);material('Power','#67b8b0',0,.4,emit=.35)
material('Glass','#b1ccd5',0,.16,alpha=.16)
roots={};parts={};current=''
def root(name):
    global current
    current=name; obj=bpy.data.objects.new(name,None);bpy.context.collection.objects.link(obj);roots[name]=obj;parts[name]=[]
def finish(obj,mat,bevel=0):
    obj.data.materials.append(M[mat]);obj.parent=roots[current];parts[current].append(obj)
    if bevel:
        mod=obj.modifiers.new('Manufactured edge','BEVEL');mod.width=bevel;mod.segments=1 if bevel<.005 else 2
        bpy.context.view_layer.objects.active=obj;bpy.ops.object.modifier_apply(modifier=mod.name)
        mod=obj.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL');bpy.ops.object.modifier_apply(modifier=mod.name)
    return obj
def box(pos,size,mat='Graphite',bevel=.004,rot=None):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if rot:o.rotation_euler=rot
    return finish(o,mat,bevel)
def cylinder(pos,radius,depth,mat='Aluminium',vertices=20,rot=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=depth,location=pos);o=bpy.context.object
    if rot:o.rotation_euler=rot
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,mat,.0015)
def ellipsoid(pos,size,mat='Fabric',segments=20,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=pos);o=bpy.context.object;o.scale=size;bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    for p in o.data.polygons:p.use_smooth=True
    return finish(o,mat)
def rod(a,b,r=.006,mat='Rubber'):
    d=Vector(b)-Vector(a);o=cylinder((Vector(a)+Vector(b))/2,r,d.length,mat,10);o.rotation_euler=d.to_track_quat('Z','Y').to_euler();return o
material('Terracotta','#b17152',0,.88);material('Cream','#d5c5a4',0,.92);material('Indigo','#363b60',0,.72)
material('Forest','#385344',0,.9);material('Cobalt','#355c93',0,.62);material('Coral','#b77560',0,.65);material('Lamp','#f5d496',0,.7,emit=.65)
root('coffee-table')
ellipsoid((0,0,.385),(.65,.36,.042),'Walnut',32,8)
for x,y in [(-.36,-.15),(.36,-.15),(0,.21)]:rod((x*.85,y*.85,.02),(x,y,.35),.025,'Walnut')
root('console')
box((0,0,.38),(2.8,.44,.47),'Walnut',.035)
for x in (-1.05,1.05):
 for y in (-.13,.13):cylinder((x,y,.10),.018,.2,'Aluminium')
for x in (-.94,0,.94):
 box((x,-.225,.38),(.87,.02,.39),'Graphite',.012);box((x,-.24,.48),(.15,.015,.014),'Copper',.004)
root('bookshelf')
for x in (-.76,.76):box((x,0,1.05),(.05,.33,2.1),'Walnut',.012)
box((0,.16,1.05),(1.52,.04,2.1),'Forest',.008)
for z in (.10,.62,1.14,1.66,2.08):box((0,0,z),(1.56,.36,.045),'Walnut',.01)
for row in range(4):
 for col in range(9):
  x=-.64+col*.14;z=.15+row*.52;h=.23+((col*3+row)%4)*.035
  box((x,-.02,z+h/2),(.085,.23,h),['Cream','Graphite','Terracotta','Forest'][col%4],.004)
  for dz in (.04,h-.04):box((x,-.14,z+dz),(.062,.004,.004),'Copper',.0005)
root('floor-lamp')
cylinder((0,0,.018),.22,.035,'Graphite',32);rod((0,0,.03),(0,0,1.58),.015,'Copper')
# Open tapered fabric shade with inward rim and actual bulb.
bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.29,radius2=.18,depth=.35,end_fill_type='NOTHING',location=(0,0,1.58));finish(bpy.context.object,'Cream')
cylinder((0,0,1.415),.285,.008,'Cream',32);ellipsoid((0,0,1.47),(.06,.06,.08),'Lamp',12,6)
root('pendant')
rod((0,0,.25),(0,0,.8),.008,'Rubber');bpy.ops.mesh.primitive_cone_add(vertices=32,radius1=.30,radius2=.07,depth=.24,end_fill_type='NOTHING',location=(0,0,.15));finish(bpy.context.object,'Copper');cylinder((0,0,.025),.295,.007,'Lamp',32)
root('plant')
bpy.ops.mesh.primitive_cone_add(vertices=24,radius1=.20,radius2=.26,depth=.46,location=(0,0,.23));finish(bpy.context.object,'Terracotta',.01)
cylinder((0,0,.46),.245,.012,'Rubber',24)
for i in range(5):
 a=i*2.4;tip=(math.sin(a)*.17,math.cos(a)*.17,1.1+i*.16);rod((0,0,.45),tip,.008,'Walnut')
 for j in range(4):
  z=.74+i*.12+j*.12;ang=a+j*2.1;cx=math.sin(ang)*.13;cy=math.cos(ang)*.13
  # Curved, pointed leaves: a raised rib, broad shoulders and narrow tip.
  vertices=[(cx,cy,z),(cx+math.sin(ang)*.30,cy+math.cos(ang)*.30,z+.13),(cx+math.cos(ang)*.09+math.sin(ang)*.13,cy-math.sin(ang)*.09+math.cos(ang)*.13,z+.09),(cx-math.cos(ang)*.09+math.sin(ang)*.13,cy+math.sin(ang)*.09+math.cos(ang)*.13,z+.09),(cx+math.sin(ang)*.13,cy+math.cos(ang)*.13,z+.12)]
  faces=[(0,2,4),(2,1,4),(1,3,4),(3,0,4),(4,2,0),(4,1,2),(4,3,1),(4,0,3)]
  mesh=bpy.data.meshes.new('Pointed leaf');mesh.from_pydata(vertices,[],faces);mesh.update();o=bpy.data.objects.new('Leaf',mesh);bpy.context.collection.objects.link(o);finish(o,'Forest')
root('curtain')
# Pleated cloth, no cloth physics. Top remains bounded; open/close scales this panel only.
verts=[];faces=[]
for row in range(9):
 for col in range(49):
  x=-.95+1.9*col/48;y=.065*math.cos(col*math.pi/3);z=.12+2.35*row/8
  verts.append((x,y,z))
for row in range(8):
 for col in range(48):
  a=row*49+col;faces.append((a,a+1,a+50,a+49))
mesh=bpy.data.meshes.new('Pleated cloth');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Curtain',mesh);bpy.context.collection.objects.link(o);finish(o,'Terracotta')
for p in o.data.polygons:p.use_smooth=True
# Original arcade profile, no commercial marks or bundled game.
root('arcade')
profile=[(-.44,.04),(.43,.04),(.43,1.87),(.22,1.94),(-.20,1.94),(-.30,1.72),(-.10,1.1),(-.51,1.01)]
for x in (-.40,.40):
 verts=[(xx,y,z) for xx in (x-.025,x+.025) for y,z in profile];n=len(profile);faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
 mesh=bpy.data.meshes.new('Arcade side');mesh.from_pydata(verts,[],faces);mesh.update();o=bpy.data.objects.new('Side',mesh);bpy.context.collection.objects.link(o);finish(o,'Indigo')
box((0,0,.48),(.77,.72,.83),'Graphite',.02);box((0,.39,1.39),(.77,.035,.95),'Indigo',.01)
box((0,-.31,1.00),(.78,.43,.065),'Cobalt',.02,rot=(math.radians(-8),0,0))
box((0,-.13,1.42),(.72,.045,.57),'Graphite',.02,rot=(math.radians(-11),0,0))
box((0,-.162,1.42),(.65,.005,.49),'Rubber',.005,rot=(math.radians(-11),0,0))
box((0,-.225,1.83),(.77,.045,.18),'Cobalt',.01)
for x in (-.34,.34):box((x,-.473,.64),(.02,.008,.64),'Copper',.004)
for x in (-.20,.20):
 rod((x,-.37,1.045),(x,-.37,1.11),.012,'Aluminium');ellipsoid((x,-.37,1.13),(.032,.032,.032),'Coral',12,6)
 for j in range(3):cylinder((x+.07+(j%2)*.04,-.29-(j//2)*.055,1.045),.014,.008,'Porcelain',12)
for z in range(6):box((0,-.367,.22+z*.023),(.35,.008,.007),'Rubber',.001)
root('controller')
ellipsoid((0,0,.035),(.10,.045,.035),'Indigo',20,8)
for x in (-.065,.065):ellipsoid((x,-.035,.025),(.037,.07,.035),'Graphite',16,8)
for x in (-.032,.032):cylinder((x,-.005,.069),.013,.018,'Rubber',16)
for x,y in [(.062,.013),(.080,0),(.062,-.013),(.045,0)]:cylinder((x,y,.07),.005,.005,'Coral',10)
box((-.065,.018,.07),(.008,.031,.006),'Porcelain',.002);box((-.065,.018,.07),(.031,.008,.006),'Porcelain',.002)
root('game-console')
box((0,0,.045),(.32,.24,.09),'Porcelain',.025);box((0,-.125,.045),(.26,.012,.045),'Graphite',.008)
for i in range(12):box((-.12+i*.022,0,.091),(.005,.16,.003),'Rubber',.001)
cylinder((.12,-.132,.048),.004,.005,'Power',12,rot=(math.pi/2,0,0))
root('display')
box((0,0,.68),(2.40,.07,1.36),'Graphite',.028)
box((0,-.039,.68),(2.30,.003,1.26),'Rubber',.008)
for x in (-.72,.72):rod((x,.01,.10),(x-.15,-.08,0),.014,'Aluminium')
root('art-frame')
box((0,0,.42),(1.15,.04,.84),'Walnut',.016);box((0,-.025,.42),(1.09,.006,.78),'Cream',.001)
# Reuse static authored model material joins; no per-book/key/leaf draw nodes.
for name,objects in parts.items():
 groups={mat:[o for o in objects if o.data.materials[0].name==mat] for mat in M}
 for mat,subset in groups.items():
  if not subset:continue
  bpy.ops.object.select_all(action='DESELECT')
  for o in subset:o.select_set(True)
  bpy.context.view_layer.objects.active=subset[0];bpy.ops.object.join();o=bpy.context.object;o.name=name+'__'+mat;bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
  if len(o.data.materials)>1:
   o.data.materials.clear();o.data.materials.append(M[mat])
   for face in o.data.polygons:face.material_index=0
bpy.ops.object.select_all(action='SELECT');bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_animations=False,export_extras=False)
print('AURA original room kit exported:',out)
