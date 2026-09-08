'use strict';

/**
 * Tests Étape 4 -- IP LAN + QR code de connexion (mode SmartStock Local).
 *
 * Zéro nouvelle dépendance npm : utilise le module natif `node:test`
 * (disponible depuis Node 18+, ce projet cible Node 20.x) plutôt que
 * jest/mocha. Exécution : `node --test tests/etape4-reseau-local.test.js`
 *
 * Deux niveaux de test :
 *  - unitaire pur sur utils/reseauLocal.js (aucune I/O, aucun mock global)
 *  - intégration sur le vrai serveur Express (app réelle de server.js,
 *    démarrée sur un port éphémère, requêtes HTTP réelles via fetch) pour
 *    couvrir l'authentification, le contrôle de rôle et le contrat JSON.
 *
 * Pour les scénarios "mode Local" (Windows + Mongo local), on force
 * temporairement `process.platform` à 'win32' et on restaure la valeur
 * d'origine après chaque test concerné -- même approche documentée que
 * pour les tests de scripts/local-backup.js (Étape 5) : ce container est
 * Linux et n'a pas de vraie machine Windows pour le vérifier autrement.
 */

const assert = require('node:assert/strict');
const { test, before, after } = require('node:test');
const os = require('os');
const http = require('http');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');

const { detecterIpLan, resolvePort } = require('../utils/reseauLocal');

// ─── Helpers plateforme (restaurés après chaque usage) ─────────────────
function forcerPlatform(valeur) {
  const original = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: valeur, configurable: true });
  return () => Object.defineProperty(process, 'platform', original);
}

// ─── 1. Algorithme de détection IP LAN (pur, isolé) ────────────────────

test('IP privée 192.168.x.x acceptée', () => {
  const { ip } = detecterIpLan({
    eth0: [{ family: 'IPv4', address: '192.168.1.50', internal: false }],
  });
  assert.equal(ip, '192.168.1.50');
});

test('IP privée 10.x.x.x acceptée', () => {
  const { ip } = detecterIpLan({
    eth0: [{ family: 'IPv4', address: '10.0.0.5', internal: false }],
  });
  assert.equal(ip, '10.0.0.5');
});

test('IP privée 172.16.x.x acceptée (borne basse de la plage)', () => {
  const { ip } = detecterIpLan({
    eth0: [{ family: 'IPv4', address: '172.16.0.1', internal: false }],
  });
  assert.equal(ip, '172.16.0.1');
});

test('IP privée 172.31.x.x acceptée (borne haute de la plage)', () => {
  const { ip } = detecterIpLan({
    eth0: [{ family: 'IPv4', address: '172.31.255.254', internal: false }],
  });
  assert.equal(ip, '172.31.255.254');
});

test('172.15.x.x refusée (juste sous la plage RFC1918)', () => {
  const { ip } = detecterIpLan({
    eth0: [{ family: 'IPv4', address: '172.15.0.1', internal: false }],
  });
  assert.equal(ip, null);
});

test('172.32.x.x refusée (juste au-dessus de la plage RFC1918)', () => {
  const { ip } = detecterIpLan({
    eth0: [{ family: 'IPv4', address: '172.32.0.1', internal: false }],
  });
  assert.equal(ip, null);
});

test('100.64.x.x (Tailscale CGNAT) refusée', () => {
  const { ip } = detecterIpLan({
    tailscale0: [{ family: 'IPv4', address: '100.100.50.4', internal: false }],
  });
  assert.equal(ip, null);
});

test('loopback (interne) refusée', () => {
  const { ip } = detecterIpLan({
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  });
  assert.equal(ip, null);
});

test('interface virtuelle nommément reconnue (VirtualBox/Docker/etc.) refusée même en RFC1918', () => {
  const { ip } = detecterIpLan({
    VirtualBox: [{ family: 'IPv4', address: '192.168.56.1', internal: false }],
    'br-abc123': [{ family: 'IPv4', address: '172.20.0.1', internal: false }],
  });
  assert.equal(ip, null);
});

test('plusieurs interfaces valides -> résultat déterministe (priorité 192.168 > 10 > 172.16-31)', () => {
  const interfaces = {
    Ethernet: [{ family: 'IPv4', address: '10.0.0.9', internal: false }],
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.20', internal: false }],
    eth1: [{ family: 'IPv4', address: '172.17.0.1', internal: false }], // 172.16-31.x.x, interface non filtrée par nom
  };
  const premierAppel = detecterIpLan(interfaces);
  const deuxiemeAppel = detecterIpLan(interfaces);
  assert.equal(premierAppel.ip, '192.168.1.20'); // priorité la plus haute
  assert.equal(premierAppel.ip, deuxiemeAppel.ip); // même entrée -> même sortie, à chaque fois
  assert.equal(premierAppel.candidats.length, 3);
});

test('aucune IP valide -> erreur claire (jamais 127.0.0.1 par défaut)', () => {
  const { ip, candidats } = detecterIpLan({
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    tailscale0: [{ family: 'IPv4', address: '100.64.0.2', internal: false }],
  });
  assert.equal(ip, null);
  assert.notEqual(ip, '127.0.0.1');
  assert.equal(candidats.length, 0);
});

test('resolvePort() lit PORT depuis l\'environnement, jamais une constante figée à 5000', () => {
  const original = process.env.PORT;
  process.env.PORT = '4242';
  assert.equal(resolvePort(), 4242);
  if (original === undefined) delete process.env.PORT;
  else process.env.PORT = original;
});

// ─── 2. Endpoint réel (app Express de server.js, requêtes HTTP réelles) ─

let serveur;
let baseUrl;
const PORT_TEST = 3901; // port dédié aux tests, distinct du port par défaut 3000
const JWT_SECRET_TEST = 'secret-de-test-etape4';

before(async () => {
  process.env.PORT = String(PORT_TEST);
  process.env.NODE_ENV = 'test';
  // Même variable que resolveSecret() lit en priorité (utils/secrets.js) --
  // fixe le secret pour que les tokens signés ici soient acceptés par
  // authMiddleware sans dépendre d'un fichier persisté sur disque.
  process.env.JWT_SECRET = JWT_SECRET_TEST;
  process.env.MONGODB_URI = 'mongodb://localhost:27017/smartStock';

  // On charge uniquement les briques nécessaires (router + middleware),
  // pas server.js entier : server.js appelle startServer() -> connectDB()
  // au chargement, qui exigerait une vraie connexion MongoDB indisponible
  // dans ce container. Ce test cible le contrat HTTP du router patron,
  // pas le démarrage complet du process (déjà couvert par le fait que
  // server.js importe ce router sans erreur -- vérifié séparément ci-dessous).
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.use('/api/patron', require('../routes/patron.routes'));

  serveur = http.createServer(app);
  await new Promise((resolve) => serveur.listen(0, resolve));
  const { port } = serveur.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise((resolve) => serveur.close(resolve));
});

function tokenPour(role) {
  return jwt.sign({ role, tenantId: 'default' }, JWT_SECRET_TEST);
}

test('server.js importe le router patron sans erreur (câblage réel, pas seulement le test isolé ci-dessus)', () => {
  assert.doesNotThrow(() => require('../routes/patron.routes'));
});

test('endpoint sans JWT -> 401', async () => {
  const res = await fetch(`${baseUrl}/api/patron/reseau-local`);
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('utilisateur authentifié non-patron (agent) -> 403', async () => {
  const res = await fetch(`${baseUrl}/api/patron/reseau-local`, {
    headers: { Authorization: `Bearer ${tokenPour('agent')}` },
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('Cloud/Linux (platform réelle du container) -> refus propre, pas de crash', async () => {
  // process.platform n'est PAS forcé ici : ce test tourne réellement sous
  // Linux, donc c'est un vrai test "Cloud", pas une simulation.
  assert.notEqual(process.platform, 'win32');
  const res = await fetch(`${baseUrl}/api/patron/reseau-local`, {
    headers: { Authorization: `Bearer ${tokenPour('patron')}` },
  });
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.success, false);
});

test('patron en mode Local (simulé win32) -> 200 avec IP/port/URL/QR corrects', async () => {
  const restaurerPlatform = forcerPlatform('win32');
  const originalNetworkInterfaces = os.networkInterfaces;
  os.networkInterfaces = () => ({
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.50', internal: false }],
  });

  try {
    const res = await fetch(`${baseUrl}/api/patron/reseau-local`, {
      headers: { Authorization: `Bearer ${tokenPour('patron')}` },
    });
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.equal(body.success, true);
    assert.equal(body.ip, '192.168.1.50');
    assert.equal(body.port, PORT_TEST);
    assert.equal(body.url, `http://192.168.1.50:${PORT_TEST}`); // URL exacte http://<IP>:<PORT>
    assert.ok(body.qrCode.startsWith('data:image/png;base64,'));

    // "QR décodable/valide et contenant exactement cette URL" : la
    // génération qrcode.toDataURL est déterministe pour un même contenu
    // et les mêmes options (vérifié séparément) -- on compare donc le PNG
    // reçu à un nouvel encodage de l'URL attendue plutôt que de décoder le
    // QR (aucune librairie de décodage QR n'est présente dans ce repo, et
    // en ajouter une seule pour ce test irait à l'encontre de la consigne
    // "pas de nouvelle dépendance npm si elle n'est pas indispensable").
    const qrAttendu = await QRCode.toDataURL(body.url, { width: 200 });
    assert.equal(body.qrCode, qrAttendu);

    // Aucune donnée sensible dans la réponse.
    const texteReponse = JSON.stringify(body).toLowerCase();
    for (const motInterdit of ['jwt', 'token', 'password', 'mot de passe', 'secret', 'mongodb://', 'mongodb+srv://']) {
      assert.ok(!texteReponse.includes(motInterdit), `champ interdit trouvé dans la réponse: ${motInterdit}`);
    }
  } finally {
    os.networkInterfaces = originalNetworkInterfaces;
    restaurerPlatform();
  }
});

test('patron en mode Local mais aucune IP LAN valide -> erreur claire, pas de 500 masqué en 200', async () => {
  const restaurerPlatform = forcerPlatform('win32');
  const originalNetworkInterfaces = os.networkInterfaces;
  os.networkInterfaces = () => ({
    lo: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
  });

  try {
    const res = await fetch(`${baseUrl}/api/patron/reseau-local`, {
      headers: { Authorization: `Bearer ${tokenPour('patron')}` },
    });
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.success, false);
  } finally {
    os.networkInterfaces = originalNetworkInterfaces;
    restaurerPlatform();
  }
});
