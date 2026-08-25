const Fournisseur = require('../models/fournisseur.model');
const Achat = require('../models/achat.model');
const Produit = require('../models/produit.model');

// Fournisseurs/achats sont un outil de gestion patron — un agent n'a pas à
// voir les coûts d'achat de la boutique (ce serait lui exposer la marge
// réelle, information sensible). Même garde inline que le reste du code
// (pas de middleware dédié pour un seul contrôleur, cohérent avec l'existant).
function verifierPatron(req, res) {
  if (req.user?.role !== 'patron') {
    res.status(403).json({ success: false, message: 'Réservé au patron' });
    return false;
  }
  return true;
}

// ─── Fournisseurs ─────────────────────────────────────────────────────
const getFournisseurs = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const fournisseurs = await Fournisseur.find({ tenantId }).sort({ nom: 1 });
    res.json({ success: true, data: fournisseurs });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const createFournisseur = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const { nom, telephone, adresse, notes } = req.body;
    if (!nom || !nom.trim()) {
      return res.status(400).json({ success: false, message: 'Nom du fournisseur requis' });
    }
    const fournisseur = await Fournisseur.create({
      tenantId, nom: nom.trim(), telephone: telephone || '', adresse: adresse || '', notes: notes || '',
    });
    res.status(201).json({ success: true, data: fournisseur });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

const updateFournisseur = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const { nom, telephone, adresse, notes } = req.body;
    const maj = {};
    if (nom !== undefined) maj.nom = nom;
    if (telephone !== undefined) maj.telephone = telephone;
    if (adresse !== undefined) maj.adresse = adresse;
    if (notes !== undefined) maj.notes = notes;
    const fournisseur = await Fournisseur.findOneAndUpdate({ _id: req.params.id, tenantId }, maj, { new: true, runValidators: true });
    if (!fournisseur) return res.status(404).json({ success: false, message: 'Fournisseur non trouvé' });
    res.json({ success: true, data: fournisseur });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

// Un fournisseur avec des factures existantes n'est PAS supprimable
// directement -- ça casserait la traçabilité de l'historique d'achats déjà
// enregistré (fournisseurId ferait référence à un document disparu). Le
// patron doit d'abord traiter/vider ses factures s'il veut vraiment
// supprimer, plutôt qu'un accident silencieux.
const deleteFournisseur = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const nbAchats = await Achat.countDocuments({ tenantId, fournisseurId: req.params.id });
    if (nbAchats > 0) {
      return res.status(400).json({
        success: false,
        message: `Impossible de supprimer -- ${nbAchats} facture(s) enregistrée(s) pour ce fournisseur`,
      });
    }
    const fournisseur = await Fournisseur.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!fournisseur) return res.status(404).json({ success: false, message: 'Fournisseur non trouvé' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// ─── Achats (factures) ──────────────────────────────────────────────
const getAchats = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const filtre = { tenantId };
    if (req.query.fournisseurId) filtre.fournisseurId = req.query.fournisseurId;
    const achats = await Achat.find(filtre).sort({ date: -1 });
    res.json({ success: true, data: achats });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

const createAchat = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const { fournisseurId, date, numeroFacture, lignes, notes } = req.body;

    const fournisseur = await Fournisseur.findOne({ _id: fournisseurId, tenantId });
    if (!fournisseur) return res.status(400).json({ success: false, message: 'Fournisseur invalide' });
    if (!Array.isArray(lignes) || lignes.length === 0) {
      return res.status(400).json({ success: false, message: 'Au moins une ligne de facture requise' });
    }

    // Chaque ligne peut être liée à un produit existant (nom/prix
    // pré-remplis, marge calculable) ou juste un nom libre saisi à la main
    // (décision du 24/08/2026 -- ne jamais bloquer la saisie d'une facture
    // réelle sur un produit pas encore catalogué). On valide juste que le
    // produitId fourni, s'il y en a un, appartient bien à ce tenant.
    const lignesValidees = [];
    let montantTotal = 0;
    for (const l of lignes) {
      const nom = (l.nom || '').toString().trim();
      const quantite = Number(l.quantite);
      const prixUnitaire = Number(l.prixUnitaire);
      if (!nom || !(quantite > 0) || !(prixUnitaire >= 0)) {
        return res.status(400).json({ success: false, message: `Ligne invalide : ${nom || '(sans nom)'}` });
      }
      let produitId = null;
      if (l.produitId) {
        const p = await Produit.findOne({ _id: l.produitId, tenantId }).select('_id');
        if (p) produitId = p._id;
      }
      const total = Math.round(quantite * prixUnitaire);
      montantTotal += total;
      lignesValidees.push({ produitId, nom, quantite, prixUnitaire, total });
    }

    const achat = await Achat.create({
      tenantId,
      fournisseurId: fournisseur._id,
      fournisseurNom: fournisseur.nom,
      date: date ? new Date(date) : new Date(),
      numeroFacture: numeroFacture || '',
      lignes: lignesValidees,
      montantTotal,
      notes: notes || '',
    });
    res.status(201).json({ success: true, data: achat });
  } catch (err) { res.status(400).json({ success: false, message: err.message }); }
};

const deleteAchat = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const achat = await Achat.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!achat) return res.status(404).json({ success: false, message: 'Facture non trouvée' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

// Dernier prix d'achat connu pour un produit -- sert au calcul de marge
// réelle côté frontend (prix de vente - dernier prix d'achat), séparé du
// champ produit.prixAchat qui, lui, reste une valeur saisie manuellement
// non historisée. On cherche la ligne la plus récente référençant ce
// produit, tous fournisseurs confondus.
const dernierPrixAchat = async (req, res) => {
  try {
    if (!verifierPatron(req, res)) return;
    const tenantId = req.tenantId || 'default';
    const achat = await Achat.findOne({ tenantId, 'lignes.produitId': req.params.produitId })
      .sort({ date: -1 });
    if (!achat) return res.json({ success: true, data: null });
    const ligne = [...achat.lignes].reverse().find((l) => String(l.produitId) === req.params.produitId);
    res.json({ success: true, data: ligne ? { prixUnitaire: ligne.prixUnitaire, date: achat.date, fournisseurNom: achat.fournisseurNom } : null });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

module.exports = {
  getFournisseurs, createFournisseur, updateFournisseur, deleteFournisseur,
  getAchats, createAchat, deleteAchat, dernierPrixAchat,
};
