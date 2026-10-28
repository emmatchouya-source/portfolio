# Décollage, approche et atterrissage — version 1.3.0

## Périmètre et données

Le mode **Vol complet** calcule une trajectoire du début du roulage jusqu’à l’arrêt après atterrissage. Le mode **Croisière uniquement** conserve les calculs précédents. Le cas `?scenario=full&view=3d` permet d’examiner directement le vol complet de vérification à 300 t.

Les cartes de croisière OpenVSP/Trent et les tables importées ne sont pas extrapolées aux phases au sol ou à basse vitesse. Ces phases utilisent un modèle paramétrique distinct, avec polaires lisses/volets, CL maximal, TSFC, poussée disponible, frottement et freinage éditables dans « Modèle & données ». Les valeurs par défaut sont des **hypothèses numériques d’étude**, pas un jeu de performances AFM de l’A380. Le JSON les conserve avec le statut `parametric-low-speed/unvalidated`.

Le document local *Cessna Citation X Takeoff and Departure Trajectories Prediction in Presence of Winds*, Ghazi, Botez & Maniette, DOI [10.2514/1.I010854](https://doi.org/10.2514/1.I010854), expose une méthode par phases, mais concerne un autre avion. Ni ses coefficients ni sa qualification ne sont transposés à l’A380. Les valeurs de freinage et d’hypersustentation A380 manquent dans les fichiers du projet.

## Distance, masse et raccordement

En vol complet, la masse et le carburant saisis sont ceux au début du roulage. La distance saisie relie l’origine de décollage au seuil d’arrivée. L’arrêt a lieu après ce seuil : la distance finale de la trajectoire dépasse donc légèrement la distance saisie.

Le calcul procède ainsi :

1. Roulage et rotation, jusqu’à ce que la portance atteigne le poids.
2. Transition initiale jusqu’à 120 m au-dessus de l’aéroport, puis montée progressive vers la première altitude de croisière.
3. Croisière, avec ses éventuelles montées et le modèle sélectionné.
4. Descente jusqu’à 300 m au-dessus de l’arrivée, approche à pente nominale, arrondi depuis 12 m, toucher et freinage jusqu’à l’arrêt.

Le carburant déjà consommé est déduit avant la croisière. La masse hors carburant reste identique dans toutes les phases. Les dimensions cinématiques de la descente et de l’approche permettent de déterminer la distance de croisière restante, sans ajouter une distance d’approche au-delà de la destination. Le raccord au seuil d’arrivée à 15,24 m est contrôlé à moins de 0,1 m. Réserve et durée maximale portent sur le vol complet.

## Roulage et rotation

Pistes horizontales, vent longitudinal uniforme (positif : vent de dos), poussée établie avant le lâcher des freins. Avec u la vitesse sol :

```text
Vair = max(0, u − vent)
q = ½ρVair², L = q S CL, D = q S (CD₀ + k CL²)
N = max(0, mg − L)
dx/dt = u
du/dt = (T − D − μroulement N)/m
dm/dt = −débit
```

Le modèle n’identifie pas les forces aérodynamiques d’un écoulement venant de l’arrière au tout début d’un roulage avec vent de dos ; leur contribution est posée nulle tant que `u − vent ≤ 0`.

La vitesse de décrochage du modèle est `Vs = sqrt(2mg/(ρS CLmaxTO))`. La rotation commence à 1,1 Vs ; CL augmente progressivement selon une loi quintique, pendant le temps de rotation commandé, vers `CLmaxTO/1,2²`. L’envol est détecté lorsque L = mg ; il peut précéder la fin de la commande de rotation si la vitesse augmente suffisamment. Les vitesses obtenues sont des **estimations du modèle**, pas des V1/VR/V2 certifiées.

La perte de poussée et le débit basse vitesse sont paramétriques :

```text
Tdisponible = 4 Tref δ^0,7 (1 − 0,25 M) × fraction configurée
débit = max(débit minimal, T × TSFCbasseVitesse)
```

La référence de poussée est celle du panneau général ; ces lois ne constituent pas une carte moteur Trent validée à basse vitesse. La poussée demandée en vol doit rester sous la marge configurée.

## Montée, descente et arrondi

Les profils d’altitude et de vitesse sont des polynômes de raccordement en temps, avec positions, vitesses et accélérations imposées aux raccords. Ils représentent une procédure prescrite, pas une loi de pilotage identifiée ou optimisée. Le calcul utilise :

```text
γ = asin(hdot/V)
Vsol = V cos γ + vent
γdot = (hddot V − hdot Vdot)/(V² cos γ)
L = m(g cos γ + V γdot)
T − D = m(g sin γ + Vdot)
```

Les polaires et CL maximaux passent progressivement entre configurations décollage, lisse et atterrissage. Les aérofreins peuvent augmenter CD dans la limite éditable pour respecter la poussée minimale en descente/décélération. Si cette traînée ne suffit pas, la trajectoire est rejetée. Poussée, portance, pente et facteur de charge sont contrôlés à toutes les étapes d’intégration ; les filtres ±12° et 0,8–1,2 g restent des limites d’étude.

La vitesse d’approche saisie est une vitesse équivalente (EAS), convertie en TAS à la densité de l’aéroport d’arrivée. Ce n’est pas une conversion CAS complète. La pente finale nominale est paramétrable. L’arrondi se termine à vitesse verticale nulle ; les efforts d’impact et la dynamique du train ne sont pas simulés. La marge d’approche de 1,3 Vs et la limite de masse à l’atterrissage, si renseignée, sont contrôlées.

Les masses, temps et travaux sont intégrés par RK4. Au classement final à pas de croisière de 5 km, les phases aéroportuaires utilisent un pas de 0,5 s en vol et 0,1 s au sol. Le contrôle à 2,5 km les réduit à 0,25 s et 0,05 s. Les événements rotation/envol/arrêt sont localisés par recherche de racine. Les longs segments de montée/descente conservent une trace tous les 2 s ; l’intégration demeure plus fine. Les phases courtes et leurs bornes sont conservées.

## Freinage et distances de piste

Après le toucher, la portance diminue progressivement pour représenter le déploiement des destructeurs de portance. Le freinage apparaît après le délai configuré, avec une transition d’une seconde :

```text
Ffreins = μfreinage × déploiement × max(0, mg − L)
du/dt = (Tralenti − D − Ffreins − μroulement N)/m
Énergie freins = ∫ Ffreins u dt
```

Aucun inverseur n’est crédité. Le coefficient de freinage est constant après déploiement : il ne modélise ni piste mouillée, neige, aquaplanage, anti-skid ou adhérence variable avec la vitesse. L’énergie est un travail mécanique total ; la température des freins et l’énergie admissible par roue ne sont pas calculées. Une limite d’énergie totale peut être renseignée ; 0 signifie qu’elle manque, pas une capacité infinie de l’avion.

Contrôles d’étude :

- Roulage jusqu’à l’envol ≤ TORA saisie.
- Distance depuis l’origine jusqu’à la hauteur de contrôle de 15,24 m ≤ TODA saisie.
- Distance du seuil d’arrivée à l’arrêt ≤ LDA saisie.

Le choix de 15,24 m est un écran de calcul explicite ; ce n’est pas une affirmation de conformité aux exigences de certification transport. Aucune majoration réglementaire de distance, panne moteur, accélération-arrêt, obstacle réel ou remise de gaz n’est calculé. Une marge positive n’établit pas l’aptitude opérationnelle d’une piste.

## Optimisation, interface et qualification

Le coût de chaque candidat Mach/altitude/montées inclut toutes les phases. Le taux de montée initiale, les paramètres de piste et la procédure d’approche restent des entrées fixées ; leur optimisation conjointe n’est pas revendiquée. La carte Mach–altitude et les exports portent sur le même périmètre que le mode sélectionné.

La vue 3D offre des caméras locales de départ/arrivée, des accès par phase et une lecture automatique qui ralentit au sol et pendant l’arrondi. L’attitude basse vitesse est illustrative : aucune incidence ou position de stabilisateur ne peut être identifiée sans données appropriées. La position, la vitesse, le carburant et les forces proviennent du calcul. Les pistes et le terrain sont schématiques ; le maillage de l’avion est agrandi.

Le CO₂ est calculé sur tout le carburant. Les autres émissions restent disponibles pour la croisière seule ; les émissions totales du vol sont déclarées indisponibles.

`tests/test_a380_full_mission.py` contrôle bilans de masse/temps/carburant, continuité, fermeture au seuil, vent, altitude/température, frottement, réserves, limites de piste, masse et énergie. Le roulage, la rotation et le freinage sont comparés à des intégrations SciPy DOP853 indépendantes, avec événements, forces normales variables et perte de masse. Les essais navigateur couvrent phases/caméras, lecture automatique, CSV/JSON, réimport et mobile.

Le [manuel FAA, chapitre Aircraft Performance](https://www.faa.gov/sites/faa.gov/files/13_phak_ch11.pdf) décrit les effets du vent, de la densité, de la masse et du freinage, ainsi que l’importance des données AFM/POH. Le [manuel NASA SP-367](https://appel.nasa.gov/wp-content/uploads/2018/08/NASA-SP-367-Intro-to-Aero-of-Flight.pdf) expose les forces et segments de décollage. Ces références générales n’apportent pas les données A380 manquantes. Une qualification réelle nécessite les performances autorisées de la variante avion/moteur, des cas AFM/vols de référence et la confirmation des hypothèses du [modèle source](SOURCE_MODEL.md).
