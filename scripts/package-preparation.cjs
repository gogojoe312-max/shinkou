'use strict';
// Inputs are existing PRIVATE files outside this public repository. Only the
// authenticated ciphertext output is suitable for committing or publishing.
const fs=require('node:fs'),crypto=require('node:crypto'),path=require('node:path');
const {validateManifest}=require('../server/preparation-service.cjs');
const [sourcePath,keyPath,shaPath,outputPath]=process.argv.slice(2);
if(!sourcePath||!keyPath||!shaPath||!outputPath)throw Error('Usage: node scripts/package-preparation.cjs PRIVATE_MANIFEST PRIVATE_KEY PRIVATE_SHA ENCRYPTED_OUTPUT');
const raw=fs.readFileSync(sourcePath),encoded=fs.readFileSync(keyPath,'utf8').trim(),key=Buffer.from(encoded,'base64');
if(key.length!==32||key.toString('base64')!==encoded)throw Error('Invalid encryption key');
validateManifest(JSON.parse(raw.toString('utf8')));
const sourceSha=crypto.createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
if(sourceSha!==fs.readFileSync(shaPath,'utf8').trim())throw Error('Private source revision does not match');
const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,nonce);
cipher.setAAD(Buffer.from('utacheck-private-preparation:v1'));
const ciphertext=Buffer.concat([cipher.update(raw),cipher.final()]);
const bundle={app:'utacheck-encrypted-preparation',version:1,sourceSha,nonce:nonce.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(bundle)+'\n');
process.stdout.write(JSON.stringify({packaged:true,sourceSha,bytes:ciphertext.length})+'\n');
