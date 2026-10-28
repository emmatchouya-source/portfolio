# DroneLab

> **En bref.** Simulateur de vol autonome de multirotors (4, 6 et 8 moteurs) dans le navigateur, pour développer et vérifier une loi de commande avant tout matériel.
>
> - **Physique et commande** : corps rigide à 6 degrés de liberté, capteurs simulés (IMU, GNSS, baromètre, magnétomètre, télémètre), estimateur, commande en cascade position → vitesse → attitude → vitesse angulaire, allocation pour 7 géométries.
> - **Vérification** : 130 contrôles automatisés (équilibre, missions, perturbations, perte GNSS, panne moteur) ; contrôleur C99 exporté identique à la version JavaScript sur 700 pas ; programme de banc compilé pour Arduino UNO et UNO R4.
> - **Limites assumées** : modèles non identifiés, aucun téléversement physique ni essai en vol.
>
> **[Ouvrir la démo](https://emmatchouya-source.github.io/portfolio/projets/drone-lab/)** · aucune installation requise. L'agent Windows de téléversement est facultatif.

Laboratoire de développement et d’essai de commande pour multirotors plans à 4, 6 et 8 moteurs. Le simulateur statique fonctionne sans compte, CDN ou service distant. Le téléversement optionnel utilise un agent Windows local et les outils Arduino. La scène est un rendu 3D en perspective sur Canvas 2D, avec rotation de caméra, zoom, vue de dessus et suivi. Le modèle physique détermine le mouvement affiché.

## Géométries disponibles

Le premier lot comprend **Quad X, Quad +, Quad H, Hexa X, Hexa +, Octo X et Octo +**. Dans l’onglet **Drone**, sélectionner la géométrie, ajuster masse, distance centre–moteur, poussée par moteur et inerties, puis appliquer. Le H accepte un rapport longueur/largeur de 1 à 3, à distance centre–moteur constante. Les inerties et la poussée ne sont pas déduites automatiquement du dessin.

Le schéma montre le montage vu de dessus, avant vers le haut, avec numéros et sens de rotation. Ce repérage est propre à DroneLab ; il n’affirme aucune correspondance directe avec les sorties d’une carte, PX4 ou ArduPilot. La scène, les pannes, les barres moteurs, les légendes, le CSV, les exports C/Arduino et l’agent utilisent le même nombre de moteurs.

`airframes.js` constitue le catalogue commun ; la construction de l’agent en extrait `airframes.json`. Chaque moteur définit `(x,y)` en FLU et le signe de son couple de réaction. L’agent recalcule les positions à partir du catalogue embarqué et des dimensions validées, sans accepter les positions ou du code fournis par la page. L’agent **1.1.0** est requis ; fermer une ancienne version avant d’ouvrir le nouvel installateur.

Les configurations exportées portent la version 2 et incluent la géométrie appliquée. Une configuration version 1 est importée comme Quad X. Le contrôleur C expose `motor_count`, `rotors[8][3]` et `motor_N[8]` ; seules les premières `motor_count` sorties sont actives, les autres restent nulles. L’adaptateur matériel reçoit aussi ce nombre. Il s’agit d’une évolution de l’interface C : un ancien adaptateur doit être porté explicitement.

L’allocation utilise l’inverse à norme minimale des géométries planes équilibrées du catalogue, puis écrête les forces à leurs bornes. Les positions et les moments sont recalculés pour chaque géométrie. Elle ne résout pas une optimisation sous contraintes et ne réalloue pas la commande après une panne. Six ou huit moteurs ne garantissent donc pas un vol stabilisé après perte d’un moteur. Les modèles aérodynamiques, de batterie et de moteurs restent simplifiés et non identifiés.

La [feuille de route](TACHES.md) recense les tâches pour Deadcat, géométries personnalisées, rotors coaxiaux, servos, ailes fixes, hélicoptères et VTOL, avec leurs étapes de validation.

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

Les réglages appliqués sont mémorisés localement si le navigateur l’autorise. Les vols, journaux et mesures restent en mémoire ; recharger la page les efface. La télémétrie conserve les 12 000 derniers points (10 minutes à 20 Hz), la trace 3D les 2 400 derniers points (2 minutes). Le rapport indique la plage retenue. L’erreur RMS affichée porte sur la phase de trajectoire uniquement (après le décollage, hors retour et atterrissage). Pour le carré et les points de passage, c’est l’écart au segment parcouru, car la consigne saute d’un point au suivant ; pour le cercle, le huit et le stationnaire, l’écart à la consigne continue ; la valeur depuis le décollage est rappelée en dessous. Le rapport JSON fournit les deux (`tracking_*` et `rms/max_position_error_m`) ; la saturation porte sur tout l’essai.

## Architecture

| Fichier | Responsabilité |
| --- | --- |
| `math.js` | Vecteurs, quaternions Hamilton, projections et bruit reproductible |
| `core.js` | Dynamique, actionneurs, capteurs, estimateur, commande, mission et supervision simulée |
| `renderer.js` | Projection 3D, horizon artificiel et courbes |
| `app.js` | Interface, paramètres, import/export et horloge à pas fixe |
| `exports.js` | Formats JSON/CSV et paramétrage du code C |
| `controller.c` | Loi de commande C99 autonome à adapter au matériel |
| `boards.js` | Catalogue sourcé de cartes et statuts de compilation |
| `arduino.js` | Génération du projet Arduino de banc et de portage |
| `zip.js` | Archive ZIP sans compression, UTF-8 et CRC32 |

## Cartes Arduino et export de projet

L’onglet **Cartes** propose **73 profils** : UNO R4 Minima/WiFi et Nano R4 ; Nano 33 BLE/Sense et leurs révisions ; Nano RP2040 Connect, Nano ESP32, Nano Matter ; GIGA R1, Portenta H7 et variantes Lite, Portenta C33, Nicla ; Zero, MKR, M0 et Due ; AVR classiques et megaAVR ; compatibles ESP32, RP2040/RP2350 et Teensy. Les variantes et clones non recensés, notamment les variantes STM32, disposent d’un profil personnalisé utilisant leur FQBN exact.

Ce catalogue n’est pas une liste de montages qualifiés pour voler. Une carte 32 bits apporte une cible de portage ; une carte 8 bits peut servir à un banc de calcul et à des travaux de stabilisation réduits, mais la pile autonome complète n’y est pas déclarée compatible. Les cartes très anciennes, clones, modules intégrés ou produits Linux/MCU peuvent nécessiter une autre chaîne de compilation, un câblage spécifique ou un portage séparé. Aucun inventaire ne peut garantir toutes les variantes commercialisées.

Le catalogue conserve la source fabricant de chaque profil. Les mémoires affichées sont les limites du cœur de compilation lorsqu’elles sont déclarées, et non une mesure de mémoire libre ni une addition des ressources de plusieurs processeurs. Les choix de partition et de processeur peuvent modifier ces limites. Les capteurs embarqués ne sont pas automatiquement pris en charge par la sélection d’une carte.

Le bouton **Télécharger le projet .zip** produit un dossier dont le nom correspond au fichier `.ino`, avec :

- Le sketch Arduino, les paramètres de commande appliqués et le profil de la carte.
- `dl_controller.h`, version C/C++ du contrôleur de référence.
- `dl_hal.h`, les interfaces à compléter pour l’estimateur, les capteurs, la consigne, l’armement et les ESC.
- Le manifeste, la configuration simulée et les instructions Arduino IDE/CLI.

Décompresser l’archive, ouvrir le `.ino`, installer le paquet de cartes indiqué et choisir la carte exacte et le port USB. Le projet peut être téléversé comme **programme de banc**. Moniteur série à 115200 bauds : `i` affiche l’état, `b` mesure un échantillon de 32 pas de calcul du contrôleur, `r` réinitialise les défauts lorsque la carte est désarmée. Aucune commande série ne permet d’armer les moteurs.

Les sorties sont désactivées par `DL_ACTUATORS_ENABLED=0` ; les adaptateurs matériels sont également des stubs qui refusent l’armement et la fourniture d’un état. Aucun GPIO de moteur n’est configuré. Le profil 8 bits limite en plus l’export au banc avec `DL_LIMITED_PROFILE=1`. Les fonctions de lecture et d’écriture n’inventent pas de mesures et ne produisent pas un PWM générique présenté comme commande d’ESC.

La branche de portage inclut un contrôle d’âge de l’état, une détection de retard de boucle, des sorties nulles et un défaut mémorisé. Cela ne remplace pas un superviseur de vol : les pilotes, conversions de repère, calibrations, consignes, politique d’arrêt et protections indépendantes du matériel restent à fournir. Le benchmark ne mesure ni les pilotes ni l’ordonnancement complet ; les valeurs du moniteur série ne constituent pas une borne du pire temps d’exécution en vol. La cadence de 240 Hz doit être vérifiée sur la boucle entière, y compris les interruptions et communications. La taille et la précision de `double` dépendent du cœur cible.

Le statut de compilation distingue explicitement les cibles réellement compilées des profils non vérifiés. Même une compilation réussie ne valide ni le temps réel, ni les capteurs, ni les ESC, ni un vol.

### Installation et téléversement depuis la page

Dans **Cartes**, cliquer sur **Installer et téléverser depuis cette page** :

1. Télécharger puis ouvrir **DroneLab-Agent-Setup.exe** (Windows 10 / 11 x64). L’agent s’installe dans le compte courant ; garder sa fenêtre ouverte.
2. Cliquer sur **Connecter l’agent**. Autoriser le réseau local si Chrome / Edge le demande, puis accepter la connexion dans la fenêtre de l’agent.
3. Choisir la carte dans le panneau Cartes, appliquer les paramètres de simulation et brancher la carte en USB. Actualiser les ports au besoin.
4. **Préparer et compiler** télécharge les outils nécessaires à cette carte et compile le programme de banc. La première préparation nécessite Internet et peut prendre plusieurs minutes.
5. **Téléverser sur la carte** recompile les paramètres appliqués puis remplace le programme de la carte. Le résultat indique séparément compilation et téléversement. Les sorties moteurs restent inactives.

Arduino IDE n’est pas requis. L’agent conserve ses fichiers dans `%LOCALAPPDATA%\DroneLabAgent` et enregistre uniquement le protocole `dronelab-agent:` dans le registre du compte utilisateur pour le bouton **Ouvrir DroneLab Agent**. Il ne crée ni service ni démarrage automatique. Fermer sa fenêtre arrête le serveur local, sauf pendant une opération en cours. Une version macOS / Linux n’est pas encore distribuée.

L’installation ne demande pas d’élévation administrateur et désactive les scripts d’installation de pilotes des paquets Arduino. Une carte qui exige un pilote USB absent, une procédure de bootloader ou un outil externe peut nécessiter une intervention distincte ; les règles d’un poste d’entreprise peuvent bloquer l’exécutable. L’installateur n’a pas de signature d’éditeur Windows. Aucune modification des protections du système n’est proposée. La distribution et son empreinte SHA-256 sont accessibles dans la [version de l’agent](https://github.com/emmatchouya-source/portfolio/releases/tag/dronelab-agent-v1.1.0).

Le serveur écoute uniquement sur `127.0.0.1:47831`. Il autorise l’origine exacte du portfolio, demande un accord dans sa fenêtre et fournit un jeton en mémoire valable une heure. Les requêtes sont bornées, les tâches appartiennent au jeton qui les a créées, et un seul traitement s’exécute à la fois. La page envoie un profil et des paramètres numériques ; elle ne peut fournir ni code source, ni commande, ni URL de téléchargement. L’agent utilise les modèles de banc embarqués et impose `DL_ACTUATORS_ENABLED=0`. Les paquets proviennent des index fabricants autorisés ; seuls les dix profils déjà vérifiés ont une version de cœur fixée, les autres restent des cibles de portage à vérifier.

Validation : compilation réelle du programme produit par l’agent pour UNO AVR, autotest de l’exécutable Windows (CLI embarqué et interface Tk), contrôles HTTP d’origine/jeton et parcours web avec un CLI simulé. **Aucun téléversement sur une carte physique ni essai en vol n’a été réalisé.** L’autotest n’effectue pas une installation dans le profil utilisateur et ne modifie pas le registre. Le comportement des pilotes et bootloaders réels reste à valider avec chaque carte.

Sources : [accès au réseau local dans Chrome](https://developer.chrome.com/blog/local-network-access), [Arduino CLI](https://github.com/arduino/arduino-cli), [code et construction de l’agent](../../agent/README.md).

Sources du catalogue : [cœurs officiels Arduino](https://github.com/arduino), [Espressif Arduino-ESP32](https://github.com/espressif/arduino-esp32), [Silicon Labs Arduino](https://github.com/SiliconLabs/arduino), [Arduino-Pico](https://github.com/earlephilhower/arduino-pico), [paquet PJRC Teensy](https://www.pjrc.com/teensy/package_teensy_index.json). [Téléverser avec Arduino IDE](https://docs.arduino.cc/software/ide-v2/tutorials/getting-started/ide-v2-uploading-a-sketch/).

### Repères et unités

- Monde local **ENU** : X Est, Y Nord, Z vers le haut. Il ne s’agit pas d’un repère géographique latitude/longitude.
- Corps **FLU** : X avant, Y gauche, Z haut. Quaternions `[w,x,y,z]` Hamilton, corps vers monde.
- Toutes les grandeurs internes et le C utilisent les unités SI : m, s, kg, N, rad, rad/s, kg·m². L’interface convertit les angles en degrés.
- Moteurs : positions et ordre dans le schéma et le manifeste. Le Quad X conserve M1 avant gauche, M2 arrière gauche, M3 arrière droit, M4 avant droit. Les signes indiquent le couple de réaction sur le corps ; `+` correspond à une hélice CW vue de dessus. Poussées suivant +Z corps.
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

`estimated_state` et `mission_target` sont à fournir par l’intégration. `armed=false` remet l’état du contrôleur à zéro et renvoie toutes les sorties nulles. La fonction renvoie `false` et des sorties nulles sur entrée invalide ou géométrie non prise en charge ; le superviseur matériel doit gérer cette situation. Aucun appel ne doit armer un appareil uniquement sur la base de ce résultat.

Pour produire un micrologiciel utilisable sur un drone, il reste à choisir et calibrer la carte, les capteurs et ESC ; intégrer leurs pilotes et leurs horodatages ; fournir l’estimation, l’ordonnanceur et le superviseur (armement, arrêt, radio, batterie, perte de capteurs, limites), convertir les axes et les poussées, puis qualifier les résultats avec le logiciel cible et le contrôleur réel. Aucun micrologiciel de vol complet, pilote matériel, liaison MAVLink, PX4 SITL ou HIL n’est inclus. Ces éléments seront ajoutés pour le matériel retenu.

## Vérification

Le lot multirotor est couvert par les commandes suivantes, dans cet ordre :

```sh
python tests/airframes.py
python tests/airframes_native.py
python tests/airframes_agent.py
python tests/arduino_export.py
python tests/arduino_compile.py
python tests/airframes_compile.py
python tests/agent_bridge.py
python tests/agent_bridge.py --real-compile
python tests/agent_browser.py
```

Les 130 contrôles numériques et d’export couvrent les sept géométries : équilibre, moments, saturation, cinq missions, perturbation avec capteurs, perte GNSS, dernier moteur en panne, formats et schéma. Les bornes de suivi à 40 s sont de 1 m, ou 2 m pour le cercle dont le contrôleur de référence présente un retard ; chaque géométrie doit aussi rester à moins de 10 cm du résultat Quad X de référence. Ces seuils sont des critères de régression, pas une précision garantie pour un drone réel. Le test C vérifie 700 pas JavaScript/C, toutes les sorties, la saturation et la mise à zéro sur géométrie invalide ou désarmement.

La matrice Arduino compile les sept géométries sur UNO AVR et UNO R4 Minima. Les huit autres cibles déjà vérifiées restent limitées à la compilation Quad X indiquée dans le catalogue. L’agent est testé séparément avec comparaison de ses paramètres à ceux du navigateur, compilation réelle et parcours HTTP simulé. Les tests n’effectuent aucun téléversement physique. Les entrées du catalogue indiquent précisément les géométries compilées et ne constituent pas une validation en vol.

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

Vérification des exports Arduino :

```sh
python tests/arduino_export.py
```

Ce test vérifie les 73 profils, les noms de fichiers, le manifeste, la désactivation des sorties, le CRC32 des ZIP, leur extraction, les profils personnalisés et l’interface. Il prépare des projets dans `.test-artifacts/arduino-projects/`. `tests/arduino_compile.py` compile ensuite dix cibles UNO R4, AVR et Due lorsque leurs cœurs sont installés dans la configuration Arduino CLI locale des artefacts. Il n’effectue jamais de téléversement et ne se connecte à aucune carte.

Vérification du 27 octobre 2026 avec Arduino CLI 1.5.1 : compilation réussie du modèle de banc avec les paramètres initiaux pour UNO R4 Minima/WiFi et Nano R4 (cœur `arduino:renesas_uno` 1.6.0), UNO, Nano ATmega328, Mega 2560, Leonardo et Micro (cœur `arduino:avr` 1.8.8), Due Native et Programming Port (cœur `arduino:sam` 1.6.12). Les autres profils restent marqués **non vérifiés**. Les sorties étaient désactivées pour toutes ces compilations ; aucun capteur ou matériel de vol n’a été testé.

`tests/record_arduino_validation.py` reporte les compilations réussies dans le catalogue sans y copier les chemins locaux. Sous Windows, les anciens compilateurs ARM peuvent nécessiter un chemin court : le script de compilation copie uniquement ces outils dans le dossier temporaire du système lorsque nécessaire. Les exécutables restent séparés du site statique et sont distribués dans une version GitHub de l’agent.

## Références

- [Architecture de commande multicoptère PX4](https://docs.px4.io/main/en/flight_stack/controller_diagrams) : chaîne de commande, limites et allocation.
- [Simulation PX4](https://docs.px4.io/main/en/simulation/) : distinction entre simulation du logiciel et essais avec matériel.

DroneLab est une implémentation indépendante ; aucun code PX4 n’y est embarqué et ces références ne constituent pas une certification.
