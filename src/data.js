import { parse, stringify } from 'yaml';
export const ext = name => name.split('.').pop().toLowerCase();
export const stem = name => name.replace(/\.[^.]+$/, '') || 'converted';
export function csvRead(text, delimiter = ',') {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted) quoted = false;
      else if (!cell) quoted = true;
      else throw new Error('CSV 引号格式不正确');
    } else if (ch === delimiter && !quoted) { row.push(cell); cell = ''; }
    else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  if (!rows.length) throw new Error('表格为空');
  const headers = rows.shift();
  if (new Set(headers).size !== headers.length) throw new Error('列名重复，请先修改列名');
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error('CSV 每行的列数必须相同');
    return Object.fromEntries(headers.map((key, i) => [key, values[i]]));
  });
}
export function csvWrite(data, delimiter = ',') {
  if (!Array.isArray(data) || data.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('转表格需要 JSON 对象数组，例如 [{"姓名":"小明"}]');
  const keys = [...new Set(data.flatMap(Object.keys))];
  const escape = val => {
    let value = val == null ? '' : typeof val === 'object' ? JSON.stringify(val) : String(val);
    // Prevent spreadsheet programs from interpreting untrusted cells as formulas.
    if (/^[=+@\-\t\r]/.test(value)) value = "'" + value;
    return /["\r\n]/.test(value) || value.includes(delimiter) ? '"' + value.replaceAll('"', '""') + '"' : value;
  };
  return '\uFEFF' + [keys.map(escape).join(delimiter), ...data.map(row => keys.map(key => escape(row[key])).join(delimiter))].join('\r\n');
}
export function dataConvert(text, from, to) {
  let data;
  try { data = from === 'json' ? JSON.parse(text) : ['yaml', 'yml'].includes(from) ? parse(text, { maxAliasCount: 50 }) : csvRead(text, from === 'tsv' ? '\t' : ','); }
  catch (error) { throw new Error(`无法解析 ${from.toUpperCase()} 文件：${error.message}`); }
  if (to === 'json') return JSON.stringify(data, null, 2);
  if (to === 'yaml') return stringify(data);
  return csvWrite(data, to === 'tsv' ? '\t' : ',');
}
export function uniqueName(name, used) {
  let candidate = name, i = 2;
  while (used.has(candidate)) candidate = `${stem(name)} (${i++}).${ext(name)}`;
  used.add(candidate); return candidate;
}
export function pageSelection(input, count) {
  if (!input.trim()) return Array.from({length: count}, (_, i) => i);
  const result = [];
  for (const part of input.split(',')) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) throw new Error('页码格式示例：1, 3-5');
    const a = Number(match[1]), b = Number(match[2] || match[1]);
    if (a < 1 || b > count || b < a) throw new Error(`页码必须在 1–${count} 之间`);
    for (let p = a; p <= b; p++) if (!result.includes(p - 1)) result.push(p - 1);
  }
  return result;
}
