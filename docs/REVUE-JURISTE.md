# Dossier de relecture juridique — à transmettre au juriste

Date : 5 octobre 2026. Documents à relire :
- CGU : `app/src/modules/landing/terms-page.tsx` (route publique `/conditions-utilisation`)
- Politique de confidentialité : `app/src/modules/landing/privacy-page.tsx` (route publique `/confidentialite`)

## Contexte technique (constaté, pas supposé)

- PWA familiale, pas de publicité, pas de revente de données, pas de traceurs.
- Authentification : Google / Facebook SSO (nom + e-mail uniquement) ou e-mail + mot de passe.
- Hébergement : base et auth auto-hébergées (Supabase), serveurs situés en France / Union européenne (Oracle OCI,
  formulation prudente retenue). Notifications push envoyées par notre propre serveur (pas de prestataire tiers).
- Mineurs : pas d'inscription directe avant 15 ans ; profils « enfant » créés et gérés par un parent depuis son
  compte. Contrôle technique : case à cocher obligatoire post-première-connexion (« Je certifie avoir 15 ans ou
  plus »), horodatée en base (`profiles.age_attested_at`), accès bloqué tant que non confirmée, refus =
  déconnexion. Aucune vérification d'identité (auto-déclaration, mesure proportionnée au risque).
- Suppression : toutes les clés étrangères vers `households` (40/40 vérifiées) sont `ON DELETE CASCADE`, et la
  politique RLS `households_delete` réserve la suppression à l'administrateur du foyer. Sauvegardes purgées sous
  30 jours (engagement documentaire, procédure d'exploitation à confirmer).
- Ardoise : calcul indicatif de répartition, aucun flux monétaire dans l'application.

## Points à valider explicitement

1. **Article 8 CGU (Ardoise)** : la qualification « répartition indicative, ni transaction, ni garantie de
   paiement » suffit-elle à écarter toute requalification (conseil financier, intermédiation) ?
2. **Âge** : l'auto-déclaration horodatée post-connexion est-elle une mesure suffisante pour un service familial
   sans publicité ni profilage, ou faut-il un contrôle renforcé ?
3. **Suppression de foyer promise (CGU art. 9, confidentialité §5) mais SANS parcours applicatif** : aucun bouton
   « Supprimer le foyer » n'existe dans l'interface à ce jour (suppression possible uniquement par un admin via
   PostgREST direct, politique RLS en place). Faut-il développer ce parcours avant de promettre la suppression
   « à tout moment », ou reformuler l'engagement (suppression sur demande écrite sous 30 jours, comme le compte) ?
4. **Médiation de la consommation (CGU art. 12)** : la mention d'absence de dispositif est-elle tenable pour un
   service gratuit, ou la médiation s'impose-t-elle quand même ?
5. **Partage externes (CGU art. 6)** : le consentement par l'accès (clic sur le lien vaut acceptation) est-il
   opposable, notamment pour les invités d'ardoise en lecture seule sans compte ?
6. **Prospection et preuve du consentement notifications** : le consentement navigateur/appareil suffit-il, et
   faut-il journaliser les acceptations CGU/politique (horodatage) au-delà de l'attestation d'âge ?
7. **Transferts hors UE** : le SSO Google/Facebook implique un transfert nom + e-mail vers les États-Unis à la
   connexion — la mention actuelle suffit-elle, ou faut-il détailler base légale et garanties ?

## Questions ouvertes au juriste

- Mentions légales d'identification de l'éditeur (personne physique) : le minimum requis sur le site au-delà du
  nom et de l'e-mail de contact ?
- Faut-il un registre des traitements formalisé en annexe, et un DPO (seuils applicables ici) ?
- Durées de conservation des journaux techniques (logs serveur, 30 jours backup) : à préciser dans la politique ?
