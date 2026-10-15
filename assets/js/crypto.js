// Déchiffrement de data/portefeuille.enc (AES-256-GCM, clé PBKDF2-SHA256), produit par outils/generer.py.
const deB64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const versB64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));

export class MotDePasseIncorrect extends Error {
  constructor() { super("mot de passe incorrect"); this.name = "MotDePasseIncorrect"; }
}

export async function deriverCle(motDePasse, enc) {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(motDePasse), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: deB64(enc.sel), iterations: enc.iter },
    base, { name: "AES-GCM", length: 256 }, true, ["decrypt"]);
}

// La clé (et non le mot de passe) est gardée en sessionStorage pour éviter de le redemander au rechargement.
export const exporterCle = async cle => versB64(await crypto.subtle.exportKey("raw", cle));
export const importerCle = texte => crypto.subtle.importKey("raw", deB64(texte), "AES-GCM", true, ["decrypt"]);

export async function dechiffrer(enc, cle) {
  if (enc.v !== 1) throw new Error(`format de portefeuille inconnu : ${enc.v}`);
  let clair;
  try {
    clair = await crypto.subtle.decrypt({ name: "AES-GCM", iv: deB64(enc.iv) }, cle, deB64(enc.donnees));
  } catch {
    throw new MotDePasseIncorrect();
  }
  return JSON.parse(new TextDecoder().decode(clair));
}
