#!/usr/bin/env python3
"""Build Android sans dépendance Gradle. Les outils SDK restent hors du dépôt."""
from pathlib import Path
import argparse,subprocess,zipfile,hashlib,shutil,os

p=argparse.ArgumentParser()
p.add_argument('--tools',required=True,help='Dossier contenant android-35/android.jar, android-15/ et ecj.jar')
p.add_argument('--signing-directory',required=True,help='Dossier privé hors dépôt pour la signature')
a=p.parse_args()
root=Path(__file__).resolve().parents[2]
tools=Path(a.tools).resolve();sdk=tools/'android-15';platform=tools/'android-35/android.jar'
build=root/'android/build';build.mkdir(parents=True,exist_ok=True)
for directory in ['classes','dex','generated']:(build/directory).mkdir(exist_ok=True)
signing=Path(a.signing_directory).resolve()
if signing==root or root in signing.parents:raise SystemExit('La clé de signature doit rester hors du dépôt.')
signing.mkdir(parents=True,exist_ok=True,mode=0o700)
key=signing/'flamingo-release.pk8';cert=signing/'flamingo-release.pem'
def run(args):subprocess.run([str(x) for x in args],check=True)
if not key.exists():
 if cert.exists():raise SystemExit('Certificat présent sans clé : restauration de la sauvegarde requise.')
 pem=signing/'private-temporary.pem'
 run(['openssl','req','-x509','-newkey','rsa:3072','-nodes','-days','10950','-subj','/CN=Flamingo Network/O=Flamingo SARL','-keyout',pem,'-out',cert])
 run(['openssl','pkcs8','-topk8','-inform','PEM','-outform','DER','-in',pem,'-out',key,'-nocrypt'])
 pem.unlink();os.chmod(key,0o600)
if not cert.exists():raise SystemExit('Clé présente sans certificat : restauration de la sauvegarde requise.')
run(['java','-jar',tools/'ecj.jar','-1.8','-encoding','UTF-8','-bootclasspath',str(platform)+os.pathsep+str(sdk/'core-lambda-stubs.jar'),'-d',build/'classes',root/'android/src/com/flamingo/network/MainActivity.java'])
run([sdk/'aapt2','compile','--dir',root/'android/res','-o',build/'resources.zip'])
run([sdk/'aapt2','link','-o',build/'resources.apk','--manifest',root/'android/AndroidManifest.xml','-I',platform,'--java',build/'generated','--auto-add-overlay',build/'resources.zip'])
classes=list((build/'classes').rglob('*.class'))
run([sdk/'d8','--release','--min-api','26','--lib',platform,'--output',build/'dex',*classes])
unsigned=build/'unsigned.apk';shutil.copyfile(build/'resources.apk',unsigned)
with zipfile.ZipFile(unsigned,'a',compression=zipfile.ZIP_DEFLATED) as z:
 for dex in (build/'dex').glob('*.dex'):z.write(dex,dex.name)
run([sdk/'zipalign','-f','-p','4',unsigned,build/'aligned.apk'])
output=root/'downloads/flamingo-network-v1.0.4.apk';output.parent.mkdir(exist_ok=True)
run([sdk/'apksigner','sign','--key',key,'--cert',cert,'--out',output,build/'aligned.apk'])
run([sdk/'apksigner','verify','--verbose','--print-certs',output])
sha=hashlib.sha256(output.read_bytes()).hexdigest()
(output.parent/(output.name+'.sha256')).write_text(sha+'  '+output.name+'\n')
print('APK signé :',output.name,output.stat().st_size,'octets')
print('SHA-256 :',sha)
