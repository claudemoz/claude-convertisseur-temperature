import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const port = 5173;
const hote = '127.0.0.1';
const racineParDefaut = fileURLToPath(new URL('.', import.meta.url));

const typesDeContenu = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8'
};

/**
 * Transforme l'URL demandée en chemin de fichier à servir, ou renvoie null
 * si la demande sort de la liste blanche (index.html et src/*.js).
 */
export function resoudreCheminFichier(urlDemandee, racine = racineParDefaut) {
  let cheminDecode;

  try {
    // L'API URL ignore la query string et résout déjà les segments « .. ».
    const { pathname } = new URL(urlDemandee, 'http://localhost');
    cheminDecode = decodeURIComponent(pathname);
  } catch {
    return null;
  }

  if (cheminDecode.includes('\0')) {
    return null;
  }

  const cheminRelatif = normalize(
    cheminDecode === '/' ? 'index.html' : cheminDecode.replace(/^\/+/, '')
  );

  const estAutorise =
    cheminRelatif === 'index.html' ||
    (cheminRelatif.startsWith(`src${sep}`) && extname(cheminRelatif) === '.js');

  if (!estAutorise) {
    return null;
  }

  const racineAbsolue = resolve(racine);
  const cheminFichier = resolve(racineAbsolue, cheminRelatif);

  // Dernier garde-fou : le fichier doit rester sous la racine du projet.
  if (!cheminFichier.startsWith(racineAbsolue + sep)) {
    return null;
  }

  return cheminFichier;
}

function repondreErreur(reponse, statut, message, entetes = {}) {
  reponse.writeHead(statut, {
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    ...entetes
  });
  reponse.end(message);
}

export function creerServeur(racine = racineParDefaut) {
  return createServer(async (requete, reponse) => {
    if (requete.method !== 'GET' && requete.method !== 'HEAD') {
      repondreErreur(reponse, 405, 'Méthode non autorisée.', { Allow: 'GET, HEAD' });
      return;
    }

    const cheminFichier = resoudreCheminFichier(requete.url, racine);

    if (!cheminFichier) {
      repondreErreur(reponse, 404, 'Fichier introuvable.');
      return;
    }

    try {
      const contenu = await readFile(cheminFichier);

      reponse.writeHead(200, {
        'Content-Type': typesDeContenu[extname(cheminFichier)],
        'X-Content-Type-Options': 'nosniff'
      });

      reponse.end(requete.method === 'HEAD' ? undefined : contenu);
    } catch {
      repondreErreur(reponse, 404, 'Fichier introuvable.');
    }
  });
}

const estLanceDirectement =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (estLanceDirectement) {
  creerServeur().listen(port, hote, () => {
    console.log(`Serveur de développement disponible sur http://localhost:${port}`);
  });
}
