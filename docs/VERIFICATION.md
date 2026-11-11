# Vérification scientifique — 11 novembre 2026

Les calculs ci-dessous utilisent exclusivement le code et les données déjà publics. Aucun fichier industriel ou personnel n’est ajouté. Les modules physiques A380 et DroneLab, les tables A380 et le contrôleur C sont inchangés par rapport à `36b575e`.

## 1. AéroOptim

**Sources :** fonctions `isa`, `derive`, `drag`, `cruise`, `wingMassRaymer`, `makeEvaluator` et `runOptimization` dans `projets/aero-optim/index.html`. Préréglage `PRESETS.c172`. Scénario et sortie versionnés dans `projets/aero-optim/reference-example.json`, avec SHA-256 du HTML normalisé en fins de ligne LF.

**Exécution :** audit initial `python -X utf8 tests/audit_baseline.py`, puis `python -X utf8 tests/test_aero_optim.py --record` pour archiver le scénario. Le même test sans `--record` vérifie l’empreinte et le résultat.

| Paramètre | Référence / domaine |
|---|---|
| Masse, carburant, réserve | 1 111 kg ; 145 kg ; 10 % du carburant préservé |
| Propulsion | Hélice ; 119 kW ; rendement 0,80 ; BSFC 0,30 kg/(kW·h) |
| Voilure initiale | b = 11 m ; S = 16,17 m² ; CLmax = 1,6 ; CD0 = 0,027 ; e = 0,75 constant |
| Recherche | b = 7,7–16,5 m ; S = 9,7–22,6 m² ; h = 0–6 000 m |
| Contraintes | Vs sol ≤ 98 km/h ; ROC sol ≥ 4,8 m/s ; AR ≤ 14 |
| Couplages | Masse d’aile relative active ; Nz = 5,7 ; t/c = 0,13 ; traînée de surface mouillée active, Cf = 0,0055 |
| Méthode | Grille 34 × 34, recherche d’altitude, simplexe pénalisé ; croisière par 40 intervalles de masse au point milieu |

| Grandeur calculée | Référence | Solution trouvée |
|---|---:|---:|
| Distance | 1 562,891238 km | 2 046,611999 km |
| Envergure | 11,000000 m | 16,500000 m |
| Surface | 16,170000 m² | 19,446429 m² |
| Allongement | 7,482993 | 14,000000 |
| Masse totale | 1 111,000 kg | 1 215,194751 kg |
| Masse d’aile estimée | 138,919939 kg | 243,114690 kg |
| Traînée au premier point de quadrature | 851,461936 N | 646,693073 N |
| Vs au sol | 94,395615 km/h | 90,022862 km/h |
| ROC maximal au sol | 5,995470 m/s | 6,395099 m/s |
| Altitude de croisière | 2 500 m | 2 400 m |

**Résultat :** +30,9503789 % de distance calculée. L’affirmation arrondie +31 % est reproductible pour ce scénario précis. Les résultats numériques initiaux et finaux sont identiques ; les modifications ajoutent surtout contexte, mesures dérivées et contrôle des entrées.

**Vérification indépendante :** pour ces croisières à CL constant, comparaison de la somme au point milieu avec l’intégrale analytique de Breguet pour hélice : `R = η (L/D) / (c g) ln(m0/m1)`, avec `c = BSFC / 3,6e6`. Écart relatif inférieur à `2e-6` sur les deux configurations. La loi scalaire de masse d’aile est aussi recalculée en Python : la masse initiale d’aile concorde à `1e-8 kg` près et le résidu du point fixe de masse optimisée reste inférieur à `0,001 kg` après les huit itérations JavaScript.

**Interprétation :** les bornes hautes d’envergure et d’allongement sont actives. La Vs conserve environ 7,977 km/h de marge et la montée environ 1,595 m/s. Les traînées comparent des vitesses et masses de quadrature différentes, pas un état aérodynamique commun. L’aile optimisée gagne de la finesse mais devient plus lourde. Modèle empirique sans dimensionnement structural détaillé, stabilité ni validation sur avion réel. La recherche ne démontre pas un optimum global.

## 2. A380 Cruise Lab

**Sources :** `data/project.json`, `model.js`, `project-model.js`, `mission.js`, `optimizer.js`, `scenarios.js`, `trajectory.js`, `vertical-profile.js`, `airport-config.js`. Le fichier dérivé comporte 180 cas WB et 310 cas HT ; les archives ayant servi à l’extraction ne sont pas dans ce clone.

**Exécutions :** `node scripts/reproduce_examples.mjs --write`, puis sans `--write` pour vérifier le résultat versionné et les empreintes ; tests `test_a380_project.py`, `test_a380_lab.py`, `test_a380_finite_climbs.py`, `test_a380_full_mission.py` et régressions d’interface. Le nouveau `test_a380_example.py` vérifie que le bouton recharge le modèle du projet après une étude paramétrique, retrouve le scénario versionné et signale un échec de chargement sans lui substituer un autre modèle.

### Exemple de croisière versionné

4 569 km ; masse initiale 300 000 kg ; carburant 120 000 kg ; réserve 15 000 kg ; vent et ΔISA nuls. Référence à Mach 0,60, 8 000 m, aucune montée. Domaine initial : Mach 0,50–0,80 ; 8 000–9 500 m ; jusqu’à deux montées de 600 m ; limite verticale 1,27 m/s. Autres paramètres conservés intégralement dans `data/reference-example.json`.

| Sortie | Référence | Meilleur profil exploré |
|---|---:|---:|
| Mach | 0,60 | 0,50 |
| Altitude / montées | 8 000 m / 0 | 8 000 m / 0 |
| Carburant consommé | 49 801,883893 kg | 36 157,753735 kg |
| Temps | 24 719,004023 s | 29 662,804827 s |
| Masse finale | 250 198,116107 kg | 263 842,246265 kg |

925 profils explorés, 475 admissibles. Gain de carburant **27,3968153 %**, pour **4 943,800805 s de plus**. Mach optimisé à la borne basse : ce résultat illustre un compromis à l’intérieur du domaine, pas une économie industrielle démontrée. La conservation de masse est contrôlée ; le carburant restant est distinct de la réserve exigée.

L’essai à pas de 10 km donne 49 801,883974 kg pour la référence, contre 49 801,883893 kg à 5 km : différence d’environ 0,000081 kg. Cette faible sensibilité numérique ne valide pas les hypothèses du modèle.

### Cas original à 500 t

À 10 668 m et Mach 0,75, poussée totale requise d’environ 422,7 kN contre environ 218,1 kN au maximum du domaine moteur choisi. Le calcul reste rejeté : « Poussée hors domaine N1 corrigé du projet ». Ni borne moteur, ni correction de pression, ni équation de trim n’ont été modifiées pour forcer un résultat.

Cette incompatibilité concerne le modèle reconstruit. Elle ne caractérise pas les performances de l’A380 réel. Conventions géométriques des moteurs, centrage, domaine des coefficients et ratings restent à confronter aux routines originales autorisées.

### Références indépendantes et limites

- 17 solutions d’équilibrage SciPy HYBR et inversions moteur vérifiées dans `test_a380_project.py` ; poussée à moins de 0,1 N, angles à moins de `1e-5` degré, résidus normalisés inférieurs à `1e-8`.
- 40 contrôles du modèle réduit et deux intégrations indépendantes SciPy DOP853 dans `test_a380_lab.py`.
- 79 contrôles de montées finies, six missions DOP853 et 17 trims indépendants dans `test_a380_finite_climbs.py`.
- 33 contrôles de vol complet et intégration indépendante du décollage/atterrissage dans `test_a380_full_mission.py` : bilans de masse, carburant, phases, temps et convergence.
- Les vues 3D, pentes, cadrages et exports sont vérifiés séparément du calcul de performance. L’exemple versionné est en croisière seule ; le démarrage interactif reste le vol complet paramétrique à basse vitesse.

Non exécutables ici : extraction et comparaison des 490 cas aux archives `.history`, faute d’archives ; comparaison au rapport original et attribution individuelle, faute de documents historiques ; validation sur vol réel, faute de données de vol. Les mentions antérieures d’extraction sont historiques.

## 3. DroneLab

**Sources :** `core.js`, `math.js`, `airframes.js`, `controller.c` ; nouveau protocole `demo.js`. Les équations de dynamique, capteurs, estimation et commande restent inchangées. Le protocole guide la simulation existante.

**Paramètres :** quad X, 1,5 kg, 5 m d’altitude, huit avec rayon de paramétrage 4 m et vitesse de paramétrage 1 m/s, vent/rafales nuls, bruit 1, graine 12, retour sur estimation. Pas de dynamique `1/240 s`. Impulsion unique à 20 s : Δv `[1.4, -.8, .3] m/s`, Δω `[.5, -.35, .2] rad/s`. Arrêt à 40 s simulées.

**Exécutions :** `node scripts/reproduce_examples.mjs`, `tests/test_guided_demo.py`, `browser_smoke.py`, `airframes.py`, `native_controller.py`, `airframes_native.py`, `arduino_export.py`.

| Indicateur du parcours | Résultat simulé |
|---|---:|
| RMS de suivi, phase de trajectoire seulement | 0,198627609 m |
| Erreur maximale après impulsion | 0,911571268 m |
| Rétablissement selon les bandes définies | 2,7375 s |
| Fraction de commandes saturées | 0 % |

La RMS est recalculée indépendamment à partir des positions et consignes de chaque pas de dynamique dans le test du protocole. Le rétablissement est le délai jusqu’à la dernière sortie des bandes position ≤ 0,5 m et écart de vitesse ≤ 0,3 m/s, avec au moins deux secondes dans les bandes jusqu’à la fin. Il dépend du scénario et de la fenêtre d’observation.

Node et Edge présentent seulement des différences au niveau des derniers chiffres flottants (environ `1e-15 m` sur ces indicateurs). Répétition dans le même navigateur et égalité entre calcul direct et déroulement affiché vérifiées.

**Parité native :** compilateur Zig 0.15.2 utilisé uniquement pour les tests locaux C99. Trace de 100 pas et trace de 700 pas sur les sept géométries ; huit sorties vérifiées, écart maximal observé 0 N dans cet environnement, seuil du test `1e-9 N`. Arrêt, désarmement et géométries invalides également contrôlés. Cela ne valide ni l’exécution temps réel ni un matériel embarqué.

Les 73 profils d’export Arduino sont vérifiés pour structure, CRC, extraction et sorties désactivées. Leur recompilation sur les cœurs Arduino et tout essai matériel restent hors exécution de cet audit ; les validations historiques du catalogue ne sont pas de nouveaux résultats.

## 4. Chiffres professionnels et projet sensible

| Sujet | Source disponible | Ce qui est vérifiable | Décision publique |
|---|---|---|---|
| 3DEXPERIENCE : 162 exigences, une journée / moins de 5 min | Description existante et bilan dans le CV local | Origine de la déclaration ; pas le chronométrage, le périmètre de relecture ou le caractère mesuré/estimé | Présentation contextualisée comme gain déclaré, sans benchmark ni ratio d’accélération |
| 7 spécifications, 17 révisions, >3 000 exigences, >1 000 suivies | Même source ; aucun journal fourni | Volumes déclarés ; impossible de distinguer exigences uniques et occurrences | Retrait des accroches ; périmètres séparés dans l’étude de cas |
| TGD1 : 3,5 h, 125 000 échantillons, 6 grandeurs, 28 exigences, 6 anomalies, 85 pages | Description/CV ; pas de signaux ni scripts autorisés publics | Déclaration, pas recalcul de volumes ni conclusion de conformité | Pas de RMSE, précision, difficulté spécifique ou qualification inventée |
| Hexacoptère : 8 kg, 10 km, 2 000 m | Déclaration seulement, sans compte rendu ni statut | Impossible de trancher objectif / calcul / simulation / mesure / validation | Caractéristiques et « essais réussis » retirés de la présentation publique |

Le CV est lu localement pour cohérence chronologique ; il n’est pas ajouté. Aucun résultat sur simulateur n’est assimilé à une validation industrielle et aucun document confidentiel n’est promis en entretien sans autorisation.
