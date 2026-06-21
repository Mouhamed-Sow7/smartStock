/**
 * Script de seed — données demo supermarché
 * Usage: TENANT_ID=tenant_xxx node scripts/seed-demo.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Produit = require('../models/produit.model');

const TENANT_ID = process.env.TENANT_ID || 'demo';
const MONGO_URI = process.env.MONGODB_URI;

const PRODUITS = [
  // Boissons
  { nom: 'Coca-Cola 1.5L',          prix: 1200, stock: 48,  seuilAlerte: 12, categorie: 'Boissons',    codeBarres: '5449000131805' },
  { nom: 'Fanta Orange 1.5L',       prix: 1200, stock: 36,  seuilAlerte: 10, categorie: 'Boissons',    codeBarres: '5449000054227' },
  { nom: 'Eau Kirene 1.5L',         prix:  500, stock: 96,  seuilAlerte: 24, categorie: 'Boissons',    codeBarres: '6194003613017' },
  { nom: 'Bissap Purafoods 33cl',   prix:  650, stock: 60,  seuilAlerte: 15, categorie: 'Boissons',    codeBarres: '6194003620015' },
  { nom: 'Jus Gingembre 33cl',      prix:  700, stock: 40,  seuilAlerte: 10, categorie: 'Boissons',    codeBarres: '6194003620022' },
  { nom: 'Biere Flag 65cl',         prix: 1500, stock: 72,  seuilAlerte: 18, categorie: 'Boissons',    codeBarres: '6191234567890' },
  { nom: 'Malta Guinness 33cl',     prix:  750, stock: 50,  seuilAlerte: 12, categorie: 'Boissons',    codeBarres: '5010000301527' },
  // Epicerie
  { nom: 'Riz Parfume 5kg',         prix: 4500, stock: 30,  seuilAlerte: 8,  categorie: 'Epicerie',    codeBarres: '6194000400017' },
  { nom: 'Farine de ble 1kg',       prix: 1000, stock: 40,  seuilAlerte: 10, categorie: 'Epicerie',    codeBarres: '6194000400024' },
  { nom: 'Huile Vegetale 1L',       prix: 2200, stock: 35,  seuilAlerte: 8,  categorie: 'Epicerie',    codeBarres: '6194000400031' },
  { nom: 'Sucre en poudre 1kg',     prix:  900, stock: 55,  seuilAlerte: 15, categorie: 'Epicerie',    codeBarres: '6194000400048' },
  { nom: 'Sel iode 500g',           prix:  350, stock: 80,  seuilAlerte: 20, categorie: 'Epicerie',    codeBarres: '6194000400055' },
  { nom: 'Cube Maggi x12',          prix:  500, stock: 120, seuilAlerte: 30, categorie: 'Epicerie',    codeBarres: '7613035182851' },
  { nom: 'Tomate concentree 140g',  prix:  450, stock: 90,  seuilAlerte: 25, categorie: 'Epicerie',    codeBarres: '6194000400062' },
  // Laitiers
  { nom: 'Lait Candia 1L',          prix: 1800, stock: 24,  seuilAlerte: 6,  categorie: 'Laitiers',   codeBarres: '3228881014453' },
  { nom: 'Yaourt Kirene nature',    prix:  600, stock: 30,  seuilAlerte: 8,  categorie: 'Laitiers',   codeBarres: '6194003614007' },
  { nom: 'Beurre Presidence 250g',  prix: 3500, stock: 20,  seuilAlerte: 5,  categorie: 'Laitiers',   codeBarres: '3228021130016' },
  { nom: 'Lait en poudre Nido 400g',prix: 5500, stock: 25,  seuilAlerte: 6,  categorie: 'Laitiers',   codeBarres: '7613033137471' },
  // Hygiene
  { nom: 'Savon Lux Rose',          prix:  400, stock: 100, seuilAlerte: 20, categorie: 'Hygiene',     codeBarres: '6001087378580' },
  { nom: 'Dentifrice Colgate 75ml', prix: 1200, stock: 45,  seuilAlerte: 10, categorie: 'Hygiene',     codeBarres: '8714789959107' },
  { nom: 'Shampoing Pantene 200ml', prix: 2500, stock: 30,  seuilAlerte: 8,  categorie: 'Hygiene',     codeBarres: '8001090302960' },
  { nom: 'Gel douche Dove 250ml',   prix: 2800, stock: 25,  seuilAlerte: 6,  categorie: 'Hygiene',     codeBarres: '8717163598566' },
  { nom: 'Deodorant Rexona 150ml',  prix: 3000, stock: 20,  seuilAlerte: 5,  categorie: 'Hygiene',     codeBarres: '6001087017616' },
  // Entretien
  { nom: 'Detergent OMO 500g',      prix: 1500, stock: 50,  seuilAlerte: 12, categorie: 'Entretien',   codeBarres: '6001087330540' },
  { nom: 'Eau de javel 1L',         prix:  800, stock: 40,  seuilAlerte: 10, categorie: 'Entretien',   codeBarres: '6194001900014' },
  { nom: 'Essuie-tout Lotus x2',    prix: 1200, stock: 30,  seuilAlerte: 8,  categorie: 'Entretien',   codeBarres: '3281099887707' },
  // Snacks
  { nom: 'Biscuits Oreo 176g',      prix: 1800, stock: 40,  seuilAlerte: 10, categorie: 'Snacks',      codeBarres: '7622210951991' },
  { nom: 'Chips Lays Classic 45g',  prix:  900, stock: 60,  seuilAlerte: 15, categorie: 'Snacks',      codeBarres: '4902504111779' },
  { nom: 'Chocolat Milka 100g',     prix: 2500, stock: 30,  seuilAlerte: 8,  categorie: 'Snacks',      codeBarres: '7622300441937' },
  { nom: 'Bonbons Haribo 100g',     prix: 1000, stock: 50,  seuilAlerte: 12, categorie: 'Snacks',      codeBarres: '4001686325841' },
  { nom: 'Cacahuetes grillees 100g',prix:  600, stock: 80,  seuilAlerte: 20, categorie: 'Snacks',      codeBarres: '6194001900021' },
  // Frais
  { nom: 'Oeufs frais boite x12',   prix: 3500, stock: 20,  seuilAlerte: 5,  categorie: 'Frais',       codeBarres: '6194001900038' },
  { nom: 'Pain de mie Harrys',      prix: 1500, stock: 15,  seuilAlerte: 4,  categorie: 'Frais',       codeBarres: '3017620400678' },
  // Telephonie
  { nom: 'Credit Sonatel 1000F',    prix: 1000, stock: 200, seuilAlerte: 50, categorie: 'Telephonie',  codeBarres: '6194001100017' },
  { nom: 'Recharge Orange 500F',    prix:  500, stock: 300, seuilAlerte: 80, categorie: 'Telephonie',  codeBarres: '6194001100024' },
  { nom: 'Internet Orange 1Go',     prix: 1500, stock: 100, seuilAlerte: 25, categorie: 'Telephonie',  codeBarres: '6194001100031' },
  // Feculents
  { nom: 'Pates spaghetti 500g',    prix:  750, stock: 60,  seuilAlerte: 15, categorie: 'Feculents',   codeBarres: '8000070034838' },
  { nom: 'Couscous moyen 500g',     prix:  900, stock: 40,  seuilAlerte: 10, categorie: 'Feculents',   codeBarres: '3011360032070' },
  { nom: 'Mais en boite 400g',      prix:  850, stock: 45,  seuilAlerte: 12, categorie: 'Feculents',   codeBarres: '3083680085826' },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connecte a MongoDB');
  const deleted = await Produit.deleteMany({ tenantId: TENANT_ID });
  console.log(`Supprime ${deleted.deletedCount} anciens produits`);
  const docs = PRODUITS.map(p => ({ ...p, tenantId: TENANT_ID }));
  const inserted = await Produit.insertMany(docs);
  console.log(`Insere ${inserted.length} produits demo`);
  await mongoose.disconnect();
  console.log('Done!');
}

seed().catch(err => { console.error(err); process.exit(1); });
