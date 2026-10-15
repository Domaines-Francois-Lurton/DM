// Fonctions pures, sans accès à la page : testées sous Node (tests/logique.test.js).
import { C, MEMBRES, NON_PAYS, ORGS } from "./referentiels.js";

export const parseDate = s => { if (!s) return null; const [d, m, y] = s.split("/"); return new Date(+y, +m - 1, +d); };

// Ajoute n mois calendaires ; un jour absent du mois cible devient le dernier jour du mois (31/08 + 6 mois = 28/02).
export function ajouterMois(d, n) {
  const dernier = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), dernier));
}

// x = échue, r = < 6 mois, o = 6 à 18 mois, g = > 18 mois, n = pas d'échéance
export function niveau(echeance, aujourdhui) {
  if (!echeance) return "n";
  if (echeance < aujourdhui) return "x";
  if (echeance < ajouterMois(aujourdhui, 6)) return "r";
  if (echeance < ajouterMois(aujourdhui, 18)) return "o";
  return "g";
}

export const sansAccents = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/* Titulaires : les variantes d'écriture sont regroupées (casse, accents, ponctuation, forme juridique S.L., S.A., SAS, SARL).
   Le libellé affiché est la variante la plus fréquente. */
export const cleTitulaire = nom => sansAccents(nom).toUpperCase().replace(/[.,]/g, " ").replace(/\s+/g, " ").trim()
  .replace(/ (S ?L|S ?A|SAS|SARL)$/, "");

export function libellesTitulaires(lignes) {
  const n = new Map();
  for (const r of lignes) {
    const v = r.titulaire.trim(), k = cleTitulaire(v);
    if (!n.has(k)) n.set(k, new Map());
    n.get(k).set(v, (n.get(k).get(v) || 0) + 1);
  }
  return new Map([...n].map(([k, vs]) => [k, [...vs].sort((a, b) => b[1] - a[1])[0][0]]));
}

export function preparerLignes(rows, aujourdhui) {
  const lib = libellesTitulaires(rows);
  return rows.map((r, i) => {
    const ech = parseDate(r.echeance);
    return { ...r, i, tit: lib.get(cleTitulaire(r.titulaire)), ech, lvl: niveau(ech, aujourdhui), cls: r.classes.split(",").filter(Boolean) };
  });
}

/* Couverture : un pays est couvert par un dépôt national, une désignation Madrid,
   ou un dépôt auprès d'un office régional dont il est membre (UE, Benelux, OAPI). */
export const couvre = (r, p) => r.pays === p || (MEMBRES[r.pays] || []).includes(p);
export const estPays = p => !NON_PAYS.includes(p);
export const estOffice = p => !!MEMBRES[p];

export function paysCouverts(lignes) {
  const s = new Set();
  for (const r of lignes) {
    if (estPays(r.pays) && !estOffice(r.pays)) s.add(r.pays);
    (MEMBRES[r.pays] || []).forEach(m => s.add(m));
  }
  return s;
}

export function paysDeVente(lignes) {
  const s = new Set(lignes.map(r => r.pays).filter(estPays));
  lignes.forEach(r => (MEMBRES[r.pays] || []).forEach(m => s.add(m)));
  return [...s];
}

// La plus ancienne, échues comprises : une échéance passée reste visible tant qu'elle n'est pas traitée.
export const prochaineEcheance = lignes => lignes.filter(r => r.ech).sort((a, b) => a.ech - b.ech)[0] || null;

// Un pays absent du référentiel garde son nom brut de l'Excel, sans drapeau.
export const libellePays = (p, li) => (C[p] ? C[p][1 + li] : p);
export const isoPays = p => (C[p] ? C[p][0] : "");
// Texte de la pastille : sigle de l'office (OAPI, BX), code ISO, sinon nom brut.
export const etiquettePays = (p, li) => { const iso = isoPays(p); return ORGS[iso] || iso || libellePays(p, li); };

// Vrai si la recherche figure dans le nom de la marque (pour classer ces marques en tête des résultats).
export const nomCorrespond = (marque, q) => { const n = sansAccents(q).trim(); return !!n && sansAccents(marque).includes(n); };

export function correspond(r, F, li) {
  if (F.pays && !couvre(r, F.pays)) return false;
  if (F.tit && r.tit !== F.tit) return false;
  if (F.statut && r.statut !== F.statut) return false;
  if (F.nature && r.nature !== F.nature) return false;
  if (F.horizon.size && !F.horizon.has(r.lvl)) return false;
  if (F.classe.size && !r.cls.some(c => F.classe.has(c))) return false;
  if (F.q) {
    const q = sansAccents(F.q).trim();
    const texte = [r.marque, r.pays, libellePays(r.pays, li), isoPays(r.pays), r.numDepot, r.numEnreg, r.dossier, r.tit].join(" ");
    if (!sansAccents(texte).includes(q)) return false;
  }
  return true;
}

// CSV pour Excel : chaque champ entre guillemets, guillemets doublés, séparateur point-virgule.
export const ligneCsv = valeurs => valeurs.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";");

// Excel lit un champ CSV numérique comme un nombre et perd les zéros initiaux (EUTM 018805347) : ="…" le garde en texte.
export const texteExcel = v => (v ? `="${v}"` : "");
