# API Coverage Decision — Phase 31

**Verdict global : aucun service, SDK ou API tiers nouveau intégré par cette phase.**
Les touches « externes » ci-dessous sont de la configuration d'infrastructure existante
ou du code first-party ; aucune dépendance applicative nouvelle (Package Legitimacy
Audit 31-RESEARCH.md : aucun paquet externe).

| capability | decision | reason |
|---|---|---|
| GoTrue rate-limiting (GOTRUE_RATE_LIMIT_*) | OPT-OUT | Configuration d'une stack Supabase auto-hébergée déjà déployée, pas d'API tiers appelée par l'app. |
| Transport SMTP (confirmations d'inscription) | OPT-OUT | Service de messagerie de la stack existante ; l'app ne consomme aucun SDK SMTP tiers. |
| Middlewares Traefik (429 sur routes auth) | OPT-OUT | Proxy inverse déjà en place ; configuration locale, aucune intégration applicative. |
| Edge Function household-invite-preview | OPT-OUT | Code first-party appelant la base du projet via le runtime épinglé @supabase/server. |
| Edge Function household-invite | OPT-OUT | Code first-party appelant la base du projet via le runtime épinglé @supabase/server. |
| Dépendances npm ajoutées par la phase | OPT-OUT | Aucune (audit de légitimité des paquets 31-RESEARCH.md : zéro paquet externe nouveau). |
