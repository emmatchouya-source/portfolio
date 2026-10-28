# Intégration des architectures de drones

Ce suivi distingue simulation vérifiée, compilation réelle et validation matérielle. Une case cochée ne signifie pas une qualification en vol.

## Lot 1 — Multirotors recommandés (livré : site 1.2 / agent 1.1)

- [x] Ajouter Quad +, Quad H, Hexa X/+, Octo X/+ et conserver Quad X.
- [x] Centraliser positions, nombre et sens des moteurs dans un catalogue commun au simulateur et à l’agent.
- [x] Adapter poussée totale, moments, allocation, saturation et états moteurs à 4/6/8 rotors.
- [x] Ajouter le choix de géométrie dans Drone, les dimensions du H et un schéma numéroté des moteurs.
- [x] Adapter scène 3D, défauts, barres moteurs, courbes, légendes et télémétrie CSV.
- [x] Versionner les configurations et importer les anciens essais Quad X sans ambiguïté.
- [x] Adapter contrôleur C, projets Arduino, manifeste et génération de l’agent ; interdire une géométrie inconnue.
- [x] Vérifier chaque géométrie : équilibre des forces/moments, stationnaire, missions, perturbations, saturation et arrêts.
- [x] Comparer les sorties JavaScript et C pour chaque géométrie et compiler des projets Arduino représentatifs.
- [x] Tester sélection, application, import/export et affichage mobile dans le navigateur.
- [x] Construire et publier l’agent Windows compatible ; empêcher l’ancien agent de compiler une autre géométrie comme un Quad X.
- [x] Publier le site et vérifier la version HTTPS.

Preuves locales : 130 contrôles numériques/d’export, 700 pas JavaScript/C sur les sept géométries, dix cibles Arduino Quad X et quatorze couples carte/géométrie (sept géométries sur UNO AVR et UNO R4 Minima). Le parcours navigateur/agent utilise un USB simulé ; deux projets générés par l’agent ont également été compilés réellement. Aucun téléversement physique ni vol n’est revendiqué.

Publication vérifiée : les 130 contrôles et le parcours navigateur/agent passent aussi sur le site HTTPS. L’exécutable 1.1 a passé son autotest (CLI, Tk et génération des sept géométries), et son téléchargement public correspond à l’empreinte publiée. [Ouvrir DroneLab](https://emmatchouya-source.github.io/portfolio/projets/drone-lab/?v=airframes-1) · [Agent Windows 1.1](https://github.com/emmatchouya-source/portfolio/releases/tag/dronelab-agent-v1.1.0).

## Lot 2 — Géométries planes avancées

- [ ] Ajouter Quad Deadcat avec positions des moteurs et centre de gravité mesurés.
- [ ] Étendre le modèle d’inertie aux termes croisés lorsque les axes du châssis ne sont pas principaux.
- [ ] Ajouter un éditeur de positions et sens de rotation, de 4 à 12 moteurs.
- [ ] Vérifier rang, équilibre avec poussées positives et capacité de commande de chaque montage ; refuser les montages irréalisables.
- [ ] Ajouter Déca et Dodéca plans avec presets et tests propres.
- [ ] Développer une allocation sous contraintes et vérifier l’autorité restante après panne, sans promettre de tolérance universelle.

## Lot 3 — Rotors coaxiaux

- [ ] Ajouter Y6 (3 bras / 6 moteurs), X8 (4 bras / 8 moteurs), puis 6 bras / 12 moteurs.
- [ ] Modéliser les interactions entre rotors superposés et leur dissymétrie.
- [ ] Identifier les coefficients sur données fabricant ou banc ; distinguer modèle simplifié et modèle identifié.
- [ ] Adapter représentation des étages, repérage, consommation et diagnostics.
- [ ] Valider forces/moments, commande et pannes pour chaque architecture.

## Lot 4 — Propulsion orientable

- [ ] Tricoptère : servo de lacet, limites, vitesse et retard de l’actionneur.
- [ ] Bicoptère : cinématique des deux rotors orientables et couplages de commande.
- [ ] Vérifier stabilité et saturation sur tout le domaine retenu.
- [ ] Étendre exports et interfaces matérielles aux servos.

## Lot 5 — Ailes fixes, hélicoptères et VTOL

- [ ] Définir un modèle par famille et obtenir les données de masse/inertie et d’aérodynamique.
- [ ] Avion et aile volante : portance, traînée, décrochage, gouvernes, vitesse air, guidage et atterrissage.
- [ ] Hélicoptère : pas collectif/cyclique, rotor, anti-couple et dynamique des actionneurs.
- [ ] VTOL : modèles stationnaire/croisière, transition, enveloppe et superviseur propres à l’architecture.
- [ ] Comparer à un simulateur indépendant et effectuer des essais SIL/HIL avant essais matériels.

## Qualification matérielle — pour chaque montage réel

- [ ] Choisir carte, capteurs, ESC, moteurs, hélices et câblage ; mesurer les ressources et la cadence complète.
- [ ] Intégrer pilotes, calibrations, estimation, horodatages et correspondance des sorties.
- [ ] Développer armement, arrêt indépendant, supervision et gestion des défauts.
- [ ] Identifier poussée/couple/consommation ; vérifier les conventions d’axes et la numérotation.
- [ ] Compiler sur la carte choisie, téléverser, puis valider sur banc avec sorties contrôlées.
- [ ] Définir et exécuter un protocole d’essais en vol progressif.

Les exports du lot 1 restent des programmes de banc, avec les sorties moteurs désactivées. Aucun essai physique ou en vol n’est réalisé par les tests automatisés.
