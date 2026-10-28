# Représentation des trajectoires — version 1.3.3

## Choix de représentation

La vue globale d’un trajet de 4 569 km à 8 km d’altitude est presque plate lorsque les axes ont la même échelle. Amplifier automatiquement l’altitude d’un facteur 114 rendait la croisière visible, mais transformait une pente de 3° en un angle graphique voisin de 80,5° avant même les effets de perspective : `atan(114 × tan(3°))`.

Trois usages sont désormais explicites :

- **3D à échelles identiques par défaut** : positions calculées, caméra mobile, sol et repères ancrés au trajet. Une perspective oblique ne permet pas de mesurer directement un angle sur l’écran.
- **Profil local fidèle** : projection orthographique latérale, même nombre de pixels par mètre sur les deux axes. Fenêtre horizontale de 10 km avant zoom, centrée sur l’instant sélectionné. Les pentes au sol sont conservées ; la perspective et l’amplification verticale sont désactivées dans cette vue.
- **Relief amplifié sur demande** : aide à la lecture de toute la mission, avec avertissement visible dans et au-dessus de la scène. Un changement de caméra ne rétablit plus une ancienne amplification implicitement.

Le profil utilise les points calculés et ne remplace pas la trajectoire par une courbe décorative. Les changements de caméra n’altèrent ni les masses, ni les forces, ni les durées ou le carburant. Le modèle d’avion reste agrandi et son assiette basse vitesse illustrative : l’incidence n’est pas identifiée par les données de croisière.

## Pentes et vent

La pente au sol est `atan2(vitesse verticale, vitesse sol)`. L’angle air γ est distinct lorsque le vent longitudinal est non nul.

La pente finale configurée est maintenant explicitement une pente **au sol**. Pour une descente à θ, une vitesse vraie V et un vent longitudinal w positif vers l’avant, la construction utilise :

```text
gamma_air = -theta - asin(w * sin(theta) / V)
vitesse_verticale = V * sin(gamma_air)
vitesse_sol = V * cos(gamma_air) + w
```

On obtient `vitesse_verticale / vitesse_sol = -tan(theta)`. Le vent change la vitesse verticale nécessaire pour suivre la même pente vers la piste. Sans vent, la trajectoire et les performances numériques de référence restent identiques à la version 1.3.2.

Cette correction cinématique ne qualifie pas les hypothèses basse vitesse comme données A380 de manuel de vol. Voir [TAKEOFF_LANDING.md](TAKEOFF_LANDING.md).

## Exemples publics examinés

- [Cesium — Build a Flight Tracker](https://cesium.com/learn/cesiumjs-learn/cesiumjs-flight-tracker/) : suivi d’un avion à partir de positions horodatées, trajectoire et caméra attachée à l’objet. Le principe de lecture synchronisée est retenu ; cette application conserve son repère longitudinal local, sans revendication de route géographique ou de terrain réel.
- [Garmin — G1000 NXi, guide Cessna NAV III, page imprimée 53](https://static.garmin.com/pumac/190-02824-00_a.pdf#page=77) : affichage vertical VSD et profil VNAV. La lecture locale altitude–distance complète utilement la scène 3D. Notre profil à échelles identiques est un choix d’analyse, sans reproduire l’interface de l’avionique.
- [Airbus — A Focus on the Landing Flare](https://safetyfirst.airbus.com/a-focus-on-the-landing-flare/) : distingue trajectoire, assiette, vitesse et arrondi ; explique l’augmentation du taux de descente sous vent arrière pour conserver la pente. Ces explications justifient de ne pas déduire la pente de l’orientation de la silhouette.

## Vérifications

```text
python -X utf8 tests/test_a380_profile_scale.py
python -X utf8 tests/test_a380_full_mission.py
```

Le test de profil reconstruit indépendamment les angles projetés en Python, pour deux formats d’écran et trois zooms. Il mesure aussi les angles des trajectoires par différences finies, avec vents −10, 0 et +10 m/s. Les contrôles navigateur reproduisent le passage automatique → profil global à l’origine du défaut, l’amplification volontaire, le retour au profil fidèle et l’invariance des résultats exportés.
