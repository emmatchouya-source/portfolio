# DroneLab

Laboratoire de développement et d’essai de commande pour un quadricoptère X. Application statique, sans dépendance, CDN, compte ou service distant. La scène est un rendu 3D en perspective sur Canvas 2D, avec rotation de caméra, zoom, vue de dessus et suivi. Le modèle physique détermine le mouvement affiché.

## Lancement

Depuis la racine du dépôt :

```sh
python -m http.server 8080
```

Ouvrir `http://localhost:8080/projets/drone-lab/`. Les modules ES et le chargement du modèle C nécessitent HTTP ; l’ouverture par `file://` n’est pas prise en charge. Compatible avec les navigateurs récents prenant en charge modules ES, Canvas, dialog et structured objects. GitHub Pages peut servir l’application telle quelle.

## Utilisation

1. Choisir une mission : stationnaire, carré, cercle, huit ou points de passage ENU. Un carré utilise la dimension comme côté ; cercle et huit l’utilisent comme rayon/amplitude. Les missions cercle et huit se répètent ; les points de passage se terminent par un maintien.
2. Régler altitude, vitesse, vent, rafales, drone, gains et bruit. Cliquer sur **Appliquer et réinitialiser**. Les réglages ne modifient pas un vol en cours.
3. Lancer la mission ; pause et vitesse ×1/×2/×4 agissent sur le temps simulé. Une page masquée suspend l’avancement. La simulation n’essaie pas de rattraper un ordinateur lent.
4. Injecter une impulsion, couper le GNSS ou désactiver un moteur. Observer l’état réel, l’estimation, les courbes et le journal.
5. Exporter la configuration, la télémétrie CSV, le rapport JSON ou le contrôleur C99. Les exports utilisent la configuration **appliquée**, jamais les modifications en attente.

Les réglages appliqués sont mémorisés localement si le navigateur l’autorise. Les vols, journaux et mesures restent en mémoire ; recharger la page les efface. La télémétrie conserve les 12 000 derniers points (10 minutes à 20 Hz), la trace 3D les 2 400 derniers points (2 minutes). Le rapport indique la plage retenue. Les indicateurs RMS, maximum et saturation portent sur tout l’essai depuis le décollage, y compris les transitions, et non uniquement sur la trajectoire stabilisée.

## Architecture

| Fichier | Responsabilité |
| --- | --- |
| `math.js` | Vecteurs, quaternions Hamilton, projections et bruit reproductible |
| `core.js` | Dynamique, actionneurs, capteurs, estimateur, commande, mission et supervision simulée |
| `renderer.js` | Projection 3D, horizon artificiel et courbes |
| `app.js` | Interface, paramètres, import/export et horloge à pas fixe |
| `exports.js` | Formats JSON/CSV et paramétrage du code C |
| `controller.c` | Loi de commande C99 autonome à adapter au matériel |

### Repères et unités

- Monde local **ENU** : X Est, Y Nord, Z vers le haut. Il ne s’agit pas d’un repère géographique latitude/longitude.
- Corps **FLU** : X avant, Y gauche, Z haut. Quaternions `[w,x,y,z]` Hamilton, corps vers monde.
- Toutes les grandeurs internes et le C utilisent les unités SI : m, s, kg, N, rad, rad/s, kg·m². L’interface convertit les angles en degrés.
- Moteurs : M1 avant gauche, M2 arrière gauche, M3 arrière droit, M4 avant droit. Spins de couple de réaction `+,-,+,-`. Poussées suivant +Z corps.
- Ne pas transmettre directement ces axes à une pile FRD/NED : les vecteurs, quaternions, signes et ordres moteurs nécessitent une transformation explicite.

### Physique

Pas fixe 1/240 s. Le corps possède trois translations, une orientation quaternion et trois vitesses angulaires. Équations :

```text
m a = R(q) [0,0,ΣFi] + Fdrag + [0,0,-mg]
I ωdot = τ - ω × (Iω) - 0,002 ω
Fdrag = -cdrag |v - vvent| (v - vvent)
Fi_dot = (Fi_commande × facteur_tension - Fi) / τmoteur
```

L’intégration de translation est à accélération constante sur le pas ; la rotation utilise une mise à jour quaternion normalisée avec la vitesse mise à jour. Les moteurs utilisent une réponse exponentielle exacte au premier ordre. Batterie 4S de référence : courant empirique proportionnel à `Fi^1,5`, capacité intégrée et chute de tension simplifiée, sans modèle électrochimique ni rendement d’hélice identifié. Un contact dur avec le sol ou une grande inclinaison au contact arrête le vol comme collision. Pas de contact avec des obstacles, d’effet de sol, d’aérodynamique des pales, de flexibilité ou de CFD.

### Capteurs et estimation

| Mesure | Cadence effective | σ nominal à bruit ×1 |
| --- | --- | --- |
| Gyroscope + biais fixes | 240 Hz | 0,002 rad/s |
| Accéléromètre de force spécifique | 240 Hz | 0,025 m/s² |
| GNSS local position / vitesse | 10 Hz | 0,12 m / 0,04 m/s |
| Altitude barométrique | 24 Hz | 0,06 m |
| Magnétomètre vectoriel | 48 Hz | 0,006 relatif |
| Télémètre sol | 24 Hz | 0,015 m, sous 12 m et inclinaison limitée |

Les cadences 24 et 48 Hz sont des diviseurs du pas physique et non des cadences matérielles revendiquées. Les échantillons sont maintenus entre mises à jour. Bruit gaussien avec graine fixe ; biais gyro fixes multipliés par le niveau de bruit. Pas de délai de transport, quantification, défaut de calibration ni température dans cette version. Le GNSS est une mesure locale, pas une simulation des satellites.

L’estimateur propage orientation et translation par l’IMU puis applique des corrections complémentaires de gravité, champ magnétique, GNSS, baromètre et télémètre. Il n’accède pas à l’état physique exact. Il ne fournit ni covariance ni estimation de biais ; accélération soutenue et perte de GNSS peuvent induire une dérive. Le mode « État physique exact » permet d’isoler l’effet des capteurs.

### Commande et supervision

Commande position P → vitesse PI avec anticipation d’accélération → attitude quaternion P → vitesse angulaire PID avec dérivée filtrée et compensation gyroscopique → allocation des poussées. Limites de vitesse, inclinaison et poussées. L’intégration des deux boucles est gelée au pas suivant une saturation de l’allocation. Il s’agit d’un anti-emballement simple ; pas d’allocation optimale ni de désaturation priorisant l’attitude.

Le superviseur **JavaScript** gère décollage, maintien, points de passage, retour et descente. Le GNSS perdu depuis plus de 1,2 s déclenche une descente ; batterie sous 20 % un retour, sous 8 % une descente ; limite de zone ou plafond dépassés un retour. La clôture virtuelle est une détection avec retour, pas une barrière physique empêchant tout dépassement. Une panne moteur déclenche une tentative de descente sans garantie de stabilité d’un quadricoptère sous-actionné.

## Contrôleur C exporté

Le téléchargement remplace `DL_DEFAULT` par les paramètres appliqués. Le calcul de commande est identique à la version JavaScript (double précision) avec validation des entrées supplémentaire. L’intégrateur, les capteurs, l’estimateur, le superviseur et les missions ne sont pas exportés dans ce fichier.

```c
/* Inclure le fichier généré ou séparer ses déclarations dans un en-tête. */
DL_Controller ctl;
DL_Output out;
dl_reset(&ctl);
/* Dans la tâche de commande à 240 Hz : */
bool ok = dl_step(&ctl, &DL_DEFAULT, &estimated_state,
                  &mission_target, 1.0 / 240.0, armed, &out);
/* out.motor_N : poussées en newtons, pas des consignes PWM. */
```

`estimated_state` et `mission_target` sont à fournir par l’intégration. `armed=false` remet l’état du contrôleur à zéro et renvoie quatre sorties nulles. La fonction renvoie `false` et des sorties nulles sur entrée invalide ; le superviseur matériel doit gérer cette situation. Aucun appel ne doit armer un appareil uniquement sur la base de ce résultat.

Pour produire un micrologiciel utilisable sur un drone, il reste à choisir et calibrer la carte, les capteurs et ESC ; intégrer leurs pilotes et leurs horodatages ; fournir l’estimation, l’ordonnanceur et le superviseur (armement, arrêt, radio, batterie, perte de capteurs, limites), convertir les axes et les poussées, puis qualifier les résultats avec le logiciel cible et le contrôleur réel. Aucun binaire flashable, pilote matériel, liaison MAVLink, PX4 SITL ou HIL n’est inclus. Ces éléments seront ajoutés pour le matériel retenu.

## Vérification

```sh
python -m pip install playwright
python tests/browser_smoke.py
```

Les tests utilisent Microsoft Edge déjà installé et un serveur HTTP local éphémère. Ils vérifient la stabilisation, les missions, les trois gabarits, les perturbations, la perte GNSS, le retour/atterrissage, l’allocation, le déterminisme, les exports et l’interface mobile. Les artefacts sont dans `.test-artifacts/` (ignoré par Git).

Pour vérifier aussi le code exporté avec un compilateur C99 (`cc`, `clang` ou `gcc`) :

```sh
python tests/native_controller.py
```

Sous Windows sans compilateur, une chaîne locale peut être installée dans les artefacts : `python -m pip install --target .test-artifacts/toolchain ziglang==0.15.2`. Elle sert uniquement aux tests et ne fait pas partie de l’application.

Vérification initiale : **22 contrôles numériques réussis**, parcours de l’interface et des trois gabarits, pause, rejet des paramètres invalides, téléchargement C, absence d’erreur JavaScript et absence de débordement horizontal sur mobile. Le C exporté a été compilé en C99 avec `-Wall -Wextra -Werror -pedantic`, puis comparé à JavaScript sur une séquence de 100 états : écart maximal observé **0 N** dans cet environnement (tolérance de test : 10⁻⁹ N). Les sorties désarmées et les entrées invalides sont également vérifiées. Cette comparaison ne qualifie pas l’exécution sur une carte embarquée.

Les gains, inerties, bruits et critères de réussite constituent un cas de développement reproductible ; ils ne représentent pas une identification ni une validation d’un drone réel.

## Références

- [Architecture de commande multicoptère PX4](https://docs.px4.io/main/en/flight_stack/controller_diagrams) : chaîne de commande, limites et allocation.
- [Simulation PX4](https://docs.px4.io/main/en/simulation/) : distinction entre simulation du logiciel et essais avec matériel.

DroneLab est une implémentation indépendante ; aucun code PX4 n’y est embarqué et ces références ne constituent pas une certification.
