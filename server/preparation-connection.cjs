'use strict';
// A dedicated private preparation credential must not enable or reconfigure
// unrelated production-data synchronization or member publication.
function preparationConnection(env){
 const dedicated=typeof env.PREPARATION_GITHUB_TOKEN==='string'&&env.PREPARATION_GITHUB_TOKEN.length>0;
 const token=dedicated?env.PREPARATION_GITHUB_TOKEN:env.GITHUB_TOKEN;
 const valid=typeof token==='string'&&token.length>0&&token.length<=8192&&!/[\x00-\x20\x7f]/.test(token);
 const fixed=(env.DATA_OWNER||'gogojoe312-max')==='gogojoe312-max'&&(env.DATA_REPO||'shinkou-data')==='shinkou-data'&&(env.DATA_BRANCH||'main')==='main';
 return {token,ready:valid&&(dedicated||fixed)};
}
module.exports={preparationConnection};
