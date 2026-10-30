import { engine } from './engine.js';
import './style.css';
import { createIcons, ArrowUpRight, ArrowRight, ArrowDownToLine, ArrowLeftRight, Plus, X, Check, Image, FileText, FileType, Table2, Archive, ShieldCheck, Github, SlidersHorizontal, CircleHelp, Clock3, Sparkles, FolderOpen, LockKeyhole, LoaderCircle, Trash2, ChevronDown } from 'lucide';
import { groups, groupFor, targets, convert, zipFiles, mergePDF } from './converters.js';
import { ext, stem, uniqueName } from './data.js';
const icons = {ArrowUpRight,ArrowRight,ArrowDownToLine,ArrowLeftRight,Plus,X,Check,Image,FileText,FileType,Table2,Archive,ShieldCheck,Github,SlidersHorizontal,CircleHelp,Clock3,Sparkles,FolderOpen,LockKeyhole,LoaderCircle,Trash2,ChevronDown};
const icon = name => `<i data-lucide="${name}"></i>`;
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let category = 'all', view = 'convert', queue = [], busy = false, history = [];
const options = {quality:.9,width:0,background:'#ffffff',pages:'',merge:false};
const app = document.querySelector('#app');
app.innerHTML = `
<aside class="sidebar"><a class="brand" href="./"><span class="brand-icon">f<span>↗</span></span>filee<span class="web-badge">WEB</span></a>
<div class="workspace-label">你的文件工作台</div><nav><button data-view="convert" class="nav-button active">${icon('arrow-left-right')}文件转换<span class="nav-dot"></span></button><button data-view="history" class="nav-button">${icon('clock-3')}本次记录<span id="history-count">0</span></button></nav>
<div class="sidebar-bottom"><div class="local-card"><span class="local-icon">${icon('shield-check')}</span><strong>你的文件，只属于你</strong><p>所有转换在浏览器本地完成，<br>文件不会上传到任何服务器。</p><span class="local-status"><b></b>本地处理已就绪</span></div><button class="help" data-action="help">${icon('circle-help')}使用说明${icon('arrow-up-right')}</button><a class="source-link" href="https://github.com/Dukewen04/filee-web" target="_blank" rel="noreferrer">${icon('github')}开源在 GitHub${icon('arrow-up-right')}</a><span class="version">Filee Web · v1.0</span></div></aside>
<div class="main-shell"><header class="topbar"><div class="breadcrumb">工作台<span>/</span><b id="crumb">文件转换</b></div><span class="privacy-pill">${icon('lock-keyhole')}无需上传 · 无需注册</span></header>
<main><section id="convert-view"><div class="intro"><div><div class="eyebrow"><span></span>小工具，让文件自由一点</div><h1>换个格式，<em>轻松搞定。</em></h1><p>图片、文档、数据……拖进来，转出去。文件始终留在你的设备上。</p></div><div class="intro-stamp">${icon('sparkles')}简单一点<br><strong>快一点。</strong></div></div>
<div class="category-tabs" role="group" aria-label="文件类别"><button data-category="all" class="selected">${icon('folder-open')}全部文件</button>${Object.entries(groups).map(([key,g])=>`<button data-category="${key}">${icon(g.icon)}${g.name}</button>`).join('')}</div>
<section class="converter-panel"><div class="panel-top"><span><b class="step-number">01</b>添加你的文件</span><button class="text-button" data-action="engine-settings">${icon('sparkles')}连接原版引擎</button><button class="text-button" data-action="settings">${icon('sliders-horizontal')}转换设置</button></div>
<div id="dropzone" class="dropzone" role="button" tabindex="0" aria-label="选择或拖入文件"><div class="file-art" aria-hidden="true"><div class="mini-file left-file"><span>JPG</span>${icon('image')}</div><div class="mini-file center-file">${icon('arrow-left-right')}</div><div class="mini-file right-file"><span>PDF</span>${icon('file-text')}</div></div><h2>把文件拖到这里</h2><p>一个或多个文件，都可以一起放进来</p><button class="primary choose" data-action="choose">${icon('plus')}选择文件</button><span class="drop-note">支持图片、PDF、DOCX、CSV、JSON 等 · 单文件最大 50 MB</span></div><input type="file" id="file-input" multiple hidden>
<div class="panel-foot"><span>${icon('shield-check')}本地转换，保护隐私</span><span>${icon('check')}批量处理</span><span>${icon('check')}免费使用</span></div>
<div id="queue-area" hidden></div></section>
<div id="engine-settings" class="settings" hidden><div class="section-title"><h3>${icon('sparkles')}Filee 原版转换服务</h3><button class="icon-button" data-action="engine-settings" aria-label="关闭引擎设置">${icon('x')}</button></div><p class="muted">连接运行原版 Filee 引擎的后端，开启文档、表格、音视频、电子书、字体、CAD、3D 与地理数据等格式转换。选择此模式后，文件会上传到该服务处理。</p><div class="setting-fields"><label>转换服务地址<input id="engine-url" type="url" placeholder="https://你的转换服务"></label><label>访问令牌（公开服务留空）<input id="engine-token" type="password" autocomplete="off"></label></div><button class="primary" data-action="connect-engine">连接并读取引擎</button><div id="engine-status" class="muted" aria-live="polite">尚未连接，当前使用浏览器内置转换。</div></div><div id="settings" class="settings" hidden><div class="section-title"><h3>${icon('sliders-horizontal')}转换设置</h3><button class="icon-button" data-action="settings" aria-label="关闭设置">${icon('x')}</button></div><div class="setting-fields"><label>图片质量 <output id="quality-value">90%</output><input type="range" id="quality" min="10" max="100" value="90"></label><label>最大宽度（像素，不放大）<input id="width" type="number" min="1" max="12000" placeholder="保持原尺寸"></label><label>JPG / PDF 背景色<input id="background" type="color" value="#ffffff"></label><label>PDF 页码（留空表示全部）<input id="pages" placeholder="例如 1, 3-5"></label><label>原版引擎 OCR<input id="engine-ocr" type="checkbox">识别扫描件文字</label><label>OCR 语言<select id="engine-language"><option value="chi_sim+eng">简体中文 + 英文</option><option value="eng">英文</option><option value="chi_tra+eng">繁体中文 + 英文</option><option value="jpn+eng">日文 + 英文</option><option value="kor+eng">韩文 + 英文</option></select></label><label class="merge-setting"><input id="merge" type="checkbox">将队列中的 PDF 合并为一个文件</label></div><p class="muted">合并时请将所有 PDF 的输出选为 PDF；页码设置会应用于每个 PDF。队列按添加顺序处理。</p></div>
<div class="section-heading"><div><h2>常用转换</h2><span>从这里开始，少点几下</span></div><button class="text-button" data-action="formats">查看支持格式${icon('arrow-up-right')}</button></div><div class="quick-grid">${[['image','图片格式互转','JPG / PNG / WebP','图片也可以变成 PDF'],['pdf','PDF 随心处理','PDF → 图片 / 文字','导出、选页，或合并文档'],['data','数据轻松整理','CSV / JSON / YAML','常用数据格式自由切换'],['archive','文件一键打包','任意文件 → ZIP','把零散的文件收在一起']].map(([key,title,formats,desc])=>`<button class="quick-card ${groups[key].color}" data-category="${key}"><span class="quick-icon">${icon(groups[key].icon)}</span><span class="quick-arrow">${icon('arrow-up-right')}</span><h3>${title}</h3><strong>${formats}</strong><p>${desc}</p></button>`).join('')}</div>
<div class="bottom-note"><span>${icon('shield-check')}没有上传进度，因为根本不需要上传。</span><span>灵感来自 <a href="https://github.com/KnifeLemon/Filee" target="_blank" rel="noreferrer">Filee ↗</a></span></div></section>
<section id="history-view" hidden><div class="intro"><div><div class="eyebrow">THIS SESSION</div><h1>转换过的，<em>都在这里。</em></h1><p>仅保留本次打开页面的记录，刷新或关闭后自动清空。</p></div></div><div id="history-list"></div></section></main><footer><span>Filee Web</span><span>为每一份文件，找到合适的格式。</span><span>本地处理 · 开源免费</span></footer></div>
<dialog id="help-dialog"><div class="section-title"><h2 id="dialog-title">使用说明</h2><button data-action="close-dialog" class="icon-button" aria-label="关闭弹窗">${icon('x')}</button></div><div id="dialog-body"></div><button class="primary" data-action="close-dialog">知道了${icon('check')}</button></dialog><div id="toast" role="status" aria-live="polite"></div>`;
const $ = selector => document.querySelector(selector);
const refreshIcons = () => createIcons({icons, attrs:{'stroke-width':1.7}});
const size = bytes => bytes < 1024 ? bytes+' B' : bytes < 1048576 ? (bytes/1024).toFixed(1)+' KB' : (bytes/1048576).toFixed(1)+' MB';
function toast(text) { $('#toast').textContent=text; $('#toast').classList.add('visible'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('#toast').classList.remove('visible'),4500); }
function download(blob,name) { const url=URL.createObjectURL(blob); const a=document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(url),30000); }
function resultLink(result) { return `<button class="small-button" data-download="${result.id}">${icon('arrow-down-to-line')}下载</button>`; }
function renderQueue() {
  $('#queue-area').hidden=!queue.length;
  $('#queue-area').innerHTML=`<div class="queue-head"><h3>转换队列 <span>${queue.length}</span></h3><button class="text-button" data-action="clear" ${busy?'disabled':''}>清空列表</button></div><div class="queue-list">${queue.map(item=>`<div class="file-row"><span class="file-type ${groups[item.group||'archive'].color}">${icon(groups[item.group||'archive'].icon)}</span><div class="file-info"><strong title="${escape(item.file.name)}">${escape(item.file.name)}</strong><span>${size(item.file.size)} · ${item.error?`<b class="error">${escape(item.error)}</b>`:item.status==='done'?'<b class="success">转换完成</b>':item.status==='working'?'正在转换…':'准备就绪'}</span></div><span class="row-arrow">${icon('arrow-right')}</span><select aria-label="${escape(item.file.name)} 输出格式" data-format="${item.id}" ${busy?'disabled':''}>${targets(item.file,category).map(t=>`<option value="${t}" ${t===item.to?'selected':''}>${t==='companion'?'配套文件（不单独转换）':t.toUpperCase()}</option>`).join('')}</select>${item.result?resultLink(item.result):''}<button class="icon-button" data-remove="${item.id}" aria-label="移除 ${escape(item.file.name)}" ${busy?'disabled':''}>${icon('x')}</button></div>`).join('')}</div><div class="queue-actions"><span>${icon(busy?'loader-circle':'shield-check')}${busy?(category==='engine'?'转换服务处理中，请稍候…':'正在本地处理，请稍候…'):(category==='engine'?'文件将发送到已连接的转换服务':'文件不会离开你的设备')}</span><div><button class="secondary" data-action="download-all" ${busy||!queue.some(i=>i.result)?'disabled':''}>${icon('archive')}打包下载</button><button class="primary" data-action="convert" ${busy?'disabled':''}>${icon(busy?'loader-circle':'arrow-left-right')}${busy?'转换中…':'开始转换'}</button></div></div>`;
  refreshIcons();
}
function setCategory(key) {
  if (busy) return;
  if (queue.length && ((category==='archive') !== (key==='archive') || (category==='engine') !== (key==='engine'))) { toast('请先清空当前队列，再切换处理模式'); return; }
  if(key==='engine'&&!engine.connected){$('#engine-settings').hidden=false;$('#engine-settings').scrollIntoView({behavior:'smooth',block:'nearest'});toast('先连接 Filee 转换服务，再选择原版引擎模式');return;}
  category=key;
  const remote=key==='engine';
  $('.privacy-pill').innerHTML=icon(remote?'sparkles':'lock-keyhole')+(remote?'Filee 原版引擎 · 服务端处理':'无需上传 · 无需注册');
  $('.local-card strong').textContent=remote?'原版引擎，完整格式库':'你的文件，只属于你';
  $('.local-status').innerHTML='<b></b>'+(remote?'转换服务已连接':'本地处理已就绪');
  $('footer span:last-child').textContent=remote?'Filee 后端 · 开源引擎':'本地处理 · 开源免费';
  $('.local-card p').textContent=remote?'文件将发送到已连接的转换服务处理；请求完成后清理临时文件。':'所有转换在浏览器本地完成，文件不会上传到任何服务器。';
  $('.panel-foot span').innerHTML=icon('shield-check')+(remote?'转换服务处理':'本地转换，保护隐私');
  $('.bottom-note>span:first-child').textContent=remote?'服务端模式：请确认转换服务地址可信。':'没有上传进度，因为根本不需要上传。';
  $('.intro p').textContent=remote?'复用 Filee 格式注册表与转换路由，支持能力取决于转换服务已安装的引擎。':'图片、文档、数据……拖进来，转出去。文件始终留在你的设备上。';
  document.querySelectorAll('.category-tabs button').forEach(button=>button.classList.toggle('selected',button.dataset.category===key));
  $('#file-input').accept=key==='all'||key==='archive'||key==='engine'?'':groups[key].inputs.map(e=>'.'+e).join(',');
  $('#dropzone h2').textContent=key==='archive'?'把要打包的文件拖到这里':'把文件拖到这里';
  $('#dropzone p').textContent=key==='all'?'一个或多个文件，都可以一起放进来':groups[key].hint;
  renderQueue();
}
async function addFiles(files) {
  if (busy) return toast('转换过程中请稍候');
  for (const file of files) {
    if (queue.length>=30) { toast('每批最多 30 个文件'); break; }
    if (file.size>50*1048576 || queue.reduce((n,i)=>n+i.file.size,0)+file.size>150*1048576) { toast('单文件上限 50 MB，每批总大小上限 150 MB'); continue; }
    if(category==='engine'){
      try {const route=await engine.prepare(file,$('#engine-ocr').checked);if(route.source&&!route.targets.some(t=>t.available)){toast(file.name+'：需要安装额外引擎，当前服务无法转换此文件');continue;}}catch(error){toast(error.message);continue;}
    }
    const group=category==='engine'?'engine':groupFor(file);
    if (category!=='archive' && category!=='engine' && (!group || (category!=='all' && group!==category))) { toast(`${file.name}：当前类别不支持此格式，可用 ZIP 模式打包`); continue; }
    queue.push({id:crypto.randomUUID(),file,group,to:targets(file,category)[0],status:'ready'});
  }
  $('#file-input').value=''; renderQueue();
}
function addResult(blob,name) { const result={id:crypto.randomUUID(),blob,name,time:new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}; history.push(result); $('#history-count').textContent=history.length; return result; }
async function run() {
  if (busy || !queue.length) return;
  const width=Number($('#width').value);
  if (!Number.isFinite(width)||width<0||width>12000) return toast('图片宽度需要在 1–12000 之间，或留空');
  Object.assign(options,{width,quality:Number($('#quality').value)/100,background:$('#background').value,pages:$('#pages').value,merge:$('#merge').checked,ocr:$('#engine-ocr').checked,language:$('#engine-language').value});
  if(category==='engine' && queue.every(i=>i.to==='companion'))return toast('请至少选择一个主文件及其输出格式');
  busy=true; queue.forEach(i=>{i.error='';i.result=null;i.status='ready';}); renderQueue();
  try {
    if (category==='engine') {
      const companions=queue.filter(i=>i.to==='companion').map(i=>i.file);
      for(const item of queue){
        if(item.to==='companion'){item.status='done';continue;}
        item.status='working';renderQueue();
        try {const blob=await engine.convert(item.file,item.to,options,companions);item.result=addResult(blob,`${stem(item.file.name)}-${item.to}.zip`);item.status='done';}
        catch(error){item.error=error.message;item.status='error';}
      }
    } else if (category==='archive') {
      const names=new Set(), entries=[];
      for (const item of queue) entries.push([uniqueName(item.file.name,names),new Uint8Array(await item.file.arrayBuffer())]);
      const result=addResult(await zipFiles(entries),'filee-files.zip'); queue.forEach(i=>{i.result=result;i.status='done';});
    } else {
      const merging=options.merge && queue.filter(i=>i.group==='pdf').length>1;
      const pdfItems=queue.filter(i=>i.group==='pdf');
      if (merging && pdfItems.some(i=>i.to!=='pdf')) throw new Error('合并 PDF 时，请把每个 PDF 的输出格式设为 PDF');
      if (merging) {
        pdfItems.forEach(i=>i.status='working'); renderQueue();
        try { const result=addResult(await mergePDF(pdfItems.map(i=>i.file),options),'filee-merged.pdf'); pdfItems.forEach(i=>{i.result=result;i.status='done';}); }
        catch(error) { pdfItems.forEach(i=>{i.error=error.message;i.status='error';}); }
      }
      for (const item of queue.filter(i=>!merging||i.group!=='pdf')) {
        item.status='working'; renderQueue();
        await new Promise(resolve=>setTimeout(resolve,0));
        try { const output=await convert(item.file,item.to,options); item.result=addResult(output.blob||output,output.name||`${stem(item.file.name)}.${item.to}`); item.status='done'; }
        catch(error) { item.error=error.message||'转换失败，请检查文件是否损坏或加密'; item.status='error'; }
      }
    }
    toast(queue.some(i=>i.status==='error')?'部分文件转换失败，请查看队列中的原因':'转换完成，点击下载保存文件');
  } catch(error) { toast(error.message); }
  finally { busy=false;renderQueue(); }
}
function showDialog(formats=false) {
  $('#dialog-title').textContent=formats?'支持格式与处理说明':'三步，完成文件转换';
  $('#dialog-body').innerHTML=formats?Object.values(groups).map(g=>`<div class="format-row"><h3>${icon(g.icon)}${g.name}</h3><p>${g===groups.engine?'由已连接服务的 Filee 格式注册表和已安装引擎决定':(g.inputs.length?g.inputs.join(' / ').toUpperCase():'任意文件')+' → '+g.outputs.join(' / ').toUpperCase()}</p><p class="muted">${g.hint}</p></div>`).join(''):`<ol><li><strong>拖入或选择文件</strong><p>支持多选。每批最多 30 个，总计 150 MB。</p></li><li><strong>选好输出格式</strong><p>每个文件可单独设置。图片质量、尺寸和 PDF 页码在「转换设置」中调整。</p></li><li><strong>转换并下载</strong><p>转换后手动下载，或将结果打包下载。原文件不会修改。</p></li></ol><div class="notice">浏览器内置模式支持有限的格式。连接原版引擎后，可使用服务已安装引擎支持的全部转换路线；服务端模式会上传文件。配套文件（如 Shapefile 的 DBF/PRJ、OBJ 的 MTL/纹理）请一起加入队列并选择「配套文件」。记录与结果仅存在页面内存中，刷新前请保存。</div>`;
  refreshIcons();$('#help-dialog').showModal();
}
app.addEventListener('click',async event=>{
  const button=event.target.closest('button'); if (!button||button.disabled) return;
  if (button.dataset.category) return setCategory(button.dataset.category);
  if (button.dataset.view) {
    view=button.dataset.view; $('#convert-view').hidden=view!=='convert';$('#history-view').hidden=view!=='history';$('#crumb').textContent=view==='convert'?'文件转换':'本次记录';
    document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
    $('#history-list').innerHTML=history.length?history.slice().reverse().map(result=>`<div class="file-row"><span class="file-type purple">${icon('check')}</span><div class="file-info"><strong>${escape(result.name)}</strong><span>${result.time} · ${size(result.blob.size)}</span></div>${resultLink(result)}</div>`).join(''):`<div class="empty-history">${icon('clock-3')}<h2>还没有转换记录</h2><p>去转换第一份文件吧，结果会显示在这里。</p><button class="primary" data-view="convert">开始转换${icon('arrow-right')}</button></div>`;
    refreshIcons();return;
  }
  if (button.dataset.remove) {queue=queue.filter(i=>i.id!==button.dataset.remove);renderQueue();return;}
  if (button.dataset.download) {const result=history.find(i=>i.id===button.dataset.download);download(result.blob,result.name);return;}
  switch(button.dataset.action) {
    case 'engine-settings':$('#engine-settings').hidden=!$('#engine-settings').hidden;if(!$('#engine-settings').hidden)$('#engine-settings').scrollIntoView({behavior:'smooth',block:'nearest'});break;
    case 'connect-engine': {
      button.disabled=true;$('#engine-status').textContent='正在检查转换服务与引擎…';
      try{const caps=await engine.connect($('#engine-url').value,$('#engine-token').value);const ready=caps.engines.filter(e=>e.available);$('#engine-status').innerHTML=`<p>已连接：${caps.formats.length} 个注册格式，${ready.length}/${caps.engines.length} 个引擎可用。</p>`+caps.engines.map(e=>`<span class="engine-badge ${e.available?'success':'error'}">${escape(e.name)} · ${e.available?'可用':'未就绪'}</span>`).join('');if(!queue.length)setCategory('engine');toast('已连接原版 Filee 引擎');}catch(error){$('#engine-status').textContent=error.message;toast(error.message);}finally{button.disabled=false;}break;
    }
    case 'choose': $('#file-input').click();break;
    case 'clear': queue=[];renderQueue();break;
    case 'settings': $('#settings').hidden=!$('#settings').hidden;if(!$('#settings').hidden)$('#settings').scrollIntoView({behavior:'smooth',block:'nearest'});break;
    case 'help': showDialog();break;
    case 'formats': showDialog(true);break;
    case 'close-dialog':$('#help-dialog').close();break;
    case 'convert':await run();break;
    case 'download-all': {
      button.disabled=true;
      try {const used=new Set(),entries=[],seen=new Set();for(const i of queue.filter(i=>i.result)){if(seen.has(i.result.id))continue;seen.add(i.result.id);entries.push([uniqueName(i.result.name,used),new Uint8Array(await i.result.blob.arrayBuffer())]);}download(await zipFiles(entries),'filee-converted.zip');} catch(error){toast(error.message);}finally{button.disabled=false;}break;
    }
  }
});
$('#queue-area').addEventListener('change',event=>{const item=queue.find(i=>i.id===event.target.dataset.format);if(item){item.to=event.target.value;item.result=null;item.error='';item.status='ready';renderQueue();}});
$('#quality').addEventListener('input',event=>$('#quality-value').textContent=event.target.value+'%');
$('#file-input').addEventListener('change',event=>addFiles(event.target.files));
const zone=$('#dropzone');
zone.addEventListener('click',event=>{if(!event.target.closest('button'))$('#file-input').click();});
zone.addEventListener('keydown',event=>{if(event.target===zone&&['Enter',' '].includes(event.key)){event.preventDefault();$('#file-input').click();}});
for(const type of ['dragenter','dragover'])zone.addEventListener(type,event=>{event.preventDefault();zone.classList.add('dragging');});
zone.addEventListener('dragleave',event=>{if(!zone.contains(event.relatedTarget))zone.classList.remove('dragging');});
zone.addEventListener('drop',event=>{event.preventDefault();zone.classList.remove('dragging');addFiles(event.dataTransfer.files);});
window.addEventListener('dragover',event=>event.preventDefault());window.addEventListener('drop',event=>event.preventDefault());
refreshIcons();

$('#engine-ocr').addEventListener('change',async()=>{if(category!=='engine'||busy)return;for(const item of queue){try{await engine.prepare(item.file,$('#engine-ocr').checked);if(!targets(item.file,category).includes(item.to))item.to=targets(item.file,category)[0];item.result=null;item.status='ready';}catch(error){toast(error.message);}}renderQueue();});

$('#engine-url').value=import.meta.env.VITE_FILEE_API||location.origin;
if(import.meta.env.VITE_FILEE_SERVER==='1'||import.meta.env.VITE_FILEE_API){$('#engine-token').value='';document.querySelector('[data-action="connect-engine"]').click();}
