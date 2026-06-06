// Ekran görüntüsündeki 5 siparişin paket verisini çek, net'i yeniden üretmeye çalış.
import { readFileSync } from "node:fs";
const env = {};
const raw = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of raw.split(/\r?\n/)) { const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if(m) env[m[1]]=m[2].replace(/^["']|["']$/g,""); }
const supplierId=env.TRENDYOL_SUPPLIER_ID;
const baseUrl=(env.TRENDYOL_API_BASE_URL??"https://api.tgoapis.com").replace(/\/$/,"");
const token=env.TRENDYOL_API_TOKEN??Buffer.from(`${env.TRENDYOL_API_KEY}:${env.TRENDYOL_API_SECRET}`).toString("base64");
const headers={Authorization:`Basic ${token}`,"User-Agent":`${supplierId} - SelfIntegration`,"x-agentname":env.TRENDYOL_AGENT_NAME??"PaketSiparis","x-executor-user":env.TRENDYOL_EXECUTOR_USER??"system@local",Accept:"application/json"};
async function get(p){const r=await fetch(`${baseUrl}${p}`,{headers});const t=await r.text();if(!r.ok)throw new Error(`${r.status}: ${t.slice(0,150)}`);return t?JSON.parse(t):null;}
const DAY=86400000, now=Date.now();

// Ekrandan beklenenler: orderNumber -> {tutar, indirim, komisyon, net, marka}
const expected = {
  "11295282405": {tutar:820, indirim:260, komisyon:57.12, net:502.88, marka:"Multinet"},
  "11295127373": {tutar:915, indirim:225, komisyon:95.23, net:594.77, marka:"Edenred"},
  "11295097360": {tutar:1276,indirim:250, komisyon:141.58,net:884.42, marka:"Edenred"},
  "11294396376": {tutar:799, indirim:200, komisyon:82.66, net:516.34, marka:"Multinet"},
  "11294252130": {tutar:618, indirim:200, komisyon:57.68, net:360.32, marka:"Pluxee (Sodexo)"},
};

let pg=0; const found={};
while(true){
  const d=await get(`/integrator/order/meal/suppliers/${supplierId}/packages?packageModificationStartDate=${now-60*DAY}&packageModificationEndDate=${now}&page=${pg}&size=50`);
  for(const p of (d.content??[])){ if(expected[p.orderNumber]) found[p.orderNumber]=p; }
  if(pg>=(d.totalPages??1)-1)break; pg++;
}

for(const on of Object.keys(expected)){
  const p=found[on]; const ex=expected[on];
  console.log(`\n═══ ${on}  (${ex.marka}) ═══`);
  console.log(`  EKRAN: tutar=${ex.tutar}  indirim=${ex.indirim}  komisyon=${ex.komisyon}  NET=${ex.net}`);
  if(!p){ console.log("  ⚠ paket bulunamadı"); continue; }
  console.log(`  PAKET: totalPrice=${p.totalPrice}  status=${p.packageStatus}`);
  // Satır fiyatları
  let linesSum=0, sellingSum=0;
  for(const l of (p.lines??[])){
    const qty=l.items?.length??1;
    linesSum += (l.price??0)*qty;
    sellingSum += (l.unitSellingPrice??0)*qty;
    console.log(`    line "${l.name}" x${qty}  price=${l.price}  unitSellingPrice=${l.unitSellingPrice}  mods=${(l.modifierProducts??[]).map(m=>m.price).join("+")||0}`);
  }
  console.log(`    Σ price×qty=${linesSum}   Σ sellingPrice×qty=${sellingSum}`);
  // payment objesi tam dök
  console.log(`    payment=${JSON.stringify(p.payment)}`);
  // Tüm üst düzey anahtarlar (indirim/promosyon alanı var mı?)
  console.log(`    keys: ${Object.keys(p).join(", ")}`);
  // İndirim/promosyon içeren alan var mı?
  for(const k of Object.keys(p)){
    if(/discount|promo|coupon|indirim|campaign/i.test(k)) console.log(`    >> ${k} = ${JSON.stringify(p[k])}`);
  }
}
