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

Ajouter **ARCHIVE_CRON_SECRET**, de type **Secret**, avec une valeur aléatoire d’au moins 32 caractères. Garder cette valeur dans un gestionnaire de mots de passe pour la recopier ensuite dans le Worker. Ne pas la publier dans GitHub ni dans le chat. Redéployer le projet Pages après les changements de variables.

## 3. Créer la tâche mensuelle Cloudflare

Les Pages Functions n’ont pas leur propre planificateur Cron : utiliser un petit **Worker distinct**. Référence : https://developers.cloudflare.com/workers/configuration/cron-triggers/

Dans Cloudflare → Workers & Pages → Create application, créer un Worker nommé **flamingo-monthly-backup** (offre gratuite, sans activer d’option payante).

1. Dans l’éditeur de code de ce Worker, coller le contenu de **workers/monthly-backup.mjs** et déployer.
2. Dans ses variables, ajouter **ARCHIVE_ENDPOINT**, type Text, valeur `https://caisse-site.pages.dev/api/archive-monthly`.
3. Ajouter **ARCHIVE_CRON_SECRET**, type Secret, avec **exactement la même valeur** que dans le projet Pages. Aucune clé Supabase n’est nécessaire dans ce Worker.
4. Dans Settings → Triggers / Cron Triggers, ajouter :

```text
5 23 9 * *
```

Cloudflare utilise UTC : cela correspond au **10 de chaque mois à 00 h 05 à Kinshasa**, pour la période terminée le 9. Le serveur calcule la période du 10 au 9 précédente. Les archives mensuelles sont idempotentes : une période déjà archivée ne crée pas un doublon.

Le même déploiement peut être fait avec Wrangler depuis le dossier `workers/` en utilisant `wrangler.toml`, après connexion explicite du propriétaire à Cloudflare. Ne pas mettre le secret dans ce fichier.

## 4. Vérifier le fonctionnement

Sur des données de test, avant une utilisation générale :

1. Se connecter comme administrateur : le bouton « Tout réinitialiser » doit être absent ; les PDF archivés sont accessibles, pas les JSON.
2. Se connecter comme super utilisateur : le bouton apparaît. Un dialogue demande la phrase **TOUT REINITIALISER** et le mot de passe actuel.
3. Une sauvegarde JSON complète des données applicatives et un PDF récapitulatif sont d’abord envoyés au stockage privé. S’ils ne sont pas enregistrés, aucun reset n’est autorisé.
4. Après confirmation réussie, les rapports courants et les périodes de caisse sont vidés ; une nouvelle caisse est ouverte par site. **Les cumuls et le rapport mensuel courant repartent à zéro.** Les anciennes données ne sont pas réadditionnées dans le mois, conformément au choix du propriétaire.
5. Les comptes, sites, PDF et sauvegardes antérieurs restent conservés. Dans « Historique et PDF », ouvrir le PDF avant reset et vérifier les totaux.
6. Pour tester une archive mensuelle sans attendre le Cron, sélectionner une période terminée dans le tableau de bord super utilisateur, puis « Archiver cette période en PDF ». Les périodes non terminées sont refusées.
7. Vérifier aussi les journaux du Worker après un déclenchement de test de la tâche planifiée. Ne considérer l’automatisation active qu’après cette vérification.

Le planificateur ne réinitialise aucune caisse et ne supprime aucune donnée. Il crée une sauvegarde et un PDF mensuels. Seule l’action explicite du super utilisateur « Tout réinitialiser » efface les rapports courants.

## Conservation et limites

Les archives sont conservées sans suppression automatique. Elles utilisent le quota de stockage Supabase du compte. Les échecs du Worker sont visibles dans ses journaux ; le Worker tente jusqu’à trois appels. Une période non créée peut être archivée manuellement depuis l’interface super utilisateur. Les sites et comptes sont conservés pendant le reset ; ce mécanisme ne remplace pas un export complet de l’infrastructure Supabase ou une sauvegarde des mots de passe d’authentification.

Pendant la copie, les écritures applicatives sont temporairement bloquées pour éviter qu’un rapport soit ajouté après la sauvegarde puis supprimé. Le verrou expire après 15 minutes si le processus est interrompu. Toute finalisation après expiration est refusée. Les fichiers partiellement enregistrés restent privés et ne provoquent aucune suppression.

Les PDF mensuels déjà créés sont des instantanés : une correction ultérieure des rapports ne réécrit pas les PDF existants. Conserver ou exporter les PDF/JSON avant toute suppression du projet Supabase. La restauration automatique n’est pas comprise dans cette version.

## Vérifications réalisées côté développement

- Tests Node : précision des FC/grammes, PDF multi-pages, idempotence, refus des administrateurs et d’un mot de passe erroné, ordre sauvegarde/finalisation.
- PostgreSQL via PGlite : installation et réexécution de la migration, RLS, refus des rôles non autorisés, blocage des écritures pendant copie, stockage obligatoire avant reset, conservation des comptes/sites/archives, expiration et finalisation idempotente.
- PDF de test validé avec `pdfinfo` et rendu pour contrôle.

Les appels au stockage Supabase réel et le planificateur Cloudflare doivent encore être testés après connexion/activation sur les comptes du propriétaire. PGlite est utilisé uniquement pour les vérifications et n’est pas une dépendance de l’application.

Pour reproduire la vérification PostgreSQL : installer `@electric-sql/pglite@0.3.14` dans un environnement de test puis lancer `tests/archive-database-check.mjs` (variable optionnelle `PGLITE_MODULE` pour préciser le chemin du module).
