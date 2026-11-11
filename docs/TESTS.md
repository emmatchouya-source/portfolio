# Rapport de tests — 11 novembre 2026

Environnement exécuté : Windows, Python 3.13.15, Playwright 1.62.0, Edge installé, NumPy 2.5.2, SciPy 1.18.1, Node 26.13.0. Compilateur de test C99 : Zig 0.15.2 installé uniquement dans `.test-artifacts/toolchain` (non distribué).

Les tests et contrôles ci-dessous ont été exécutés. Les résultats historiques des anciennes documentations ne sont pas comptés comme de nouvelles exécutions.

## Suite existante

Commande : `python -X utf8 tests/run_audit_suite.py`. Première exécution : 26 scripts réussis, un échec, aucun timeout global. L’échec de `test_a380_steps.py` venait du test : après passage sur mobile il éditait un champ dans le tiroir fermé. Le test ouvre désormais le panneau comme un utilisateur ; sa relance ciblée `python -X utf8 tests/test_a380_steps.py` réussit. Le résultat final est donc 27 scripts réussis après cette correction ; la sortie initiale et son échec restent documentés, sans présenter le premier lancement comme entièrement réussi.

| Script | Résultat final | Portée / observation |
|---|---|---|
| `test_a380_cockpit.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_depth.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_auto_framing.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_exaggeration.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_finite_climbs.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_ground.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_full_mission.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_hero.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_profile_geometry.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_profile_scale.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_lab.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_pylons.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_project.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_scene_views.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_shadow.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_steps.py` | Réussi après correction du test et relance | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_startup.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_trajectory.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `test_a380_workbench.py` | Réussi | Calculs, interface ou rendu A380 ; voir le script pour ses assertions exactes |
| `browser_smoke.py` | Réussi | 22 contrôles numériques, commandes, exports, mobile et erreurs JavaScript |
| `airframes.py` | Réussi | 130 contrôles numériques/exports, sept géométries, import ancien et mobile |
| `native_controller.py` | Réussi | Compilation C99, 100 pas JS/C, désarmement et entrées invalides ; écart max 0 N |
| `airframes_native.py` | Réussi | Sept géométries, 700 pas JS/C, huit sorties, géométries invalides ; écart max 0 N |
| `arduino_export.py` | Réussi | 73 exports de profils, CRC32/ZIP, sorties inactives, profils personnalisés et mobile |
| `agent_bridge.py` | Réussi | Six tests locaux de l’agent, origines, appairage et opérations simulées |
| `agent_browser.py` | Réussi | Interface de l’agent et intégration navigateur |
| `airframes_agent.py` | Réussi | Sept géométries, préparation et compilation simulée dans l’agent |

Les 19 scripts A380 de cette suite incluent les comparaisons SciPy indépendantes, bilans, convergence, unités, cas rejetés, vues 3D, géométrie, profondeur, cadrages, import/export et affichage mobile. Aucun changement des équations ou données physiques A380/DroneLab n’est introduit.

## Nouveaux contrôles et reproduction

| Commande | Résultat | Ce qui a été réellement vérifié |
|---|---|---|
| `node scripts/reproduce_examples.mjs --write`, puis sans `--write` | Réussi | Exemple A380 recalculé, fichier versionné et empreintes comparés, rejet 500 t, protocole DroneLab déterministe |
| `python -X utf8 tests/test_aero_optim.py --record`, puis sans `--record` | Réussi | Cas +30,9504 %, comparaison indépendante avec Breguet, loi de masse recalculée en Python et résidu du point fixe, contraintes, valeurs invalides, résultats périmés, clavier, quatre largeurs |
| `python -X utf8 tests/test_guided_demo.py` | Réussi ; repris après optimisation du rendu | Impulsion unique, graine, RMS recalculée indépendamment, limites moteurs, égalité calcul direct/interface, pause, sortie manuelle, quatre largeurs |
| `python -X utf8 tests/test_a380_example.py` | Réussi | Retour du modèle paramétrique au modèle exact de l’exemple ; paramètres et résultats égaux au fichier versionné ; absence de substitution de modèle en cas de données indisponibles |
| `python -X utf8 tests/test_portfolio_ui.py` | Réussi | Dix pages à 360, 390, 768 et 1 440 px ; captures, pas de débordement horizontal ; ordre des six projets ; Joukowski et ses réglages conservés ; filtres, menu et encodage du brouillon e-mail |
| `python -X utf8 tests/check_site.py` | Réussi | Dix HTML, 109 liens/ressources locaux après finalisation des liens de parcours, métadonnées et ancres ; les 338 identifiants/contrôles HTML initiaux sont conservés ; syntaxe de tous les JS/MJS |
| `python -X utf8 tests/check_hosted.py` | Réussi sur les ressources du site existant | 48 ressources de la base actuellement sur GitHub Pages : 48 HTTP 200 ; profil GitHub HTTP 200 |
| `git diff --check` | Réussi | Pas d’erreur d’espacement dans le diff |

Les premières tentatives navigateur en sandbox étaient empêchées par `WinError 5` (pipes Playwright). Les exécutions ont ensuite réussi avec l’autorisation locale hors sandbox. Le premier contrôle des dix pages a repéré un débordement du menu à 768 px : la bascule mobile jusqu’à 980 px corrige ce défaut. Une erreur de chaîne JavaScript dans le test de mailto a été corrigée avant la reprise réussie. Ces erreurs ne sont pas dissimulées comme des tests réussis.

## Vérification visuelle et accessibilité

Captures de chaque page en ordinateur et mobile, plus accueil clair/sombre. Inspection visuelle directe de l’accueil ordinateur/mobile, de l’entrée A380 mobile, de DroneLab et de l’aperçu social régénéré. Les deux extrémités du dégradé des boutons principaux offrent respectivement un contraste blanc/fond de 7,14:1 et 5,28:1. Navigation clavier testée pour le menu, les onglets A380/AéroOptim et les contrôles déjà couverts par la suite. Ce contrôle n’est pas une certification WCAG complète.

## Tests non exécutés ou limites explicites

- `scripts/prepare_a380_sources.py` : archives OpenVSP/MATLAB, PDF propulsion et classeur source absents du clone ; pas de nouvelle extraction ni revalidation des 490 cas aux originaux.
- `tests/arduino_compile.py`, `tests/airframes_compile.py` et mode `--real-compile` de l’agent : Arduino CLI et cœurs requis absents du clone de test. Les profils d’exports sont testés, les compilations historiques du catalogue ne sont pas recomptées.
- `tests/agent_package.py` : exécutable Windows empaqueté absent du clone. L’agent Python et son interface sont testés localement ; aucun installateur n’est construit ni lancé.
- `tests/record_arduino_validation.py` : outil de mise à jour du catalogue, non exécuté car aucune nouvelle compilation Arduino n’a été réalisée.
- Aucun téléversement, accès USB, essai sur carte, banc moteur ou vol réel. Aucune validation industrielle du comparateur, de TGD1 ou des simulations.
- LinkedIn répond HTTP 999 au contrôle automatique. L’adresse correspond au lien du CV local ; son accessibilité authentifiée reste à confirmer manuellement.
- Le formulaire est vérifié pour champs manquants, focus et URI mailto Unicode/retours à la ligne. Aucun message envoyé ; ouverture d’un client de messagerie réel non testée.
- Tests visuels et fonctionnels sous Edge/Windows ; Firefox, Safari et appareils physiques non exécutés.
- Les nouvelles pages et modifications de la branche ne sont pas déployées. Le contrôle HTTP public porte sur les ressources existantes de la base ; les chemins des nouveaux fichiers sont vérifiés localement avec le préfixe GitHub Pages `/portfolio/`.

## Traces et confidentialité

Les logs par script sont dans `.test-artifacts/audit-suite/`, les résultats AéroOptim dans `.test-artifacts/aero-verification.json`, le protocole et les captures dans `.test-artifacts/a380/`, les contrôles HTTP dans `.test-artifacts/hosted-resources.json`. Ce répertoire et les outils de compilation sont ignorés par Git. Aucun document industriel ou personnel brut n’est intégré aux modifications ; les nouveaux JSON de référence dérivent uniquement des calculateurs publics.
