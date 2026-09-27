#!/usr/bin/env node
// Convert supplied normalized OpenCV face metadata to Ekitaldi's pixel boxes.
// This reuses reviewed assignments; it does not perform face recognition.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
const slug=process.argv[2];
if(!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Usage: node scripts/prepare-event-faces.mjs <event-slug>');
const eventDir=path.resolve('events',slug);
const event=JSON.parse(fs.readFileSync(path.join(eventDir,'event.json'),'utf8'));
const faceSection=event.sections.find(s=>s.key===(event.publish?.faceSection||'todas'));
if(!faceSection) throw new Error('Missing face section');
const root=path.resolve(eventDir,event.sourcePath,faceSection.folder);
const input=path.resolve(eventDir,event.faceDataPath);
const output=path.resolve(eventDir,event.publish.faceDataPath);
if(input===output) throw new Error('Derived metadata must not overwrite the source');
if(![root,input,output].every(p=>p.startsWith(eventDir+path.sep))) throw new Error('Event paths must stay within the event directory');
const raw=JSON.parse(fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''));
if(raw.params?.source!=='local-opencv-yunet-sface') throw new Error('Unexpected source coordinate format');
const files=new Set(fs.readdirSync(root).filter(f=>/\.(jpe?g|png|webp|tiff?)$/i.test(f)));
const dimensions=new Map(await Promise.all([...files].map(async file=>[file,await sharp(path.join(root,file)).metadata()])));
const visibleIds=new Set(raw.clusters.filter(c=>['person_001','person_002'].includes(c.person_id)||c.size>=3).map(c=>c.person_id));
const photos=raw.photos.filter(p=>files.has(p.filename)).map(p=>({...p,person_ids:p.person_ids.filter(id=>visibleIds.has(id))}));
const presentIds=new Set(photos.flatMap(p=>p.person_ids));
const faces=raw.faces.filter(f=>files.has(f.filename)&&presentIds.has(f.person_id)).map(f=>{
 const {width,height}=dimensions.get(f.filename);const [x,y,w,h]=f.bbox;
 return {...f,bbox:[x*width,y*height,(x+w)*width,(y+h)*height]};
});
const faceById=new Map(faces.map(f=>[f.face_id,f]));
const clusters=raw.clusters.filter(c=>presentIds.has(c.person_id)).map(c=>{
 const reviewed=(c.example_faces||[]).map(id=>faceById.get(id)).filter(Boolean);
 const matching=faces.filter(f=>f.person_id===c.person_id);
 return {...c,label:event.people?.labels?.[c.person_id]||c.label,size:photos.filter(p=>p.person_ids.includes(c.person_id)).length,example_files:[...new Set([...reviewed,...matching].map(f=>f.filename))].slice(0,5)};
});
const derived={...raw,params:{...raw.params,bbox_format:'pixel-xyxy',derived_from:event.faceDataPath},photos,faces,clusters,stats:{images:photos.length,faces:faces.length,people:clusters.length,photos_with_people:photos.filter(p=>p.person_ids.length).length}};
fs.writeFileSync(output,JSON.stringify(derived));
console.log('Prepared compatible supplied metadata:',derived.stats);
