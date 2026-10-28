# Vérification de la version 1.0.0

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
