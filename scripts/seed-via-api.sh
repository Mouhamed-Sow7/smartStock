#!/bin/bash
# Seed via l'API REST Render — pas besoin d'accès direct MongoDB
# Usage: bash scripts/seed-via-api.sh

API="https://smartstock-api-1zzc.onrender.com/api"
TOKEN="$1"

if [ -z "$TOKEN" ]; then
  echo "Usage: bash scripts/seed-via-api.sh <ton_token_jwt>"
  exit 1
fi

declare -A PRODUITS=(
  ["Coca-Cola 1.5L"]="|1200|48|12|Boissons|5449000131805"
  ["Fanta Orange 1.5L"]="|1200|36|10|Boissons|5449000054227"
  ["Eau Kirene 1.5L"]="|500|96|24|Boissons|6194003613017"
  ["Bissap Purafoods 33cl"]="|650|60|15|Boissons|6194003620015"
  ["Jus Gingembre 33cl"]="|700|40|10|Boissons|6194003620022"
  ["Biere Flag 65cl"]="|1500|72|18|Boissons|6191234567890"
  ["Malta Guinness 33cl"]="|750|50|12|Boissons|5010000301527"
  ["Riz Parfume 5kg"]="|4500|30|8|Epicerie|6194000400017"
  ["Farine de ble 1kg"]="|1000|40|10|Epicerie|6194000400024"
  ["Huile Vegetale 1L"]="|2200|35|8|Epicerie|6194000400031"
  ["Sucre en poudre 1kg"]="|900|55|15|Epicerie|6194000400048"
  ["Sel iode 500g"]="|350|80|20|Epicerie|6194000400055"
  ["Cube Maggi x12"]="|500|120|30|Epicerie|7613035182851"
  ["Tomate concentree 140g"]="|450|90|25|Epicerie|6194000400062"
  ["Lait Candia 1L"]="|1800|24|6|Laitiers|3228881014453"
  ["Yaourt Kirene nature"]="|600|30|8|Laitiers|6194003614007"
  ["Beurre Presidence 250g"]="|3500|20|5|Laitiers|3228021130016"
  ["Lait Nido 400g"]="|5500|25|6|Laitiers|7613033137471"
  ["Savon Lux Rose"]="|400|100|20|Hygiene|6001087378580"
  ["Dentifrice Colgate 75ml"]="|1200|45|10|Hygiene|8714789959107"
  ["Shampoing Pantene 200ml"]="|2500|30|8|Hygiene|8001090302960"
  ["Gel douche Dove 250ml"]="|2800|25|6|Hygiene|8717163598566"
  ["Deodorant Rexona 150ml"]="|3000|20|5|Hygiene|6001087017616"
  ["Detergent OMO 500g"]="|1500|50|12|Entretien|6001087330540"
  ["Eau de javel 1L"]="|800|40|10|Entretien|6194001900014"
  ["Essuie-tout Lotus x2"]="|1200|30|8|Entretien|3281099887707"
  ["Biscuits Oreo 176g"]="|1800|40|10|Snacks|7622210951991"
  ["Chips Lays 45g"]="|900|60|15|Snacks|4902504111779"
  ["Chocolat Milka 100g"]="|2500|30|8|Snacks|7622300441937"
  ["Bonbons Haribo 100g"]="|1000|50|12|Snacks|4001686325841"
  ["Cacahuetes grillees 100g"]="|600|80|20|Snacks|6194001900021"
  ["Oeufs frais boite x12"]="|3500|20|5|Frais|6194001900038"
  ["Pain de mie Harrys"]="|1500|15|4|Frais|3017620400678"
  ["Credit Sonatel 1000F"]="|1000|200|50|Telephonie|6194001100017"
  ["Recharge Orange 500F"]="|500|300|80|Telephonie|6194001100024"
  ["Internet Orange 1Go"]="|1500|100|25|Telephonie|6194001100031"
  ["Pates spaghetti 500g"]="|750|60|15|Feculents|8000070034838"
  ["Couscous moyen 500g"]="|900|40|10|Feculents|3011360032070"
  ["Mais en boite 400g"]="|850|45|12|Feculents|3083680085826"
)

echo "Debut du seed — ${#PRODUITS[@]} produits..."
ok=0; fail=0

for nom in "${!PRODUITS[@]}"; do
  IFS='|' read -r _ prix stock seuil cat code <<< "${PRODUITS[$nom]}"
  resp=$(curl -s -X POST "$API/produits" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $TOKEN" \
    -d "{\"nom\":\"$nom\",\"prix\":$prix,\"stock\":$stock,\"seuilAlerte\":$seuil,\"categorie\":\"$cat\",\"codeBarres\":\"$code\"}")
  if echo "$resp" | grep -q '"success":true'; then
    echo "  OK  $nom"
    ((ok++))
  else
    echo "  ERR $nom -> $resp"
    ((fail++))
  fi
done

echo ""
echo "Done : $ok OK, $fail erreurs"
