# Montées de croisière de durée finie — version 1.2.0

La version 1.2 remplace les sauts d’altitude du rapport par une trajectoire progressive. Le coût est calculé dans le moteur de performance et dans l’optimiseur ; la vue 3D lit ce même résultat. Ce n’est pas un lissage graphique de l’ancien calcul.

## Trajectoire et cinématique

Pour une montée de hauteur Δh et de longueur horizontale L, `u = (x − xdépart)/L` :

```text
h = hdépart + Δh (10u³ − 15u⁴ + 6u⁵),  0 ≤ u ≤ 1
L = (15/8) Δh (VTAS,max + vent) / ROCmax
```

La pente et la courbure sont nulles aux deux extrémités. La constante 15/8 est le maximum de la dérivée de ce polynôme. La longueur choisie borne la vitesse verticale par le taux configuré, sous l’hypothèse de Mach et vent constants. Ce profil prescrit n’est ni une loi de pilotage identifiée sur l’A380, ni une solution optimale en poussée/taux de montée.

Le vent est longitudinal, uniforme, sans composante verticale. Avec `s = dh/dx` et γ l’angle de trajectoire dans la masse d’air :

```text
Vsol = V cos γ + vent
hdot = s Vsol = V sin γ
γ = atan(s) + asin[vent s / (V sqrt(1+s²))]
Vdot = (dV/dh) hdot
```

À Mach constant, `dV/dh = −0,0065 V/(2T)` sous 11 km et 0 au-dessus dans l’atmosphère implémentée. γdot est obtenu en dérivant la relation de pente, avec la courbure `d²h/dx²`. La subdivision à la tropopause traite séparément les deux gradients ISA. La pression demeure la pression ISA à l’altitude, même en ΔISA, comme dans le modèle précédent.

## Forces, carburant et énergie

Les équations dans les axes de trajectoire sont :

```text
T∥ − D = m (g sin γ + Vdot)
L + T⊥ = m (g cos γ + V γdot)
```

Le mode projet résout toujours α, stabilisateur et moment, mais avec ces charges tangentielles et normales. La poussée moteur est inclinée de `α + 2°` dans les axes vent. Les conventions de moments restent celles du projet reconstruit et demandent confirmation sur les routines originales. Dans le mode réduit, la poussée est alignée avec la trajectoire et CL inclut la charge normale.

Le débit est recalculé à la poussée demandée à chaque étape RK4. Le modèle du projet inverse ses polynômes et conserve son domaine N1 corrigé et sa marge de poussée. Les tables réduites et le mode paramétrique conservent l’hypothèse simplificatrice d’une TSFC indépendante du réglage moteur. Une montée trop exigeante est rejetée, pas ralentie silencieusement ni rendue faisable en augmentant les limites moteur.

Le bilan de puissance contrôlé est :

```text
(T∥ − D)V = mg hdot + mV Vdot
```

Les termes de travail, énergie potentielle et énergie cinétique sont intégrés sur la mission. La masse varie : le contrôle utilise les intégrales de puissance à masse instantanée, pas la différence entre deux énergies `mgh + ½mV²` à masses différentes. Cette cohérence des forces ne valide pas les cartes aérodynamiques ou moteur.

`dm/dx = −WF/Vsol` et `dt/dx = 1/Vsol` sont intégrés ensemble. Au moins 32 intervalles par montée à 5 km, 64 à 2,5 km et davantage aux pas plus fins. Les raccords et la tropopause sont atteints explicitement. Réserve, poussée, CL et domaines sont contrôlés à toutes les étapes RK4. Les filtres ±8° de pente et 0,8–1,2 de charge normale sont des limites d’étude, sans statut d’enveloppe certifiée.

## Optimisation et restitution

La recherche Mach/altitude/nombre de montées évalue désormais ce coût physique. Les départs sont éditables en pourcentage de distance. Si leur optimisation est activée, elle explore 10–90 % par pas de 10 %, puis un voisinage à 2 %, au meilleur Mach/altitude trouvé par nombre de montées. Cette recherche par coordonnées ne garantit pas un optimum conjoint global. Le taux vertical maximal et la forme de transition sont fixés ; ils ne sont pas optimisés.

Une montée chevauchante, terminée après la destination ou dépassant les contraintes est rejetée. Le carburant du tableau des montées est le total consommé sur la transition, pas un surcoût par rapport à une croisière fictive.

La vue 3D utilise la même loi d’altitude ; assiette = pente + incidence si disponible. Elle indique vitesse verticale, pente, poussée et débit. Les exports conservent phases, altitudes intermédiaires, durées, bilans d’énergie et qualification. Les anciennes études importées sont recalculées : les champs absents reçoivent les nouveaux paramètres par défaut ; les anciens résultats ne sont pas réutilisés.

## Vérifications indépendantes

`tests/test_a380_finite_climbs.py` compare six missions à une implémentation Python séparée : interpolation Hermite quintique SciPy, angle sous vent par Brent et intégration adaptative DOP853. Cas sans montée, une/deux montées, vents ±30 m/s, ΔISA ±10 K et traversée de la tropopause. Tolérance de comparaison : 0,01 kg et 0,01 s aux pas testés. La convergence à un pas quatre fois plus fin est aussi vérifiée.

Sur les montées du modèle source, 17 équilibres HYBR et inversions moteur Brent indépendants vérifient les forces, moments, poussées et débits. Les essais contrôlent énergie, taux maximal et rejets des montées trop exigeantes, chevauchantes ou inachevées. Les tests d’interface contrôlent animation, télémétrie, CSV, durée/carburant, choix du profil et mobile.

Repère du modèle reconstruit à 300 t, Mach 0,6, départ 8 km, deux montées de 600 m à 35/70 %, taux maximal 1,27 m/s : chaque transition dure environ 890 s. Le modèle consomme environ 2 008 kg puis 1 886 kg pendant ces transitions. Ces chiffres vérifient l’implémentation ; ce ne sont pas des performances validées de l’A380. Le cas 500 t reste rejeté sous les conventions moteur/trim actuelles.

## Sources et qualification

Le principe du bilan d’énergie totale est décrit dans le [manuel EUROCONTROL BADA 3.4, §3.1](https://www.eurocontrol.int/sites/default/files/library/007_User_Manual_BADA_3_4.pdf). Les équilibres sont exposés par [NASA Glenn, Forces in a Climb](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/forces-in-a-climb/). Le code n’incorpore pas de données BADA ni de qualification BADA.

La correction ne lève pas les limites de [SOURCE_MODEL.md](SOURCE_MODEL.md) : domaine moteur non identifié, CG/moments reconstruits, facteur de débit à confirmer, absence de comparaison à des vols et d’enveloppe de buffet. Des références avion/moteur autorisées et plusieurs missions mesurées ou constructeur, sur les masses/Mach/altitudes/températures visés, sont nécessaires pour qualifier les gains pour une décision d’entreprise. Le logiciel ne produit pas de plan de vol opérationnel.
