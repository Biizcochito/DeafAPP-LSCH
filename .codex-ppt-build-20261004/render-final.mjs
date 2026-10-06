import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {FileBlob, PresentationFile} from '@oai/artifact-tool';
const root='D:/Descargas D/DeafAPP-LSCH-master';
const out=path.join(root,'.codex-ppt-build-20261004/review-final');
await fs.mkdir(out,{recursive:true});
const deck=await PresentationFile.importPptx(await FileBlob.load(path.join(root,'entregables/DeafApp-mejoras-2026-10-04.pptx')));
for(const [index,s] of deck.slides.items.entries()) {
  const preview=await deck.export({slide:s,format:'png',scale:2});
  const bytes=new Uint8Array(await preview.arrayBuffer());
  await sharp(bytes).resize(1280,720).png().toFile(path.join(out,`slide-${String(index+1).padStart(2,'0')}.png`));
  console.log(`REVIEW ${index+1}`);
}
