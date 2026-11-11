# Refonte du portfolio — bilan de livraison

Travail réalisé sur `audit/refonte-portfolio-2026-11`, à partir de `36b575e`. Le site existant est conservé. Aucun déploiement ni fusion vers `main` n’est effectué.

## Modifications et bénéfice de lecture

| Page / section | Problème trouvé | Modification réalisée | Bénéfice pour le lecteur | Limite restante |
|---|---|---|---|---|
| Accueil | Simulation au premier plan, indicateurs sans contexte, stage présenté comme achevé | Présentation des bancs moteurs aux exigences ; deux accès professionnels visibles ; projets ordonnés ; chiffres non auditables retirés des accroches ; Joukowski conservé en exploration optionnelle | Profil et postes recherchés lisibles rapidement ; accès direct aux deux travaux principaux | Le délai de lecture de 15 s / 1 min reste un objectif de conception, pas une mesure auprès de recruteurs |
| 3DEXPERIENCE | Description de fusion très précise sans code inspectable | Étude de cas distincte ; problème des révisions concurrentes ; fonctionnalités décrites et points non vérifiés séparés ; durée avant/après contextualisée | Comprendre le problème d’ingénierie sans confondre description et preuve | Identifiants, base de fusion, règles de conflit, contrôles d’écriture, récupération et usage réel à examiner dans les sources autorisées |
| TGD1 / bancs | Fidélité du modèle affirmée sans mesure publique | Étude de cas avec contexte, méthode déclarée, périmètre des chiffres et limites du modèle ; aucune RMSE inventée | Relier instrumentation, analyse et exigences sans revendiquer une qualification du système | Aucune difficulté particulière ni précision modèle/mesures vérifiable publiquement |
| A380 | Attribution individuelle excessive, résultats difficiles à lire avant le calcul | Exemple de croisière statique versionné, comparaison carburant/temps, recharge de son modèle exact ; atelier et 3D conservés ; documentation scientifique distincte | Un résultat et son compromis sont visibles sans attendre l’optimisation | Résultats académiques collectifs ; archives originales et répartition des contributions absentes ; cas 500 t toujours rejeté |
| DroneLab | Densité et absence de démonstration courte | Parcours déterministe en un bouton : décollage, huit, perturbation, métriques et arrêt ; sortie explicite du protocole après commande manuelle ; documentation distincte | Découvrir et évaluer une réponse de commande sans installation | Modèle synthétique ; pas de qualification sur matériel ou en vol |
| AéroOptim | +31 % sans scénario archivé, entrées invalides et résultats obsolètes applicables | Cas monomoteur reproductible, table masse d’aile/traînée/performances, marges de contraintes ; validation des entrées ; application d’un ancien optimum bloquée après modification ; retour portfolio et navigation clavier | Comprendre le gain et le coût en masse/envergure ; explorer sans appliquer par erreur une étude périmée | Modèle empirique simplifié ; pas de structure détaillée ni de mission complète |
| Hexacoptère | Performances sans statut, « essais réussis » non documenté | Présentation générique ; caractéristiques et résultat d’essais retirés ; schéma déclaré illustratif | Éviter une confusion entre objectif et performance vérifiée | Statut de 8 kg / 10 km / 2 000 m, contributions et diffusion à confirmer hors publication |
| Preuves | Démonstration assimilée à validation ; entretien confidentiel promis | Statut explicite des éléments : démonstration publique, résultat reproductible, travail décrit ; documents soumis à autorisation | Savoir ce qui peut être vérifié et à quelle portée | Les descriptions professionnelles ne sont pas des preuves publiques de conformité |
| Compétences | Catalogue de logiciels et niveaux implicites | Trois groupes : maîtrise opérationnelle déclarée, pratique en projet, connaissances complémentaires ; liens vers travaux ; usage des assistants discret | Relier les compétences à des activités concrètes | Niveaux déclarés, pas de certification ou d’évaluation indépendante |
| Parcours | Durée future du stage et fin d’études présentées comme acquises | Depuis mai 2026, fin prévue décembre ; études en cours, fin prévue hiver 2027 ; diplôme camerounais nommé ; équivalence québécoise non documentée retirée | Chronologie cohérente au 11 novembre 2026 | Disponibilité et dates prévues à actualiser après confirmation |
| Contact | Bouton suggérant un envoi direct ; navigation forcée en nouvel onglet | « Ouvrir ma messagerie », erreur accessible et focus du champ manquant ; URI encodée testée ; liens internes dans le même onglet | Comprendre le fonctionnement sans collecte ni serveur d’envoi | L’ouverture effective dépend du client mail installé ; LinkedIn bloque la vérification automatique |
| Ensemble | Chargement de polices externes et menu trop large sur tablette | Polices système ; contraste des boutons principaux renforcé ; menu adapté jusqu’à 980 px ; métadonnées des applications ; aperçu social régénéré depuis son script | Moins de requêtes, lecture et navigation plus prévisibles | Contrôles visuels et fonctionnels sous Edge/Windows ; autres moteurs non testés |

## Résultats vérifiés

- AéroOptim : 1 562,891 → 2 046,612 km, +30,9504 % calculés ; aile estimée 138,920 → 243,115 kg ; limites d’envergure et d’allongement actives.
- A380, croisière à 300 t : 49 801,884 → 36 157,754 kg de carburant, avec un passage de 6 h 52 à 8 h 14. Gain calculé de 27,3968 %, au prix du temps de vol. Le cas à 500 t reste inadmissible dans le modèle reconstruit.
- DroneLab guidé : RMS de suivi 0,198628 m ; pic après perturbation 0,911571 m ; rétablissement selon les bandes définies 2,7375 s ; saturation 0 %. Données exclusivement simulées.

Les sources, paramètres et écarts sont détaillés dans [VERIFICATION.md](VERIFICATION.md). Les exécutions réelles et limites de tests figurent dans [TESTS.md](TESTS.md).

## Décisions et données à confirmer

1. Autoriser et fournir, si une présentation plus précise est souhaitée, les éléments du comparateur qui démontrent le mécanisme de concurrence, les journaux de temps et le statut d’utilisation. Aucune donnée interne n’est nécessaire pour conserver la version prudente actuelle.
2. Pour TGD1, préciser les éléments publiables, la difficulté réellement documentée et la portée du modèle. Sans séries autorisées, aucun indicateur de précision ne sera ajouté.
3. Confirmer la répartition individuelle du projet MGA803 à partir du rapport ou d’un historique d’équipe ; confirmer les conventions de centrage/propulsion avant toute interprétation physique plus forte.
4. Qualifier les trois caractéristiques historiques de l’hexacoptère et leur droit de diffusion avant de les réintroduire. Aucune photographie ajoutée.
5. Confirmer manuellement l’accès au profil LinkedIn et actualiser les dates lorsque le stage et les études se terminent.

## Relecture finale

- **Profil** : ingénierie système, intégration, vérification/validation et essais aéronautiques.
- **Problèmes abordés** : exploiter des mesures, relier exigences et vérification, suivre les révisions, automatiser des tâches d’ingénierie, explorer les limites d’un modèle.
- **Contribution** : travail professionnel décrit à la première personne ; résultats universitaires collectifs ; extension web et code public séparés du projet de cours.
- **Vérification** : tests numériques, références indépendantes, scénarios et paramètres accessibles ; validation industrielle non revendiquée.
- **Pertinence recrutement** : continuité entre pratique des bancs moteurs, analyse, exigences et outils.
- **Parcours personnel** : évolution explicite depuis le montage et l’instrumentation vers la traçabilité et l’automatisation, sans ajouter d’expérience ni de responsabilité.

Aucun document personnel ou industriel local, rapport d’essais, photographie, archive de cours, mesure confidentielle ou identifiant de coauteur n’a été ajouté. Les nouveaux exemples numériques sont calculés exclusivement à partir du code et des données déjà publics ; leur mise en production n’est pas effectuée.
