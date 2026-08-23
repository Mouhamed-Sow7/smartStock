const mongoose = require("mongoose");

const produitSchema = new mongoose.Schema(
  {
    tenantId: { type: String, required: true, index: true },
    nom: { type: String, required: true, trim: true },
    prix: { type: Number, required: true, min: 0 },
    // Prix de vente "en gros" — optionnel. 0/absent = produit vendu uniquement
    // à l'unité (comportement historique, valeur par défaut). Dès qu'il est
    // renseigné (>0), le produit devient vendable en détail ET en gros, et
    // l'agent devra choisir lequel au moment de la vente (voir vente.controller).
    prixGros: { type: Number, default: 0, min: 0 },
    prixAchat: { type: Number, default: 0, min: 0 },
    stock: { type: Number, default: 0, min: 0 },
    // Stock "en gros" — pool séparé du stock détail (pas le même stock avec
    // juste un prix différent : beaucoup de commerçants réservent
    // physiquement une partie de leur arrivage au détail et une autre au
    // gros, ex: cartons scellés vs unités déjà déballées). Ne compte/décompte
    // que pour les ventes typeVente==='gros'. 0 par défaut — sans incidence
    // sur les produits vendus uniquement au détail (prixGros non défini).
    stockGros: { type: Number, default: 0, min: 0 },
    // Mode de gestion du stock gros — par défaut 'separe' (comportement
    // historique, préserve tous les produits existants tel quel) :
    //   'separe' : deux pools indépendants (stock détail et stockGros ne se
    //     touchent jamais) — boutiques qui réservent physiquement une partie
    //     de l'arrivage au détail et une autre au gros (cartons scellés vs
    //     unités déjà déballées).
    //   'lie' : un seul stock physique réel, exprimé en unités détail
    //     (`stock`) — vendre "en gros" prélève uniteParGros unités détail
    //     d'un coup sur ce même compteur. `stockGros` n'est alors plus la
    //     source de vérité (laissé tel quel en base, non maintenu) : la
    //     quantité de lots gros disponibles se déduit de stock/uniteParGros
    //     côté frontend pour l'affichage.
    modeStock: { type: String, enum: ["separe", "lie"], default: "separe" },
    // Nombre d'unités détail contenues dans une unité gros (ex: 1 carton de
    // "La vache qui rit" = 8 portions) — utilisé uniquement en modeStock
    // 'lie', pour convertir une vente/annulation gros en déduction/ajout sur
    // le stock détail unique. Sans incidence si modeStock==='separe'.
    uniteParGros: { type: Number, default: 0, min: 0 },
    seuilAlerte: { type: Number, default: 5 },
    categorie: { type: String, default: "Général" },
    codeBarres: { type: String, default: "" },
    image: { type: String, default: "" },
    // Date de péremption — optionnelle (tous les produits n'en ont pas :
    // épicerie sèche, hygiène, etc.). Sert uniquement à alerter le patron
    // (voir getProduitsExpirationProche), aucun blocage de vente automatique.
    dateExpiration: { type: Date, default: null },
  },
  { timestamps: true },
);

// Index composite pour les requêtes multi-tenant
produitSchema.index({ tenantId: 1, nom: 1 });

// Index unique pour codeBarres par tenant (empêche les doublons)
// partialFilterExpression ignore les documents avec codeBarres vide
produitSchema.index(
  { tenantId: 1, codeBarres: 1 },
  { unique: true, partialFilterExpression: { codeBarres: { $ne: "" } } },
);

module.exports = mongoose.model("Produit", produitSchema);
