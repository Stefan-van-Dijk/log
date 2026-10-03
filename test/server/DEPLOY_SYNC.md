# Deploy `sync.php` op sharon.life

De testclient gebruikt voor de nieuwe persoons-, taak- en voertuigsynchronisatie:

`https://sharon.life/log/api/sync.php`

GitHub Pages kan geen PHP uitvoeren. Daarom moet `test/server/sync.php` éénmalig via Strato/FileZilla naar de PHP-hosting worden gekopieerd.

## Doelpad

Upload:

`test/server/sync.php`

naar:

`/log/api/sync.php`

op sharon.life.

Dit staat naast de bestaande:

`/log/api/publish.php`

## Rechten

Gebruik geen `777` als permanente instelling.

Aanbevolen:

- `sync.php`: `644`
- `/log/api`: `755`
- `/log/private`: alleen schrijfbaar voor de webserver/eigen account zoals al nodig voor `publish.php`

`sync.php` maakt zelf onder `/log/private/` de map `sync` aan met private submappen voor status en versleutelde payloads.

## Wat staat online

De nieuwe client versleutelt de inhoud vóór verzending.

De server bewaart bij persoonlijke back-up en samenwerking daarom:

- willekeurige publieke alias;
- revisie/status (`active`, `offline`, `revoked`);
- hashes van toegangstokens;
- rechten per deelnemer;
- acceptatie-/afwijzingsstatus voor gedeelde uren;
- versleutelde payload.

De private bron-ID's en de leesbare inhoud horen alleen ín de versleutelde payload te staan.

## Eerste controle

Na upload hoort een GET zonder geldige 12-teken-ID bijvoorbeeld een JSON-fout terug te geven in plaats van een 404 van de webserver.

Daarna kan vanuit Log TEST onder **Mijn Log & samenwerking** een versleutelde back-up worden aangemaakt.

## Testvolgorde

1. Open Log TEST en controleer versie `0.39-test.3`.
2. Open Instellingen → Mijn Log & samenwerking.
3. Controleer dat een PersonId en VehicleId zichtbaar zijn.
4. Maak een versleutelde persoonlijke back-up met een testwachtwoord.
5. Noteer de 12-teken herstelcode.
6. Controleer op een tweede apparaat of de herstelcode + hetzelfde wachtwoord de back-up kan ontsleutelen.
7. Koppel bij Personen een tweede PersonId.
8. Deel een tijdregistratie en laat de tweede persoon accepteren/afwijzen.
9. Deel de auto en registreer op het tweede apparaat een nieuwe rit.
10. Publiceer die voertuigregistratie terug en controleer de gezamenlijke registratie.
11. Zet de payload tijdelijk offline en controleer dat de lokale samenwerking blijft bestaan.
12. Beëindig als eigenaar een testsamenwerking en controleer dat de deelnemer na online controle geen toegang meer heeft.

Live/productie hoeft voor deze test niet te worden gewijzigd.
