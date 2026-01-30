#!/usr/bin/env node
console.log('🔍 FYND Backend Diagnostics');
try { console.log('Pods:', require('child_process').execSync('kubectl get pods --no-headers').toString()); } catch(e){}
console.log('\n✅ Full diagnosis requires agent context');
