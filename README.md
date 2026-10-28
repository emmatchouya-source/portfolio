# Portfolio — Emmanuel Tchouya

Site personnel statique (HTML/CSS, sans dépendance).

- `index.html` : page principale
- `contact.html` : page de contact (formulaire qui ouvre la messagerie)
- `style.css`, `main.js` : style, thème et animations communs
- `projets/aero-optim/` : application AéroOptim ([dépôt source](https://github.com/emmatchouya-source/aero-optim))
- `projets/a380-lab/` : A380 Cruise Lab, données OpenVSP et propulsion MGA803, équilibrage longitudinal, audit de faisabilité, optimisation sous contraintes, MRC/LRC/ECON, modèle paramétrique distinct et exports reproductibles ([modèle et validation](projets/a380-lab/README.md)). Sans validation sur données de vol.
- `projets/drone-lab/` : laboratoire de vol autonome 3D, sept géométries de multirotors, capteurs simulés, commande en cascade, catalogue de 73 cartes et programme Arduino de banc/portage ([documentation](projets/drone-lab/README.md))
- `agent/` : agent Windows à installer depuis DroneLab pour compiler et téléverser le programme de banc depuis la page ([construction et limites](agent/README.md))

DroneLab utilise des modules JavaScript : le servir par HTTP, par exemple avec `python -m http.server 8080`, puis ouvrir `http://localhost:8080/projets/drone-lab/`.

## Voir le site

Ouvrir `index.html` dans un navigateur, ou activer GitHub Pages (Settings → Pages → branche `main`, dossier `/`).
