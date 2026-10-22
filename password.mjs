import {randomBytes,scryptSync} from 'node:crypto';
let value='';
process.stderr.write('輸入至少 12 字元密碼（以標準輸入提供，輸入後按 Enter）：\n');
for await(const chunk of process.stdin){value+=chunk;if(value.includes('\n'))break;}
value=value.trim();if(value.length<12)throw Error('密碼至少 12 字元');
const salt=randomBytes(16).toString('hex');console.log(`${salt}:${scryptSync(value,salt,64).toString('hex')}`);
