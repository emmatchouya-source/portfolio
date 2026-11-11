# Portfolio — Emmanuel Tchouya

Site personnel statique (HTML/CSS, sans dépendance).

## Branche de refonte et vérification

Refonte du portfolio existant sur `audit/refonte-portfolio-2026-11`, sans publication ni modification de `main`.

- [Audit et matrice de décisions](docs/AUDIT.md), [inventaire](docs/INVENTAIRE.md).
- [Changements et points à confirmer](docs/LIVRAISON.md), [vérification scientifique](docs/VERIFICATION.md), [tests exécutés](docs/TESTS.md).
- Études de cas descriptives : `projets/3dexperience/` et `projets/essais/`. Aucun document industriel ajouté.
- Chaque application conserve ses fonctions avancées et propose une documentation scientifique distincte (`documentation.html`).

Reproduire les exemples A380 et DroneLab depuis les seules sources publiques :

```text
node scripts/reproduce_examples.mjs
```

Le contrôle A380 compare le résultat à `data/reference-example.json` et ses empreintes de sources. `--write` régénère volontairement cet exemple après examen des changements de modèle.

Contrôles du site et des nouveaux parcours :

```text
python -X utf8 tests/check_site.py
python -X utf8 tests/test_portfolio_ui.py
python -X utf8 tests/test_aero_optim.py
python -X utf8 tests/test_guided_demo.py
python -X utf8 tests/test_a380_example.py
```

Les tests navigateur utilisent Python, Playwright et Edge installé. Les références indépendantes A380 utilisent NumPy/SciPy. La suite existante est orchestrée par `python -X utf8 tests/run_audit_suite.py` ; les tests C demandent un compilateur C99. Les journaux et captures sont conservés dans `.test-artifacts/`, ignoré par Git. Les tests ne téléversent rien sur une carte.

- `index.html` : page principale
- `contact.html` : page de contact (formulaire qui ouvre la messagerie)
- `style.css`, `main.js` : style, thème et animations communs (menu mobile, matrice de preuves filtrable, feuille d'impression)
- `favicon.svg`, `og.png` : icône d'onglet et image d'aperçu du lien partagé ; `og.png` se régénère avec `python scripts/build_og.py` (Pillow)
- `projets/aero-optim/` : application AéroOptim ([dépôt source](https://github.com/emmatchouya-source/aero-optim))
- `projets/a380-lab/` : A380 Cruise Lab, données OpenVSP et propulsion MGA803, équilibrage longitudinal, trajectoire 3D animée, optimisation sous contraintes, MRC/LRC/ECON et exports reproductibles ([modèle et validation](projets/a380-lab/README.md)). Sans validation sur données de vol.
- `projets/drone-lab/` : laboratoire de vol autonome 3D, sept géométries de multirotors, capteurs simulés, commande en cascade, catalogue de 73 cartes et programme Arduino de banc/portage ([documentation](projets/drone-lab/README.md))
- `agent/` : agent Windows à installer depuis DroneLab pour compiler et téléverser le programme de banc depuis la page ([construction et limites](agent/README.md))

DroneLab utilise des modules JavaScript : le servir par HTTP, par exemple avec `python -m http.server 8080`, puis ouvrir `http://localhost:8080/projets/drone-lab/`.

## Voir le site

Ouvrir `index.html` dans un navigateur, ou activer GitHub Pages (Settings → Pages → branche `main`, dossier `/`).
