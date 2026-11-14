// Read-only public probes. No database, credentials, configuration or mail access.
import dns from 'node:dns/promises';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { pathToFileURL } from 'node:url';

const hosts = ['tapandwrap.net', 'www.tapandwrap.net'];
const safeError = error => ({ error: error.code || 'PROBE_FAILED' });
async function handshake(host, address, family, version) {
  return new Promise(resolve => {
    const socket = tls.connect({ host: address, family, servername: host, port: 443,
      rejectUnauthorized: true, minVersion: version, maxVersion: version, ALPNProtocols: ['h2','http/1.1'] });
    const finish = value => { socket.destroy(); resolve({ host, address, family, version, ...value }); };
    socket.setTimeout(8000, () => finish({error:'PROBE_TIMEOUT'}));
    socket.once('error', error => finish(safeError(error)));
    socket.once('secureConnect', () => { const cert=socket.getPeerCertificate(); finish({authorized:socket.authorized,
      protocol:socket.getProtocol(), alpn:socket.alpnProtocol, issuer:cert.issuer?.O, validFrom:cert.valid_from, validTo:cert.valid_to, names:cert.subjectaltname }); });
  });
}
async function redirectChain(start, family, records) {
  const chain=[]; let url=start;
  for(let i=0;i<5;i+=1) {
    const result=await new Promise(resolve => {
      // Pin the already inspected DNS result while retaining URL/SNI hostname.
      // Windows' system lookup can otherwise fail IPv6 before reaching the route.
      const lookup=(hostname,_options,callback)=>{
        const record=records.find(row=>row.host===hostname),addresses=family===6?record?.aaaa:record?.a;
        if(Array.isArray(addresses)&&addresses.length)callback(null,addresses[0],family);
        else callback(Object.assign(new Error(),{code:'NO_DNS_ADDRESS'}));
      };
      const request=(url.startsWith('https:')?https:http).request(url,{method:'HEAD',family,lookup,timeout:8000},res=>{
        res.resume();resolve({url,status:res.statusCode,location:res.headers.location||null,server:res.headers.server,
          hsts:res.headers['strict-transport-security']||null,altSvc:res.headers['alt-svc']||null,ray:res.headers['cf-ray']||null});
      });
      request.on('timeout',()=>request.destroy(Object.assign(new Error(),{code:'PROBE_TIMEOUT'})));
      request.on('error',error=>resolve({url,...safeError(error)}));request.end();
    });
    chain.push(result);if(!result.location)break;
    const next=new URL(result.location,url);if(!hosts.includes(next.hostname)){chain.push({error:'UNEXPECTED_REDIRECT_HOST'});break;}url=next.href;
  }
  return {start,family,chain};
}
export async function checkPublicHttps() {
  // Some Windows hosts block Node's UDP DNS while system DNS/HTTPS works.
  async function resolve(name, type) {
    try { return await (type==='A'?dns.resolve4(name):type==='AAAA'?dns.resolve6(name):dns.resolveNs(name)); }
    catch {
      const response=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,{headers:{accept:'application/dns-json'},signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw Object.assign(new Error(),{code:'DOH_FAILED'});
      const result=await response.json();return (result.Answer||[]).filter(row=>row.type===({A:1,AAAA:28,NS:2}[type])).map(row=>row.data.replace(/\.$/,''));
    }
  }
  const records=[];
  for(const host of hosts) {
    const [a,aaaa]=await Promise.all([resolve(host,'A').catch(safeError),resolve(host,'AAAA').catch(safeError)]);
    records.push({host,a,aaaa});
  }
  const nameservers=await resolve(hosts[0],'NS').catch(safeError), authoritative=[];
  if(Array.isArray(nameservers)) for(const ns of nameservers) {
    try { const resolver=new dns.Resolver({timeout:2000,tries:1});resolver.setServers([...(await resolve(ns,'A'))]);
      for(const host of hosts) authoritative.push({ns,host,a:await resolver.resolve4(host),aaaa:await resolver.resolve6(host)});
    } catch(error){authoritative.push({ns,...safeError(error)});}
  }
  const handshakes=await Promise.all(records.flatMap(({host,a,aaaa})=>[[a,4],[aaaa,6]].flatMap(([addresses,family])=>Array.isArray(addresses)?addresses.flatMap(ip=>['TLSv1.2','TLSv1.3'].map(version=>handshake(host,ip,family,version))):[])));
  const redirects=[];
  for(let repeat=0;repeat<3;repeat+=1) for(const family of [4,6]) for(const host of hosts) for(const scheme of ['http','https']) redirects.push(await redirectChain(`${scheme}://${host}/?https_probe=1`,family,records));
  return {at:new Date().toISOString(),nameservers,records,authoritative,handshakes,redirects,
    limitations:['This host is not the Samsung device or its carrier. IPv6 errors may be local egress restrictions. HTTP/3 and device Private DNS require separate evidence.']};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await checkPublicHttps(),null,2));
