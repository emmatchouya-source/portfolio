# DroneLab Agent — Windows x64

Agent local permettant au portfolio GitHub Pages de compiler et de téléverser son programme Arduino de banc. Python et Arduino IDE ne sont pas requis sur le poste de l’utilisateur. L’exécutable contient Python/Tk, les modèles du projet et Arduino CLI officiel 1.5.1. Les outils propres à la carte sont téléchargés à la première préparation.

La version 1.1.0 gère Quad X/+/H, Hexa X/+ et Octo X/+. Les configurations version 1 restent des Quad X ; celles de version 2 doivent nommer une géométrie autorisée. L’agent reconstruit ses positions depuis `airframes.json`, vérifie le rapport H et la poussée totale selon le nombre de moteurs, et ignore les tableaux de rotors reçus. La page refuse la version 1.0 afin d’éviter la génération silencieuse d’un Quad X pour un autre montage.

## Construire

Sur Windows x64 avec Python 3.13 et PyInstaller 6.22.3 :

```powershell
python -m pip install -r agent/requirements-build.txt
# Télécharger l’archive officielle arduino-cli_1.5.1_Windows_64bit.zip :
# https://github.com/arduino/arduino-cli/releases/tag/v1.5.1
python scripts/build_agent.py --cli-zip chemin/vers/arduino-cli_1.5.1_Windows_64bit.zip
```

Vérifier l’archive contre les checksums de la distribution officielle avant construction. Le script extrait les modèles de `arduino.js`, charge les catalogues `boards.js` et `airframes.js`, copie le contrôleur et crée `.test-artifacts/agent-release/DroneLab-Agent-Setup.exe` avec `SHA256SUMS.txt`. Il n’exécute pas l’installateur. Publier ensemble l’exécutable, les empreintes et `NOTICE.md` dans `dronelab-agent-v1.1.0`, lié au commit source correspondant. Le programme est exécuté avec les droits courants, sans manifeste UAC d’élévation.

## Vérifier

Avec Playwright et Edge installés :

```powershell
python tests/agent_bridge.py
python tests/agent_browser.py
python tests/agent_package.py
```

Le test du paquet appelle uniquement `--self-test` dans un dossier vérifié sous `.test-artifacts` : il vérifie l’extraction et les empreintes du CLI, sa version, les modèles et Tk. Il ne lance pas l’installation utilisateur, n’enregistre aucun protocole et n’énumère aucun port. Les tests HTTP/navigateur utilisent un CLI et un port fictifs. `tests/agent_bridge.py --real-compile` compile réellement une cible AVR à partir des cœurs déjà installés dans `.test-artifacts/arduino/arduino-cli.json`, sans téléversement. `tests/agent_browser.py --hosted` vérifie le site HTTPS publié avec l’autorisation réseau local normale du navigateur.

## Interface locale

`bridge.py` utilise uniquement la bibliothèque standard. Écoute sur `127.0.0.1:47831` ; Host vérifié et origine autorisée `https://emmatchouya-source.github.io`. Aucun service accessible sur le réseau. Aucune commande ni aucun code client ne sont exécutés. Les profils du catalogue et quelques familles personnalisées autorisées sont les seules cibles.

- `GET /health` : version et indicateur occupé, sans secret. La page exige la version 1.1.0 pour le catalogue de géométries.
- `POST /connect {}` : accord dans la fenêtre de l’agent, jeton aléatoire limité à une heure et à l’origine.
- `GET /ports` : ports détectés par Arduino CLI, jeton requis.
- `POST /jobs` : action `prepare` ou `upload`, profil de carte et configuration JSON. L’upload exige un port détecté. Un seul travail à la fois.
- `GET /jobs/<id>` : état, journal borné et résultat, accessibles au seul jeton créateur.

Les commandes CLI utilisent des listes d’arguments sans shell. Le build a un répertoire isolé par tâche. L’upload utilise explicitement ces fichiers compilés. Les scripts post-install et pre-uninstall sont désactivés afin de ne pas installer les pilotes ou demander des droits administrateur. Les erreurs du CLI sont visibles dans le journal. L’application conserve les vingt derniers travaux en mémoire ; les dossiers de build restent sur disque pour diagnostic.

`desktop.py` installe l’exécutable et le CLI dans `%LOCALAPPDATA%\DroneLabAgent`, avec les licences dans `licenses`. Il enregistre le protocole `HKCU\Software\Classes\dronelab-agent`. La commande du protocole lance uniquement l’exécutable fixe ; l’URL reçue ne devient jamais un argument. Aucun démarrage automatique. Pour mettre à jour une version en cours d’utilisation, fermer sa fenêtre avant de lancer le nouvel installateur ; l’installateur indique cette étape lorsqu’il détecte une ancienne version. Une fenêtre visible reste ouverte et demande l’accord de connexion. Fermer la fenêtre coupe l’accès local ; une tâche en cours doit se terminer avant fermeture.

Le binaire n’est pas signé. Les restrictions d’entreprise, les pilotes, les bootloaders et certains anciens outils peuvent empêcher une opération. Une compilation réussie ne qualifie pas un drone pour le vol ; les modèles de banc conservent leurs adaptateurs matériels inactifs. Voir [les notices](NOTICE.md) et [la documentation de l’application](../projets/drone-lab/README.md).
