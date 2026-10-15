// Point d'entrée : reprend la session si possible, sinon affiche la connexion.
import { deriverCle, exporterCle, importerCle, dechiffrer, MotDePasseIncorrect } from "./crypto.js";
import { demarrer } from "./app.js";

const SESSION = "cle-portefeuille";
const $ = id => document.getElementById(id);
const form = $("loginForm"), input = $("password"), toggle = form.querySelector(".cx-toggle"), bouton = form.querySelector(".cx-submit");

// sessionStorage peut être indisponible (navigation privée stricte) : on continue sans.
const lireSession = () => { try { return sessionStorage.getItem(SESSION); } catch { return null; } };
const ecrireSession = v => { try { v ? sessionStorage.setItem(SESSION, v) : sessionStorage.removeItem(SESSION); } catch { /* sans session */ } };

let enc;
async function chargerPortefeuille() {
  if (!enc) {
    const r = await fetch("data/portefeuille.enc", { cache: "no-cache" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    enc = await r.json();
  }
  return enc;
}

function ouvrir(donnees) {
  $("connexion").hidden = true;
  document.body.classList.remove("cx");
  $("app").classList.remove("hidden");
  demarrer(donnees, { deconnecter() { ecrireSession(null); location.reload(); } });
}

// Clé gardée d'une visite précédente dans cet onglet ; périmée si le portefeuille a été régénéré.
async function reprendre() {
  const cle = lireSession();
  if (!cle) return false;
  try {
    ouvrir(await dechiffrer(await chargerPortefeuille(), await importerCle(cle)));
    return true;
  } catch {
    ecrireSession(null);
    return false;
  }
}

toggle.addEventListener("click", () => {
  const voir = input.type === "password";
  input.type = voir ? "text" : "password";
  toggle.textContent = voir ? "Masquer" : "Afficher";
  toggle.setAttribute("aria-pressed", voir);
});
input.addEventListener("input", () => form.classList.remove("has-error", "load-error"));

form.addEventListener("submit", async e => {
  e.preventDefault();
  if (!input.value) { input.focus(); return; }
  bouton.disabled = true;
  form.classList.remove("has-error", "load-error");
  try {
    const p = await chargerPortefeuille();
    const cle = await deriverCle(input.value, p);
    const donnees = await dechiffrer(p, cle);
    ecrireSession(await exporterCle(cle));
    ouvrir(donnees);
  } catch (err) {
    form.classList.add(err instanceof MotDePasseIncorrect ? "has-error" : "load-error");
    input.focus();
    input.select();
  } finally {
    bouton.disabled = false;
  }
});

if (!(await reprendre())) {
  $("connexion").hidden = false;
  input.focus();
}
