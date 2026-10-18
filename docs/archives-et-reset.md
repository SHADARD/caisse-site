# Activation des sauvegardes et de la réinitialisation générale

Le code seul n’active ni les tables de sauvegarde ni le déclenchement automatique. Aucun reset des données réelles n’est effectué pendant l’installation.

## 1. Activer la base

Dans Supabase → projet → SQL Editor → New query, exécuter **migrations/002-archives-reset.sql**. Ne pas réexécuter le grand `schema.sql` sur la base existante.

Cette migration crée :

- Les métadonnées des PDF et sauvegardes dans `business_archives`.
- Le bucket privé `business-archives`, pour les PDF et les fichiers JSON.
- Un historique technique des anciens rapports conservés avant un reset général.
- Les fonctions de copie et de réinitialisation et les contrôles de maintenance.

Les comptes et sites sont conservés. Les admins consultent les PDF. Le super utilisateur consulte aussi les sauvegardes JSON. Les utilisateurs des sites n’accèdent pas aux archives globales. Les mots de passe et clés de services ne sont jamais copiés dans les sauvegardes.

## 2. Vérifier les secrets Pages

Dans Cloudflare → Workers & Pages → caisse-site → Settings → Variables and Secrets → Production, conserver les variables déjà en place :

- `SUPABASE_URL` : URL racine HTTPS du projet, sans `/rest/v1/`.
- `SUPABASE_SERVICE_ROLE_KEY` : clé serveur confidentielle déjà utilisée pour créer les comptes.
- `SUPABASE_ANON_KEY` : clé publique utilisée pour la connexion du navigateur.

## 3. Planification Supabase (active)

L’automatisation utilise **Supabase Cron + pg_net + une Edge Function**. Aucun Worker Cloudflare supplémentaire ni secret Cron à recopier n’est nécessaire.

1. Exécuter `migrations/003-monthly-schedule.sql` après la migration 002. Cette migration installe les extensions, crée un secret aléatoire chiffré dans Vault et les fonctions d’appel. Elle ne retourne jamais la valeur du secret.
2. Déployer la fonction `supabase/functions/flamingo-monthly-archive/index.ts` avec ses dépendances : `domain.mjs`, `server/business-archives.mjs`, `server/archive-pdf.mjs` et `deno.json`. Les trois modules partagés sont des copies des fichiers correspondants à la racine ; les synchroniser avant chaque nouveau déploiement. `verify_jwt=false` est intentionnel : la fonction vérifie elle-même le jeton interne Vault, inaccessible aux utilisateurs. Elle utilise les variables serveur Supabase fournies automatiquement.
3. Après déploiement réussi, activer la tâche avec :

```sql
select cron.schedule(
 'flamingo_monthly_backup',
 '5 23 9 * *',
 'select flamingo_private.dispatch_monthly_archive();'
);
```

L’horaire UTC correspond au **10 de chaque mois à 00 h 05 à Kinshasa**, pour le cycle du 10 au 9 terminé. Le nom stable remplace la tâche existante ; ne pas activer simultanément le Worker alternatif dans `workers/`.

Pour vérifier sans attendre le mois suivant : appeler `select flamingo_private.dispatch_monthly_archive();` en tant qu’opérateur PostgreSQL, puis vérifier le statut HTTP dans `net._http_response` et les fichiers privés. Ne jamais sélectionner les secrets Vault. Une période déjà archivée retourne l’archive existante, sans doublon.

## 4. Vérifier le fonctionnement

Sur des données de test, avant une utilisation générale :

1. Se connecter comme administrateur : le bouton « Tout réinitialiser » doit être absent ; les PDF archivés sont accessibles, pas les JSON.
2. Se connecter comme super utilisateur : le bouton apparaît. Un dialogue demande la phrase **TOUT REINITIALISER** et le mot de passe actuel.
3. Une sauvegarde JSON complète des données applicatives et un PDF récapitulatif sont d’abord envoyés au stockage privé. S’ils ne sont pas enregistrés, aucun reset n’est autorisé.
4. Après confirmation réussie, les rapports courants et les périodes de caisse sont vidés ; une nouvelle caisse est ouverte par site. **Les cumuls et le rapport mensuel courant repartent à zéro.** Les anciennes données ne sont pas réadditionnées dans le mois, conformément au choix du propriétaire.
5. Les comptes, sites, PDF et sauvegardes antérieurs restent conservés. Dans « Historique et PDF », ouvrir le PDF avant reset et vérifier les totaux.
6. Pour tester une archive mensuelle sans attendre le Cron, sélectionner une période terminée dans le tableau de bord super utilisateur, puis « Archiver cette période en PDF ». Les périodes non terminées sont refusées.
7. Vérifier aussi la réponse pg_net et les journaux de la fonction Supabase après un déclenchement de test de la tâche planifiée. Ne considérer l’automatisation active qu’après cette vérification.

Le planificateur ne réinitialise aucune caisse et ne supprime aucune donnée. Il crée une sauvegarde et un PDF mensuels. Seule l’action explicite du super utilisateur « Tout réinitialiser » efface les rapports courants.

## Conservation et limites

Les archives sont conservées sans suppression automatique. Elles utilisent le quota de stockage Supabase du compte. Les échecs sont visibles dans les journaux de la fonction Supabase et dans les réponses pg_net. Le planificateur appelle une fois par mois ; il n’existe pas de relance quotidienne automatique. Une période non créée peut être archivée manuellement depuis l’interface super utilisateur. Les sites et comptes sont conservés pendant le reset ; ce mécanisme ne remplace pas un export complet de l’infrastructure Supabase ou une sauvegarde des mots de passe d’authentification.

Pendant la copie, les écritures applicatives sont temporairement bloquées pour éviter qu’un rapport soit ajouté après la sauvegarde puis supprimé. Le verrou expire après 15 minutes si le processus est interrompu. Toute finalisation après expiration est refusée. Les fichiers partiellement enregistrés restent privés et ne provoquent aucune suppression.

Les PDF mensuels déjà créés sont des instantanés : une correction ultérieure des rapports ne réécrit pas les PDF existants. Conserver ou exporter les PDF/JSON avant toute suppression du projet Supabase. La restauration automatique n’est pas comprise dans cette version.

## Vérifications réalisées côté développement

- Tests Node : précision des FC/grammes, PDF multi-pages, idempotence, refus des administrateurs et d’un mot de passe erroné, ordre sauvegarde/finalisation.
- PostgreSQL via PGlite : installation et réexécution de la migration, RLS, refus des rôles non autorisés, blocage des écritures pendant copie, stockage obligatoire avant reset, conservation des comptes/sites/archives, expiration et finalisation idempotente.
- PDF de test validé avec `pdfinfo` et rendu pour contrôle.

Activation vérifiée le 18 octobre 2026 : fonction Supabase active, appel réel HTTP 200, PDF et JSON présents dans le bucket privé, tâche Cron active. Le test a archivé le cycle terminé le 9 octobre (aucun rapport dans ce cycle). Les 3 rapports, 5 sites et 3 comptes existants sont restés inchangés ; aucun reset réel n’a été effectué. PGlite est utilisé uniquement pour les vérifications et n’est pas une dépendance de l’application.

Pour reproduire la vérification PostgreSQL : installer `@electric-sql/pglite@0.3.14` dans un environnement de test puis lancer `tests/archive-database-check.mjs` (variable optionnelle `PGLITE_MODULE` pour préciser le chemin du module).
