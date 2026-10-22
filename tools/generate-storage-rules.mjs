import {readFile,writeFile} from 'node:fs/promises';
import '../public/firebase-shared.js';
const core=globalThis.KidsTubeCloud;
export function generateRules({uids,paths=[],prefixes=[]}) {
  if(!Array.isArray(uids)||!uids.length||uids.some(v=>typeof v!=='string'||!v||v.length>128||/['\\\x00-\x1f]/.test(v)))throw Error('請提供已確認的 UID 白名單');
  if(!Array.isArray(paths)||paths.some(p=>!core.validPath(p)))throw Error('實際檔案路徑不正確');
  if(!Array.isArray(prefixes)||prefixes.some(p=>p!==''&&!core.validPath(p)))throw Error('資料夾位置不正確');
  const folders=new Set([...prefixes,...paths.filter(p=>core.isVideo(p)||core.isPoster(p)).map(p=>p.split('/').slice(0,-1).join('/'))]);
  if(!folders.size)throw Error('請先確認實際 MP4 或影片資料夾');
  // folder 字串直接成為 Rules 路徑，拒絕可能改變 Rules 結構的特殊字元。
  for(const folder of folders)if(folder&&!/^[A-Za-z0-9_./-]+$/.test(folder))throw Error('此資料夾名稱需人工檢查後建立規則');
  const blocks=[...folders].sort().map(folder=>`    match /${folder?folder+'/':''}{file${folder?'=**':''}} {\n      allow get: if family() && resource.name.matches('.*[.]([mM][pP]4|[jJ][pP][eE]?[gG]|[pP][nN][gG]|[wW][eE][bB][pP])');\n    }`).join('\n');
  return `rules_version = '2';\nservice firebase.storage {\n  match /b/${core.bucket}/o {\n    function family() {\n      return request.auth != null && request.auth.uid in [${uids.map(v=>"'"+v+"'").join(', ')}];\n    }\n    // 白名單才可探索實際目錄；內容只開放下方已確認資料夾的影音及封面。\n    match /{path=**} {\n      allow list: if family();\n      allow create, update, delete: if false;\n    }\n${blocks}\n  }\n}\n`;
}
if(process.argv[1]&&new URL('file:///'+process.argv[1].replaceAll('\\','/')).pathname===new URL(import.meta.url).pathname){
 const [input,output='storage.rules']=process.argv.slice(2);if(!input)throw Error('用法：node tools/generate-storage-rules.mjs confirmed-storage.json storage.rules');
 await writeFile(output,generateRules(JSON.parse(await readFile(input,'utf8'))));console.log('已依實際路徑產生規則：'+output);
}
