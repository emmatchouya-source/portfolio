# Vérification de la version 1.0.0

## Version 1.4.0 — atelier d’analyse de mission

- Présentation factuelle du projet et de ses auteurs, animation 3D intégrée sans cadre décoratif, typographie système et réduction des surfaces encadrées.
- Bande d’indicateurs, graphique principal sur toute la largeur et tableau comparatif placé immédiatement après. Les vitesses caractéristiques et le diagnostic suivent le bilan.
- Paramètres avancés repliables, panneau de configuration mobile fermé au démarrage ; les champs invalides et leurs groupes sont révélés avant le focus de validation native.
- Statut non validé en vol toujours visible ; détails accessibles et conservés dans le PDF. Aucune équation, donnée d’entrée ou limite physique modifiée.
- Contrôles navigateur de 360 à 1 512 px, onglets, provenance, formulaire, animation automatique, export/réimport et impression. Le cas initial conserve 49 801,884 kg pour la référence et 36 157,754 kg pour le meilleur profil exploré (tolérance du contrôle : 0,1 kg).

```text
python -X utf8 tests/test_a380_workbench.py
python -X utf8 tests/test_a380_startup.py
python -X utf8 tests/test_a380_hero.py
```

## Version 1.3.7 — attaches des moteurs

- Ajout de quatre pylônes solides entre les nacelles et les ailes du maillage partagé par l’introduction et la trajectoire. Les nacelles sont légèrement remontées ; elles restent entièrement sous les ailes.
- Les attaches suivent les triangles réels de l’aile et pénètrent légèrement dans les deux surfaces pour supprimer les interstices. Ces proportions restent illustratives, sans revendication de conformité à une CAO Airbus ; aucun calcul de performance n’est modifié.
- Contrôle indépendant par intersections rayon–triangle des attaches supérieures, vérification du contact avec les facettes des nacelles (32 points), captures de face et de trois quarts en WebGL et en rendu logiciel. Contrôles du pare-brise, de la profondeur ailes/moteurs et de l’animation automatique.

```text
python -X utf8 tests/test_a380_pylons.py
python -X utf8 tests/test_a380_cockpit.py
python -X utf8 tests/test_a380_depth.py
python -X utf8 tests/test_a380_hero.py
```

## Version 1.3.6 — pare-brise du cockpit

- Le pare-brise plan qui coupait la coque est remplacé par six panneaux ajustés aux facettes réelles du nez, avec un léger décalage vers l’extérieur et des montants visibles.
- Le contrôle de profondeur est conservé : les vitres ne sont pas forcées au premier plan et les parties situées derrière la coque restent naturellement occultées.
- Vérification de la position extérieure et de l’intégralité visible de chaque panneau avec rendu WebGL et logiciel, dans les deux ordres de dessin. Captures des vues avant gauche et droite ; essais de l’animation automatique et de l’occultation ailes/moteurs.

```text
python -X utf8 tests/test_a380_cockpit.py
python -X utf8 tests/test_a380_hero.py
python -X utf8 tests/test_a380_depth.py
```

## Version 1.3.5 — profondeur et lecture automatique

- Suppression du tri des faces par distance moyenne : le modèle de l’introduction et celui de la trajectoire partagent un rendu opaque à profondeur par pixel (WebGL). Les moteurs ne passent plus visuellement à travers les ailes.
- Repli logiciel avec tampon de profondeur si WebGL est indisponible ou perdu ; ajustement des plans proche/lointain au maillage pour conserver la précision dans le profil orthographique.
- Démarrage automatique dès que l’illustration devient visible. Le réglage de mouvement réduit ralentit la rotation et supprime l’oscillation ; il ne place plus l’animation en pause initiale. La pause manuelle et l’arrêt hors écran restent disponibles.
- Comparaison indépendante rayon–triangle sur un tour de caméra et cinq élévations, avec ordre des faces inversé, rendu graphique et logiciel. Vérification supplémentaire de surfaces rapprochées dans une caméra orthographique distante.

```text
python -X utf8 tests/test_a380_depth.py
python -X utf8 tests/test_a380_hero.py
python -X utf8 tests/test_a380_profile_scale.py
```

## Version 1.3.4 — modèle animé dans l’introduction

- Le dessin fixe est remplacé par une vue 3D animée : maillage partagé avec le lecteur de trajectoire, rotation lente, éclairage et ombre projetée.
- Orientation à la souris, au toucher ou au clavier ; pause explicite, pose fixe avec préférence de mouvement réduit, arrêt du rendu hors écran et lorsque la page est masquée.
- Contrôles navigateur de l’animation, de la pause, des interactions, des formats ordinateur/mobile et du rendu du même maillage dans la trajectoire. Aucun calcul aérodynamique ou de performance modifié.

```text
python -X utf8 tests/test_a380_hero.py
```

## Version 1.3.3 — pentes et profil fidèle

- Échelles identiques au chargement et après changement de caméra ; suppression du rétablissement implicite de l’amplification verticale de la vue globale.
- Profil local orthographique qui conserve les angles au sol, amplification optionnelle avec avertissement visible et affichage distinct des pentes air/sol.
- Pente finale au sol conservée en présence de vent longitudinal ; le taux vertical et l’angle air s’adaptent au vent. Cas sans vent inchangé.
- Exemples publics, formules et protocole : [FLIGHT_VISUALIZATION.md](FLIGHT_VISUALIZATION.md).

## Version 1.3.2 — continuité du sol et déplacement en suivi

- Sol schématique prolongé jusqu’à l’horizon par intersection des rayons de la caméra avec le plan du sol : aucune dalle finie susceptible de disparaître pendant l’approche.
- Découpage des segments et polygones au plan proche de la caméra puis aux limites de l’écran ; une piste ou une ligne partiellement visible reste affichée. Les coordonnées projetées extrêmes ne créent plus de bandes pleines dans le quadrillage.
- Grille adaptative et repères kilométriques ancrés dans les coordonnées du trajet. Le changement d’origine du suivi déplace les repères sans les attacher à l’avion.
- En caméra automatique, le cadrage suit la position calculée pendant toutes les phases ; la croisière automatique passe de ×3 600 à ×300 pour rendre son déroulement lisible. Distance et vitesse au sol apparaissent à côté de l’avion. Les accélérations manuelles restent disponibles.
- Contrôles indépendants par lancer de rayons, écrans larges/étroits, inclinaisons et distances caméra, ancrage spatial, passage de la descente au freinage et lecture en croisière. Les équations physiques ne changent pas.

```text
python -X utf8 tests/test_a380_ground.py
python -X utf8 tests/test_a380_full_mission.py
```

## Version 1.3.1 — ombre dans la scène 3D

- Remplacement de l’ellipse en pixels par la projection de la silhouette du maillage sur le sol local, avec la même direction lumineuse que l’avion.
- Projection en perspective, altitude locale des pistes, indépendance du décalage horizontal vis-à-vis de l’exagération verticale et adoucissement du contour avec la hauteur réelle.
- Masque de silhouettes rempli une seule fois : les faces superposées ne multiplient pas l’opacité. Atténuation visuelle à grande hauteur ; aucune ombre ponctuelle fixe en croisière.
- Éclairage fixe et avion agrandi : rendu illustratif, sans géolocalisation du soleil ni simulation photométrique. Aucun changement des équations de vol ou de l’optimisation.
- Contrôle géométrique par intersection rayon-plan, comparaison raster des faces superposées, caméras de départ/arrivée/dessus/côté, rotation, arrondi, arrêt et affichage mobile.

```text
python -X utf8 tests/test_a380_shadow.py
python -X utf8 tests/test_a380_trajectory.py
```

## Version 1.3.0 — décollage et atterrissage

- Mode vol complet avec neuf phases : accélération, rotation, montée après envol, montée initiale, croisière, descente, approche, arrondi, freinage.
- 33 contrôles physiques : bilans de masse/carburant/temps, raccords, fermeture au seuil, effet du vent, altitude/température, friction, limites de piste, réserves, masse et énergie des freins.
- Comparaison indépendante SciPy DOP853 du roulage/rotation/envol et du freinage : écart de distance < 0,03 m aux cas contrôlés ; événements détectés indépendamment.
- Convergence 5 km / 2,5 km avec réduction simultanée des pas au sol/en vol : écarts < 0,1 kg et 0,05 s sur le cas de vérification.
- Essais navigateur : phases/caméras, vitesse automatique qui conserve l’arrondi, budgets, CSV/JSON, réimport d’une étude de vol complet et affichage à 390 px.
- Les 40 contrôles de croisière et les deux intégrations indépendantes restent applicables ; les hypothèses aéroportuaires ne changent pas le mode croisière.

```text
python -X utf8 tests/test_a380_full_mission.py
python -X utf8 tests/test_a380_lab.py
python -X utf8 tests/test_a380_finite_climbs.py
```

Les données basse vitesse sont paramétriques et non validées A380. Les marges TORA/TODA/LDA ne constituent pas une validation AFM ou réglementaire. Voir [TAKEOFF_LANDING.md](TAKEOFF_LANDING.md).

## Version 1.2.0 — montées physiques de durée finie

Les entrées 1.0/1.1 ci-dessous sont un historique. La version 1.2 remplace leur hypothèse de montées instantanées ; leurs résultats à plusieurs paliers ne sont plus des valeurs de référence du moteur actuel.

- 79 contrôles : raccords C², continuité temporelle/spatiale, masse, puissance, taux vertical, convergence, rejets des contraintes et valeurs non finies.
- Six missions comparées à une référence indépendante Python/SciPy : Hermite quintique, angle sous vent par Brent, intégration DOP853. Tolérances : 0,01 kg et 0,01 s.
- 17 équilibres HYBR et inversions moteur indépendants pendant les montées source.
- Le cas source 500 t reste rejeté. La correction n’augmente pas artificiellement la poussée disponible pour le rendre faisable.
- Équations, hypothèses et protocole : [FINITE_CLIMBS.md](FINITE_CLIMBS.md).

```text
python -X utf8 tests/test_a380_finite_climbs.py
python -X utf8 tests/test_a380_lab.py
python -X utf8 tests/test_a380_steps.py
python -X utf8 tests/test_a380_trajectory.py
```

Ces contrôles établissent une cohérence numérique et fonctionnelle. Ils ne remplacent pas une validation des performances avion sur données indépendantes.

## Correction 1.1.2 — profil configuré dans la vue 3D

La vue 3D sélectionne le profil configuré admissible avant le profil optimisé. Les équations et l’optimiseur restent inchangés. Un test sépare volontairement deux montées configurées de zéro montée autorisée à l’optimiseur : télémétrie 8 000 / 8 600 / 9 200 m, changements à l’instant exact des transitions, rendu du canvas, export CSV et sélection indépendante des deux profils. Il vérifie aussi le recalcul depuis la vue 3D, la mise en page mobile et le remplacement explicite d’une référence rejetée par une trajectoire optimisée admissible.

```text
python -X utf8 tests/test_a380_steps.py
```

## Correction 1.1.1 — démarrage et diagnostic de faisabilité

Le démarrage utilise le cas de vérification numérique à 300 t, tandis que le cas du rapport à 500 t reste sélectionnable. Les équations, les données et les limites physiques du modèle sont inchangées.

- Vérification des deux jeux de paramètres, de leur identification et du rejet maintenu du cas 500 t.
- Essais Edge : démarrage calculable, lecture 3D, changement de scénario, diagnostic de poussée, récupération après modification d’une contrainte, import d’une étude rejetée et rechargement de la page.
- Le diagnostic du cas original affiche 422,7 kN requis contre 218,1 kN disponibles dans le domaine moteur retenu. Le bouton de récupération rétablit le jeu complet des paramètres du cas de vérification.
- Contrôle de la mise en page sur mobile à 390 px et absence d’erreurs JavaScript.

```text
python -X utf8 tests/test_a380_startup.py
```

## Extension 1.1.0 — trajectoire 3D

La version 1.1 ajoute uniquement une lecture spatiale et temporelle des points calculés. Les équations de performance, contraintes et données numériques restent celles de la version 1.0.

- 20 contrôles supplémentaires : projection perspective, repère caméra, interpolation temporelle, coordonnées physiques, conservation des sauts d’altitude, bornage aux extrémités et rejet des profils infaisables.
- Essais dans Edge : télémétrie synchronisée, lecture/pause, retour au début, changement de profil et de caméra, zoom, vrai geste tactile de pincement, superposition, capture PNG et export des coordonnées CSV.
- Contrôle du cas source 500 t sans animation fictive, puis lecture du cas de vérification source à 300 t. Contrôles sur ordinateur et en largeur mobile de 390 px.
- Les 40 contrôles du noyau, les deux intégrations SciPy DOP853 et les essais existants d’import/export, PDF et interface ont été relancés avec succès.

Le curseur conserve la durée exacte, y compris les fractions de seconde. La lecture ne lisse pas les changements de palier instantanés. L’exagération verticale et le zoom n’affectent pas les coordonnées exportées. Les captures de contrôle sont dans `.test-artifacts/a380/3d-*.png`.

```text
python -X utf8 tests/test_a380_trajectory.py
```

## Vérifications du modèle initial

Exécutée le 28 octobre 2026 sous Windows, Python 3.13, SciPy 1.18.1 et Microsoft Edge via Playwright. Ce dossier décrit une vérification numérique et fonctionnelle ; il ne constitue pas une validation en vol.

| Vérification | Résultat |
|---|---|
| 180 cas OpenVSP WB et 310 cas HT, comparaison MAT / dernière itération `.history` | 490 cas concordants, tolérance 1e-10 |
| Contrôles numériques du noyau, contraintes, vents, MRC/LRC/ECON et optimisation | 40 contrôles passés |
| Deux missions du mode paramétrique comparées à SciPy DOP853 | Écart carburant < 0,001 kg ; temps < 1e-7 s |
| Équilibrage projet comparé à SciPy HYBR et produits vectoriels indépendants | 17 points concordants ; angles < 1e-5 degré ; poussée < 0,1 N |
| Inversion moteur du point faisable comparée à SciPy Brent | N1 corrigé < 1e-5 point ; débit < 1e-6 kg/s |
| Indice d’émission nul / débit hors domaine | Non disponible, sans plancher ni extrapolation |
| JSON, CSV, dossier imprimable et réimport | Passés ; résultats recalculés, sans utilisation des résultats importés |
| Réimport d’une étude projet > 2 Mo | Passé, modèle et champs de centrage conservés |
| Vues ordinateur et mobile, navigation clavier, cas invalides et sans solution | Passés, sans erreur JavaScript ni débordement de la page |

## Cas repères

| Cas | Résultat du modèle |
|---|---|
| Projet, 500 t, 10 668 m, Mach 0,75 | Équilibrage : α 6,103089°, stabilisateur −4,107812° ; poussée requise 422,650 kN, capacité au N1c maximal d’étude 218,107 kN. Mission rejetée. |
| Projet, cas de vérification 300 t, 8 000 m, Mach 0,6, 4 569 km | Référence faisable : 49 801,884 kg brûlés ; durée 24 719,004 s. |
| Même cas, recherche Mach 0,5–0,8 / altitude initiale 8–9,5 km / 0–2 montées | 850 profils explorés, 440 admissibles. Meilleur candidat discret : Mach 0,5, 8 000 m, aucune montée ; 36 157,754 kg brûlés. Solution sur les bornes basses, sans optimum intérieur identifié. |
| Convergence du meilleur candidat projet : RK4 5 km / 2,5 km | Écart de carburant 0,0000333 kg environ, relatif 9,22e-10. |
| Mode paramétrique, étude initiale 500 t / 4 569 km | 1 807 profils explorés, 1 730 admissibles ; modèle synthétique séparé, aucune calibration revendiquée sur l’A380. |

Les valeurs du cas de vérification ne représentent pas une mission opérationnelle d’A380. Les réserves sur centrage, bras moteur, domaine de régime et coût des montées figurent dans [SOURCE_MODEL.md](SOURCE_MODEL.md). La convergence numérique ne résout pas ces réserves physiques.

## Reproduction

Depuis la racine du portfolio :

```text
python -X utf8 scripts/prepare_a380_sources.py
python -X utf8 tests/test_a380_lab.py
python -X utf8 tests/test_a380_project.py
```

La première commande demande les fichiers locaux `Outils/` et les bibliothèques SciPy, NumPy, PyMuPDF et openpyxl. Les tests navigateur demandent Playwright et Edge. Les captures, exports, résultats détaillés et PDF de contrôle sont écrits dans `.test-artifacts/a380/`, ignoré par Git. Le code public contient le jeu numérique dérivé pour utiliser l’application sans les archives originales.
