# Vérification de la version 1.0.0

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
