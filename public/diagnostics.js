import {createFirebaseClient} from './firebase-client.js?diagnostic=1';
const output=document.getElementById('result'),button=document.getElementById('run');
const line=text=>{output.textContent+=text+'\n';};
let client;
try{
 client=await createFirebaseClient(globalThis.KIDSTUBE_SETTINGS,()=>{});await client.ready;
 line('頁面來源：'+location.origin);line('播放服務：'+(navigator.serviceWorker.controller?.scriptURL||'未控制此頁'));
 if(!client.user){line('尚未登入：請先回影片首頁登入，再重新開此頁。');button.textContent='請先登入';}
 else{button.disabled=false;button.textContent='開始連線測試';}
}catch(error){line('初始化失敗：'+(error.code||error.name)+' '+error.message);}
button.onclick=async()=>{
 button.disabled=true;line('開始測試…');
 let item;
 try{const items=await client.catalog();line('片單與 metadata：成功，共 '+items.length+' 部影片');item=items[0];if(!item)throw Error('沒有可測試的影片');line('測試影片大小：'+Math.round(item.size/1024/1024)+' MiB');}
 catch(error){line('片單失敗：'+(error.code||error.name)+' '+error.message);button.disabled=false;return;}
 const endpoint='https://firebasestorage.googleapis.com/v0/b/'+KidsTubeCloud.bucket+'/o/'+encodeURIComponent(item.path)+'?alt=media';
 for(const ranged of [false,true]){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000),label=ranged?'直接讀取（Range 0–0）':'直接讀取（無 Range）';
  try{const headers={Authorization:'Firebase '+await client.token()};if(ranged)headers.Range='bytes=0-0';
   const response=await fetch(endpoint,{headers,credentials:'omit',signal:controller.signal});
   line(label+'：HTTP '+response.status+'；類型 '+response.type+'；Content-Type '+response.headers.get('Content-Type')+'；Content-Range '+response.headers.get('Content-Range'));
   if(!response.ok)line('伺服器訊息：'+(await response.text()).slice(0,500));else await response.body?.cancel();
  }catch(error){line(label+'：'+error.name+' '+error.message);}finally{clearTimeout(timer);}
 }
 line('官方 SDK 小範圍讀取：測試中（最多約 15 秒）…');
 try{const blob=await client.videoBlob(item.path,true);line('官方 SDK 小範圍讀取：成功，'+blob.size+' bytes');}
 catch(error){line('官方 SDK 小範圍讀取：'+(error.code||error.name)+' '+error.message);}
 line('測試結束。請將以上結果貼回聊天。');button.disabled=false;
};
