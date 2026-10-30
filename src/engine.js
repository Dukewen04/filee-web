let endpoint = '', token = '';
let capabilities = null;
const routes = new Map();
export const engine = {
  get connected() { return capabilities !== null; },
  get endpoint() { return endpoint; },
  get capabilities() { return capabilities; },
  async connect(url, key = '') {
    const parsed = new URL(url, location.href);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(parsed.hostname))) throw new Error('服务地址需要 HTTPS，本机服务可使用 HTTP');
    endpoint = parsed.href.replace(/\/$/,''); token=key; capabilities=null; routes.clear();
    const response=await request('/api/capabilities'); capabilities=await response.json();
    if (!Array.isArray(capabilities.formats)||!Array.isArray(capabilities.engines)) {capabilities=null;throw new Error('此地址不是 Filee Web 转换服务');}
    return capabilities;
  },
  async prepare(file, ocr = false) {
    if (!capabilities) throw new Error('请先连接 Filee 转换服务');
    const result=await (await request('/api/routes?name='+encodeURIComponent(file.name)+'&ocr='+ocr)).json();
    routes.set(file.name,result);return result;
  },
  targets(file) { return routes.get(file.name)?.targets.filter(t=>t.available).map(t=>t.id)||[]; },
  info(file) { return routes.get(file.name); },
  async convert(file, target, options, companions) {
    const body=new FormData();body.append('target',target);body.append('source',file.name);
    body.append('quality',String(Math.round(options.quality*100)));body.append('width',String(options.width));body.append('pages',options.pages);
    body.append('ocr',String(options.ocr));body.append('language',options.language||'chi_sim+eng');
    body.append('files',file,file.name);
    for(const companion of companions) if(companion!==file)body.append('files',companion,companion.name);
    const result=await request('/api/convert',{method:'POST',body});
    if(result.headers.get('X-Filee-Results')==='partial')throw new Error('部分转换失败，请缩小到单个主文件重试');
    return result.blob();
  }
};
async function request(path,options={}) {
  const response=await fetch(endpoint+path,{...options,headers:{...(token?{Authorization:'Bearer '+token}:{}),...options.headers}});
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||`服务请求失败（${response.status}）`);}
  return response;
}
