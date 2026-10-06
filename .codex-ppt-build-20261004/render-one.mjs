import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import {FileBlob, PresentationFile} from '@oai/artifact-tool';
const base='D:/Descargas D/DeafAPP-LSCH-master';
const n=Number(process.argv[2] ?? 3);
const deck=await PresentationFile.importPptx(await FileBlob.load(path.join(base,process.argv[3] ?? 'entregables/DeafApp-mejoras-2026-10-04.pptx')));
const preview=await deck.export({slide:deck.slides.items[n-1],format:'png',scale:2});
await sharp(new Uint8Array(await preview.arrayBuffer())).resize(1280,720).png().toFile(path.join(base,'.codex-ppt-build-20261004',`fresh-${n}.png`));
