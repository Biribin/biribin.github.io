# Linéo Biribin · Ingénieur automatisation et agents IA

**Je remplace chaque processus manuel par un flux auditable.**

Ingénieur automatisation et agents IA. Je construis des chaînes métier de bout en bout sur n8n auto-hébergé, avec une couche IA branchée dessus : paie, DSN, DPAE, facturation, contrats, conformité et veille réglementaire, pour un groupe d'intérim aéroportuaire de 900 intérimaires.

Nogent-sur-Marne (94) · France entière · remote ou présentiel · tout type de contrat. En poste, préavis d'un mois.

- ~100 workflows n8n en production, auto-hébergés
- 51 workflows partagés en open source, licence MIT
- 14 serveurs MCP exposant le SI RH à un assistant IA
- < 1 % d'écart sur bulletin de référence, moteur de paie interne

## Projets

Cadrage, spécification et recette de ma main. Le code est produit par des agents sous ma spécification, puis recetté ligne à ligne.

1. **51 workflows n8n en open source** ([dépôt](https://github.com/Biribin/n8n-workflows)) — licence MIT : veille sur forum avec scoring par LLM, exploitation de n8n à l'échelle (workflow d'erreur, relance de déploiement, suivi du coût des API), veille réglementaire française, interface web servie par n8n sans JavaScript. Sanitisés par un script qui refuse la publication s'il détecte un secret ou une donnée personnelle.
2. **Couche MCP sur SI RH** (interne) — 14 serveurs MCP sur mesure exposant identité, badges, compétences, indemnités, formations, émargement, planning, CLD et boîtes Outlook à un assistant conversationnel. Cache-first : temps de réponse ramené de 4 s à 200 ms, dégradation automatique vers le scraper live.
3. **Moteur de paie interne** (interne) — remplace une chaîne propriétaire (Tempo7 / Banco7 / Citrix), calibré à moins de 1 % d'écart sur bulletin de référence : reverse-engineering des assiettes CSG, CRDS, URSSAF, FNAL, AGIRC-ARRCO (T1/T2, CEG, APEC), mutuelle et prévoyance, puis recette ligne à ligne.
4. **Déclaratif social automatisé** (interne) — DSN de bout en bout : signaux (FCTU, arrêt, reprise, amorçage, néant), retours AEE/CCO, PAS mensuel, réconciliation des CRM organismes. DPAE via l'API URSSAF, worker toutes les 15 minutes.
5. **Agent juridique sur Légifrance** (interne) — client OAuth2 PISTE, code du travail, conventions collectives, accords de branche intérim et jurisprudence en base vectorielle ; interrogation en langage naturel, veille réglementaire avec export.
6. **Webapp métier Next.js** (interne) — multi-tenant, mot de passe et 2FA TOTP, ingestion de l'ERP RH, arbitrage des pointages, journal d'audit ; réconciliation triple source planning × badgeuse × relevé client.
7. **Galerie de 25 landing pages** (en ligne) — 25 variantes de design sur un cas client fictif, servies en statique sur GitHub Pages.
8. **AEF Solutions, site produit** (en cours) — landing d'un espace métier multi-secteur en Next.js.
9. **Lead generation & acquisition** (freelance) — identification de prospects, extraction Apollo, scraping Bright Data et Apify, enrichissement, messages personnalisés par LLM.
10. **Visual Samples** (en ligne) — agence de production vidéo 3D, site vitrine et portfolio.

## Parcours

- **Ingénieur automatisation et agents IA** — groupe d'intérim aéroportuaire, 900 intérimaires, CDG & Orly · depuis mars 2026. Paie, DSN, DPAE, facturation, contrats, conformité ; couche MCP de 14 serveurs ; calcul d'émargement (12 716 vacations, 385 agents) ; veille réglementaire automatisée ; Microsoft 365 par Graph API ; contribution à l'audit ISO 9001:2015 et au RGPD opérationnel.
- **Automatisation & IA appliquée** — PH Deco, freelance · 2025. Pipeline de lead generation et d'outreach.
- **Automatisation & IA appliquée** — Groupe Biribin, freelance · 2025. Bot de gestion des connaissances (Pinecone), gestion automatisée de flotte (Supabase).
- **Cycle Master, majeure Imagerie & Réalité virtuelle** — EFREI · 2019-2024.
- **Professeur particulier de physique-chimie** · 2025.

## Profil

Mon métier n'est pas d'écrire le code : je cadre le besoin, j'assemble les briques existantes, je fais produire le code par des agents et je le recette moi-même. Garde-fou constant : validation humaine avant tout envoi.

- **Automatisation low-code** : n8n auto-hébergé à l'échelle, idempotence, reprise sur erreur, webhooks, files d'attente.
- **IA appliquée & agents** : API Claude et Gemini, serveurs MCP, OCR par LLM, RAG, développement assisté par agents (Claude Code, BMAD, GSD).
- **Intégration & API** : REST, webhooks, OAuth2, Microsoft Graph, scraping authentifié.
- **Données & exploitation** : PostgreSQL, Supabase, SQLite, Linux, Docker Compose, VPS, Coolify, Caddy.

Langues : français (langue maternelle), anglais (TOEIC 830).

## Contact

- Courriel : [lineobiribin@gmail.com](mailto:lineobiribin@gmail.com)
- [LinkedIn](https://www.linkedin.com/in/lineo-biribin) · [GitHub](https://github.com/Biribin)
- [CV (PDF)](https://biribin.github.io/assets/BIRIBIN-Lineo-cv.pdf)

Version HTML : https://biribin.github.io/
