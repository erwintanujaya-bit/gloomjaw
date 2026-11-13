import json,struct,io,sys
import numpy as np
from PIL import Image
src,dst=sys.argv[1],sys.argv[2]
GLOW=sys.argv[3] if len(sys.argv)>3 else 'purple'   # which colour glows: purple (Gloomjaw) or orange (lava dragons)
b=open(src,'rb').read();l=struct.unpack('<I',b[12:16])[0];j=json.loads(b[20:20+l])
bo=20+l;bl=struct.unpack('<I',b[bo:bo+4])[0];BIN=b[bo+8:bo+8+bl]
views=[BIN[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']] for v in j['bufferViews']]
def img(i):return Image.open(io.BytesIO(views[j['images'][i]['bufferView']]))
mat=j['materials'][0];pbr=mat['pbrMetallicRoughness']
ti=lambda t:j['textures'][t['index']]['source']
base=img(ti(pbr['baseColorTexture'])).convert('RGB');print('size',base.size)
S=2048
def jpg(im,q):buf=io.BytesIO();im.resize((S,S),Image.LANCZOS).save(buf,'JPEG',quality=q,optimize=True);return buf.getvalue()
new={ti(pbr['baseColorTexture']):jpg(base,86),ti(mat['normalTexture']):jpg(img(ti(mat['normalTexture'])).convert('RGB'),90),ti(pbr['metallicRoughnessTexture']):jpg(img(ti(pbr['metallicRoughnessTexture'])).convert('RGB'),85)}
# emissive: bright saturated purple/magenta pixels
a=np.asarray(base.resize((S,S),Image.LANCZOS)).astype(np.float32)/255
r,g,bb=a[...,0],a[...,1],a[...,2];mx=a.max(-1);mn=a.min(-1);sat=(mx-mn)/(mx+1e-5)
if GLOW=='orange': mask=np.clip((sat-0.5)/0.25,0,1)*np.clip((mx-0.5)/0.25,0,1)*(r>g*1.25)
else: mask=np.clip((sat-0.45)/0.25,0,1)*np.clip((mx-0.38)/0.25,0,1)*(bb>g*1.2)
em=(a*mask[...,None]*1.15).clip(0,1)
print('glow coverage %.1f%%'%(100*(mask>0.3).mean()))
buf=io.BytesIO();Image.fromarray((em*255).astype(np.uint8)).save(buf,'JPEG',quality=85);
for k,v in new.items():
    views[j['images'][k]['bufferView']]=v;j['images'][k]['mimeType']='image/jpeg'
j['bufferViews'].append({'buffer':0,'byteLength':0});views.append(buf.getvalue())
j['images'].append({'bufferView':len(views)-1,'mimeType':'image/jpeg','name':'glow'})
j['textures'].append({'source':len(j['images'])-1,'sampler':j['textures'][0].get('sampler',0)} if 'samplers' in j else {'source':len(j['images'])-1})
mat['emissiveTexture']={'index':len(j['textures'])-1};mat['emissiveFactor']=[1,1,1]
out=b'';
for i,v in enumerate(views):
    pad=(-len(out))%4;out+=b'\0'*pad
    j['bufferViews'][i]['byteOffset']=len(out);j['bufferViews'][i]['byteLength']=len(v);out+=v
out+=b'\0'*((-len(out))%4);j['buffers'][0]['byteLength']=len(out)
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
glb=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(out))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(out),0x004E4942)+out
open(dst,'wb').write(glb);print('out MB',round(len(glb)/1e6,2))
Image.fromarray((em*255).astype(np.uint8)).resize((512,512)).save('glow_preview.png')
