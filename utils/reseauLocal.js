'use strict';

/**
 * SmartStock Local -- détection de l'adresse LAN de la boutique.
 *
 * But : trouver l'IPv4 locale sur laquelle les autres appareils de la
 * boutique (téléphones, tablettes) peuvent joindre ce serveur, pour
 * l'afficher/l'encoder en QR (voir controllers/reseau.controller.js).
 *
 * Décision d'architecture (audit validé) : ne retenir que des plages
 * RFC1918 (réseau privé physique typique boutique/domicile), en excluant
 * explicitement Tailscale (100.64.0.0/10 -- traité comme un accès distant
 * séparé, pas comme le réseau local de la boutique) et les interfaces
 * virtuelles usuelles (VPN, machines virtuelles, conteneurs, loopback).
 *
 * `os.networkInterfaces()` n'est PAS appelé ici : la fonction le reçoit en
 * paramètre pour rester pure et testable sans dépendre du réseau réel de
 * la machine qui exécute les tests.
 */

const REGEX_INTERFACE_VIRTUELLE =
  /^(vEthernet|VirtualBox|VMware|Hyper-V|Loopback|Docker|br-|veth|utun|Tailscale)/i;

function estIPv4RFC1918(adresse) {
  const parts = adresse.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function estTailscaleCGNAT(adresse) {
  const parts = adresse.split('.').map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  return a === 100 && b >= 64 && b <= 127;
}

// Priorité de plage si plusieurs candidats valides restent : 192.168.x.x
// (cas immense majorité pour une boutique/domicile) avant 10.x.x.x, avant
// 172.16-31.x.x (parfois une IP Docker/VM légitime ayant passé le filtre
// de nom, donc mise en dernier par prudence -- voir audit section E).
function rangPriorite(adresse) {
  const premierOctet = Number(adresse.split('.')[0]);
  if (premierOctet === 192) return 0;
  if (premierOctet === 10) return 1;
  return 2; // 172.16-31.x.x
}

/**
 * @param {object} interfacesReseau -- résultat de os.networkInterfaces()
 * @returns {{ip: string|null, candidats: string[]}}
 */
function detecterIpLan(interfacesReseau) {
  const candidats = [];

  for (const [nomInterface, adresses] of Object.entries(interfacesReseau || {})) {
    if (!Array.isArray(adresses)) continue;
    if (REGEX_INTERFACE_VIRTUELLE.test(nomInterface)) continue;

    for (const info of adresses) {
      if (!info) continue;
      // node <18 renvoie family: 'IPv4' (string), >=18 peut renvoyer 4 (number)
      // selon la plateforme -- on accepte les deux formes.
      const estIPv4 = info.family === 'IPv4' || info.family === 4;
      if (!estIPv4) continue;
      if (info.internal) continue; // couvre 127.0.0.1 automatiquement
      if (estTailscaleCGNAT(info.address)) continue; // exclu ici, traité ailleurs (Tailscale)
      if (!estIPv4RFC1918(info.address)) continue;

      candidats.push(info.address);
    }
  }

  if (candidats.length === 0) {
    return { ip: null, candidats: [] };
  }

  const tries = [...candidats].sort((a, b) => rangPriorite(a) - rangPriorite(b));
  return { ip: tries[0], candidats };
}

// Le port ne doit jamais être une constante dupliquée/inventée ici : même
// règle de résolution que server.js (process.env.PORT || 3000), pour que
// l'URL affichée corresponde toujours réellement au port sur lequel le
// serveur écoute.
function resolvePort() {
  return Number(process.env.PORT) || 3000;
}

module.exports = {
  detecterIpLan,
  resolvePort,
  estIPv4RFC1918,
  estTailscaleCGNAT,
  REGEX_INTERFACE_VIRTUELLE,
};
