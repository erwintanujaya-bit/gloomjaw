# Shrinks a GLB's textures: every image becomes a JPEG (max 1024 px). Use it for props and riders (no glow map).
#   python tools/shrink_glb.py in.glb out.glb
import json, struct, io, sys
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]
b = open(src, 'rb').read(); l = struct.unpack('<I', b[12:16])[0]; j = json.loads(b[20:20+l])
bo = 20 + l; bl = struct.unpack('<I', b[bo:bo+4])[0]; BIN = b[bo+8:bo+8+bl]
views = [BIN[v.get('byteOffset', 0):v.get('byteOffset', 0) + v['byteLength']] for v in j['bufferViews']]
for im in j['images']:
    i = im['bufferView']
    img = Image.open(io.BytesIO(views[i])).convert('RGB')
    img.thumbnail((1024, 1024), Image.LANCZOS)
    buf = io.BytesIO(); img.save(buf, 'JPEG', quality=86, optimize=True)
    views[i] = buf.getvalue(); im['mimeType'] = 'image/jpeg'
out = b''
for i, v in enumerate(views):
    out += b'\0' * ((-len(out)) % 4)
    j['bufferViews'][i]['byteOffset'] = len(out); j['bufferViews'][i]['byteLength'] = len(v); out += v
out += b'\0' * ((-len(out)) % 4); j['buffers'][0]['byteLength'] = len(out)
js = json.dumps(j, separators=(',', ':')).encode(); js += b' ' * ((-len(js)) % 4)
open(dst, 'wb').write(struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(out)) + struct.pack('<II', len(js), 0x4E4F534A) + js + struct.pack('<II', len(out), 0x004E4942) + out)
print('out MB', round(len(open(dst, 'rb').read()) / 1e6, 2))
