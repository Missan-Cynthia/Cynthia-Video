import './firebase-shared.js';
const core=globalThis.KidsTubeCloud;
export async function scanStorageTree(readPage,{maxFolders=128,maxPages=200,prefixes=null}={}){
 const paths=[],visited=new Set(),queue=[''];let pages=0;
 while(queue.length){
  const folder=queue.shift();if(visited.has(folder))continue;
  if(visited.size>=maxFolders)throw Object.assign(Error('too many folders'),{code:'kidstube/limit'});
  visited.add(folder);let pageToken;
  do{
   if(++pages>maxPages)throw Object.assign(Error('too many pages'),{code:'kidstube/limit'});
   const page=await readPage(folder,pageToken);
   paths.push(...page.items.filter(path=>!prefixes||prefixes.some(prefix=>prefix===''?!path.includes('/'):path.startsWith(prefix+'/'))));
   queue.push(...page.prefixes.filter(folder=>!prefixes||prefixes.some(prefix=>prefix!==''&&(folder===prefix||folder.startsWith(prefix+'/')||prefix.startsWith(folder+'/')))));pageToken=page.nextPageToken;
  }while(pageToken);
 }
 return [...new Set(paths)].sort();
}
export async function catalogFromPaths(paths,readMetadata){
 const known=new Set(paths),refs=paths.filter(core.isVideo),result=[];let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,refs.length)},async()=>{
  while(cursor<refs.length){const path=refs[cursor++];try{result.push(core.itemFromMetadata(await readMetadata(path),known));}
   catch(error){if(error.code!=='storage/object-not-found'){error.kidstubeStage='metadata';throw error;}}
  }
 }));return result;
}
