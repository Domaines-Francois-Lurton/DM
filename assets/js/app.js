// Écran principal : état des filtres, rendu des vues, impression, export.
import { T } from "./textes.js";
import { STATUT, NATURE, ORGS, LI } from "./referentiels.js";
import {
  parseDate, preparerLignes, estPays, estOffice, paysCouverts, paysDeVente, prochaineEcheance,
  libellePays, isoPays, etiquettePays, correspond, ligneCsv, texteExcel, nomCorrespond,
} from "./logique.js";

const LANGUES = ["fr", "en", "es"];
const LOC = { fr: "fr-FR", en: "en-GB", es: "es-ES" };
const LV = { x: "hX", r: "hR", o: "hO", g: "hG" };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const tog = (s, v) => (s.has(v) ? s.delete(v) : s.add(v));
const cmp = (x, y) => (typeof x === "string" ? x.localeCompare(y, "fr") : x - y);

const TODAY = new Date(); TODAY.setHours(0, 0, 0, 0);
let DATA, ROWS, SALE;
let lang = "fr", view = "brands", open = new Set(), sortB = { k: "name", d: 1 }, sortD = { k: "ech", d: 1 };
const F = { q: "", pays: "", tit: "", statut: "", nature: "", horizon: new Set(), classe: new Set() };

const t = k => T[lang][k] ?? k;
const tr = (m, v) => (m[v] ? m[v][LI[lang]] : v);
const cName = p => libellePays(p, LI[lang]);
const flagImg = iso => (iso && !ORGS[iso] ? `<img src="assets/flags/${iso.toLowerCase()}.svg" alt="">` : "");
const fmt = d => (d ? d.toLocaleDateString(LOC[lang], { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
const match = r => correspond(r, F, LI[lang]);
const nameParts = m => { const x = m.match(/^(.*?)\s*\((.*)\)\s*$/); return x ? [x[1], x[2]] : [m, ""]; };
const visuel = nom => `data:image/jpeg;base64,${DATA.images[nom]}`;

// Langue : choix retenu, sinon celle du navigateur, sinon le français.
function langueInitiale() {
  try { const l = localStorage.getItem("langue"); if (LANGUES.includes(l)) return l; } catch { /* stockage indisponible */ }
  for (const l of navigator.languages || [navigator.language || ""]) {
    const c = String(l).slice(0, 2).toLowerCase();
    if (LANGUES.includes(c)) return c;
  }
  return "fr";
}
function choisirLangue(l) {
  lang = l;
  try { localStorage.setItem("langue", l); } catch { /* stockage indisponible */ }
  i18n(); filtersUI(); render();
}

function brands(rows) {
  const m = new Map(); rows.forEach(r => { (m.get(r.marque) || m.set(r.marque, []).get(r.marque)).push(r); });
  return [...m].map(([name, rs]) => {
    const [n, v] = nameParts(name);
    // offices (UE, Benelux, OAPI) en premier, puis pays par ordre alphabétique ; l'OMPI n'est pas un pays
    const ctry = [...new Set(rs.map(r => r.pays).filter(estPays))].sort((a, b) => (estOffice(b) - estOffice(a)) || cName(a).localeCompare(cName(b), lang));
    return { name, n, v, rows: rs, next: prochaineEcheance(rs), ctry, tit: [...new Set(rs.map(r => r.tit))], img: (rs.find(r => r.img) || {}).img || "" };
  });
}

function langSwitch(el){
  el.innerHTML=["fr","en","es"].map(l=>`<button type="button" class="${l===lang?"on":""}" data-l="${l}" aria-pressed="${l===lang}">${l.toUpperCase()}</button>`).join("");
  el.querySelectorAll("button").forEach(b=>b.onclick=()=>choisirLangue(b.dataset.l));
}
function i18n(){
  document.documentElement.lang=lang;
  document.querySelectorAll("[data-i18n]").forEach(e=>e.textContent=t(e.dataset.i18n));
  $("q").placeholder=t("search");$("q").setAttribute("aria-label",t("search"));
  langSwitch($("langs"));
    $("asof").textContent=`${t("asof")} ${parseDate(DATA.asof).toLocaleDateString(LOC[lang],{day:"numeric",month:"long",year:"numeric"})}`;
}
function sel(el,vals,lab,cur){el.innerHTML=`<option value="">${t("all")}</option>`+vals.map(v=>`<option value="${esc(v)}"${v===cur?" selected":""}>${esc(lab(v))}</option>`).join("")}
function filtersUI(){
  sel($("fPays"),[...SALE].sort((a,b)=>cName(a).localeCompare(cName(b),lang)),cName,F.pays);
  sel($("fTit"),[...new Set(ROWS.map(r=>r.tit))].sort((a,b)=>a.localeCompare(b,"fr")),v=>v,F.tit);
  sel($("fStatut"),Object.keys(STATUT),v=>tr(STATUT,v),F.statut);
  sel($("fNature"),Object.keys(NATURE),v=>tr(NATURE,v),F.nature);
  $("fHorizon").innerHTML=`<span class="lbl">${t("colDeadline")}</span>`+["x","r","o","g"].map(k=>`<button class="chip ${F.horizon.has(k)?"on":""}" data-k="${k}" aria-pressed="${F.horizon.has(k)}">${t(LV[k])}</button>`).join("");
  $("fHorizon").querySelectorAll("button").forEach(b=>b.onclick=()=>{tog(F.horizon,b.dataset.k);filtersUI();render()});
  $("fClasse").innerHTML=`<span class="lbl">${t("classes")}</span>`+[...new Set(ROWS.flatMap(r=>r.cls))].sort((a,b)=>a-b).map(c=>`<button class="chip ${F.classe.has(c)?"on":""}" data-k="${c}" aria-pressed="${F.classe.has(c)}">${c}</button>`).join("");
  $("fClasse").querySelectorAll("button").forEach(b=>b.onclick=()=>{tog(F.classe,b.dataset.k);filtersUI();render()});
}
const badge=r=>r&&r.ech?`<span class="badge b-${r.lvl}">${fmt(r.ech)}</span>`:`<span class="badge b-n">—</span>`;
const cc=p=>{const iso=isoPays(p);return`<span class="cc ${ORGS[iso]?"org":""}" title="${esc(cName(p))}">${flagImg(iso)}${esc(etiquettePays(p,LI[lang]))}</span>`};
const flagCell=p=>flagImg(isoPays(p))||(ORGS[isoPays(p)]?`<span class="cc org">${ORGS[isoPays(p)]}</span>`:"");

function facts(rows){
  const nb=new Set(rows.map(r=>r.marque)).size,nc=paysCouverts(rows).size;
  const n=k=>rows.filter(r=>r.lvl===k).length;
  const one=k=>F.horizon.size===1&&F.horizon.has(k);
  const col={x:"red",r:"red",o:"amber"};
  $("facts").innerHTML=[["fBrands",nb,""],["fCountries",nc,""],["fX",n("x"),"x"],["fR",n("r"),"r"],["fO",n("o"),"o"]].map(([l,v,k])=>
    `<div class="fact glass ${k&&one(k)?"on":""}" ${k?`data-k="${k}" role="button" tabindex="0"`:""}><dt>${t(l)}</dt><dd${k?` style="color:var(--${col[k]})"`:""}>${v}</dd></div>`).join("");
  $("facts").querySelectorAll(".fact[data-k]").forEach(f=>{const go=()=>{const k=f.dataset.k,on=one(k);F.horizon.clear();if(!on)F.horizon.add(k);view="deadlines";filtersUI();render()};f.onclick=go;f.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();go()}}});
}

function render(){
  const rows=ROWS.filter(match);
  const B=brands(rows);
  const nDead=rows.filter(r=>r.ech).length;
  $("tabs").innerHTML=[["brands","navBrands",B.length],["deadlines","navDeadlines",nDead]].map(([v,l,n])=>`<button type="button" class="${view===v?"on":""}" data-v="${v}" aria-pressed="${view===v}">${t(l)}<span class="n">${n}</span></button>`).join("");
  $("tabs").querySelectorAll("button").forEach(b=>b.onclick=()=>{view=b.dataset.v;render()});
  $("pageTitle").textContent=t(view==="brands"?"tBrands":"tDeadlines");
  $("secTitle").textContent=t(view==="brands"?"secBrands":"secDeadlines");
  $("secCount").textContent=`(${view==="brands"?B.length:nDead})`;
  facts(ROWS.filter(r=>!F.q||match(r)));
  if(!rows.length){$("results").innerHTML=`<div class="list glass"><p class="empty">${t("none")}</p></div>`;return}
  view==="brands"?renderBrands(B):renderDeadlines(rows);
}

function renderBrands(B){
  const key={name:b=>b.name,tit:b=>b.tit[0],nb:b=>b.ctry.length,next:b=>b.next?+b.next.ech:9e15}[sortB.k];
  // pendant une recherche, les marques dont le nom correspond passent en tête ; le tri choisi s'applique dans chaque groupe
  const nom=b=>F.q?+nomCorrespond(b.name,F.q):0;
  B.sort((a,b)=>(nom(b)-nom(a))||cmp(key(a),key(b))*sortB.d);
  const h=(k,l)=>`<button data-k="${k}">${t(l)} <span class="arr">${sortB.k===k?(sortB.d>0?"↑":"↓"):""}</span></button>`;
  $("results").innerHTML=`<div class="list glass">
    <div class="list-head cols">${h("name","colBrand")}${h("tit","colHolder")}<span>${t("colCountries")}</span>${h("nb","colNb")}${h("next","colNext")}<span></span></div>
    ${B.map(b=>{const isOpen=open.has(b.name);
      return`<div class="row ${isOpen?"open":""}" data-b="${esc(b.name)}">
        <button class="row-head cols" aria-expanded="${isOpen}">
          <span class="r-name"><span class="n">${esc(b.n)}</span>${b.v?`<span class="v">${esc(b.v)}</span>`:""}</span>
          <span class="r-tit" title="${esc(b.tit.join(", "))}">${esc(b.tit.join(", "))}</span>
          <span class="ctry">${b.ctry.map(cc).join("")}<span class="cc more" hidden></span></span>
          <span class="r-nb">${b.ctry.length}</span>
          <span class="r-next">${badge(b.next)}${b.next?`<span class="k">${esc(cName(b.next.pays))} · ${esc(tr(NATURE,b.next.nature))}</span>`:""}</span>
          <svg class="chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>
        </button>
        ${isOpen?detail(b):""}
      </div>`}).join("")}
  </div>`;
  fitFlags();
  $("results").querySelectorAll(".list-head button").forEach(x=>x.onclick=()=>{const k=x.dataset.k;sortB={k,d:sortB.k===k?-sortB.d:1};render()});
  $("results").querySelectorAll(".row-head").forEach(x=>x.onclick=()=>{tog(open,x.parentElement.dataset.b);render()});
}

/* Drapeaux : deux lignes au plus. Les pays qui ne tiennent pas sont résumés par « +N » sur la deuxième ligne. */
function fitFlags(){
  document.querySelectorAll(".ctry").forEach(box=>{
    const chips=[...box.querySelectorAll(".cc:not(.more)")],more=box.querySelector(".more");
    chips.forEach(c=>c.hidden=false);more.hidden=true;
    const top=chips[0]?.offsetTop??0,rowH=(chips[0]?.offsetHeight??22)+4;
    const fits=el=>el.offsetTop-top<rowH*2-2;
    if(chips.every(fits))return;
    more.hidden=false;
    let n=chips.length;
    while(n>0&&(!fits(chips[n-1])||!fits(more))){n--;chips[n].hidden=true;more.textContent="+"+(chips.length-n)}
    more.textContent="+"+(chips.length-n);
    while(n>0&&!fits(more)){n--;chips[n].hidden=true;more.textContent="+"+(chips.length-n)}
  });
}
let rz;addEventListener("resize",()=>{clearTimeout(rz);rz=setTimeout(fitFlags,120)});
document.fonts?.ready.then(()=>fitFlags());

function detail(b){
  // une ligne par territoire (pays + voie internationale ou non) ; ses échéances sont regroupées
  const g=new Map();b.rows.forEach(r=>{const k=r.pays+"|"+r.madrid;(g.get(k)||g.set(k,[]).get(k)).push(r)});
  const terr=[...g.values()].map(x=>x.sort((a,c)=>(a.ech||9e15)-(c.ech||9e15))).sort((a,c)=>cName(a[0].pays).localeCompare(cName(c[0].pays),lang));
  return`<div class="row-body">
    <div class="d-meta">
      ${b.img?`<div><span class="k">${t("visual")}</span><div class="d-visual"><img src="${visuel(b.img)}" alt=""></div></div>`:""}
      <div><span class="k">${t("colHolder")}</span>${esc(b.tit.join(", "))}</div>
      <div><span class="k">${t("classes")}</span>${esc([...new Set(b.rows.flatMap(r=>r.cls))].join(", "))}</div>
      <div><span class="k">${t("colNb")}</span>${b.ctry.length}</div>
    </div>
    <div class="table-wrap"><table class="matrix">
      <thead><tr><th>${t("colCountry")}</th><th>${t("colStatus")}</th><th>${t("colFiling")}</th><th>${t("colReg")}</th><th>${t("classes")}</th><th>${t("colDeadline")}</th><th>${t("colFile")}</th></tr></thead>
      <tbody>${terr.map(x=>{const r=x[0];return`<tr>
        <td><span class="p">${flagCell(r.pays)}${esc(cName(r.pays))}</span>${r.madrid||(F.pays&&r.pays!==F.pays)?`<span class="cell-tags">${r.madrid?`<span class="tag" title="${esc(t("intlTip"))} ${esc(r.numDepot)}">${t("madrid")}</span>`:""}${F.pays&&r.pays!==F.pays?`<span class="tag tag-via">${t("covers")} ${esc(cName(F.pays))}</span>`:""}</span>`:""}</td>
        <td data-l="${t("colStatus")}">${esc(tr(STATUT,r.statut))}${r.statut==="Dépôt"?`<span class="cell-tags"><span class="tag tag-amber">${t("pending")}</span></span>`:""}</td>
        <td class="nw" data-l="${t("colFiling")}">${esc(r.designation||r.depot||"—")}<span class="sub">${esc(r.numDepot)}</span></td>
        <td class="nw" data-l="${t("colReg")}">${esc(r.enreg||"—")}<span class="sub">${esc(r.numEnreg)}</span></td>
        <td data-l="${t("classes")}">${esc(r.classes)}</td>
        <td data-l="${t("colDeadline")}"><span class="echs">${x.map(e=>`<span class="ech">${badge(e)}<span class="sub">${esc(tr(NATURE,e.nature))}</span></span>`).join("")}</span></td>
        <td class="dim nw" data-l="${t("colFile")}">${esc(r.dossier)}</td></tr>`}).join("")}</tbody>
    </table></div>
  </div>`;
}

function renderDeadlines(rows){
  rows=rows.filter(r=>r.ech);
  const key={ech:r=>+r.ech,marque:r=>r.marque,pays:r=>cName(r.pays),nature:r=>tr(NATURE,r.nature)}[sortD.k];
  rows.sort((a,b)=>cmp(key(a),key(b))*sortD.d);
  const h=(k,l)=>`<th data-k="${k}">${t(l)} <span style="color:var(--accent)">${sortD.k===k?(sortD.d>0?"↑":"↓"):""}</span></th>`;
  $("results").innerHTML=`<div class="table-wrap glass" style="background:var(--surface)"><table class="matrix full">
    <thead><tr>${h("ech","colDeadline")}${h("marque","colBrand")}${h("pays","colCountry")}${h("nature","nature")}<th>${t("colStatus")}</th><th>${t("colRegNo")}</th></tr></thead>
    <tbody>${rows.map(r=>`<tr data-b="${esc(r.marque)}">
      <td class="nw">${badge(r)}</td><td class="bn">${esc(r.marque)}</td>
      <td><span class="p">${flagCell(r.pays)}${esc(cName(r.pays))}</span>${r.madrid||(F.pays&&r.pays!==F.pays)?`<span class="cell-tags">${r.madrid?`<span class="tag" title="${esc(t("intlTip"))} ${esc(r.numDepot)}">${t("madrid")}</span>`:""}${F.pays&&r.pays!==F.pays?`<span class="tag tag-via">${t("covers")} ${esc(cName(F.pays))}</span>`:""}</span>`:""}</td>
      <td data-l="${t("nature")}">${esc(tr(NATURE,r.nature))}</td><td data-l="${t("colStatus")}">${esc(tr(STATUT,r.statut))}${r.statut==="Dépôt"?`<span class="cell-tags"><span class="tag tag-amber">${t("pending")}</span></span>`:""}</td><td class="dim nw" data-l="${t("colRegNo")}">${esc(r.numEnreg||r.numDepot)}</td></tr>`).join("")}</tbody>
  </table></div>`;
  $("results").querySelectorAll("th[data-k]").forEach(x=>x.onclick=()=>{const k=x.dataset.k;sortD={k,d:sortD.k===k?-sortD.d:1};render()});
  $("results").querySelectorAll("tbody tr").forEach(x=>x.onclick=()=>{open=new Set([x.dataset.b]);view="brands";render();document.querySelector(".row.open")?.scrollIntoView({block:"center"})});
}

/* ============ Impression et export de la liste filtrée ============ */
function filtersSummary(){
  const f=[];
  if(F.q.trim())f.push(`${t("search_")} : « ${F.q.trim()} »`);
  if(F.pays)f.push(`${t("country")} : ${cName(F.pays)}`);
  if(F.tit)f.push(`${t("holder")} : ${F.tit}`);
  if(F.statut)f.push(`${t("status")} : ${tr(STATUT,F.statut)}`);
  if(F.nature)f.push(`${t("nature")} : ${tr(NATURE,F.nature)}`);
  if(F.horizon.size)f.push(`${t("colDeadline")} : ${[...F.horizon].map(k=>t(LV[k])).join(", ")}`);
  if(F.classe.size)f.push(`${t("classes")} : ${[...F.classe].join(", ")}`);
  return f.length?f.join(" · "):t("noFilter");
}
const sortedRows=()=>ROWS.filter(match).sort((a,b)=>a.marque.localeCompare(b.marque,"fr")||cName(a.pays).localeCompare(cName(b.pays),lang)||((a.ech||0)-(b.ech||0)));
function printList(){
  const rows=sortedRows();
  $("print").innerHTML=`<header><div><h1>${t("tBrands")}</h1><p class="meta">${esc($("asof").textContent)} · ${t("printed")} ${fmt(TODAY)}</p><p class="meta">${esc(filtersSummary())}</p></div><img src="assets/img/logo-fl.png" alt="François Lurton"></header>
    <table><thead><tr><th>${t("colBrand")}</th><th>${t("colCountry")}</th><th>${t("colStatus")}</th><th>${t("colRegNo")}</th><th>${t("classes")}</th><th>${t("colDeadline")}</th><th>${t("nature")}</th></tr></thead>
    <tbody>${rows.map(r=>`<tr><td class="b">${esc(r.marque)}</td><td>${esc(cName(r.pays))}${r.madrid?` (${t("madrid")})`:""}</td><td>${esc(tr(STATUT,r.statut))}</td><td>${esc(r.numEnreg||r.numDepot)}</td><td>${esc(r.classes)}</td><td>${fmt(r.ech)}${r.lvl==="x"?` (${t("hX")})`:""}</td><td>${esc(tr(NATURE,r.nature))}</td></tr>`).join("")}</tbody></table>`;
  window.print();
}
function exportList(){
  const rows=sortedRows();
  const head=[t("colBrand"),t("colHolder"),t("colCountry"),t("madrid"),t("colStatus"),t("colFiling"),t("filingNo"),t("colReg"),t("colRegNo"),t("classes"),t("colDeadline"),t("nature"),t("colFile")];
  const lines=rows.map(r=>[r.marque,r.tit,cName(r.pays),r.madrid?"x":"",tr(STATUT,r.statut),r.designation||r.depot,texteExcel(r.numDepot),r.enreg,texteExcel(r.numEnreg),r.classes,r.ech?fmt(r.ech):"",tr(NATURE,r.nature),texteExcel(r.dossier)]);
  // point-virgule + BOM UTF-8 : Excel l'ouvre directement avec les accents
  const csv="\uFEFF"+[head,...lines].map(ligneCsv).join("\r\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const ymd=[TODAY.getFullYear(),String(TODAY.getMonth()+1).padStart(2,"0"),String(TODAY.getDate()).padStart(2,"0")].join("-");
  a.download=`depots-de-marques-${ymd}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

export function demarrer(donnees, { deconnecter }) {
  DATA = donnees;
  ROWS = preparerLignes(DATA.rows, TODAY);
  SALE = paysDeVente(ROWS);
  lang = langueInitiale();

  $("btnPrint").onclick = printList;
  $("btnExport").onclick = exportList;
  $("fPays").onchange = e => { F.pays = e.target.value; render(); };
  $("fTit").onchange = e => { F.tit = e.target.value; render(); };
  $("fStatut").onchange = e => { F.statut = e.target.value; render(); };
  $("fNature").onchange = e => { F.nature = e.target.value; render(); };
  $("q").oninput = e => { F.q = e.target.value; render(); };
  $("reset").onclick = () => { Object.assign(F, { q: "", pays: "", tit: "", statut: "", nature: "" }); F.horizon.clear(); F.classe.clear(); $("q").value = ""; filtersUI(); render(); };
  $("logout").onclick = deconnecter;
  // « / » place le curseur dans la recherche, « Échap » l'efface
  document.addEventListener("keydown", e => {
    const busy = document.activeElement && document.activeElement !== document.body;
    if (e.key === "/" && !busy) { e.preventDefault(); $("q").focus(); }
    else if (e.key === "Escape" && document.activeElement === $("q")) { $("q").value = ""; F.q = ""; render(); }
  });

  i18n(); filtersUI(); render();
  fitFlags();
}
