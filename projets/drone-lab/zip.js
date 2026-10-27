// Deterministic ZIP/STORE archive, UTF-8 names, CRC32. No library or CDN.
const encoder=new TextEncoder();
const table=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export function crc32(bytes){let crc=0xffffffff;for(const b of bytes)crc=table[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
export function zipStore(files){
  if(!Array.isArray(files)||!files.length||files.length>65535)throw Error('Nombre de fichiers ZIP invalide.');
  const local=[],central=[],names=new Set();let offset=0,centralSize=0;
  for(const file of files){
    if(typeof file.name!=='string'||!file.name||file.name.startsWith('/')||file.name.includes('\\')||file.name.split('/').some(p=>!p||p==='..'||p==='.')||/[\x00-\x1f:]/.test(file.name)||names.has(file.name))throw Error('Nom de fichier ZIP invalide.');
    names.add(file.name);const name=encoder.encode(file.name),data=file.content instanceof Uint8Array?file.content:encoder.encode(file.content),crc=crc32(data);
    if(name.length>65535||data.length>0xffffffff)throw Error('Fichier ZIP trop volumineux.');
    const header=new Uint8Array(30+name.length),v=new DataView(header.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);
    const dir=new Uint8Array(46+name.length),d=new DataView(dir.buffer);
    d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);dir.set(name,46);
    local.push(header,data);central.push(dir);offset+=header.length+data.length;centralSize+=dir.length;
  }
  if(offset+centralSize+22>0xffffffff)throw Error('Archive ZIP trop volumineuse.');
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  const out=new Uint8Array(offset+centralSize+22);let cursor=0;for(const part of [...local,...central,end]){out.set(part,cursor);cursor+=part.length;}return out;
}
