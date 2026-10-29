# A380 Cruise Lab

Application statique d’analyse et d’optimisation de la **croisière ou d’un vol complet**, intégrée au portfolio d’Emmanuel Tchouya. Aucun compte, serveur de calcul ou transfert de fichier importé. Les calculs tournent dans un Web Worker ; annuler interrompt le travail.

Depuis la version 1.3, « Vol complet » ajoute roulage, rotation, montée initiale, descente, approche, arrondi et freinage à l’arrêt. Ces phases utilisent un **modèle basse vitesse paramétrique distinct**, avec hypothèses éditables, sans extrapoler les tables de croisière. Elles sont incluses dans le temps et le carburant optimisés. Voir [TAKEOFF_LANDING.md](TAKEOFF_LANDING.md) pour les équations et les limites de qualification.

## Statut scientifique

Source principale : Lina Seghilani, Emmanuel Tchouya Tangwa et Cyril Traineau, *Conception d’un modèle de performance pour un avion Airbus A-380 en phase de croisière*, projet MGA803, ÉTS, été 2025, 12 pages. Le PDF fourni dans le répertoire parent a été lu. Il n’est pas republié, notamment parce qu’il contient les coordonnées et identifiants des coauteurs.

Le rapport décrit une chaîne OpenVSP, équilibrage longitudinal, modèle moteur Trent 970B-84, émissions BFF et intégration de trajectoire. Ses **fichiers complémentaires ont été ajoutés pendant le développement** : archives OpenVSP/MATLAB, coefficients de propulsion, classeur OACI et références. Le modèle du projet est maintenant intégré avec des conventions explicites. Il ne prétend pas reproduire exactement les figures du rapport ni prédire les performances réelles d’un A380 sans validation.

Trois modes :

Ces trois modèles concernent la croisière. En vol complet, le modèle basse vitesse des autres phases reste explicitement paramétrique et non validé A380.

- **Projet MGA803**, mode initial : 180 cas WB + 310 cas empennage, équilibrage longitudinal de l’incidence, du stabilisateur et de la poussée ; propulsion corrigée et émissions BFF simplifiées. Les 490 cas ont été comparés aux dernières itérations des fichiers `.history`. Voir [SOURCE_MODEL.md](SOURCE_MODEL.md) pour les équations, les hypothèses d’assemblage et les anomalies de faisabilité.

- **Paramétrique de démonstration**, explicitement signalé dans l’interface, le dossier imprimé et le JSON. Hypothèses éditables de polaire, TSFC et perte de poussée.
- **Tables importées**, fournies par l’utilisateur : polaire de l’avion complet équilibré et tables moteur réduites en conditions ISA. Aucune validation automatique de leur fidélité physique ; aucune extrapolation. L’import direct de `.history` est réservé au script de préparation local.

L’outil sert aux études exploratoires et à la comparaison reproductible de modèles. Il ne sert pas à planifier ou conduire un vol. Aucune qualification, affiliation ou validation par Airbus ou une université n’est revendiquée pour cette extension web.

## Utilisation

Servir la racine du portfolio par HTTP :

```text
python -m http.server 8080
```

Ouvrir `http://localhost:8080/projets/a380-lab/`. Un navigateur moderne supportant les modules et Web Workers est nécessaire. L’application ne nécessite aucune compilation et utilise les polices système, sans téléchargement de police externe.

Depuis la version 1.4, les résultats sont organisés autour du profil altitude–distance et du tableau de comparaison. Les paramètres essentiels restent visibles sur ordinateur ; le vent, les transitions et le domaine de recherche se déplient à la demande. Sur mobile, ouvrir « Paramètres de mission » pour modifier l’étude. Le statut académique du modèle reste visible et son détail est accessible dans « Hypothèses et limites » ; il est conservé à l’impression.

La vue 3D démarre en suivi automatique, à échelle réelle, avec un cadrage rapproché au décollage et à l’atterrissage, intermédiaire en montée/descente et plus large en croisière. Les changements de cadrage sont progressifs. Le curseur d’exagération est directement dans la scène ; « Auto » rétablit le réglage adapté à la vue. Par défaut, toutes les vues sont à ×1 ; les profils orthographiques conservent alors les angles. L’exagération de ×1 à ×400 est modifiable dans toutes les vues et reste conservée lors des changements de caméra et du cadrage de la mission entière. Auto ou Profil local fidèle rétablit ×1. Le dézoom du suivi peut atteindre la mission entière, également accessible par un bouton intégré à la scène. Les profils par phase utilisent chacun un zoom uniforme, sans raccord entre cadres : le décollage, les montées par paliers et l’atterrissage restent lisibles sans redresser leurs angles. Une éventuelle amplification manuelle est explicitement schématique. Ces réglages de présentation ne modifient ni les points de trajectoire, ni les calculs, ni le CSV.

Les trois boutons dans la scène ouvrent directement le suivi 3D, le profil latéral et la mission entière. Le cadrage initial garde la croisière horizontale. Le profil latéral utilise une grille cartésienne à axes égaux, et la vue globale montre un repère de position à la place d’une maquette démesurément agrandie. Voir [les choix de représentation et les références publiques](FLIGHT_VISUALIZATION.md).

1. Définir la mission, le profil de référence et les contraintes.
2. Choisir l’objectif : carburant, durée, ou carburant + CI × durée en minutes.
3. Lancer l’analyse. Les résultats correspondent toujours à la dernière configuration calculée ; une modification non appliquée est signalée.
4. Examiner les marges, les exclusions, la convergence et les hypothèses avant d’interpréter un gain.
5. Exporter l’étude JSON, la trajectoire CSV ou imprimer le dossier en PDF.

Le démarrage charge le **vol complet de vérification à 300 t**, du décollage à l’arrêt après atterrissage, avec une altitude de croisière initiale de 8 km. Le bouton de réinitialisation rétablit également ce vol complet. Ce n’est pas une mission opérationnelle A380 validée. Le sélecteur « Cas d’étude » conserve le cas original du rapport : 4 569 km, 500 000 kg, 10 668 m, Mach 0,75 et Δh = 600 m selon le tableau II. Le carburant initial de 120 t, la réserve de 15 t et les limites d’étude sont des hypothèses supplémentaires. **Dans le modèle du projet reconstruit, le cas 500 t dépasse le domaine de poussée retenu.** Un diagnostic explique le rejet et permet de charger le cas calculable ; aucune borne moteur ni équation n’est modifiée pour forcer un résultat.

Le lien `?scenario=report` charge explicitement le cas original ; `?scenario=verification` charge le cas de vérification. `?model=parametric` conserve l’exploration séparée du modèle synthétique à 500 t. Le bouton de réinitialisation restaure le scénario de démarrage et le modèle du projet. La dernière étude calculée peut être restaurée explicitement depuis le stockage local du navigateur ; elle ne remplace pas automatiquement le cas de démarrage. L’import JSON conserve les paramètres de l’étude importée, même si son profil est rejeté.

`?scenario=climbs&view=3d` ouvre le cas de vérification avec deux montées de 600 m et une limite verticale de 1,27 m/s, pour examiner immédiatement les transitions physiques. Ce choix est également disponible dans « Cas d’étude ».

`?scenario=full&view=3d` ouvre le cas de vol complet de vérification à 300 t. Le sélecteur « Périmètre du calcul » permet aussi de changer de mode. En vol complet, la masse/carburant sont ceux au début du roulage et la distance relie les seuils d’aéroport. La croisière utilise la masse restante et la distance utile, puis la mission se poursuit jusqu’à l’arrêt après le seuil d’arrivée. Les réglages de pistes/procédures apparaissent dans le panneau de configuration ; polaires, freinage et propulsion basse vitesse sont dans « Modèle & données ».

## Trajectoire 3D — version 1.3.3

L’illustration de l’introduction utilise depuis la version 1.3.4 le même maillage que le lecteur de trajectoire, défini dans `aircraft-mesh.js`. Cette animation de présentation est indépendante du calcul : démarrage automatique, rotation lente, orientation interactive et bouton de pause. La préférence de mouvement réduit ralentit la rotation et supprime l’oscillation, sans nécessiter de clic pour démarrer. Le rendu s’arrête hors écran. Depuis la version 1.3.5, `depth-mesh.js` gère la profondeur des ailes, du fuselage et des moteurs par pixel, avec un repli logiciel si WebGL n’est pas disponible.

L’onglet **Trajectoire 3D** anime un avion à quatre moteurs sur les points de la mission calculée. Le lien `?view=3d` ouvre directement cette vue. Lecture/pause, retour au début, curseur temporel et vitesses ×60 / ×300 / ×1 200 / ×3 600. Chaque position est accompagnée de la distance, altitude, Mach, TAS, masse, carburant et, en mode projet, incidence et stabilisateur équilibrés.

La vue suit par défaut le **profil configuré (référence)** pour reproduire le nombre de montées saisi. Le **profil optimisé (recommandé)** reste sélectionnable : son nombre de montées est choisi par l’optimiseur et peut être nul, même si la référence en contient deux. Le texte au-dessus de la scène précise le profil suivi, le nombre de montées et les altitudes initiale/finale. Les boutons de paliers permettent d’atteindre chaque transition exacte. Après modification des paramètres, « Appliquer et recalculer la trajectoire » recalcule l’étude ; les données affichées restent celles du dernier calcul jusque-là. Une référence non admissible n’est pas animée : la vue sélectionne alors le profil optimisé admissible et explique ce remplacement.

La caméra permet une vue d’ensemble, un suivi de l’avion, une vue de dessus et une vue de profil. Rotation à la souris ou au toucher, zoom à la molette ou par pincement, translation avec Maj + glisser, boutons et raccourcis clavier. L’autre profil peut être superposé pour comparaison. La lecture démarre uniquement sur demande et s’arrête lorsqu’on quitte la vue ou la page visible.

La scène utilise une projection perspective de géométries 3D, rendue en Canvas, sans bibliothèque ou service externe. Elle représente le **repère d’étude longitudinal**, sans latitude/longitude, relief réel ou courbure terrestre. X = distance au sol en mètres, Y = 0 et Z = altitude du modèle. Le maillage de l’avion est illustratif et agrandi pour la lecture. Les axes ont la même échelle par défaut. Le **profil local fidèle**, orthographique à ×1, conserve les angles au sol. L’amplification verticale de 1 à 400 est optionnelle, signalée et modifie seulement le rendu. Voir [FLIGHT_VISUALIZATION.md](FLIGHT_VISUALIZATION.md) pour les exemples publics étudiés et les contrôles d’angles.

La position et la télémétrie suivent les points de l’intégration physique. L’altitude est réévaluée sur la même trajectoire C² que celle du calcul, sans saut ni lissage décoratif. Les montées sont indiquées en orange. L’assiette affichée est la pente de vol + l’incidence équilibrée du mode projet ; le mode réduit affiche la pente seule. La télémétrie ajoute vitesse verticale, pente, poussée et débit. Le tableau des montées donne leurs distances, durées et carburants calculés. Les boutons « milieu » permettent d’examiner la transition. Ni virage, roulis ni dynamique 6DOF ne sont ajoutés par la vue.

Une mission rejetée n’est pas animée. Le bouton du cas de vérification est également disponible dans la scène vide. Modifier les entrées marque la lecture comme correspondant à la dernière étude calculée ; il faut relancer l’analyse pour appliquer les changements. La caméra, le zoom et le curseur n’affectent jamais les résultats d’optimisation.

Exports supplémentaires : capture PNG avec contexte du modèle et échelle, et CSV des coordonnées **physiques** (mètres), temps, phase de vol, vitesse verticale, pente, poussée et débit du profil choisi. Temps et distance croissent pendant les montées, indépendamment de l’exagération visuelle. Le JSON comporte la trajectoire C², le bilan d’énergie, les statistiques des montées et les réserves de qualification. Le dossier PDF d’étude conserve les graphiques scientifiques existants ; la vue interactive s’exporte séparément en PNG.

```text
python -X utf8 tests/test_a380_trajectory.py
```

## Modèle, unités et hypothèses

Les calculs internes utilisent exclusivement le SI : m, s, kg, N, K. Le formulaire utilise km pour la distance et mg/(N·s) pour la TSFC de référence.

### Atmosphère

Altitude traitée comme altitude géopotentielle, de 0 à 20 000 m. `g = 9,80665 m/s²`, `R = 287,05287 J/(kg·K)`, `γ = 1,4`.

- Jusqu’à 11 km : `TISA = 288,15 − 0,0065 h`, `p = 101325 (TISA/288,15)^(g/(0,0065 R))`.
- De 11 à 20 km : `TISA = 216,65 K`, pression exponentielle hydrostatique continue à la tropopause.
- `T = TISA + ΔISA`, à pression standard fixée ; `ρ = p/(RT)` et `a = √(γRT)`.
- `V = Ma` et `Vsol = V + vent`. Vent longitudinal constant, sans composante latérale.

### Équilibre et aérodynamique du mode paramétrique

`q = ρV²/2`, `CL = mg/(qS)`, `CD = CD0 + k CL² + A max(0,M−Mcrit)^4`, `Trequise = D = qS CD`.

Dans ce mode paramétrique uniquement : équilibre réduit quasi stationnaire, sans composante verticale de poussée. Ni moments, incidence, stabilisateur, downwash, centrage, ni buffet ne sont résolus. Le mode projet décrit dans SOURCE_MODEL.md résout séparément les forces et le moment de tangage.

Par défaut : `S = 859 m²` (rapport p. 5), `CD0 = 0,016`, `k = 0,042`, `Mcrit = 0,78`, `A = 20`. Les quatre derniers sont des hypothèses synthétiques non identifiées sur l’A380.

La surface publique de 845 m² donnée par [Airbus, Facts & Figures 2021](https://www.airbus.com/sites/g/files/jlcbta136/files/2021-10/EN-Airbus-A380-Facts-and-Figures_0.pdf) diffère de la référence de 859 m² du rapport. Les coefficients dépendent de leur surface de référence : changer S seul ne constitue pas une correction valide du modèle.

### Propulsion de démonstration

`TSFC = TSFCref √(T/216,65) [1 + 0,6(M−0,75) + 2(M−0,75)²]`, avec `TSFCref = 15,5 × 10⁻⁶ kg/(N·s)`.

`Tdisponible = 4 × Tref × (p/p0)^0,7 × (1−0,25M)`, avec `Tref = 352 900 N/moteur`, référence reprise du rapport p. 3. La loi de perte de poussée est synthétique, non identifiée sur les moteurs Trent. Le débit total des quatre moteurs est `WF = Trequise × TSFC` en kg/s. Aucun calcul de N1 n’est fourni.

### Mission et montées par paliers

Intégration RK4 de la masse **et du temps**, `dm/dx = −WF/Vsol`, `dt/dx = 1/Vsol`, à Mach constant. La vitesse sol horizontale est `V cos γ + vent`. Les segments sont scindés aux départs/fins des montées et au franchissement de 11 km. Au moins 32 intervalles par montée à 5 km et 64 à 2,5 km : le contrôle de convergence affine aussi les transitions courtes.

0, 1 ou 2 montées de hauteur fixée. Leur profil est quintique C², avec pente et courbure nulles aux raccords. La vitesse verticale maximale détermine la longueur minimale de cette loi de transition. Le calcul résout les forces tangentielles et normales, la poussée requise, l’équilibrage du projet et le débit pendant toute la montée. Une montée hors capacité moteur, chevauchante ou inachevée est rejetée. Les départs sont configurables et peuvent être optimisés. Le cas numérique à 300 t utilise une limite de 1,27 m/s (250 ft/min), distincte de toute affirmation sur les capacités réelles de l’A380. Voir [FINITE_CLIMBS.md](FINITE_CLIMBS.md) pour les équations et vérifications.

La masse hors carburant reste `masse initiale − carburant initial`. La réserve finale est une contrainte, pas une phase de vol de dégagement ou d’attente simulée.

Contraintes contrôlées aux étapes RK4, en entrée et sortie de palier : CL maximal d’étude, fraction de poussée disponible, plafond, domaine des tables, vitesse sol > 30 m/s et réserve finale. La durée maximale porte sur la mission complète. Cette vérification échantillonnée n’est pas une preuve continue entre points.

### Vitesses et environnement

- MRC : maximum de `SR = Vsol/WF` sur une grille Mach à pas 0,001, à l’état initial de référence.
- LRC : première racine sur la branche rapide `SR = 0,99 SRmax`, bisection. Non affiché si la racine est hors domaine admissible.
- ECON : minimum discret de `(WF + CI/60)/Vsol` (WF en kg/s et CI en kg/min).
- Ces vitesses caractérisent un point de vol, tandis que l’optimisation de mission utilise la consommation intégrée. Elles peuvent différer du Mach recommandé pour la mission.
- CO₂ direct = 3,16 × carburant brûlé (rapport, équation 16). Pas d’effet non-CO₂, de traînées de condensation, ni d’analyse de cycle de vie. En mode projet seulement, NOx/CO/HC sont intégrés par le modèle BFF documenté, avec indice non disponible si une partie de la mission sort des données de référence ou rencontre un indice nul.

## Optimisation et limites du solveur

Variables : Mach constant, altitude initiale, nombre de montées et, si activé, position des départs. Hauteur des montées et limite de vitesse verticale fixées. La recherche de positions teste 10–90 % du trajet par pas de 10 %, puis affine à 2 % au meilleur Mach/altitude de chaque nombre de montées. C’est une recherche par coordonnées, sans garantie d’optimum conjoint global. Aucune modification de géométrie ou moteur n’est optimisée.

Balayage complet de la grille initiale (`ΔM = 0,01`, `Δh = 250 m`, intégration 40 km). Les bornes supérieures sont incluses. Affinement autour du meilleur point de chaque nombre de montées (`ΔM = 0,001`, `Δh = 50 m`, intégration 10 km). Les 30 meilleurs candidats sont recalculés à 5 km avant classement final. La référence admissible est aussi conservée si elle est dans le domaine de recherche, pour éviter une recommandation moins bonne que la référence.

La grille n’est pas une preuve d’optimalité globale continue, notamment pour des tables non convexes ou des îlots de faisabilité étroits. La carte Mach–altitude décrit le balayage initial sans montée, avec intégration 40 km. La frontière carburant–temps est un sous-ensemble non dominé des profils explorés, incluant les positions testées, vérifié à 5 km ; elle n’est pas une frontière de Pareto continue exacte.

La sensibilité applique ±10 % à CD0, k et TSFCref séparément, au profil recommandé fixé, sans réoptimisation et en conservant les contraintes. Un scénario violant une contrainte est marqué « Hors contrainte ». Ces scénarios ne sont pas des bornes statistiques ou probabilistes.

## Import de données

Le bouton de téléchargement fournit un exemple **synthétique**, pas des données A380 mesurées.

```json
{
  "schema": "a380-cruise-tables/v1",
  "name": "Nom du jeu de données",
  "source": "Provenance, version, protocole d’équilibrage et domaine de validité",
  "area": 859,
  "mach": [0.6, 0.85],
  "cl": [0.2, 1.2],
  "altitude": [9000, 12500],
  "cd": [[0.02, 0.08], [0.025, 0.09]],
  "tsfc": [[0.000015, 0.000015], [0.000016, 0.000016]],
  "maxThrust": [[500000, 350000], [480000, 330000]]
}
```

Les matrices sont indexées `[Mach][CL]` pour CD et `[Mach][altitude]` pour TSFC et poussée totale. Interpolation bilinéaire, axes strictement croissants, au moins 2 points par axe, 100 maximum. Valeurs finies et plages plausibles vérifiées, fichier limité à 10 Mo pour permettre le réimport des trajectoires longues. ΔISA est bloqué à zéro et S est fixé à la référence du jeu importé. La TSFC importée ne dépend pas du régime : évaluer la validité de cette réduction avant utilisation.

Une étude `a380-study/v1` contient configuration, tables éventuelles (y compris le jeu `a380-project/v1`), statut du modèle, date, version et résultats. **À l’import, seuls configuration et tables sont utilisés ; les résultats enregistrés ne sont pas considérés comme fiables et doivent être recalculés.** Le CSV contient les trajectoires recommandée et de référence avec unités explicites, paramètres d’équilibrage, statut du modèle et précision numérique conservée. Le dossier imprimable présente les résultats et les limites, le JSON fournit l’ensemble des entrées exactes.

## Vérification

```text
python -X utf8 tests/test_a380_lab.py
python -X utf8 tests/test_a380_project.py
```

Dépendances de développement uniquement : Python, SciPy, Playwright et Microsoft Edge installé. Les artefacts de test restent dans `.test-artifacts/a380/`, ignoré par Git.

Les vérifications couvrent les références ISA, la continuité à la tropopause, l’équilibre et les unités, la conservation de masse, l’effet du vent, les contraintes, les transitions exactes, MRC/LRC/ECON, le rejet des tables invalides et de l’extrapolation, les bornes et la convergence du solveur. Deux missions sont comparées à une intégration indépendante Python/SciPy DOP853. Les essais navigateur vérifient les exports et leur réimport, les tables, les états sans solution et la navigation clavier, sur ordinateur et mobile.

Le modèle du projet est aussi comparé à 17 résolutions SciPy HYBR indépendantes, avec vérification de l’inversion moteur. Le [dossier de vérification de la version 1.0.0](VALIDATION.md) consigne les résultats, dont l’incompatibilité du cas 500 t avec le domaine moteur retenu.

La vérification numérique établit la cohérence du code avec les équations documentées. **Elle ne valide pas la fidélité du modèle aux performances réelles.** Les matrices et coefficients fournis sont intégrés ; la correspondance exacte entre centrage, repères et limites moteur demande encore confirmation sur les routines d’équilibrage originales, non fournies. Une comparaison aux données de référence et de vol reste nécessaire.

## Corrections et réserves sur le rapport

- Masse initiale : 500 000 kg selon tableau II, plutôt que 5 × 10⁶ kg dans le texte p. 5.
- Temps : `Δt = Δx/Vsol`, plutôt que la relation inversée p. 5.
- Le tableau I limite le Mach wing-body à 0,7, alors que des figures vont à 0,89 : aucune extrapolation de ces surfaces n’a été inventée.
- Les équations typographiées de moments et de poussée présentent des ambiguïtés. Le modèle réduit ne prétend pas les résoudre sans fichiers sources.
- Les interprétations de température et d’émissions ne sont pas généralisées à un moteur réel sans vérification.

## Sources publiques

- [NASA Glenn — Drag coefficient](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-coefficient/), définition de la polaire et de la référence de surface.
- [NASA Glenn — Earth atmosphere](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/earth-atmosphere-equation-metric/), contexte des couches atmosphériques ; les constantes exactes employées ici sont données ci-dessus.
- [Airbus — Facts & Figures A380, septembre 2021](https://www.airbus.com/sites/g/files/jlcbta136/files/2021-10/EN-Airbus-A380-Facts-and-Figures_0.pdf), caractéristiques publiques, non utilisées comme calibration de performances.
- [EASA / OACI — Engine emissions databank](https://www.easa.europa.eu/en/domains/environment/icao-aircraft-engine-emissions-databank), données nécessaires à un futur modèle d’émissions moteur.
- [Ghazi & Botez, 2022, doi:10.2514/1.I011050](https://doi.org/10.2514/1.I011050), référence bibliographique du rapport.
