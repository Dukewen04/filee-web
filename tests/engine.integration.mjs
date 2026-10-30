import test from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { unzipSync, strFromU8 } from 'fflate';
const base=process.env.FILEE_TEST_URL||'http://127.0.0.1:8080';
const headers={Authorization:'Bearer '+(process.env.FILEE_TEST_TOKEN||'filee-test-token')};
async function convert(files,target,extra={}) {
  const body=new FormData();body.set('target',target);for(const [name,data] of files)body.append('files',new Blob([data]),name);for(const [key,value]of Object.entries(extra))body.set(key,String(value));
  const response=await fetch(base+'/api/convert',{method:'POST',headers,body});
  assert.equal(response.status,200,await response.clone().text());return unzipSync(new Uint8Array(await response.arrayBuffer()));
}
test('API enforces authentication and advertises the original registry and live engine status',async()=>{
  assert.equal((await fetch(base+'/api/capabilities')).status,401);
  const c=await(await fetch(base+'/api/capabilities',{headers})).json();assert.ok(c.formats.length>=270);assert.ok(c.engines.length>=30);
  assert.ok(c.engines.some(e=>e.id==='docx-writer'&&e.available)||c.engines.some(e=>e.name==='DOCX writer (built-in)'&&e.available));
  const route=await(await fetch(base+'/api/routes?name=report.pdf',{headers})).json();assert.ok(route.targets.some(t=>t.id==='docx'&&t.available));
});
test('PDF to Word retains editable text, an editable ruled table, and an embedded image; DOCX converts back to PDF',async()=>{
  const pdf=await PDFDocument.create(),font=await pdf.embedFont(StandardFonts.Helvetica),page=pdf.addPage([600,800]);page.drawText('Quarterly report',{x:40,y:740,size:24,font});
  for(const x of [40,220,400])page.drawLine({start:{x,y:500},end:{x,y:650},thickness:1});
  for(const y of [500,550,600,650])page.drawLine({start:{x:40,y},end:{x:400,y},thickness:1});
  for(const[text,x,y]of [['Product',50,620],['Count',230,620],['Apples',50,570],['12',230,570],['Oranges',50,520],['24',230,520]])page.drawText(text,{x,y,size:14,font});
  const image=await pdf.embedPng(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64'));page.drawImage(image,{x:40,y:350,width:100,height:100});
  const outputs=await convert([['layout.pdf',await pdf.save()]],'docx');const name=Object.keys(outputs).find(n=>n.endsWith('.docx'));assert.ok(name);
  const docx=unzipSync(outputs[name]);const xml=strFromU8(docx['word/document.xml']);assert.match(xml,/Quarterly report/);assert.match(xml,/Apples/);assert.equal((xml.match(/<w:tbl>/g)||[]).length,1);assert.ok(Object.keys(docx).some(n=>n.startsWith('word/media/')));
  const returned=await convert([['layout.docx',outputs[name]]],'pdf');const final=Object.values(returned)[0];assert.equal(Buffer.from(final.subarray(0,4)).toString(),'%PDF');
});
test('Original spreadsheet, subtitle and data converters run through the Web adapter',async()=>{
  const sheets=await convert([['people.csv','姓名,备注\n小明,你好\nJane,test']],'xlsx');const xlsx=unzipSync(Object.values(sheets)[0]);assert.ok(xlsx['xl/workbook.xml']);
  const subtitles=await convert([['subtitles.srt','1\n00:00:01,000 --> 00:00:03,000\nHello Filee\n']],'vtt');assert.match(strFromU8(Object.values(subtitles)[0]),/WEBVTT/);assert.match(strFromU8(Object.values(subtitles)[0]),/Hello Filee/);
  const images=await convert([['drawing.svg','<svg xmlns="http://www.w3.org/2000/svg" width="80" height="60"><rect width="80" height="60" fill="purple"/></svg>']],'webp');assert.equal(Buffer.from(Object.values(images)[0].subarray(0,4)).toString(),'RIFF');
  const data=await convert([['data.json','{"name":"小明","count":2}']],'yaml');assert.match(strFromU8(Object.values(data)[0]),/小明/);
});
test('Invalid filenames, missing engines and untrusted CORS origins are rejected',async()=>{
  const form=new FormData();form.set('target','docx');form.append('files',new Blob(['test']),'../escape.pdf');assert.equal((await fetch(base+'/api/convert',{method:'POST',headers,body:form})).status,400);
  const unknown=new FormData();unknown.set('target','not-a-format');unknown.append('files',new Blob(['x']),'test.txt');assert.equal((await fetch(base+'/api/convert',{method:'POST',headers,body:unknown})).status,400);
  const cors=await fetch(base+'/api/capabilities',{headers:{...headers,Origin:'https://untrusted.example'}});assert.equal(cors.headers.get('Access-Control-Allow-Origin'),null);
});

test('Image-only scanned PDF is converted to editable Word using the upstream OCR route',async()=>{
  const source=await PDFDocument.create(),font=await source.embedFont(StandardFonts.Helvetica),page=source.addPage([600,800]);page.drawText('Recognize this sentence',{x:50,y:650,size:28,font});
  const pngs=await convert([['print.pdf',await source.save()]],'png');const scan=await PDFDocument.create();scan.addPage([600,800]).drawImage(await scan.embedPng(Object.values(pngs)[0]),{x:0,y:0,width:600,height:800});
  const docs=await convert([['scan.pdf',await scan.save()]],'docx',{ocr:true,language:'eng'});const doc=unzipSync(Object.values(docs)[0]);assert.match(strFromU8(doc['word/document.xml']),/Recognize/);
});
