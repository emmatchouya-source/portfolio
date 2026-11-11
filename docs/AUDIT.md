# Audit du portfolio — 11 novembre 2026

Branche : `audit/refonte-portfolio-2026-11`. Base : `36b575e`. Aucun déploiement demandé.

## Périmètre inspecté avant modification de l'application

Inventaire complet par `rg --files --hidden -g '!.git'` et `git ls-tree -r 36b575e` : 101 fichiers suivis à la base, site statique sans gestionnaire de dépendances web. Deux pages principales, trois applications, scripts Python, agent Windows optionnel, tests Python/Playwright et contrôleur C. Aucun `AGENTS.md` dans le dépôt. Pas de code 3DEXPERIENCE, de mesures TGD1, de MATLAB original, d'archives OpenVSP, de photos ou de données hexacoptère. Les documents sources cités par les anciennes notes ne sont pas fournis avec ce clone.

- Accueil/contact : `index.html`, `contact.html`, `style.css`, `main.js`, favicon et aperçu social.
- A380 : modules de modèle, propulsion, mission, optimisation, worker, graphiques, trajectoire et rendu 3D ; `data/project.json` est le seul jeu numérique distribué. Notes scientifiques et préparation locale des sources dans `scripts/prepare_a380_sources.py`.
- DroneLab : dynamique/commande/estimation dans `core.js`, géométries, rendu, catalogue de cartes, exports C/Arduino ; agent local séparé dans `agent/`.
- AéroOptim : modèles, calculs et interface dans un seul HTML ; aucun scénario de référence versionné ni test dédié initialement.
- Tests : 19 scripts A380, tests DroneLab, parité native, exports et agent. Les comptes historiques ne constituent pas une nouvelle exécution.

Une lecture locale du CV fourni confirme la chronologie déclarée et l'origine des chiffres professionnels, mais ne remplace ni des chronométrages ni des mesures d'essais. Ce document personnel ne sera pas ajouté au dépôt. Aucun autre rapport industriel n'est nécessaire à cette refonte.

## Matrice de décisions

| Page/projet | Problème identifié | Données disponibles | Correction proposée | Vérification |
|---|---|---|---|---|
| Accueil | Chiffres professionnels sans source publique ; 8 mois annoncés avant fin de stage ; simulation très visible | HTML, CV local, applications | Profil direct, deux travaux professionnels d'abord, chiffres non recalculables contextualisés | Ordre DOM, navigation et mobile |
| 3DEXPERIENCE | Fusion trois versions et déploiement non démontrables | Description/CV uniquement | Étude de cas, périmètre vérifiable, réserve sur mécanismes internes | Contrôle des affirmations ; pas de fausse démo industrielle |
| TGD1 | Pas de données pour RMSE ou fidélité du jumeau | Description/CV uniquement | Méthode déclarée, aucune précision inventée | Relecture confidentialité et absence de résultat fabriqué |
| A380 Cruise Lab | Attribution individuelle trop large ; calcul initial coûteux ; docs historiques peu séparées | JSON dérivé, code, tests indépendants SciPy | Exemple versionné et reproductible, trois niveaux de lecture, attribution prudente | Rejet 500 t, trim, bilan, convergence, navigateur |
| DroneLab | Interface dense ; slogan ; pas de parcours guidé | Simulation déterministe et tests | Mission courte reproductible avec perturbation et métriques définies | Régression, unités/saturations, parité C, mobile |
| AéroOptim | +31 % sans paramètres archivés ; navigation retour absente ; entrées incomplètement validées | Préréglages et solveur inline | Recalcul du préréglage, résultat avant/après, contraintes et limites, tests | Calcul enregistré, cas invalides, navigateur |
| Hexacoptère | 8 kg/10 km/2 000 m et « essais réussis » sans statut établi | Déclaration dans CV ; aucune autorisation de diffusion technique | Présentation générique, retrait des caractéristiques non qualifiables | Pas de photo/donnée nouvelle, pas de résultat revendiqué |
| Preuves | Démonstration assimilée à preuve ; détails confidentiels promis | Tests publics ; descriptions professionnelles | Statut de preuve explicite, entretien sous réserve d'autorisation | Liens vers méthodes réellement exécutées |
| Compétences | Catalogue sans niveau ni lien avec travaux | Expériences déclarées, code public | Trois groupes, pratique et connaissances distinguées | Aucune maîtrise déduite d'une simple présence de fichier |
| Parcours | Stage futur décrit comme achevé, attribution collective | CV local et métadonnées A380 | Stage en cours, fin prévue, contributions à confirmer | Cohérence au 11/11/2026 |
| Contact | Navigation interne forcée en nouvel onglet ; formulaire mailto | HTML/JS existants | Liens internes ordinaires, information et validation accessibles | mailto encodé, clavier, mobile |

## Premiers contrôles

- Lancement en sandbox des tests navigateur impossible : `PermissionError [WinError 5]` à la création des pipes Playwright. Relance locale autorisée hors sandbox nécessaire ; ce n'est pas une erreur du site.
- `tests/test_a380_project.py` : le cas original 500 t est rejeté « Poussée hors domaine N1 corrigé du projet ». Cas croisière 300 t : 49 801,883974 kg, 24 719,004023 s. 17 trims SciPy et inversion moteur réussis. La comparaison des 490 coefficients aux archives originales n'est pas reproductible sans ces archives.
- Les notes de validation existantes sont historiques ; le rapport de livraison distinguera leurs résultats des tests exécutés dans cette branche.

Les décisions et résultats finaux sont consignés dans `VERIFICATION.md`, `TESTS.md` et `LIVRAISON.md`. Les jeux numériques publics dérivés des calculateurs existants ne contiendront aucune nouvelle donnée industrielle.
