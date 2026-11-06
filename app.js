// Clear Label — phone side of the app.
const ALLERGENS=[
 {id:"lactose",name:"Lactose",label:"Lactose intolerance",hint:"Lactose-free dairy (e.g. Lactofree) is usually fine"},
 {id:"milk",name:"Milk",label:"Milk allergy",hint:"All dairy, including lactose-free"},
 {id:"peanuts",name:"Peanuts",label:"Peanuts",hint:"Including groundnut and arachis oil"},
 {id:"treenuts",name:"Tree nuts",label:"Tree nuts",hint:"Almond, hazelnut, walnut, cashew, pecan, Brazil, pistachio, macadamia"},
 {id:"gluten",name:"Gluten",label:"Gluten (coeliac)",hint:"Wheat, barley, rye, oats unless gluten-free"},
 {id:"egg",name:"Egg",label:"Eggs",hint:""},
 {id:"soya",name:"Soya",label:"Soya",hint:""},
 {id:"sesame",name:"Sesame",label:"Sesame",hint:""},
 {id:"fish",name:"Fish",label:"Fish",hint:""},
 {id:"crustaceans",name:"Crustaceans",label:"Crustaceans",hint:"Prawns, crab, lobster"},
 {id:"molluscs",name:"Molluscs",label:"Molluscs",hint:"Mussels, squid, oysters"},
 {id:"mustard",name:"Mustard",label:"Mustard",hint:""},
 {id:"celery",name:"Celery",label:"Celery",hint:"Including celeriac"},
 {id:"lupin",name:"Lupin",label:"Lupin",hint:""},
 {id:"sulphites",name:"Sulphites",label:"Sulphites",hint:"Often in wine, dried fruit"}
];
const byId=Object.fromEntries(ALLERGENS.map(a=>[a.id,a]));
const $=s=>document.querySelector(s);
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
const store={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};

let profile=store.get("cl_profile",null);
let history=store.get("cl_history",[]);
let password=store.get("cl_pw","");
let busy=false;

// ---------- talking to the server ----------
async function api(path,body){
  let r;
  try{
    r=await fetch(path,{method:"POST",headers:{"content-type":"application/json","x-app-password":password},body:JSON.stringify(body)});
  }catch{throw{code:"offline"}}
  if(r.status===401){showLock(true);throw{code:"wrong_password"}}
  const j=await r.json().catch(()=>({error:"bad_answer"}));
  if(!r.ok||j.error)throw{code:j.error||"api_error"};
  return j;
}
const ERR={offline:"No internet connection. Check your signal and try again.",
  wrong_password:"Please enter the app code first.",
  busy:"Very busy just now. Please wait a minute and try again.",
  no_key:"The app isn’t set up yet (missing API key). Ask the person who set it up.",
  bad_answer:"Something went wrong reading that. Please try again."};
const errText=e=>ERR[e?.code]||"Couldn’t check that just now. Please try again.";

// ---------- screens ----------
function showLock(on){$("#lock").hidden=!on;if(on){["#setup","#check","#find","#result","#historyBox"].forEach(s=>$(s).hidden=true)}}
function showSetup(on){$("#setup").hidden=!on;["#check","#find","#result"].forEach(s=>$(s).hidden=on);$("#historyBox").hidden=on||!history.length}
$("#pwGo").onclick=async()=>{
  password=$("#pwIn").value.trim();$("#pwErr").hidden=true;
  try{await api("/api/check",{mode:"ping"}).catch(e=>{if(e.code==="wrong_password")throw e})}catch{$("#pwErr").hidden=false;showLock(true);return}
  store.set("cl_pw",password);showLock(false);start();
};

// ---------- profile ----------
function renderSetup(){
  const list=$("#allergenList");list.textContent="";
  const sel=new Set(profile?.allergens||["lactose"]);
  ALLERGENS.forEach(a=>{
    const l=el("label","opt");const i=el("input");i.type="checkbox";i.id="al-"+a.id;i.value=a.id;i.checked=sel.has(a.id);
    const s=el("span");s.append(el("b",null,a.label));if(a.hint)s.append(el("small",null,a.hint));
    l.append(i,s);list.append(l);
  });
  $("#strictMay").checked=profile?profile.strictMay:true;
}
function renderChips(){
  const c=$("#profileChips");c.textContent="";
  const ids=profile?.allergens||[];
  if(!ids.length){c.append(el("span","muted","No allergies set yet"));return}
  ids.forEach(id=>c.append(el("span","chip","Avoids: "+byId[id].name)));
}
$("#editProfile").onclick=()=>{stopScan();renderSetup();showSetup(true)};
$("#saveProfile").onclick=()=>{
  const ids=[...document.querySelectorAll("#allergenList input:checked")].map(i=>i.value);
  profile={allergens:ids,strictMay:$("#strictMay").checked};store.set("cl_profile",profile);
  renderChips();showSetup(false);clearFind();renderHistory();
  const m=el("p","saved","✓ Saved. Your choices stay saved when you close the app.");$("#check").prepend(m);setTimeout(()=>m.remove(),5000);
};

// ---------- verdict (decided here, not by the AI) ----------
const RANK={contains:3,may_contain:2,unclear:1,clear:0};
function overall(findings){
  const mine=findings.filter(f=>profile.allergens.includes(f.allergen));
  const worst=mine.reduce((m,f)=>Math.max(m,RANK[f.status]??1),0);
  const names=s=>mine.filter(f=>f.status===s).map(f=>byId[f.allergen]?.name).join(", ");
  if(worst===3)return{k:"bad",big:"Not safe for you",sub:"Contains: "+names("contains")};
  if(worst===2)return profile.strictMay?{k:"warn",big:"Risky – may contain",sub:"May contain: "+names("may_contain")}
    :{k:"good",big:"OK, but may contain traces",sub:"May contain: "+names("may_contain")};
  if(worst===1)return{k:"unsure",big:"Couldn’t be sure",sub:"Part of the information was unclear"};
  return{k:"good",big:"No listed allergens for you",sub:"Nothing you avoid was found"};
}
const STATUS_TEXT={contains:"CONTAINS",may_contain:"MAY CONTAIN",clear:"Not listed",unclear:"Unclear"};
const PILL={bad:"p-bad",warn:"p-warn",good:"p-good",unsure:"p-unsure"};
const SOURCE={database:"From the barcode",label:"Read from your photo",memory:"From the product name – check the pack"};

function renderResult(r){
  const box=$("#result");box.textContent="";
  const v=overall(r.findings||[]);
  const vb=el("div","verdict v-"+v.k);
  if(SOURCE[r.source])vb.append(el("span","tag",SOURCE[r.source]));
  vb.append(el("div","big",v.big));
  if(v.sub)vb.append(el("p",null,v.sub));
  if(r.image){const im=el("img","prodimg");im.src=r.image;im.alt="";vb.append(im)}
  if(r.product)vb.append(el("p",null,r.product));
  box.append(vb);

  const may=(r.findings||[]).filter(f=>f.status==="may_contain"&&profile.allergens.includes(f.allergen));
  if(may.length){
    const p=el("div","panel");
    p.append(el("h2",null,"What “may contain” means here"));
    p.append(el("p",null,"This food is made in a factory or on equipment that also handles "+may.map(f=>byId[f.allergen]?.name.toLowerCase()).join(" and ")+". Small amounts can get into the food by accident. The maker is warning you it isn’t guaranteed free from it."));
    p.append(el("p",null,"If your reaction is serious, do not eat it."));
    box.append(p);
  }
  const mine=(r.findings||[]).filter(f=>profile.allergens.includes(f.allergen)).sort((a,b)=>(RANK[b.status]??1)-(RANK[a.status]??1));
  if(mine.length){
    const fs=el("div","finds");
    mine.forEach(f=>{
      const d=el("div","find s-"+f.status);d.append(el("span","dot"));
      const t=el("b");t.append(el("span","st",STATUS_TEXT[f.status]||"Unclear"),document.createTextNode(" · "+(byId[f.allergen]?.label||f.allergen)));
      d.append(t);
      if(f.explain)d.append(el("span",null,f.explain));
      if(f.evidence)d.append(el("span","ev","On the label: “"+f.evidence+"”"));
      fs.append(d);
    });
    box.append(fs);
  }
  if(r.notes)box.append(el("p","note",r.notes));
  if(r.alternatives?.length){
    const p=el("div","panel");p.append(el("h2",null,v.k==="good"?"Similar options you could also try":"Safer options in UK shops"));
    const a=el("div","alts");
    r.alternatives.forEach(x=>{const d=el("div","alt");d.append(el("b",null,String(x.name||"")));
      if(x.why)d.append(el("span",null,String(x.why)));if(x.where)d.append(el("span","where","Found at: "+x.where));a.append(d)});
    p.append(a);p.append(el("p","note","Suggestions only – check the label in the shop, as recipes change."));
    box.append(p);
  }
}

// ---------- history ----------
function renderHistory(){
  const h=$("#hist");h.textContent="";
  $("#historyBox").hidden=!history.length||!$("#setup").hidden;
  history.slice(0,10).forEach(item=>{
    const b=el("button");b.type="button";const v=overall(item.r.findings||[]);
    b.append(el("span",null,item.r.product||"Unnamed product"),el("span","pill "+PILL[v.k],v.k==="bad"?"Not safe":v.k==="warn"?"May contain":v.k==="good"?"OK":"Unsure"));
    b.onclick=()=>{renderResult(item.r);$("#result").scrollIntoView({behavior:"smooth"})};h.append(b);
  });
}

// ---------- checking ----------
function setBusy(b){document.querySelectorAll("#check button, #check input, #find button").forEach(x=>x.disabled=b)}
function thinking(box,text){box.textContent="";const t=el("div","panel thinking");t.append(el("span","spin"),el("span",null,text));box.append(t)}
async function runCheck(body,label){
  if(busy)return;
  if(!profile){renderSetup();showSetup(true);return}
  busy=true;setBusy(true);
  const box=$("#result");thinking(box,label);box.scrollIntoView({behavior:"smooth",block:"start"});
  try{
    const r=await api("/api/check",{...body,profile});
    if(r.notFound){
      box.textContent="";const p=el("div","panel");
      p.append(el("h2",null,"Barcode not found"));
      p.append(el("p",null,"This product isn’t in the barcode database yet. Take a photo of the front and the ingredients instead – that works for any product."));
      box.append(p);return;
    }
    if(!Array.isArray(r.findings))throw{code:"bad_answer"};
    if(r.readable===false&&body.mode==="image")r.notes=(r.notes?r.notes+" ":"")+"Tip: add a photo of the front of the pack, or a close-up of the ingredients in good light.";
    if(body.mode==="image"&&r.readable!==false)clearTrayUI();
    renderResult(r);
    history.unshift({r,at:Date.now()});history=history.slice(0,30);store.set("cl_history",history);renderHistory();
  }catch(e){
    box.textContent="";const p=el("div","panel");p.append(el("p","err",errText(e)));box.append(p);
  }finally{busy=false;setBusy(false)}
}

// ---------- barcode scanner ----------
let scanner=null;
async function startScan(){
  if(busy)return;
  if(!window.Html5Qrcode){alert("The scanner didn’t load. Check your internet and reopen the app.");return}
  $("#scanner").hidden=false;$("#scanBtn").hidden=true;
  scanner=new Html5Qrcode("reader",{formatsToSupport:[
    Html5QrcodeSupportedFormats.EAN_13,Html5QrcodeSupportedFormats.EAN_8,Html5QrcodeSupportedFormats.UPC_A,Html5QrcodeSupportedFormats.UPC_E],verbose:false});
  try{
    await scanner.start({facingMode:"environment"},{fps:10,qrbox:(w,h)=>({width:Math.min(300,w*0.85),height:Math.min(150,h*0.5)})},
      async code=>{if(navigator.vibrate)navigator.vibrate(80);await stopScan();runCheck({mode:"barcode",barcode:code},"Looking up barcode "+code+"…")},()=>{});
  }catch{
    await stopScan();
    const box=$("#result");box.textContent="";const p=el("div","panel");
    p.append(el("p","err","The camera couldn’t start. Allow camera access for this app in Settings, or take a photo of the pack instead."));box.append(p);
  }
}
async function stopScan(){
  if(scanner){try{if(scanner.isScanning)await scanner.stop();scanner.clear()}catch{}scanner=null}
  $("#scanner").hidden=true;$("#scanBtn").hidden=false;
}
$("#scanBtn").onclick=startScan;$("#scanStop").onclick=stopScan;

// ---------- photos (shrunk on the phone before sending) ----------
let photos=[];const MAX=3;
function shrink(file){
  return new Promise((ok,bad)=>{
    const img=new Image();img.onload=()=>{
      const s=Math.min(1,1600/Math.max(img.width,img.height));
      const c=document.createElement("canvas");c.width=Math.round(img.width*s);c.height=Math.round(img.height*s);
      c.getContext("2d").drawImage(img,0,0,c.width,c.height);URL.revokeObjectURL(img.src);ok(c.toDataURL("image/jpeg",0.82));
    };img.onerror=bad;img.src=URL.createObjectURL(file);
  });
}
function renderTray(){
  const th=$("#thumbs");th.textContent="";
  photos.forEach((src,i)=>{const d=el("div","thumb");const im=el("img");im.alt="Photo "+(i+1);im.src=src;
    const x=el("button",null,"×");x.type="button";x.setAttribute("aria-label","Remove photo "+(i+1));x.onclick=()=>{photos.splice(i,1);renderTray()};
    d.append(im,x);th.append(d)});
  $("#tray").hidden=!photos.length;
  $("#camBtn").firstChild.textContent=photos.length?(photos.length<MAX?"Add another photo (e.g. the back)":"Photo limit reached"):"Take a photo of the pack";
  $("#checkGo").textContent=photos.length>1?"Check this product ("+photos.length+" photos)":"Check this product";
}
function clearTrayUI(){photos=[];renderTray()}
$("#camIn").onchange=async e=>{
  const f=e.target.files?.[0];e.target.value="";if(!f)return;
  try{photos=photos.concat(await shrink(f)).slice(-MAX);renderTray()}catch{}
};
$("#checkGo").onclick=()=>{if(photos.length)runCheck({mode:"image",images:photos.slice()},"Reading your photos… this can take up to 30 seconds")};
$("#clearTray").onclick=clearTrayUI;
$("#textGo").onclick=()=>{
  const v=$("#textIn").value.trim();if(!v)return;
  if(/^\d{8,14}$/.test(v.replace(/\s/g,"")))runCheck({mode:"barcode",barcode:v.replace(/\s/g,"")},"Looking up barcode…");
  else runCheck({mode:"text",text:v},"Checking…");
};

// ---------- find safe foods ----------
const CATS=["Milk & yoghurt","Cheese & butter","Chocolate & sweets","Biscuits & cakes","Bread & breakfast","Crisps & snacks","Ice cream & desserts","Ready meals & sauces"];
const findCache=store.get("cl_find",{});
function clearFind(){$("#findOut").textContent="";document.querySelectorAll("#cats button").forEach(b=>b.setAttribute("aria-pressed","false"))}
function renderCats(){
  const c=$("#cats");c.textContent="";
  CATS.forEach(name=>{const b=el("button",null,name);b.type="button";b.setAttribute("aria-pressed","false");
    b.onclick=()=>{document.querySelectorAll("#cats button").forEach(x=>x.setAttribute("aria-pressed",x===b?"true":"false"));runFind(name)};c.append(b)});
}
async function runFind(what){
  if(busy)return;
  const o=$("#findOut");
  if(!profile?.allergens?.length){o.textContent="";o.append(el("p","err","Set your allergies first using “My allergies” at the top."));return}
  const key=JSON.stringify([what.toLowerCase(),profile.allergens.slice().sort(),profile.strictMay]);
  const hit=findCache[key];
  let items=hit&&Date.now()-hit.at<7*864e5?hit.items:null; // reuse for a week: no cost
  if(!items){
    busy=true;setBusy(true);thinking(o,"Finding options for you…");
    try{items=(await api("/api/find",{what,profile})).items;findCache[key]={at:Date.now(),items};store.set("cl_find",findCache)}
    catch(e){o.textContent="";o.append(el("p","err",errText(e)));return}
    finally{busy=false;setBusy(false)}
  }
  o.textContent="";
  if(!items.length){o.append(el("p","err","No suggestions came back. Try a different food."));return}
  o.append(el("p","muted","For someone avoiding: "+profile.allergens.map(id=>byId[id].label).join(", ")));
  items.forEach(x=>{const d=el("div","rec");d.append(el("b",null,String(x.name||"")));
    if(x.why)d.append(el("span",null,String(x.why)));if(x.where)d.append(el("span","muted","Found at: "+x.where));
    if(x.check)d.append(el("span","muted","Check: "+x.check));o.append(d)});
  o.append(el("p","note","Suggestions only – always check the label in the shop, as recipes change."));
}
$("#findGo").onclick=()=>{const v=$("#findIn").value.trim();if(v){clearFind();runFind(v.slice(0,300))}};

// ---------- start ----------
function start(){
  renderCats();
  if(!profile){renderSetup();showSetup(true)}else{renderChips();showSetup(false);renderHistory()}
}
(async()=>{
  // find out if this app needs a code
  try{const r=await fetch("/api/check",{method:"POST",headers:{"content-type":"application/json","x-app-password":password},body:'{"mode":"ping"}'});
    if(r.status===401){showLock(true);return}}catch{}
  start();
})();
