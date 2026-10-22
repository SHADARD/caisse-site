# Flamingo Network — Flamingo SARL · Gestion des sites

Application en français, statique, sans compilation, prévue pour GitHub + Netlify et Supabase (authentification et PostgreSQL). Sans configuration, la version publiée affiche uniquement l’accueil et l’écran de connexion, avec une indication d’activation nécessaire lors de la tentative de connexion. Aucun rapport fictif ni bouton de démonstration n’est affiché. Le fichier autonome apercu.html reste un ancien outil de test local, exclu du build Cloudflare.

## Fonctionnalités

- Un rapport par date et site : recettes internet, transferts M-pesa, commissions M-pesa en FC, achat d’or en FC, poids en grammes.
- Cinq cumuls par période, dont achat d’or, ajoutée pour suivre tous les champs saisis.
- Site : consultation de ses données et ajout de rapports. Administrateurs (deux maximum) : consultation de tous les sites, impression et clôture. Super utilisateur : mêmes droits, ajout, modification et suppression des rapports.
- Clôture atomique : une période historique conservée et une nouvelle période ouverte. Deux clôtures simultanées de la même période ne créent pas deux périodes.
- Les modifications/suppressions du super utilisateur recalculent les cumuls historiques également. Pas de journal des anciennes versions des rapports dans cette première version.
- Dates métier en fuseau Africa/Kinshasa. Un rapport maximum par jour et site, même après une clôture : confirmer si plusieurs rapports par jour sont nécessaires.

## Installation Supabase

1. Créer un projet Supabase. Dans SQL Editor, exécuter `schema.sql` une seule fois dans un projet vierge.
2. Dans Authentication → Providers, désactiver les nouvelles inscriptions publiques. Créer le premier super utilisateur depuis le tableau de bord Authentication → Add user → Create new user avec l’adresse technique `responsable@users.caisse.invalid`, confirmer son adresse et choisir un mot de passe fort. Son nom d’utilisateur sera `responsable`. Cette adresse technique sert uniquement à l’authentification, elle ne reçoit pas de courrier. Les flux de récupération/changement du mot de passe ne sont pas encore inclus ; un opérateur autorisé les gère depuis Supabase.
3. Créer le profil du premier super utilisateur via SQL Editor, avec l’UUID retourné par Authentication :

```sql
insert into public.profiles(id,username,display_name,role,site_id)
values ('UUID-AUTH-SUPER','responsable','Responsable','super',null);
```

Après connexion, ce super utilisateur peut créer les sites et les comptes `site` et `admin` depuis l’écran « Sites et utilisateurs ». La fonction serveur crée une adresse technique de la forme `identifiant@users.caisse.invalid`. Le mot de passe n’est jamais enregistré dans les tables applicatives. Les rôles ne viennent pas des métadonnées modifiables par les utilisateurs. Créer les deux administrateurs depuis cet écran.

4. Renseigner `config.js` avec l’URL du projet et sa clé **publishable / anon publique** depuis les paramètres Supabase. Ces deux valeurs sont publiques. **Ne jamais utiliser de clé service_role ou secrète.** La sécurité repose sur les politiques RLS et les fonctions SQL.
5. Dans Netlify → Environment variables, renseigner **SUPABASE_URL** et **SUPABASE_SERVICE_ROLE_KEY**, uniquement pour les fonctions serveur. Cette clé secrète ne doit jamais figurer dans `config.js`, le dépôt, un aperçu ou un message de chat. Elle est nécessaire à la création des comptes ; le serveur vérifie d’abord la session et le rôle super utilisateur.
6. Configurer les paramètres d’authentification Supabase avec l’URL Netlify finale. Vérifier les comptes et droits avec les scénarios ci-dessous avant usage réel.

## GitHub et Netlify

Créer un dépôt GitHub privé, puis exécuter dans ce dossier (remplacer l’URL) :

```sh
git init -b main
git add .
git commit -m "Créer l’application de rapports des sites"
git remote add origin https://github.com/SHADARD/caisse-site.git
git push -u origin main
```

Dans Netlify : Add new project → Import an existing project → GitHub → choisir ce dépôt. Aucun build command ; Publish directory = `.`. `netlify.toml` fournit déjà cette configuration. Chaque push sur main redéploiera le site. Le dépôt est privé mais la page de connexion Netlify est publique ; les données restent protégées par Supabase.

Si ce dossier est ajouté dans un dépôt parent, choisir `caisse-sites` comme Base directory sur Netlify.

## Vérifications

`node --test domain.test.mjs` vérifie les cumuls et les validations métier du navigateur. Les mêmes contraintes doivent être imposées dans PostgreSQL par `schema.sql`.

Scénarios d’intégration à exécuter dans le projet Supabase configuré :

1. Se connecter comme site A : créer un rapport, vérifier les cinq cumuls ; essayer un doublon et une date future (refus).
2. Se connecter comme site B : vérifier que les données du site A sont invisibles, y compris via l’API avec le jeton du site B.
3. Comme administrateur : consulter tous les sites, imprimer, tenter une modification/suppression par API (refus), clôturer une caisse (succès), consulter l’historique.
4. Comme site : appeler `close_period` (refus), tenter de changer son profil ou d’écrire directement une période (refus).
5. Comme super utilisateur : modifier/supprimer un rapport, vérifier le recalcul. Une modification n’autorise pas à changer son site, sa période ou son auteur.
6. Clôturer la même période depuis deux sessions : une seule clôture doit réussir. Ajouter un rapport pendant une clôture : les deux opérations sont sérialisées par verrou de site.
7. Tenter de créer un troisième administrateur depuis SQL : refus.

Aucune dépendance de compilation. Le client Supabase est chargé depuis esm.sh, version fixée. Le navigateur nécessite Internet pour se connecter. Les rapports imprimés respectent le site, la vue et le filtre de date sélectionnés. Désactiver les en-têtes/pieds de page du navigateur si souhaité.

## État de livraison

Sources prêtes pour GitHub/Netlify. Déploiement et base distante non configurés. Les tests d’intégration des permissions doivent être effectués sur Supabase avant la mise en service. La création des sites et des comptes est disponible au super utilisateur dans l’application, après configuration de la fonction serveur. Le premier super utilisateur et la récupération des mots de passe passent par Supabase. La gestion de suppression/modification des comptes existants n’est pas encore incluse ; les rapports, eux, sont modifiables et supprimables par le super utilisateur.

## Tester avant toute publication

Ouvrir **apercu.html** par double-clic. Il est autonome et ne nécessite ni installation, ni GitHub, ni Netlify. Cliquer sur « Essayer la démonstration » pour tester les rapports, les cumuls, les modifications/suppressions, les clôtures et l’impression avec des données fictives. Les actions de création de comptes/sites réels restent désactivées. La page d’accueil comprend pour l’instant un visuel graphique provisoire ; la photo définitive reste à choisir.

Cet aperçu ne valide pas les permissions réelles de la base. Aucun compte réel ne peut y être testé. Pour tester les comptes avant publication Netlify, configurer Supabase puis utiliser Netlify CLI localement (`netlify dev`) avec les variables serveur locales. Ne jamais committer les fichiers .env.

Le fichier aperçu est généré depuis les sources et ne doit pas être utilisé pour la production : il intègre volontairement une configuration vide. Sur Netlify, l’application utilise `index.html` et `config.js`.

## Photo d’accueil

Ajouter le fichier **image1.jpg** (tout en minuscules, extension .jpg) à la racine du dépôt, à côté de `index.html`. L’application l’affichera automatiquement au prochain déploiement. En son absence, un visuel graphique reste affiché. Choisir une photo sans informations confidentielles, puisque le dépôt est public. L’aperçu autonome conserve le visuel graphique si la photo n’est pas placée dans le même dossier.

## Déployer sur Cloudflare Pages (alternative à Netlify)

Le même dépôt reste compatible avec les deux hébergeurs. La création des comptes utilise `/api/create-user` : une Pages Function sur Cloudflare, une redirection vers la fonction Netlify sur Netlify.

1. Créer un compte Cloudflare gratuit, puis ouvrir **Workers & Pages** et choisir la création d’un projet **Pages** avec import Git (ne pas choisir un projet Workers).
2. Autoriser le dépôt GitHub **SHADARD/caisse-site** et sélectionner la branche **main**.
3. Framework preset : **None**. Build command : **node build-cloudflare.mjs**. Build output directory : **dist**. Root directory : laisser vide.
4. Déployer. Une adresse `*.pages.dev` sera attribuée. Sans configuration Supabase, seuls l’accueil et l’écran de connexion seront disponibles ; aucun compte réel ne fonctionnera encore.
5. Pour activer les comptes, préparer Supabase selon les instructions ci-dessus, renseigner les clés publiques dans `config.js`, puis définir **SUPABASE_URL** et le secret **SUPABASE_SERVICE_ROLE_KEY** dans les variables/secrets de production du projet Cloudflare Pages, jamais dans GitHub. Redéployer après configuration.
6. Vérifier les permissions et les opérations réelles avec les scénarios d’intégration, puis transmettre les identifiants aux utilisateurs séparément.

`node build-cloudflare.mjs` prépare uniquement les fichiers publics dans `dist/`. Les fonctions sont dans `functions/` à la racine et le code serveur partagé reste hors de `dist/`. Les tests, SQL et documentation ne sont pas servis par la version Cloudflare. La photo `image1.jpg`, si présente à la racine, est copiée pendant le build.

L’offre gratuite comporte des quotas. Ne pas activer d’offre payante sans décision explicite. Si Netlify est encore relié au dépôt, suspendre ses déploiements automatiques pendant cette phase pour éviter un déploiement supplémentaire lors de la reprise du cycle.

## Configuration publique chargée depuis l’hébergeur

L’application peut désormais charger `/api/config` : définir `SUPABASE_URL` et `SUPABASE_ANON_KEY` (clé publique anon ou publishable) dans l’environnement de production Cloudflare ou Netlify. `SUPABASE_PUBLISHABLE_KEY` et `SUPABASE_PUBLIC_KEY` sont aussi acceptés. Le serveur ne retourne que l’URL et une clé publique validée ; il ne lit ni ne retourne `SUPABASE_SERVICE_ROLE_KEY` pour cette route. Une clé secrète saisie par erreur dans le champ public est refusée. Redéployer après tout changement des variables Cloudflare.

## Saisir les jours précédents dans la première période

Sur une base déjà installée, exécuter seulement `migrations/001-premiere-periode.sql` dans SQL Editor. Ne pas réexécuter `schema.sql`. Cette migration remplace la validation des dates sans supprimer de données. La première période accepte les dates passées ; toute période qui suit une clôture refuse les dates antérieures à son ouverture. Les dates futures et les doublons par jour/site restent interdits. Le début affiché tient compte du premier rapport antérieur saisi.

## Périodes mensuelles du 10 au 9

Le tableau de bord des administrateurs et du super utilisateur distingue désormais les cumuls de caisse ouverte et le rapport mensuel du 10 au 9 inclus. Le choix du site ou « Tous les sites (All) » s’applique aux deux. Le rapport mensuel additionne les cinq champs de tous les rapports datés de cette période, même si leur caisse a été clôturée. Les rapports listés pour ces rôles suivent la période mensuelle sélectionnée et restent imprimables. Les périodes passées ayant des rapports sont sélectionnables. Aucun effacement ni reset mensuel automatique : un nouveau cycle commence par sélection de dates. Le calcul des parts des associés reste à définir. Les modifications/suppressions par le super utilisateur recalculent aussi les rapports mensuels concernés ; les totaux ne sont pas figés. Aucun changement SQL nécessaire.

## Application Android

Le bouton de l’accueil télécharge `downloads/flamingo-network-v1.0.0.apk`, une application Android signée qui ouvre la même plateforme HTTPS dans Android WebView. Elle reprend les interfaces, comptes, rôles, rapports, cumuls et historiques du site. Android 8 (API 26) minimum, cible API 35, Internet requis. Aucun mode de saisie hors connexion. Elle ne contient aucune clé Supabase privée. Les mises à jour du site s’affichent sans reconstruire l’APK ; un changement d’adresse, du conteneur natif ou de ses permissions nécessite une nouvelle version Android.

Pour installer depuis le site : télécharger l’APK sur Android, l’ouvrir, puis autoriser ponctuellement l’installation depuis ce navigateur si Android le demande. Cette application n’est pas publiée sur Google Play et n’est pas installable sur iPhone.

L’impression utilise le service d’impression Android ; selon l’appareil, le menu permet l’export PDF ou le choix d’une imprimante configurée. Les liens externes s’ouvrent dans le navigateur ; les pages de la plateforme restent dans l’application. La connexion et la session sont propres à l’application, distinctes de celles du navigateur.

Sources et procédure de compilation : `android/README.md`. Les signatures v2 et v3 et le manifeste de l’APK ont été vérifiés. L’installation, le clavier, les dates, l’impression et la persistance de session doivent encore être validés sur un téléphone réel avant diffusion à tous les utilisateurs.

## Logo Flamingo SARL et Android 1.0.1

L’image fournie `image1.png` sert de logo dans l’accueil et le menu, de visuel principal et de favicon. Son contenu est en fait JPEG ; le fichier original est conservé et les en-têtes déclarent le type réel. L’image est affichée entièrement, sans recadrage. Le build copie `image1.png` dans le site public.

L’APK 1.0.1 (versionCode 2) reprend le logo officiel dans son icône adaptative. Le fichier source est également conservé dans `android/res/drawable-nodpi/flamingo_logo.jpg`, avec ses octets d’origine. Il est signé avec le même certificat que la version 1.0.0 pour permettre une mise à jour sans désinstaller. Le bouton du site télécharge désormais la version 1.0.1 ; le fichier 1.0.0 reste disponible pour les anciens liens. La source fournie est de petite taille : prévoir une image plus définie pour améliorer la netteté en grand.

## Sauvegardes mensuelles, PDF et reset général

Nouveau : « Tout réinitialiser » réservé au super utilisateur, avec phrase de confirmation et vérification du mot de passe. Une sauvegarde JSON et un PDF sont obligatoires avant suppression. Le reset vide les rapports et les cumuls de caisse et mensuels, en conservant les sites, comptes et archives. Les anciennes données restent uniquement dans l’historique.

La sauvegarde mensuelle est prévue le 10 à 00 h 05 à Kinshasa, pour la période du 10 au 9 terminée. Elle ne déclenche aucun reset automatique. Le PDF de synthèse de tous les sites est conservé dans le stockage Supabase privé et apparaît dans « Historique et PDF ».

**Activé le 18 octobre 2026 :** migrations 002/003 installées, stockage privé vérifié et sauvegarde mensuelle programmée dans Supabase Cron au 10 à 00 h 05 (Kinshasa). Test réel PDF/JSON réussi sans réinitialiser les données. La fonction Supabase remplace le Worker Cloudflare alternatif. Voir `docs/archives-et-reset.md` pour le déploiement et les contrôles.

## Identifiants libres et suppression des comptes/sites

La migration `supabase/migrations/20261018171038_flexible_accounts_and_removal.sql` est appliquée après les migrations 002/003. Elle retire le format imposé aux identifiants : majuscules, minuscules, espaces, accents et noms courts sont acceptés. L’identifiant reste obligatoire et unique, sans distinction de casse. Les nouveaux comptes utilisent une adresse technique dérivée par SHA-256 ; la connexion reste compatible avec les anciens comptes et les e-mails existants. La limite applicative de 12 caractères est retirée des mots de passe ; le minimum technique Supabase reste de 6 caractères.

Le super utilisateur dispose de « Supprimer » dans les listes des comptes et des sites. Une confirmation précède l’action. La suppression est logique : elle masque l’entité, retire immédiatement les droits via les politiques de base et bloque Auth côté serveur. Un site supprimé ferme sa caisse et désactive ses utilisateurs. Les rapports, noms des auteurs et archives sont conservés pour les états mensuels. Les identifiants supprimés restent réservés. Le compte super utilisateur est protégé contre la suppression. Un compte supprimé ne compte plus dans la limite des deux administrateurs actifs.

Vérifications : `node --test tests/account-identity.test.mjs tests/create-user.test.mjs tests/delete-managed.test.mjs`, puis `tests/managed-accounts-database-check.mjs` avec PGlite (dépendance de test uniquement).

## Installation iPhone / iPad

Le bouton sous le téléchargement Android ouvre les instructions Safari → Partager → Sur l’écran d’accueil → Ajouter. Il s’agit de la version web iOS, utilisant les mêmes interfaces et comptes, avec Internet requis. Les métadonnées Apple activent le mode application lorsque le site est ajouté à l’accueil. Aucun fichier APK iOS ni publication App Store n’est proposé.

## Connexion : navigation indépendante du réseau

`public-shell.js` ouvre les écrans publics et l’aide iOS sans attendre Supabase. L’initialisation ne désactive plus tous les boutons. La configuration, le module de connexion et la session ont des délais limites ; une tentative de connexion affiche une erreur au lieu de rester bloquée. Les fichiers `.mjs` sont explicitement servis en JavaScript. Vérification navigateur locale : `node tests/login-ui-check.cjs` avec Playwright et Chromium disponibles (variables `PLAYWRIGHT_MODULE` et `CHROMIUM_PATH` facultatives). Le test utilise uniquement des données et des services simulés.

### Sessions bloquées : correction du 18 octobre 2026

Le SDK Supabase 2.49.1 est désormais livré sous `vendor/`, avec sa licence MIT, depuis l’archive npm dont l’intégrité SHA-512 a été vérifiée. Aucun chargement de SDK depuis un CDN n’est nécessaire. La clé locale de session Flamingo v2 évite les anciens verrous de session ; une reconnexion est nécessaire après mise à jour. Les verrous inter-onglets ont un délai d’acquisition de 6 secondes et les requêtes réseau un délai de 15 secondes.

« Déconnexion » reste accessible pendant le chargement des données. L’action efface uniquement les clés de session de ce projet sur cet appareil et tente la révocation serveur de cette session pendant 3 secondes maximum. Si l’appareil est hors ligne, la session locale est effacée mais la révocation distante ne peut pas être garantie ; les autres appareils ne sont pas déconnectés. Aucun compte ni rapport n’est supprimé.

Test navigateur `tests/auth-session-browser-check.cjs` : véritable SDK livré, serveur Auth simulé, ancien verrou retenu indéfiniment, connexion réussie, déconnexion sans réseau, anciennes clés supprimées et stockage d’une autre application conservé.

## Messagerie interne : groupe général et messages privés

La migration `supabase/migrations/20261022172239_general_and_private_chat.sql` crée un répertoire limité aux noms affichés et aux états actif/inactif, synchronisé avec les comptes, et les messages protégés par RLS. Aucun identifiant de connexion, e-mail ou mot de passe n’est exposé dans ce répertoire.

Tous les comptes actifs participent au groupe général. Un message privé est lisible uniquement par l’expéditeur et le destinataire, y compris pour les comptes administrateurs et super utilisateur : ces rôles ne permettent pas de lire les messages privés des autres. L’expéditeur et l’heure sont imposés par la base ; les utilisateurs ne peuvent modifier ni supprimer les messages. Les comptes désactivés ne peuvent plus lire ou envoyer de nouveaux messages. Leurs messages restent dans l’historique des correspondants.

L’onglet Messages charge son module à la demande afin de garder la connexion indépendante du chat. Les nouveaux messages utilisent Supabase Realtime avec les mêmes politiques RLS ; une actualisation toutes les 20 secondes et un bouton manuel assurent la reprise en cas de coupure. Le chargement s’arrête lorsque la messagerie est masquée. Historique paginé (80 messages), brouillon conservé en cas d’échec et identifiant stable pour éviter un doublon à la reprise. Le contenu est affiché comme du texte, sans interprétation HTML. Internet est nécessaire ; aucune notification système ni chiffrement de bout en bout n’est proposé dans cette version.

La clôture ou réinitialisation des rapports n’efface pas les conversations. Les sauvegardes mensuelles actuelles concernent les données de gestion, pas les messages. Les appels audio/vidéo et le partage d’écran ne sont pas inclus dans cette livraison ; le besoin prévu est de 6 à 15 participants.

Vérification PostgreSQL : `PGLITE_MODULE=/CHEMIN/pglite/dist/index.js node tests/chat-database-check.mjs`. Vérification navigateur locale : `node tests/chat-browser-check.cjs` (Playwright + Chromium). Ces tests ne publient aucun message dans la base réelle.
