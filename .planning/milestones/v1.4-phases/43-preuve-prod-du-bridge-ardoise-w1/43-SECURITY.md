# 43-SECURITY — Phase 43 (audit post-implémentation)

**Verdict : SECURED** — menaces fermées 4/4, `threats_open: 0`
**Niveau ASVS :** 1 · **block_on :** high
**Auditeur :** gsd-security-auditor (rapport transcrit ici — l'agent a rendu le verdict sans écrire le fichier)

## Menaces du plan → mitigations vérifiées dans le code

| ID | Catégorie | Sévérité | Disposition | Preuve |
|---|---|---|---|---|
| T-43-01 | Information Disclosure | high | mitigate | `scripts/test-ardoise-bridge-real.sh` : tous les secrets via fichiers `curl -K` 0600 (`config_session` l.174-182, `corps_secret` l.188-193 avec `--data @fichier`), `smoke_admin_config` 0600 dans `lib-smoke-accounts.sh` l.108-120 ; mktemp `-d` purgé au trap EXIT (`smoke_accounts_tmp_clean`, lib l.84-86) ; grep de `sb_secret\|Bearer <littéral>\|[A-Za-z0-9]{40,}` sur le script ET `docs/BRIDGE-ARDOISE-PREUVE.md` → aucune valeur secrète ; le diagnostic d'échec masque les valeurs longues (`sed 's/[A-Za-z0-9_-]\{30,\}/<long>/g'`). Aucun secret en argv/env. |
| T-43-02 | Tampering | medium | mitigate | Tout SQL passe par `psql.sh < fichier` stdin (aucun `-f` ni `-c`), identifiants via `psql -v foyer=…` (`:'foyer'`, `:'guest'`, `:'invite'`), chaque requête bornée `household_id = :'foyer'`, seules écritures = `delete from public.households where id = :'foyer'` du run + filet borné `user_id in (:'u1',:'u2')`. Aucune falsification d'`expires_at`. |
| T-43-03 | DoS | low | mitigate | `attend_budget` = `sleep 10` avant chaque appel répété d'action limitée ; un 429 inattendu est traité comme signal D-10, jamais comme verdict (`garde_app`). Severity low < block_on → non-bloquant. |
| T-43-SC | Supply Chain (Tampering) | high | mitigate | Aucun `npm`/`pip`/`cargo`/`npx` dans le script ; dépendances = sh + curl + psql.sh + lib-smoke-accounts.sh uniquement. |

## Contrôles additionnels (périmètre preuve prod)

- Canal de redemption = Edge `/functions/v1/household-invite` action `redeem` ; aucun appel direct aux RPC `create_household_bridge_token` / `redeem_household_invite_token` / `redeem_ardoise_invite` dans le script.
- Purge vérifiée : cascade foyers → contrôles 0 ligne (expenses/ardoises/tokens) + `smoke_accounts_purge` re-delete → 404 exigé ; doc réel du run 2026-11-11 12:44 confirme purge verte sur les deux foyers.
- Doc `docs/BRIDGE-ARDOISE-PREUVE.md` : réécrite par le script à chaque run, aucune valeur secrète (UUIDs non sensibles seulement).
- `curl` sans `-L` : un 3xx est un signal D-10, jamais suivi.

## Threat Flags

Aucun — `43-01-SUMMARY.md` ne déclare pas de section `## Threat Flags` (aucune nouvelle surface d'attaque).

## Suites de la review (43-REVIEW.md)

WR-01 et WR-02 corrigés après audit (pagination clampée GoTrue, sonde résiduelle silencieuse) — voir `43-REVIEW-DISPOSITION.md` ; ni l'un ni l'autre n'affaiblit les mitigations ci-dessus (WR-01 les renforce : la détection des résiduels n'est plus dupliquée).
