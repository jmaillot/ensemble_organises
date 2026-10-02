-- 0059_ardoise_grants_fix.sql
-- `private.can_write_ardoise` n'est appelée que par des RPC `SECURITY DEFINER`
-- (qui s'exécutent avec les droits du propriétaire) : aucun droit client ne
-- lui est nécessaire, et le contrôle exhaustif de 0001 l'exige sans référence
-- dans une politique, un trigger, une contrainte ou un défaut.

begin;

revoke all on function private.can_write_ardoise(text) from public, anon, authenticated;
grant execute on function private.can_write_ardoise(text) to service_role;

commit;
