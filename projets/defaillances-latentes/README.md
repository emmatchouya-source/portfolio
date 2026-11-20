# Défaillances latentes : probabilité moyenne de défaillance par vol

Outil web autonome développé pour le travail de recherche du cours MEC8312 — Fiabilité et sécurité des systèmes
(Polytechnique Montréal, automne 2026). Une seule page, `index.html`, sans dépendance ni connexion : il suffit de
l'ouvrir dans un navigateur.

## Ce que fait l'outil

À partir du schéma d'un système (diagramme `serie(…)/par(…)`, arbre `OU(…)/ET(…)` ou coupes minimales), du taux de
défaillance λ de chaque composant, de la durée t d'une mission et de l'intervalle de vérification T des composants
dont la défaillance est latente, il dessine le schéma saisi (composants latents en pointillé) et calcule :

1. **l'identification des défaillances latentes** (Kohda et Inoue, 2001) : indice de détectabilité, détectabilité
   de chaque coupe minimale, importances structurelle et de détectabilité ;
2. **la méthode du cours** (module M3A) : exposition pendant T, borne du vol le plus défavorable ;
3. **la probabilité moyenne approchée** de Ramesh, Twigg et Sharma (2002) ;
4. **le calcul exact** par une chaîne de Markov mission par mission (Ramesh et al., 2008), avec le profil de
   chaque mission et le pire vol ;
5. **l'intervalle de vérification admissible** pour un objectif de probabilité par mission ;
6. **l'effet d'une surveillance** ajoutée sur chaque composant latent, à comparer au classement de Kohda et Inoue.

## Validation

L'onglet « Validation » recalcule dans le navigateur 19 cas de référence : les 11 valeurs EHARP publiées par
Ramesh et al. (2002, tableaux 4 et 5), l'exemple 2 du module M3A, les états critiques du tableau 2 de Kohda et
Inoue (2001) et une simulation de Monte-Carlo avec deux composants latents d'intervalles différents.

Le moteur se teste aussi hors navigateur (Node.js 18 ou plus) :

```
node --test tests/test_moteur.cjs
```

## Hypothèses

Lois exponentielles, défaillances indépendantes, commutation, inspection et réparation parfaites, même taux en
attente et en service, maintenance entre les missions seulement (hypothèses de Ramesh et al.).

## Références

1. A. V. Ramesh, D. W. Twigg, T. C. Sharma, « Approximation method and formulas for average unavailability of
   systems with latent faults », *Proc. RAMS*, 2002, p. 460-466.
2. A. V. Ramesh, D. W. Twigg, T. C. Sharma, « Advanced methodologies for average probability calculation for
   aerospace systems », *26th ICAS Congress*, 2008.
3. T. Kohda, K. Inoue, « Fault-tree analysis considering latency of basic events », *Proc. RAMS*, 2001, p. 32-35.
