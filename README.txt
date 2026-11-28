Monivra RN, signed with the owner key (cert SHA-256 7e041ae5e75f4fe442cc01ed19cfab5658f4095c590bc1fa0f76b81de3bc9784).
versionCode = CI run number = the number in the file name.

Monivra-rn-159.apk  first build with the version name 0.3.19 (main branch commit be8ab09f7); the owner's last phone build.
Monivra-rn-194.apk  current checked build (main branch commit 9903d27e5), new period deck.

Monivra-rn-200.apk  current checked build (main branch commit 4152268f1); the first one whose version name carries the build number (0.3.19.200).

Android refuses an older versionCode over a newer one: save the data file in the app first
(Data > Data file > Save), uninstall, install the old build, restore the data file.
