import test from 'node:test';
import assert from 'node:assert/strict';
import { csvRead, csvWrite, dataConvert, pageSelection, uniqueName } from '../src/data.js';
test('CSV handles BOM, quotes, multiline, CRLF and non-Latin text',()=>{
 const data=[{姓名:'小明',备注:'第一行\n第二行,"好"'},{姓名:'Jane',备注:''}];
 assert.deepEqual(csvRead(csvWrite(data)),data);
 assert.deepEqual(csvRead('a\tb\r\n1\t2\r\n','\t'),[{a:'1',b:'2'}]);
});
test('CSV rejects malformed inputs and protects spreadsheet formulas',()=>{
 assert.throws(()=>csvRead('a,a\n1,2'),/列名重复/);
 assert.throws(()=>csvRead('a,b\n1'),/列数/);
 assert.throws(()=>csvRead('a\n"b'),/引号/);
 assert.ok(csvWrite([{a:'=1+1'}]).includes("'=1+1"));
 assert.throws(()=>csvWrite({a:1}),/对象数组/);
});
test('JSON/YAML/CSV conversion retains data and rejects wrong shapes',()=>{
 assert.deepEqual(JSON.parse(dataConvert('a,b\n1,2','csv','json')),[{a:'1',b:'2'}]);
 assert.deepEqual(JSON.parse(dataConvert('name: 小明','yaml','json')),{name:'小明'});
 assert.throws(()=>dataConvert('{bad','json','yaml'));
 assert.throws(()=>dataConvert('{"a":1}','json','csv'),/对象数组/);
});
test('PDF page ranges preserve order, deduplicate and reject out of bounds',()=>{
 assert.deepEqual(pageSelection('3,1-3',4),[2,0,1]);
 assert.deepEqual(pageSelection('',2),[0,1]);
 for(const range of ['0','5','3-1','a','1,'])assert.throws(()=>pageSelection(range,4));
});
test('ZIP names do not overwrite duplicate files',()=>{
 const used=new Set();assert.equal(uniqueName('你好.txt',used),'你好.txt');assert.equal(uniqueName('你好.txt',used),'你好 (2).txt');
});
