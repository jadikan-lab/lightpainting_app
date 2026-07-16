# Lightpainting

PWA de capture de trainées lumineuses (lightpainting) avec la caméra du smartphone.
Vanilla JS/HTML/CSS, sans build, sans backend — tout se passe côté client.

## Fonctionnement

Il n'existe pas de vraie pose longue manuelle dans un navigateur (pas de contrôle du temps
d'obturation via `getUserMedia`). L'app simule le lightpainting en empilant les frames de la
vidéo sur un canvas d'accumulation avec un blend `lighten` (garde le pixel le plus lumineux
vu à chaque frame), à la résolution native du capteur. En parallèle, le flux caméra brut est
enregistré via `MediaRecorder` pour garder une vidéo du processus de création des trainées.

## Lancer en local

```
npx serve .
```

ou tout autre serveur statique. Ouvrir ensuite l'URL affichée dans un navigateur.

## Tester sur un téléphone réel

`getUserMedia` exige un contexte sécurisé (HTTPS ou `localhost`). Pour tester sur un vrai
téléphone (indispensable pour juger la qualité de capture), deux options :

1. **Tunnel HTTPS** (le plus simple) : lancer le serveur local puis exposer le port avec
   `ngrok http 3000` (ou équivalent), ouvrir l'URL `https://...ngrok.io` sur le téléphone.
2. **Débogage USB à distance (Android + Chrome)** : brancher le téléphone, activer le
   débogage USB, ouvrir `chrome://inspect` sur desktop, `port forwarding` vers `localhost:3000`,
   puis ouvrir `http://localhost:3000` directement dans Chrome sur le téléphone (compte comme
   `localhost`, donc pas besoin de HTTPS).

## Installation en PWA

Sur mobile, utiliser "Ajouter à l'écran d'accueil" depuis le menu du navigateur pour installer
l'app (manifest + icônes déjà configurés dans `manifest.json` / `icons/`).

## Structure

```
index.html            écrans caméra / galerie / visionneuse
manifest.json          config PWA (nom, icônes, thème)
sw.js                  cache app-shell minimal (install/offline de base)
css/style.css          UI complète (thème sombre, camera-app style)
js/db.js               wrapper IndexedDB (stockage local photos/vidéos)
js/camera.js            getUserMedia, switch avant/arrière, résolution max
js/capture-engine.js    accumulation canvas (blend "lighten"), export photo finale
js/recorder.js          MediaRecorder (vidéo du processus de capture)
js/gallery.js           miniatures, visionneuse, export/partage
js/app.js               bootstrap, wiring UI
```

## Points d'attention

- **Format photo** : export JPEG qualité 1.0 à la résolution native du flux vidéo (pas de
  downscale). Ajustable dans `capture-engine.js` si le poids de fichier pose problème (PNG
  possible pour du lossless, mais plus lourd).
- **Format vidéo** : dépend du support `MediaRecorder` du navigateur (webm sur Chrome/Android,
  mp4/h264 sur Safari iOS) — détecté dynamiquement dans `recorder.js`.
- **Export/partage** : utilise `navigator.share` avec fichiers quand disponible (partage natif
  vers la pellicule ou une autre app), sinon bascule sur un téléchargement classique.
