# Prints a Meshy GLB skeleton with world positions so you can match bones to body parts (see src/dragons.js).
# Run:  python tools/inspect_bones.py model.glb
import sys, json, struct
import numpy as np
d = open(sys.argv[1], 'rb').read()
ln, _ = struct.unpack_from('<II', d, 12)
j = json.loads(d[20:20+ln]); nodes = j['nodes']
def q2m(q):
    x,y,z,w = q
    return np.array([[1-2*(y*y+z*z),2*(x*y-z*w),2*(x*z+y*w)],[2*(x*y+z*w),1-2*(x*x+z*z),2*(y*z-x*w)],[2*(x*z-y*w),2*(y*z+x*w),1-2*(x*x+y*y)]])
def local(n):
    M = np.eye(4)
    if 'matrix' in n: M = np.array(n['matrix']).reshape(4,4).T
    else:
        S = np.diag(n.get('scale',[1,1,1])); R = q2m(n.get('rotation',[0,0,0,1]))
        M[:3,:3] = R@S; M[:3,3] = n.get('translation',[0,0,0])
    return M
parent = {}
for i,n in enumerate(nodes):
    for c in n.get('children',[]): parent[c]=i
W = {}
def world(i):
    if i in W: return W[i]
    M = local(nodes[i]); 
    if i in parent: M = world(parent[i]) @ M
    W[i] = M; return M
# is there a non-identity root transform (armature)?
for i,n in enumerate(nodes):
    if i not in parent: print('root node', i, n.get('name'), {k:v for k,v in n.items() if k in ('translation','rotation','scale','matrix','mesh','skin')})
acc = j['accessors']
for m in j['meshes']:
    for pr in m['primitives']:
        a = acc[pr['attributes']['POSITION']]; print('bbox min', [round(v,2) for v in a['min']], 'max', [round(v,2) for v in a['max']])
skin = j['skins'][0]
print('joint  name       world xyz            parent')
for ji in skin['joints']:
    p = world(ji)[:3,3]; n = nodes[ji]
    print(f"{n['name']:9s} ({p[0]:6.2f},{p[1]:6.2f},{p[2]:6.2f})  <- {nodes[parent[ji]]['name'] if ji in parent else '-'}")
