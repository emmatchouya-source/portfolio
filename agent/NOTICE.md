# DroneLab Agent 1.0.0

L’agent utilise Python, Tkinter et PyInstaller. L’installateur embarque la distribution officielle Windows x64 d’**Arduino CLI 1.5.1** : https://github.com/arduino/arduino-cli/releases/tag/v1.5.1

Arduino CLI est distribué sous GNU GPL version 3. Son code source, ses notices et sa licence sont disponibles sur https://github.com/arduino/arduino-cli/tree/v1.5.1 . Le ZIP officiel embarqué conserve ses fichiers de distribution. L’empreinte SHA-256 du ZIP et de l’exécutable CLI figure dans le manifeste embarqué.

Téléchargement du code source correspondant à Arduino CLI 1.5.1 : https://github.com/arduino/arduino-cli/archive/refs/tags/v1.5.1.zip . Les sources de l’agent et le script de construction sont accessibles sur https://github.com/emmatchouya-source/portfolio/tree/dronelab-agent-v1.0.0/agent . Les licences embarquées sont copiées dans le sous-dossier `licenses` de l’agent installé (Arduino CLI, Python, PyInstaller et Tcl/Tk).

Le code source de l’agent et les étapes de construction sont dans ce dépôt. L’exécutable Windows n’est pas signé avec un certificat d’éditeur ; les règles de sécurité du poste peuvent en empêcher l’exécution. Aucun réglage de sécurité ou droit administrateur n’est modifié par l’agent.
