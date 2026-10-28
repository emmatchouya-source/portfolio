# Modèle reconstruit à partir des fichiers MGA803

Le répertoire `Outils/` contient les références ajoutées par le propriétaire du portfolio. Il est ignoré par Git : ni les documents complets, ni le FCOM, ni les archives du cours ne sont republiés. Seul le jeu numérique dérivé `data/project.json` est distribué avec le code.

## Préparation et traçabilité

```text
python -X utf8 scripts/prepare_a380_sources.py
```

Le script lit `Outputs/aero_data` dans `Program_AeroModelGeneration.zip` avec SciPy, puis vérifie **chaque coefficient** contre la dernière itération du cas correspondant dans les fichiers WB/HT `.history` de la même archive. Résultat : 180 cas WB et 310 cas HT concordants à 1e-10 près. Le jeu dérivé conserve les géométries de référence et les empreintes SHA-256 des trois fichiers sources numériques : archive, PDF de propulsion et classeur OACI.

- WB : α −2 à 15°, Mach 0,001 à 0,9, CL / CDtot / CMy.
- HT : α −15 à 15°, Mach 0,001 à 0,9, CL / CDtot ; Cm propre supposé nul comme dans le rapport.
- S WB = 859,869194 m² ; c WB = 10,689063 m.
- Origine de moment WB : X = 32,298022 m, Z = 1,758200 m.
- S HT = 205,559029 m² ; origine HT : X = 64,934583 m, Z = 3,021092 m.

Les fichiers contiennent donc bien Mach 0,8 et 0,9, contrairement au domaine limité à 0,7 indiqué dans le tableau I du rapport. Aucune extrapolation n’est nécessaire pour les Mach d’étude jusqu’à 0,89. L’interpolation est bilinéaire ; elle diffère du spline MATLAB décrit dans le rapport.

## Repères et équilibrage

Repère géométrique X vers l’arrière et Z vers le haut, moment My positif à cabrer. CG nominal à l’origine de moment WB ; `cgOffset` est un déplacement en mètres vers l’arrière, limité à ±3 m pour l’étude. **Aucune assimilation à 40 % de corde** : le lien entre le centrage du rapport et l’origine de moment des simulations n’est pas documenté.

Pour un α et un δstab donnés :

```text
ε = (1,18 + 0,37 α) degrés
αHT = α − ε + δstab
CLHTglobal = CLHT cos ε − CDHT sin ε
CDHTglobal = CDHT cos ε + CLHT sin ε
L = q(SWB CLWB + SHT CLHTglobal)
D = q(SWB CDWB + SHT CDHTglobal)
T = D / cos(α + φ), φ = 2°
```

Le moment de chaque contribution est ramené au CG par le produit vectoriel `My = z Fx − x Fz`. Pour une force aérodynamique exprimée dans les axes vent :

```text
Fx = D cos α − L sin α
Fz = L cos α + D sin α
```

Le moment propre WB est `q SWB cWB CMyWB`. Le moment HT inclut la translation de son origine au CG, avec CmHT nul. Les moteurs sont reconstruits à X = −1,7 m / −6,0 m et Z = −0,5 m / −1,6 m relativement à la référence WB, chaque paire fournissant T/2. Le signe des distances est une **hypothèse géométrique explicite à confirmer**, le rapport ne fournissant pas la routine complète et présentant des équations de moments ambiguës. Leur direction de poussée dans les axes corps utilise φ, et non α + φ ; cette dernière n’est utilisée que dans les axes vent.

Newton amorti à deux inconnues (α, δstab), la poussée étant éliminée analytiquement par l’équilibre axial. Résidus normalisés :

```text
rL = (L + T sin(α + φ) − mg)/(mg)
rM = Mtotal/(q SWB cWB)
```

Seuil de convergence : max(|rL|,|rM|) < 1e-8, 25 itérations maximum, recherche amortie dans le domaine des tables. Stabilisateur limité à ±15° **pour l’étude**, sans affirmation de débattement réel certifié. Aucun buffet ou décrochage n’est identifié à partir de ces données potentielles.

## Propulsion corrigée

Les 18 coefficients de poussée et les 18 coefficients de débit sont extraits littéralement de `Données pour le modèle de propulsion Fichier.pdf`.

```text
FNcorrigé/moteur = fFN(N1corrigé, M) × 352900 N
WFcorrigé/moteur = fWF(N1corrigé, M) × 2 × (9856,8/3600) kg/s
N1corrigé = N1/√θ
FN = δ FNcorrigé
WF = δ √θ WFcorrigé
```

Le facteur ×2 du code de débit est conservé, malgré son absence dans la transcription du rapport. Tests repères : `fFN(95,0.8) = 0.4063312749816` ; `2 fWF(95,0.8) = 0.3532071094669761`.

L’inversion de poussée utilise une bisection dans le domaine N1 corrigé réglable (50 à 110 % par défaut), avec contrôle de monotonie échantillonné à 70 intervalles. Ces bornes sont une **hypothèse de domaine d’étude**, car le domaine d’identification et les ratings Trent ne sont pas fournis. La poussée au régime maximal d’étude définit la capacité du modèle et la marge contrôlée ; elle ne constitue pas une poussée maximale certifiée.

Le FCOM fourni est explicitement un document de ratings **GP7270**, donc un autre moteur que le **Trent 970B-84** décrit dans le rapport et les données OACI. Il n’est pas utilisé pour combler les limitations Trent manquantes.

### Résultat de l’audit initial

À 500 t, 10 668 m et Mach 0,75, l’assemblage ci-dessus nécessite environ **422,65 kN** de poussée totale. Le domaine de régime corrigé retenu fournit une capacité nettement inférieure. L’application refuse ce point et ne publie ni consommation ni gain d’optimisation pour une mission non réalisable par ce modèle.

Ce résultat ne démontre pas que l’A380 réel ne peut pas effectuer ce vol : il met en évidence une incompatibilité entre les données, les conventions reconstruites et le domaine moteur retenu. Pour lever cette réserve, il faut les routines MATLAB de trim/propulsion du projet et la définition de leur domaine, puis un cas de référence vérifié. Élargir les limites ou supprimer la correction de pression pour obtenir artificiellement un résultat ne constitue pas une validation.

Un cas à 300 t, altitude initiale 8 km, Mach 0,6, domaine 8–9,5 km / Mach 0,5–0,8 est disponible comme **cas de vérification numérique**, sans prétention de représenter une mission réaliste avec les masses sèches et réserves d’un A380 exploité.

## Émissions

Extrait de la ligne OACI `18RR082`, Trent 970B-84, poussée de référence 352,9 kN, classeur fourni :

| Phase | Débit kg/s | CO g/kg | NOx g/kg | HC g/kg |
|---|---:|---:|---:|---:|
| Idle | 0,261 | 12,65 | 5,57 | 0,04 |
| Approach | 0,749 | 1,05 | 12,37 | 0,07 |
| Climb-out | 2,262 | 0,31 | 31,30 | 0,09 |
| Takeoff | 2,738 | 0,33 | 41,34 | 0 |

BFF simplifié du rapport, x = 1 et y = 0,5 :

```text
WFref = WFcorrigé (1+0,2 M²) θ^4,3
EIref : interpolation log–log sur les quatre points, sans extrapolation
EICO/HC = EIref θ^3,3 / δ^1,02
EINOx = EIref √(δ^1,02 / θ^3,3) exp[−19(ω−0,00634)]
```

Humidité relative fixée à 80 % comme dans le rapport ; saturation selon son équation 18, pression convertie en Pa. Les EI sont convertis de g/kg en kg/kg avant intégration RK4 sur chaque mission. Dès qu’un indice devient non calculable, l’émission intégrée correspondante est déclarée indisponible sur la mission complète. En particulier, l’indice HC nul à Takeoff empêche une interpolation logarithmique sur le dernier intervalle : aucun plancher arbitraire n’est substitué au zéro.

Les données LTO ne sont pas des mesures d’émissions en croisière ; la correction BFF reste un modèle et demande validation. Les jeux réduits importés et le modèle paramétrique ne réutilisent pas ces indices sans carte moteur compatible.
