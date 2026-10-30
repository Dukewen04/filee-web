import { ext, stem, dataConvert, pageSelection } from './data.js';
export const groups = {
  image: { name: '图片转换', icon: 'image', color: 'purple', inputs: ['jpg','jpeg','png','webp','avif','gif','bmp','svg'], outputs: ['png','jpg','webp','pdf'], hint: 'JPG、PNG、WebP 互转，调整尺寸和质量。GIF 仅取第一帧；AVIF 取决于浏览器。' },
  pdf: { name: 'PDF 工具', icon: 'file-text', color: 'red', inputs: ['pdf'], outputs: ['png','jpg','txt','pdf'], hint: '导出图片、提取文字、选择页码。多个 PDF 可按队列顺序合并；扫描件不支持 OCR。' },
  document: { name: '文档提取', icon: 'file-type', color: 'blue', inputs: ['docx','txt','md','html','htm'], outputs: ['txt'], hint: '提取 DOCX / HTML 中的文字，或将文本转为 UTF-8 TXT。原文档排版和图片不会保留。' },
  data: { name: '数据转换', icon: 'table-2', color: 'green', inputs: ['csv','tsv','json','yaml','yml'], outputs: ['json','csv','tsv','yaml'], hint: 'CSV、TSV、JSON、YAML 互转。转表格需要对象数组；CSV 第一行为列名。' },
  archive: { name: 'ZIP 打包', icon: 'archive', color: 'orange', inputs: [], outputs: ['zip'], hint: '任意文件合并为一个 ZIP 压缩包。同名文件自动编号，原文件保持不变。' }
};
export function groupFor(file) { return Object.keys(groups).find(key => key !== 'archive' && groups[key].inputs.includes(ext(file.name))); }
export function targets(file, category) { const group = category === 'archive' ? 'archive' : groupFor(file); return group ? groups[group].outputs : []; }
export async function zipFiles(entries) {
  const { zip } = await import('fflate');
  return new Promise((resolve, reject) => zip(Object.fromEntries(entries), {level: 6}, (error, data) => error ? reject(error) : resolve(new Blob([data], {type:'application/zip'}))));
}
export function canvasBlob(canvas, format, quality) {
  const mime = format === 'jpg' ? 'image/jpeg' : `image/${format}`;
  return new Promise((resolve, reject) => canvas.toBlob(blob => {
    if (!blob || blob.type !== mime) reject(new Error(`当前浏览器不支持导出 ${format.toUpperCase()}`)); else resolve(blob);
  }, mime, quality));
}
async function image(file, to, options) {
  const url = URL.createObjectURL(file); const img = new Image();
  try {
    img.src = url; await img.decode();
    const scale = options.width ? Math.min(1, options.width / img.naturalWidth) : 1;
    const width = Math.max(1, Math.round(img.naturalWidth * scale)), height = Math.max(1, Math.round(img.naturalHeight * scale));
    if (width * height > 40000000) throw new Error('图片超过 4000 万像素，请先缩小后重试');
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (to === 'jpg' || to === 'pdf') { ctx.fillStyle = options.background; ctx.fillRect(0,0,width,height); }
    ctx.drawImage(img,0,0,width,height);
    if (to === 'pdf') {
      const { PDFDocument } = await import('pdf-lib'); const pdf = await PDFDocument.create();
      const pic = await pdf.embedPng(await (await canvasBlob(canvas,'png',1)).arrayBuffer());
      const page = pdf.addPage([width,height]); page.drawImage(pic,{x:0,y:0,width,height});
      return new Blob([await pdf.save()], {type:'application/pdf'});
    }
    return canvasBlob(canvas,to,options.quality);
  } finally { URL.revokeObjectURL(url); }
}
let pdfjs;
async function loadPDF(file) {
  if (!pdfjs) {
    pdfjs = await import('pdfjs-dist');
    const {default: worker} = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
  }
  return pdfjs.getDocument({data:await file.arrayBuffer(), isEvalSupported:false, useSystemFonts:true}).promise;
}
async function pdfConvert(file, to, options) {
  if (to === 'pdf') return mergePDF([file], options);
  const doc = await loadPDF(file);
  try {
    const pages = pageSelection(options.pages,doc.numPages);
    if (to === 'txt') {
      const texts = [];
      for (const index of pages) {
        const content = await (await doc.getPage(index+1)).getTextContent();
        texts.push(content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join(''));
      }
      const text = texts.join('\n\n');
      if (!text.trim()) throw new Error('未找到可提取的文字，扫描件需要 OCR 工具');
      return new Blob([text],{type:'text/plain;charset=utf-8'});
    }
    const entries = [];
    for (const index of pages) {
      const page = await doc.getPage(index+1), view = page.getViewport({scale:1.5});
      if (view.width * view.height > 40000000) throw new Error('PDF 页面过大，无法渲染');
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
      await page.render({canvasContext:canvas.getContext('2d'), viewport:view}).promise;
      const blob = await canvasBlob(canvas,to,options.quality);
      entries.push([`${stem(file.name)}-p${index+1}.${to}`,new Uint8Array(await blob.arrayBuffer())]);
    }
    if (entries.length === 1) return new Blob([entries[0][1]],{type:to==='jpg'?'image/jpeg':'image/png'});
    return {blob: await zipFiles(entries), name:`${stem(file.name)}-pages.zip`};
  } finally { await doc.destroy(); }
}
export async function mergePDF(files, options) {
  const {PDFDocument} = await import('pdf-lib'); const output = await PDFDocument.create();
  for (const file of files) {
    const source = await PDFDocument.load(await file.arrayBuffer());
    const pages = await output.copyPages(source,pageSelection(options.pages, source.getPageCount()));
    pages.forEach(page=>output.addPage(page));
  }
  return new Blob([await output.save()],{type:'application/pdf'});
}
export async function convert(file, to, options) {
  const group = groupFor(file);
  if (!targets(file).includes(to)) throw new Error('此文件不支持所选格式');
  if (group === 'image') return image(file,to,options);
  if (group === 'pdf') return pdfConvert(file,to,options);
  if (group === 'data') return new Blob([dataConvert(await file.text(),ext(file.name),to)],{type:'text/plain;charset=utf-8'});
  if (group === 'document') {
    let text = ext(file.name)==='docx' ? '' : await file.text();
    if (ext(file.name)==='docx') { const mammoth = await import('mammoth/mammoth.browser'); text = (await mammoth.extractRawText({arrayBuffer:await file.arrayBuffer()})).value; }
    if (['html','htm'].includes(ext(file.name))) { const doc = new DOMParser().parseFromString(text,'text/html'); doc.querySelectorAll('script,style,noscript').forEach(node=>node.remove()); text=doc.body.textContent; }
    return new Blob([text],{type:'text/plain;charset=utf-8'});
  }
  throw new Error('暂不支持此文件');
}
