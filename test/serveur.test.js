import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { join } from 'node:path';

import { creerServeur, resoudreCheminFichier } from '../server.js';

const racine = '/projet';

test('sert index.html pour la racine', () => {
  assert.equal(resoudreCheminFichier('/', racine), join(racine, 'index.html'));
  assert.equal(resoudreCheminFichier('/index.html', racine), join(racine, 'index.html'));
});

test('sert les modules JavaScript de src/', () => {
  assert.equal(resoudreCheminFichier('/src/main.js', racine), join(racine, 'src', 'main.js'));
});

test('ignore la query string et le fragment', () => {
  assert.equal(resoudreCheminFichier('/?version=2', racine), join(racine, 'index.html'));
  assert.equal(resoudreCheminFichier('/src/main.js?v=1#x', racine), join(racine, 'src', 'main.js'));
});

test('refuse toute remontée hors de la racine', () => {
  const tentatives = [
    '/../../etc/passwd',
    '/src/../../etc/passwd',
    '/%2e%2e/%2e%2e/etc/passwd',
    '/src%2f..%2f..%2fetc%2fpasswd',
    '/src/..%5c..%5cetc%5cpasswd',
    '//etc/passwd'
  ];

  for (const tentative of tentatives) {
    assert.equal(resoudreCheminFichier(tentative, racine), null, tentative);
  }
});

test('refuse les fichiers hors liste blanche', () => {
  const fichiersInterdits = [
    '/.git/config',
    '/.mcp.json',
    '/.claude/settings.json',
    '/package.json',
    '/server.js',
    '/test/conversion.test.js',
    '/src/secret.json'
  ];

  for (const fichier of fichiersInterdits) {
    assert.equal(resoudreCheminFichier(fichier, racine), null, fichier);
  }
});

test('refuse les URL mal encodées et les octets nuls', () => {
  assert.equal(resoudreCheminFichier('/%E0%A4%A', racine), null);
  assert.equal(resoudreCheminFichier('/index.html%00.js', racine), null);
});

function envoyerRequete(port, chemin, methode = 'GET') {
  return new Promise((resoudre, rejeter) => {
    // http.request transmet le chemin tel quel, sans normaliser les « .. ».
    const requete = request({ host: '127.0.0.1', port, path: chemin, method: methode }, (reponse) => {
      let corps = '';
      reponse.setEncoding('utf8');
      reponse.on('data', (morceau) => { corps += morceau; });
      reponse.on('end', () => resoudre({ statut: reponse.statusCode, entetes: reponse.headers, corps }));
    });
    requete.on('error', rejeter);
    requete.end();
  });
}

test('le serveur HTTP sert la page et bloque la traversée de répertoires', async (contexte) => {
  const serveur = creerServeur();
  await new Promise((resoudre) => serveur.listen(0, '127.0.0.1', resoudre));
  contexte.after(() => serveur.close());
  const { port } = serveur.address();

  const accueil = await envoyerRequete(port, '/?x=1');
  assert.equal(accueil.statut, 200);
  assert.match(accueil.entetes['content-type'], /^text\/html/);
  assert.equal(accueil.entetes['x-content-type-options'], 'nosniff');

  const module = await envoyerRequete(port, '/src/conversion.js');
  assert.equal(module.statut, 200);
  assert.match(module.entetes['content-type'], /^text\/javascript/);

  for (const chemin of ['/../../../../etc/passwd', '/.git/config', '/package.json']) {
    const reponse = await envoyerRequete(port, chemin);
    assert.equal(reponse.statut, 404, chemin);
    assert.equal(reponse.corps, 'Fichier introuvable.');
  }

  const post = await envoyerRequete(port, '/', 'POST');
  assert.equal(post.statut, 405);
});
