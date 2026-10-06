import fs from 'node:fs/promises';
import path from 'node:path';
const root='D:/Descargas D/DeafAPP-LSCH-master/.codex-ppt-build-20261004';
const source=await fs.readFile(path.join(root,'build.mjs'),'utf8');
const prefix=source.slice(0,source.indexOf('// 2. Face overlay.'));
const closingSlides=source.slice(source.indexOf('// 21. Packaging and where.'),source.indexOf('const candidate ='));
const content=await fs.readFile(path.join(root,'content-13.mjs'),'utf8');
const exportCode=String.raw`
const candidate=path.join(build,'candidate-13.pptx');
const finalPath=path.join(root,'entregables/DeafApp-mejoras-13-diapositivas.pptx');
await (await PresentationFile.exportPptx(presentation)).save(candidate);
const result=await finalizePresentation({
  workspaceDir:root,candidatePath:candidate,finalPath,
  explicitTotalSlideCount:13,
  pythonExecutable:process.env.RUNTIME_PYTHON,
  integrityValidatorPath:path.join(skill,'container_tools/inspect_presentation_package_integrity.py'),
  layoutValidatorPath:path.join(skill,'container_tools/inspect_presentation_layout_geometry.py'),
  layoutArgs:['--expected-slide-size-emu','12192000,6858000','--validate-bullet-geometry','--validate-heading-fit'],
  requiredNativeTableOwnerSlides:[],fontPolicy:{basis:'design',families:[font]},
  verifyArtifactToolImport:true,receiptPath:path.join(build,'final-validation-13.json')
});
console.log('FINAL '+result.finalPath);
const finalDeck=await PresentationFile.importPptx(await FileBlob.load(finalPath));
const review=path.join(build,'review-13');await fs.mkdir(review,{recursive:true});
for(const [index,s] of finalDeck.slides.items.entries()){
  const preview=await finalDeck.export({slide:s,format:'png',scale:2});
  await sharp(new Uint8Array(await preview.arrayBuffer())).resize(1280,720).png().toFile(path.join(review,'slide-'+String(index+1).padStart(2,'0')+'.png'));
  console.log('REVIEW '+(index+1));
}
`;
await fs.writeFile(path.join(root,'build-13.mjs'),prefix+content+closingSlides+exportCode);
