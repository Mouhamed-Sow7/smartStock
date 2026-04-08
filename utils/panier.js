/** * Module Panier Intelligent - Stockage en mémoire * SmartStock - Gestion commerciale mobile-first */

// Stockage temporaire des paniers en mémoire
// Structure: { [userId]: { items: [], tenantId: string } }
const paniers = {};

/**
 * Récupère le panier d'un utilisateur
 * Crée un panier vide si inexistant
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {string} tenantId - Identifiant du tenant
 * @returns {Object} Panier de l'utilisateur
 */
const getPanier = (userId, tenantId = "default") => {
  if (!paniers[userId]) {
    paniers[userId] = {
      items: [],
      tenantId,
      createdAt: new Date().toISOString(),
    };
  }
  return paniers[userId];
};

/**
 * Convertit un ID produit en string
 * Gère les cas: ObjectId, string, ou objet avec _id/produitId
 * @param {*} id - ID à convertir
 * @returns {string} ID en string
 */
const convertIdToString = (id) => {
  if (typeof id === "string") return id;
  if (id && typeof id.toString === "function") return id.toString();
  return String(id);
};

/**
 * Ajoute un produit au panier
 * Si le produit existe déjà, augmente la quantité
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {Object} produit - Produit à ajouter
 * @param {string} tenantId - Identifiant du tenant
 * @returns {Object} Panier mis à jour
 */
const ajouterAuPanier = (userId, produit, tenantId = "default") => {
  // Récupérer ou créer le panier
  const panier = getPanier(userId, tenantId);

  // Convertir l'ID en string pour éviter les problèmes de comparaison
  // Gère les cas: produit._id (ObjectId), produit.produitId (ObjectId ou string)
  const produitId = produit._id
    ? convertIdToString(produit._id)
    : convertIdToString(produit.produitId);

  // Vérifier si le produit existe déjà dans le panier
  const indexExistant = panier.items.findIndex(
    (item) => item.produitId === produitId,
  );

  if (indexExistant !== -1) {
    // Produit existant → augmenter la quantité
    panier.items[indexExistant].quantite += 1;
    panier.items[indexExistant].updatedAt = new Date().toISOString();
  } else {
    // Nouveau produit → ajouter au panier
    panier.items.push({
      produitId,
      nom: produit.nom,
      prix: produit.prix,
      quantite: 1,
      addedAt: new Date().toISOString(),
    });
  }

  panier.updatedAt = new Date().toISOString();
  return panier;
};

/**
 * Calcule le total du panier
 * @param {Object} panier - Panier de l'utilisateur
 * @returns {Object} Objet contenant le total et le nombre d'articles
 */
const calculerTotal = (panier) => {
  if (!panier || !panier.items || panier.items.length === 0) {
    return { total: 0, nombreArticles: 0 };
  }

  const total = panier.items.reduce((sum, item) => {
    return sum + item.prix * item.quantite;
  }, 0);

  const nombreArticles = panier.items.reduce((sum, item) => {
    return sum + item.quantite;
  }, 0);

  return {
    total: Number(total.toFixed(2)),
    nombreArticles,
  };
};

/**
 * Modifie la quantité d'un produit dans le panier
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {string} produitId - Identifiant du produit
 * @param {number} quantite - Nouvelle quantité
 * @param {string} tenantId - Identifiant du tenant
 * @returns {Object|null} Panier mis à jour ou null si produit non trouvé
 */
const modifierQuantite = (
  userId,
  produitId,
  quantite,
  tenantId = "default",
) => {
  const panier = getPanier(userId, tenantId);

  // Convertir produitId en string pour la comparaison
  const produitIdStr = convertIdToString(produitId);

  const index = panier.items.findIndex(
    (item) => item.produitId === produitIdStr,
  );

  if (index === -1) {
    return null;
  }

  if (quantite <= 0) {
    // Quantité <= 0 → supprimer le produit
    panier.items.splice(index, 1);
  } else {
    panier.items[index].quantite = quantite;
    panier.items[index].updatedAt = new Date().toISOString();
  }

  panier.updatedAt = new Date().toISOString();
  return panier;
};

/**
 * Supprime un produit du panier
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {string} produitId - Identifiant du produit
 * @param {string} tenantId - Identifiant du tenant
 * @returns {Object|null} Panier mis à jour ou null si produit non trouvé
 */
const supprimerDuPanier = (userId, produitId, tenantId = "default") => {
  const panier = getPanier(userId, tenantId);

  // Convertir produitId en string pour la comparaison
  const produitIdStr = convertIdToString(produitId);

  const index = panier.items.findIndex(
    (item) => item.produitId === produitIdStr,
  );

  if (index === -1) {
    return null;
  }

  panier.items.splice(index, 1);
  panier.updatedAt = new Date().toISOString();
  return panier;
};

/**
 * Vide le panier d'un utilisateur
 * @param {string} userId - Identifiant de l'utilisateur
 * @param {string} tenantId - Identifiant du tenant
 * @returns {Object} Panier vidé
 */
const viderPanier = (userId, tenantId = "default") => {
  paniers[userId] = {
    items: [],
    tenantId,
    createdAt: new Date().toISOString(),
  };
  return paniers[userId];
};

module.exports = {
  getPanier,
  ajouterAuPanier,
  calculerTotal,
  modifierQuantite,
  supprimerDuPanier,
  viderPanier,
};
