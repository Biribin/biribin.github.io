# Landing page — Linéo Biribin

Page unique statique, sans build, sans dépendance : un seul fichier [index.html](index.html)
(HTML + CSS + JS inline, polices chargées depuis Google Fonts).

## Ouvrir en local

Double-clic sur `index.html`, ou :

```bash
python -m http.server 8000   # puis http://localhost:8000
```

## Design system

| Token | Valeur |
|---|---|
| Fond / texte | `#050505` / `#FFFFFF` |
| Accents | Electric Blue `#3B82F6`, Deep Purple `#9333EA`, Signal Green `#22C55E`, Pink `#EC4899` |
| Titres | Space Grotesk 500/700, tracking serré (`-.045em` sur le H1) |
| Corps | Inter 300/400 |
| Pixel | Press Start 2P (pill du hero, index des cartes, overlays) |
| Verre | `rgba(255,255,255,.05)` + bordure `rgba(255,255,255,.10)` + `backdrop-blur(12px)` |
| Easing | `cubic-bezier(.4,0,.2,1)` |
| Gouttières | 64px (32px en secondaire) — jamais 12px |

Effets : overlay scanlines CRT (2px sur 4px), vignette radiale, halos floutés (blur 120px),
iris-wipe (`clip-path: circle()`) au chargement **et** à chaque saut de section,
marquee infini (20s linéaire, texte en dégradé `#1f2937 → #4b5563`),
reveal au scroll via `IntersectionObserver`.
Tout est neutralisé sous `prefers-reduced-motion: reduce`.

## Structure

`Nav fixe 80px` → `Hero 100vh + 4 stats` → `Marquee` → `Grille projets 2 colonnes décalées (10 cartes)`
→ `Parcours` → `Profil + 4 services` → `Compétences` → `Contact` → `Footer`.

## Photo de profil

Le bloc portrait affiche un monogramme « LB » en niveaux de gris tant qu'aucune photo n'est fournie.
Pour la remplacer : déposer une image carrée (1:1, ≥ 800×800) en `assets/portrait.jpg`.
Si le fichier est absent, le `onerror` retire l'image et le fallback reste affiché — rien à modifier.

## Publier sur GitHub Pages

```bash
git init && git add . && git commit -m "landing page"
git branch -M main
git remote add origin https://github.com/Biribin/<nom-du-repo>.git
git push -u origin main
```

Puis *Settings → Pages → Source: main / root*. URL : `https://biribin.github.io/<nom-du-repo>/`.

## Liens sortants utilisés

- github.com/Biribin — github.com/Biribin/n8n-workflows
- biribin.github.io/ldp-coach-gallery
- aef-solutions.fr
- visual-samples.com
- linkedin.com/in/lineo-biribin
- mailto:lineobiribin@gmail.com — tel:+33650559184
