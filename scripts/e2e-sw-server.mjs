// scripts/e2e-sw-server.mjs — serveur statique du harnais e2e de la gate SW
// (phase 41, GATE-01). Node `http` natif, AUCUNE dépendance nouvelle.
//
// Il reproduit les trois règles de `app/nginx.conf` qui comptent pour le
// cycle de mise à jour du service worker :
//   1. `Cache-Control: no-cache` sur TOUTES les réponses (reproduit `expires -1`)
//      — le navigateur revalide `/sw.js` à chaque navigation, sans question de
//      cache (Pitfall 3) ;
//   2. repli SPA vers `index.html` quand le chemin n'existe pas ou est un
//      répertoire (reproduit `try_files $uri $uri/ /index.html`) ;
//   3. `Content-Type` déduit de l'extension.
//
// Le répertoire servi est lu À CHAQUE requête via le symlink
// `scripts/dist-current` (jamais mis en cache au démarrage) : la commutation
// build A → build B se fait à chaud, sans coupure ni redémarrage (Pitfall 6 —
// `vite preview` imposerait l'un et entrerait en collision de port avec le
// webServer du run e2e standard). Les deux builds sont servis sur LE MÊME
// origin (127.0.0.1:4173) : deux origins distincts auraient deux registres SW
// étanches, et aucune mise à jour ne se déclencherait (Pitfall 2).

import { createServer } from 'node:http';
import { existsSync, readFileSync, readlinkSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const DOSSIER_SCRIPTS = dirname(fileURLToPath(import.meta.url));
const LIEN_DIST_COURANT = join(DOSSIER_SCRIPTS, 'dist-current');
const PORT = Number(process.env.PORT ?? 4173);
const HOST = '127.0.0.1';

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/**
 * Racine servie : cible ACTUELLE du symlink, relue à chaque requête. Un échec
 * ici est bruyant (500 nommé) — un silence servirait une racine périmée.
 */
function racine() {
  try {
    const cible = readlinkSync(LIEN_DIST_COURANT);
    return resolve(DOSSIER_SCRIPTS, cible);
  } catch {
    // Repli : le chemin existe-t-il au moins comme répertoire direct ?
    if (existsSync(LIEN_DIST_COURANT) && statSync(LIEN_DIST_COURANT).isDirectory()) {
      return LIEN_DIST_COURANT;
    }
    throw new Error(
      `e2e-sw-server : ${LIEN_DIST_COURANT} introuvable (symlink absent). ` +
        'Créez-le vers un build (ex. dist-v1) avant de démarrer le serveur.',
    );
  }
}

createServer((req, res) => {
  let racineServie;
  try {
    racineServie = racine();
  } catch (erreur) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(String(erreur instanceof Error ? erreur.message : erreur));
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('méthode non supportée par le serveur du harnais');
    return;
  }

  const cheminDemande = decodeURIComponent(new URL(req.url, `http://${req.headers.host ?? HOST}`).pathname);
  let cheminFichier = resolve(join(racineServie, cheminDemande));
  // Garde de traversée : le chemin résolu reste sous la racine du run.
  if (cheminFichier !== racineServie && !cheminFichier.startsWith(racineServie + sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('hors de la racine servie');
    return;
  }
  // Repli SPA : chemin inexistant ou répertoire → index.html (règle nginx).
  if (!existsSync(cheminFichier) || statSync(cheminFichier).isDirectory()) {
    cheminFichier = join(racineServie, 'index.html');
  }

  try {
    const corps = readFileSync(cheminFichier);
    res.writeHead(200, {
      // Reproduit `expires -1` de nginx.conf sur TOUTES les réponses : le
      // precache hashed n'a pas besoin de cache long dans un run e2e.
      'Cache-Control': 'no-cache',
      'Content-Type': MIME[extname(cheminFichier)] ?? 'application/octet-stream',
    });
    res.end(req.method === 'HEAD' ? undefined : corps);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`introuvable dans le build servi : ${cheminDemande}`);
  }
}).listen(PORT, HOST, () => {
  console.log(`e2e-sw-server : sert ${LIEN_DIST_COURANT} sur http://${HOST}:${PORT}`);
});
