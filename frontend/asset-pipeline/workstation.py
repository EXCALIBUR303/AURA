"""Original AURA equipment. Blender 4.3+, no downloads, addons or external scripts.
Run: blender -b --factory-startup --disable-autoexec --python frontend/asset-pipeline/workstation.py -- --output frontend/public/world/workstation.glb
Coordinates while authoring: metres, Z up, front -Y. glTF export converts to Y up/front +Z.
Every shape is original. No third-party geometry, trademarks, textures or code.
"""
import bpy, math, sys, argparse
from mathutils import Vector
args=argparse.ArgumentParser(); args.add_argument('--output',required=True)
out=args.parse_args(sys.argv[sys.argv.index('--')+1:]).output
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
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
# Rounded wood top, narrow steel trestles, cable tray, grommets and levelling feet.
root('desk')
box((0,0,.755),(2.5,1.02,.055),'Walnut',.025)
for x in (-1.05,1.05):
    box((x,0,.37),(.065,.07,.72),'Graphite',.012);box((x,0,.04),(.095,.85,.045),'Aluminium',.012)
    box((x,0,.71),(.055,.8,.04),'Aluminium')
    for y in (-.35,.35):cylinder((x,y,.014),.042,.028,'Rubber')
box((0,.23,.67),(2.12,.16,.05),'Graphite',.012);box((0,.30,.72),(1.4,.08,.04),'Rubber')
for x in (-.8,.8):cylinder((x,.31,.785),.028,.004,'Rubber')
for i in range(10):box((-.9+i*.2,.23,.638),(.06,.16,.006),'Rubber',0)
# Sculpted task chair: separate padded shell, bent back, lumbar cushion, arms, star and casters.
root('chair')
ellipsoid((0,0,.48),(.32,.29,.065));box((0,.02,.435),(.44,.4,.045),'Graphite',.02)
ellipsoid((0,.23,.81),(.31,.055,.32));ellipsoid((0,.155,.68),(.255,.045,.075))
box((0,.27,.68),(.065,.05,.46),'Graphite',.015,rot=(math.radians(-9),0,0))
for x in (-.35,.35):
    rod((x*.77,.14,.45),(x,.06,.68),.018,'Graphite');box((x,-.025,.69),(.075,.32,.035),'Rubber',.016)
cylinder((0,0,.28),.035,.31);cylinder((0,0,.18),.05,.16,'Graphite')
for i in range(5):
    a=2*math.pi*i/5;end=(math.sin(a)*.36,math.cos(a)*.36,.075)
    rod((0,0,.12),end,.025,'Aluminium')
    for off in (-.018,.018):cylinder((end[0]+off,end[1],.04),.04,.023,'Rubber',16,rot=(0,math.pi/2,0))
# Open engineered chassis, front perforation, three fan rings, board, fins, cards and cabling.
root('pc')
box((0,0,.015),(.25,.49,.03),'Graphite',.008);box((0,0,.495),(.25,.49,.025),'Graphite',.008)
box((-.12,0,.255),(.012,.48,.46),'Graphite',.004)
for x in (-.115,.115):
    for y in (-.235,.235):box((x,y,.255),(.016,.016,.46),'Aluminium',.002)
    for y in (-.18,.18):box((x,y,.005),(.028,.055,.02),'Rubber',.003)
# Front facing -Y, open slats reveal fan blades. Keep real openings rather than painted dots.
for x in (-.115,.115):box((x,-.25,.26),(.02,.02,.455),'Graphite',.004)
for z in (.095,.245,.395):
    for y,radius,thickness,mat in [(-.253,.063,.003,'Aluminium'),(-.259,.056,.004,'Graphite')]:
        bpy.ops.mesh.primitive_torus_add(major_segments=24,minor_segments=6,location=(0,y,z),rotation=(math.pi/2,0,0),major_radius=radius,minor_radius=thickness)
        ring=bpy.context.object
        for face in ring.data.polygons:face.use_smooth=True
        finish(ring,mat)
    for x in (-.052,.052):
        for dz in (-.052,.052):cylinder((x,-.267,z+dz),.003,.004,'Aluminium',8,rot=(math.pi/2,0,0))
for z in range(13):box((0,-.272,.05+z*.033),(.22,.008,.004),'Graphite',.001)
# Glass is offset from the internal board; opaque internal parts remain easy to read.
box((.127,0,.265),(.004,.435,.425),'Glass',.001)
for y in (-.20,.20):
    for z in (.065,.46):cylinder((.133,y,z),.004,.007,'Aluminium',10,rot=(0,math.pi/2,0))
box((-.101,.02,.29),(.012,.32,.32),'Circuit',.003)
box((-.085,.065,.30),(.016,.07,.07),'Aluminium',.002)
for i in range(13):box((-.046+i*.0035,.065,.335),(.0015,.085,.09),'Aluminium',.0005)
for y in (-.058,-.035):
    box((-.07,y,.38),(.026,.008,.125),'Rubber',.001)
    for z in range(5):box((-.049,y,.335+z*.02),(.014,.012,.012),'Graphite',.001)
box((-.012,-.005,.19),(.16,.27,.026),'Graphite',.003);box((.075,-.005,.19),(.006,.27,.03),'Copper',.001)
for i in range(9):box((.025,-.115+i*.028,.211),(.11,.006,.012),'Aluminium',.001)
box((0,.13,.07),(.21,.18,.09),'Graphite',.006)
for i in range(4):
    z=.06+i*.018;rod((-.08,.20,z),(.07,.20,z),.003,'Rubber');rod((.07,.20,z),(.07,.12,z+.12),.003,'Rubber')
for i in range(8):box((-.083,.13-.027*i,.41),(.01,.012,.012),'Copper',.001)
cylinder((.07,-.251,.468),.007,.008,'Power',16,rot=(math.pi/2,0,0))
for x in (-.055,-.025):box((x,-.255,.468),(.016,.006,.006),'Rubber',.001)
# Separate rotor at origin, rotating around local glTF Z axis, reused by all visible towers.
root('fan')
cylinder((0,0,0),.015,.012,'Graphite',16,rot=(math.pi/2,0,0))
for i in range(7):
    a=2*math.pi*i/7
    ellipsoid((math.sin(a)*.031,0,math.cos(a)*.031),(.017,.004,.029),'Graphite',12,6).rotation_euler[1]=a+.5
# Machined monitor, rear vents, VESA plate, stand and separate replaceable screen geometry.
root('monitor-panel')
box((0,0,.36),(.89,.047,.53),'Graphite',.018)
box((0,.033,.35),(.24,.035,.20),'Graphite',.01)
for i in range(12):box((-.30+i*.055,.028,.49),(.024,.009,.065),'Rubber',.002)
cylinder((.37,-.026,.112),.0025,.002,'Power',10,rot=(math.pi/2,0,0))
root('monitor-stand')
box((0,.05,.19),(.035,.045,.31),'Aluminium',.006,rot=(math.radians(-8),0,0))
box((0,-.025,.014),(.34,.23,.028),'Aluminium',.013)
root('screen');box((0,-.0255,.36),(.848,.001,.479),'Rubber',.001)
root('keyboard')
box((0,0,.019),(.43,.145,.038),'Graphite',.012)
for row in range(5):
    for col in range(15):
        if row==0 and 4<=col<=9:continue
        box((-.196+col*.0279,-.054+row*.026,.044),(.024,.022,.014),'Porcelain' if col>1 else 'Fabric',.003)
box((-.014,-.054,.044),(.164,.022,.014),'Porcelain',.003)
root('mouse');ellipsoid((0,0,.024),(.035,.059,.026),'Graphite');box((0,-.024,.049),(.001,.05,.002),'Rubber',0);cylinder((0,-.02,.047),.006,.008,'Aluminium',12,rot=(0,math.pi/2,0))
root('speaker');box((0,0,.10),(.105,.105,.20),'Graphite',.014)
for z,r in ((.12,.034),(.055,.017)):
    cylinder((0,-.055,z),r,.007,'Rubber',24,rot=(math.pi/2,0,0));cylinder((0,-.059,z),r*.48,.004,'Aluminium',16,rot=(math.pi/2,0,0))
root('laptop')
box((0,0,.012),(.32,.225,.024),'Aluminium',.009);box((0,-.052,.026),(.10,.058,.002),'Graphite',.005)
for row in range(4):
    for col in range(12):box((-.14+col*.025,.004+row*.024,.028),(.021,.019,.004),'Graphite',.002)
box((0,.094,.12),(.32,.012,.215),'Aluminium',.01,rot=(math.radians(-14),0,0))
box((0,.085,.119),(.295,.003,.185),'Rubber',.002,rot=(math.radians(-14),0,0))
# Merge static parts by material within each named model. No exploded node per key/screw.
for name,objects in parts.items():
    groups={mat:[o for o in objects if o.data.materials[0].name==mat] for mat in M}
    for mat,subset in groups.items():
        if not subset:continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in subset:o.select_set(True)
        bpy.context.view_layer.objects.active=subset[0];bpy.ops.object.join();o=bpy.context.object;o.name=name+'__'+mat
        # Bake transforms into mesh so reusable assets have a stable common origin.
        bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
        if len(o.data.materials)>1:
            o.data.materials.clear();o.data.materials.append(M[mat])
            for face in o.data.polygons:face.material_index=0
monitor=bpy.data.objects.new('monitor',None);bpy.context.collection.objects.link(monitor)
roots['monitor-panel'].parent=monitor;roots['monitor-stand'].parent=monitor
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out,export_format='GLB',use_selection=True,export_yup=True,export_materials='EXPORT',export_animations=False,export_extras=False)
print('AURA original workstation exported:',out)
