# Flamingo Network — Android 1.0.1

Application Android native Java avec Android WebView. Identifiant : `com.flamingo.network`. URL fixe : `https://caisse-site.pages.dev/`. API minimale 26 (Android 8), cible 35. Permission demandée : Internet uniquement. Aucune autorisation de caméra, contacts ou stockage global. L’application charge les mêmes interfaces et conserve les sessions dans le stockage privé WebView. Le bouton de téléchargement n’est pas affiché à l’intérieur de l’application.

Les navigations de premier niveau restent sur l’origine HTTPS de la plateforme. Les autres liens HTTPS et mailto s’ouvrent dans une application externe ; les autres schémas sont bloqués. Les erreurs SSL sont refusées. L’accès aux fichiers locaux et au contenu local et le contenu HTTP mixte sont désactivés. L’impression native est limitée à la plateforme. La fonctionnalité native ne remplace pas les permissions Supabase.

## Compilation

Télécharger depuis les distributions officielles Android :

- Android SDK Platform 35, révision 2 : `platform-35_r02.zip`, SHA-1 du catalogue Google `0bb560a90a7a2cbd0dd8348224d518b638fe7949`.
- Android SDK Build Tools 35.0.0 Linux : `build-tools_r35_linux.zip`, SHA-1 du catalogue Google `2cfaa0bbb2336e9ec18ed3ecea84fa2e2af607bc`.
- Eclipse JDT ECJ 3.40.0, compilateur depuis Maven Central (`org.eclipse.jdt:ecj:3.40.0`).

Les répertoires extraits utilisés par le script sont `android-35/` (plateforme) et `android-15/` (outils, nom du dossier dans l’archive officielle), et le compilateur est nommé `ecj.jar`. Java 21 et OpenSSL doivent être disponibles. Vérifier la licence de chaque outil avant installation sur une autre machine.

Depuis la racine du dépôt :

```sh
python3 android/scripts/build-apk.py --tools /CHEMIN/OUTILS --signing-directory /CHEMIN/PRIVE/HORS-DEPOT
```

Au premier build seulement, le script génère une clé RSA et un certificat de signature dans le répertoire privé indiqué. Aux builds suivants, il réutilise cette clé. **Conserver et sauvegarder ce dossier de manière privée : la même clé est indispensable pour mettre à jour une application déjà installée. Ne jamais envoyer cette clé dans GitHub ni dans le dossier public du site.** Ne pas générer une autre clé pour une version de mise à jour. La clé de cette première version est conservée séparément dans l’espace d’exécution ; sa sauvegarde privée par le propriétaire reste à organiser.

Le script compile le Java, prépare les ressources, génère le DEX, aligne l’APK, le signe, vérifie sa signature puis calcule son SHA-256. Les fichiers publics sont dans `downloads/`. Les fichiers de travail dans `android/build/` sont ignorés par Git.

## Vérifications

Les signatures APK v2 et v3 sont vérifiées par `apksigner verify`. `aapt dump badging` contrôle le package, la version et les niveaux API. Le SHA-256 de l’APK livré est dans le fichier `.sha256` adjacent.

Pas de téléphone ni d’émulateur disponible dans l’environnement de construction : tester l’installation, la connexion de chaque rôle, la saisie d’un rapport, le cumul, l’historique, la clôture avec confirmation, l’impression et la reconnexion après une coupure réseau sur Android avant une diffusion large.

## Versions suivantes

Incrémenter `versionCode` et `versionName` dans le manifeste ; utiliser un nouveau nom de fichier APK, mettre à jour le script de compilation, le bouton de téléchargement, le build Cloudflare et les en-têtes de téléchargement. Réutiliser impérativement la même clé privée. Les interfaces web seules se mettent à jour via Cloudflare sans changer l’APK.

### Version 1.0.1

VersionCode 2. Icône adaptative contenant l’image Flamingo SARL fournie, sans modifier le dessin. Même certificat de signature que 1.0.0. Le changement d’icône nécessite l’installation de cette nouvelle version ; les écrans web se mettent à jour sans réinstallation.
