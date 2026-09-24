'use strict';
const {createApp}=require('./app.cjs');
const server=createApp().listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log('Shinkou server ready'));
process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
