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
8. Deel een tijdregistratie en laat de tweede persoon accepteren/afwijzen. Controleer dat de uren bij de eigenaar als geaccepteerd of afgewezen terugkomen.
9. Wijzig daarna de voorgelegde uren en publiceer opnieuw. Controleer dat de eerdere acceptatie opnieuw `pending` wordt.
10. Maak een gesprek met persoon B en voeg daarna persoon C aan dezelfde samenwerking toe. Iedere deelnemer moet een eigen uitnodigingscode krijgen.
11. Laat B een bericht plaatsen. Controleer op A dat de samenwerking als **Nieuwe update beschikbaar** met een oranje indicator wordt getoond totdat A de samenwerking opent.
12. Deel de auto met B en voeg eventueel C aan dezelfde autosamenwerking toe.
13. Activeer de gedeelde auto op B, registreer daar een nieuwe rit en publiceer de voertuigregistratie terug. Controleer op A dat dezelfde VehicleId wordt gebruikt maar B als bestuurder is vastgelegd.
14. Controleer dat de nieuwe rit ook als update van een andere deelnemer zichtbaar wordt.
15. Zet de online payload tijdelijk offline en controleer dat de lokale samenwerking op beide apparaten blijft bestaan.
16. Publiceer daarna vanuit een deelnemer met schrijfrecht opnieuw onder dezelfde samenwerking/alias en controleer dat de andere deelnemer de nieuwe revisie ziet.
17. Beëindig als eigenaar een testsamenwerking en controleer dat deelnemers na hun eerstvolgende online controle geen toegang meer hebben tot de gedeelde inhoud in Log.

### Belangrijk bij meerdere deelnemers

Taken/uren worden bewust per persoon voorgelegd, zodat toegewezen minuten en acceptatie per persoon afzonderlijk blijven.

Gesprekken en auto's mogen meerdere deelnemers binnen één samenwerking hebben. Een individuele deelnemer verwijderen is nog niet als gebruikersactie vrijgegeven: daarvoor moet ook de gedeelde inhoudssleutel worden geroteerd, anders zou een eerder ontvangen sleutel nog bruikbaar kunnen zijn. De eigenaar kan de volledige samenwerking wel veilig beëindigen; daarbij wordt de online payload verwijderd en de samenwerking ingetrokken.

Live/productie hoeft voor deze test niet te worden gewijzigd.