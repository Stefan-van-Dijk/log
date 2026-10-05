# Log-server uploaden via FTP

De productieclient 0.40.2 gebruikt `/log/api/sync.php`, `/log/api/connections.php` en `/log/api/publish.php` op sharon.life. GitHub Pages voert deze PHP-code niet uit; een app-publicatie werkt de PHP-server niet bij.

De actuele compatibele serverupdate is **2026-10-05.1**. De volledige uploadvolgorde, doelpaden, controles, beperkingen en terugvalroute staan in [de FTP-instructies](../docs/SERVER-2026-10-05.1.md).

Gebruik de bestanden uit `server/`, niet de oudere kopieën onder `test/server/`. Upload `server/relay-lock.php` eerst naar `/log/api/relay-lock.php`, daarna de drie endpoints. Bewaar bestaande sleutels en servergegevens. `server/private-access.htaccess` is bedoeld als `/log/private/.htaccess`; controleer op de hosting of de webblokkade daadwerkelijk werkt.
